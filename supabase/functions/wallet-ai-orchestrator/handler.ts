import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import {
  calculateEstimatedCost,
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
import type { EyemobileLiveClient } from "../wallet-ai-query/supabase-adapter.ts";

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
  /** Factory para o cliente ao vivo do Eyemobile. Opcional — se ausente, usa cache sincronizado. */
  eyemobileLiveClientFactory?: (context: AiExecutionContext) => EyemobileLiveClient;
}


const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-workspace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleOrchestratorHttpRequest(
  request: Request,
  dependencies: OrchestratorHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();
  let context: AiExecutionContext | null = null;

  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json_body" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
    const messages = Array.isArray(body.messages) ? (body.messages as LlmMessage[]) : [];
    const requestedModel = typeof body.model === "string" ? body.model : undefined;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "missing_workspace_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "empty_messages" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Autorização obrigatória server-side
    context = await authorizeAiRequest(request, workspaceId, dependencies.authDeps);

    const repository = dependencies.repoFactory(context);
    const eyemobileClient = dependencies.eyemobileLiveClientFactory?.(context);
    const catalog = createQueryToolCatalog(repository, eyemobileClient);
    const runner = dependencies.runnerFactory(requestedModel);


    const turnResult = await runOrchestratorTurn(messages, context, catalog, runner);
    const durationMs = Date.now() - startTime;

    const estimatedCostUsd = calculateEstimatedCost(
      (requestedModel as AllowedModel) || "gpt-4o-mini",
      turnResult.usage,
    );

    if (dependencies.auditLogger) {
      await dependencies.auditLogger.logEvent({
        userId: context.userId,
        workspaceId: context.workspaceId,
        toolName: "wallet_ai_orchestrator",
        durationMs,
        status: "success",
        recordsCount: turnResult.toolCallsExecuted.length,
        metadata: {
          iterations: turnResult.iterations,
          tokens: turnResult.usage.totalTokens,
          estimatedCostUsd,
          provider: turnResult.provider ?? "openai",
          fallback: turnResult.fallback ?? false,
          fallbackReason: turnResult.fallbackReason ?? null,
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
        provider: turnResult.provider ?? "openai",
        fallback: turnResult.fallback ?? false,
        fallbackReason: turnResult.fallbackReason ?? null,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const correlationId = (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
    ).slice(0, 8).toUpperCase();

    let status = 500;
    let errorCode = "internal_server_error";

    if (err instanceof AiAuthorizationError) {
      status = err.status;
      errorCode = err.code;
    } else if (err instanceof Error) {
      errorCode = err.message;
      // Propagar status HTTP semântico para erros conhecidos do OpenAI se não houve fallback
      if (err.message === "openai_quota_exceeded") {
        status = 429;
      } else if (err.message === "openai_invalid_key") {
        status = 401;
        errorCode = "openai_invalid_key";
      }
    }

    if (context && dependencies.auditLogger) {
      await dependencies.auditLogger.logEvent({
        userId: (context as AiExecutionContext).userId,
        workspaceId: (context as AiExecutionContext).workspaceId,
        toolName: "wallet_ai_orchestrator",
        durationMs,
        status: "error",
        errorCode,
        metadata: { correlationId },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorCode,
        correlation_id: correlationId,
      }),
      {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
}

