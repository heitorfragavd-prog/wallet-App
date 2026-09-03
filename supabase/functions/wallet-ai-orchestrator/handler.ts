import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import {
  calculateEstimatedCost,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  type AllowedModel,
} from "../_shared/ai/openai-adapter.ts";
import {
  runOrchestratorTurn,
  type LlmMessage,
  type LlmRunner,
} from "../_shared/ai/orchestrator-core.ts";
import {
  createQueryToolCatalog,
  type FinancialQueryRepository,
} from "../_shared/ai/query-tools.ts";

export interface AuditEventLogger {
  logEvent(event: {
    userId: string;
    workspaceId: string;
    toolName: string;
    durationMs: number;
    status: "success" | "error";
    errorCode?: string;
    recordsCount?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface OrchestratorHandlerDependencies {
  authDeps: AuthorizationDependencies;
  repoFactory: (context: AiExecutionContext) => FinancialQueryRepository;
  runnerFactory: (model?: string) => LlmRunner;
  auditLogger?: AuditEventLogger;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-workspace-id, x-correlation-id",
  "Access-Control-Expose-Headers": "x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mapStandardErrorCode(code: string): string {
  switch (code) {
    case "missing_authorization":
    case "invalid_authorization":
    case "invalid_token":
      return "WALLET_AI_AUTH_ERROR";
    case "invalid_workspace":
    case "missing_workspace_id":
      return "WALLET_AI_INVALID_WORKSPACE";
    case "workspace_forbidden":
      return "WALLET_AI_FORBIDDEN";
    case "WALLET_AI_INVALID_CONVERSATION":
      return "WALLET_AI_INVALID_CONVERSATION";
    case "empty_messages":
      return "WALLET_AI_INVALID_PAYLOAD";
    default:
      return code;
  }
}

export async function handleOrchestratorHttpRequest(
  request: Request,
  dependencies: OrchestratorHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const startTime = Date.now();
  let correlationId = request.headers.get("x-correlation-id")?.trim();
  if (!correlationId) {
    correlationId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  }

  const responseHeaders = {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "X-Correlation-Id": correlationId,
  };

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "method_not_allowed",
        code: "WALLET_AI_METHOD_NOT_ALLOWED",
        correlation_id: correlationId,
      }),
      { status: 405, headers: responseHeaders },
    );
  }

  let context: AiExecutionContext | null = null;

  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_json_body",
          code: "WALLET_AI_INVALID_PAYLOAD",
          correlation_id: correlationId,
        }),
        { status: 400, headers: responseHeaders },
      );
    }

    if (typeof body.correlation_id === "string" && body.correlation_id.trim()) {
      correlationId = body.correlation_id.trim();
      responseHeaders["X-Correlation-Id"] = correlationId;
    }

    const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : undefined;
    const messages = Array.isArray(body.messages) ? (body.messages as LlmMessage[]) : [];

    // Model routing com validação estrita server-side
    const rawModel = typeof body.model === "string" ? body.model.trim() : undefined;
    const selectedModel = rawModel && (ALLOWED_MODELS as readonly string[]).includes(rawModel)
      ? (rawModel as AllowedModel)
      : DEFAULT_MODEL;

    if (!workspaceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "missing_workspace_id",
          code: "WALLET_AI_INVALID_WORKSPACE",
          correlation_id: correlationId,
        }),
        { status: 400, headers: responseHeaders },
      );
    }

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "empty_messages",
          code: "WALLET_AI_INVALID_PAYLOAD",
          correlation_id: correlationId,
        }),
        { status: 400, headers: responseHeaders },
      );
    }

    // Autorização obrigatória server-side (validação de JWT, Workspace e Conversa)
    context = await authorizeAiRequest(
      request,
      workspaceId,
      dependencies.authDeps,
      conversationId,
      correlationId,
    );

    const repository = dependencies.repoFactory(context);
    const catalog = createQueryToolCatalog(repository);
    const runner = dependencies.runnerFactory(selectedModel);

    // Execução do loop de orquestração (teto de 5 iterações garantido por padrão)
    const turnResult = await runOrchestratorTurn(messages, context, catalog, runner);
    const durationMs = Date.now() - startTime;

    const estimatedCostUsd = calculateEstimatedCost(selectedModel, turnResult.usage);

    if (dependencies.auditLogger) {
      await dependencies.auditLogger.logEvent({
        userId: context.userId,
        workspaceId: context.workspaceId,
        toolName: "wallet_ai_orchestrator",
        durationMs,
        status: "success",
        recordsCount: turnResult.toolCallsExecuted.length,
        metadata: {
          correlationId,
          conversationId,
          model: selectedModel,
          iterations: turnResult.iterations,
          tokens: turnResult.usage.totalTokens,
          estimatedCostUsd,
          loopDetected: turnResult.loopDetected ?? false,
          maxIterationsReached: turnResult.maxIterationsReached ?? false,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: turnResult.finalMessage,
        toolCalls: turnResult.toolCallsExecuted,
        iterations: turnResult.iterations,
        usage: turnResult.usage,
        estimatedCostUsd,
        loopDetected: turnResult.loopDetected ?? false,
        maxIterationsReached: turnResult.maxIterationsReached ?? false,
        conversation_id: conversationId,
        correlation_id: correlationId,
      }),
      { status: 200, headers: responseHeaders },
    );
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;

    let status = 500;
    let rawError = "internal_server_error";
    let standardCode = "WALLET_AI_TOOL_ERROR";

    if (err instanceof AiAuthorizationError) {
      status = err.status;
      rawError = err.code;
      standardCode = mapStandardErrorCode(err.code);
    } else if (err instanceof Error) {
      const msg = err.message || "";
      if (err.name === "AbortError" || msg.includes("timeout") || msg.includes("aborted")) {
        status = 504;
        rawError = "timeout";
        standardCode = "WALLET_AI_TIMEOUT";
      } else if (msg.includes("openai_api_error_429")) {
        status = 429;
        rawError = "rate_limit_exceeded";
        standardCode = "WALLET_AI_PROVIDER_RATE_LIMIT";
      } else if (msg.includes("openai_api_error_")) {
        status = 502;
        rawError = "provider_error";
        standardCode = "WALLET_AI_PROVIDER_ERROR";
      } else if (msg === "tool_not_allowed") {
        status = 403;
        rawError = "tool_not_allowed";
        standardCode = "WALLET_AI_TOOL_NOT_ALLOWED";
      } else {
        rawError = msg;
        standardCode = "WALLET_AI_TOOL_ERROR";
      }
    }

    if (context && dependencies.auditLogger) {
      await dependencies.auditLogger.logEvent({
        userId: (context as AiExecutionContext).userId,
        workspaceId: (context as AiExecutionContext).workspaceId,
        toolName: "wallet_ai_orchestrator",
        durationMs,
        status: "error",
        errorCode: standardCode,
        metadata: {
          correlationId,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: rawError,
        code: standardCode,
        correlation_id: correlationId,
      }),
      { status, headers: responseHeaders },
    );
  }
}
