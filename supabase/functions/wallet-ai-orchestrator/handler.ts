import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import {
  ALLOWED_MODELS,
  DEFAULT_CHAT_MODEL as DEFAULT_MODEL,
  DEFAULT_SUMMARY_MODEL,
  type AllowedModel,
  validateAndResolveModel,
  AiModelNotAllowedError,
} from "../_shared/ai/model-policy.ts";
import {
  calculateEstimatedCost,
} from "../_shared/ai/cost-calculator.ts";
import {
  redactSensitiveAiData,
  AI_ERROR_CODES,
} from "../_shared/ai/audit-observability.ts";
import {
  buildTurnContext,
  type ConversationRepository,
  DEFAULT_RECENT_MESSAGES,
  shouldSummarizeConversation,
  generateConversationSummary,
  type SummarizerRunner,
  SUMMARIZATION_THRESHOLD_MESSAGES,
} from "../_shared/ai/memory-core.ts";
import {
  runOrchestratorTurn,
  type LlmMessage,
  type LlmRunner,
  FINANCIAL_AGENT_SYSTEM_PROMPT,
} from "../_shared/ai/orchestrator-core.ts";
import {
  createQueryToolCatalog,
  type FinancialQueryRepository,
} from "../_shared/ai/query-tools.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
  type ProcessDocumentPipelineResult,
} from "../_shared/ai/document-pipeline.ts";
import type { ActionProposal } from "../_shared/ai/action-types.ts";

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
  conversationRepo?: ConversationRepository;
  summarizerRunner?: SummarizerRunner;
  documentPipelineRunner?: (
    input: ProcessDocumentPipelineInput,
  ) => Promise<ProcessDocumentPipelineResult>;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  findDuplicateFn?: (
    context: AiExecutionContext,
    params: {
      workspaceId: string;
      chaveAcesso?: string;
      numeroNf?: string;
      cnpj?: string;
      linhaDigitavel?: string;
      codigoBarras?: string;
    },
  ) => Promise<{ isDuplicate: boolean; existingRecordId?: string; type?: string }>;
  saveProposalFn?: (
    context: AiExecutionContext,
    proposal: ActionProposal,
  ) => Promise<void>;
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
    case "WALLET_AI_DOCUMENT_VALIDATION_FAILED":
      return "WALLET_AI_DOCUMENT_VALIDATION_FAILED";
    case "WALLET_AI_PAYLOAD_TOO_LARGE":
      return "WALLET_AI_PAYLOAD_TOO_LARGE";
    case "WALLET_AI_UNSUPPORTED_MEDIA_TYPE":
      return "WALLET_AI_UNSUPPORTED_MEDIA_TYPE";
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
    const selectedModel = validateAndResolveModel(rawModel, {
      task: "chat",
      fallbackToDefault: true,
    });

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

    // Processamento Documental Canônico (DANFE / Boletos / Comprovantes)
    if (body.action === "process_document") {
      context = await authorizeAiRequest(
        request,
        workspaceId,
        dependencies.authDeps,
        conversationId,
        correlationId,
      );

      const base64 = typeof body.base64 === "string" ? body.base64 : "";
      const mimeType =
        typeof body.mime_type === "string"
          ? body.mime_type
          : typeof body.mimeType === "string"
          ? body.mimeType
          : "";
      const fileName =
        typeof body.fileName === "string"
          ? body.fileName
          : typeof body.file_name === "string"
          ? body.file_name
          : undefined;
      const rawDocType =
        typeof body.document_type === "string"
          ? body.document_type
          : typeof body.documentTypeHint === "string"
          ? body.documentTypeHint
          : undefined;
      const documentTypeHint = rawDocType
        ? (rawDocType.toUpperCase() as "DANFE" | "BOLETO" | "COMPROVANTE" | "DESCONHECIDO")
        : undefined;
      const textContext =
        typeof body.textContext === "string"
          ? body.textContext
          : typeof body.text_context === "string"
          ? body.text_context
          : undefined;

      const pipelineRunner = dependencies.documentPipelineRunner ?? processDocumentPipeline;
      const docResult = await pipelineRunner({
        workspaceId: context.workspaceId,
        userId: context.userId,
        conversationId,
        base64,
        mimeType,
        fileName,
        documentTypeHint,
        textContext,
        correlationId,
        geminiApiKey: dependencies.geminiApiKey,
        geminiApiKeyBackup: dependencies.geminiApiKeyBackup,
        openaiApiKey: dependencies.openaiApiKey,
        findDuplicateFn: dependencies.findDuplicateFn
          ? (params) => dependencies.findDuplicateFn!(context!, params)
          : undefined,
        saveProposalFn: dependencies.saveProposalFn
          ? (prop) => dependencies.saveProposalFn!(context!, prop)
          : undefined,
      });

      const durationMs = Date.now() - startTime;
      if (dependencies.auditLogger) {
        await dependencies.auditLogger.logEvent({
          userId: context.userId,
          workspaceId: context.workspaceId,
          toolName: "wallet_ai_document_pipeline",
          durationMs,
          status: docResult.success ? "success" : "error",
          errorCode: docResult.errorCode,
          metadata: {
            correlationId,
            conversationId,
            documentType: docResult.documentType,
            status: docResult.status,
            hasPromptInjection: docResult.hasPromptInjection,
            isDuplicate: docResult.isDuplicate,
            hasProposal: !!docResult.actionProposal,
          },
        });
      }

      const httpStatus =
        docResult.errorCode === "WALLET_AI_PAYLOAD_TOO_LARGE"
          ? 413
          : docResult.errorCode === "WALLET_AI_UNSUPPORTED_MEDIA_TYPE"
          ? 415
          : docResult.errorCode === "WALLET_AI_INVALID_PAYLOAD"
          ? 400
          : 200;

      return new Response(JSON.stringify(docResult), {
        status: httpStatus,
        headers: responseHeaders,
      });
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
    const catalog = createQueryToolCatalog(repository, { extended: true });
    const runner = dependencies.runnerFactory(selectedModel);

    // Context Management: se conversationRepo e conversationId fornecidos, constrói contexto canônico
    let turnInputMessages = messages;
    let loadedSummary: string | null = null;
    let contextTruncated = false;

    if (dependencies.conversationRepo && conversationId) {
      try {
        const conv = await dependencies.conversationRepo.getConversation(
          conversationId,
          context.workspaceId,
          context.userId,
        );
        if (conv) {
          loadedSummary = conv.summary;
          const recent = await dependencies.conversationRepo.listRecentMessages(
            conversationId,
            context.workspaceId,
            DEFAULT_RECENT_MESSAGES,
          );
          const historyAsLlm: LlmMessage[] = recent.map((m) => ({
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: m.content,
            tool_calls: m.tool_calls as any,
          }));
          const currentMsg = messages[messages.length - 1];
          const ctxResult = buildTurnContext({
            systemPrompt: FINANCIAL_AGENT_SYSTEM_PROMPT,
            summary: loadedSummary,
            historyMessages: historyAsLlm,
            currentMessage: currentMsg,
          });
          turnInputMessages = ctxResult.messages;
          contextTruncated = ctxResult.contextTruncated;
        }
      } catch (err) {
        console.warn("[handler] Falha ao carregar memória canônica:", err);
      }
    }

    // Execução do loop de orquestração (teto de 5 iterações garantido por padrão)
    const turnResult = await runOrchestratorTurn(turnInputMessages, context, catalog, runner);
    const durationMs = Date.now() - startTime;

    const estimatedCostUsd = calculateEstimatedCost(selectedModel, turnResult.usage);

    // Persistência da mensagem do usuário e resposta do assistente na memória canônica
    if (dependencies.conversationRepo && conversationId) {
      try {
        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        if (lastUserMsg) {
          await dependencies.conversationRepo.appendMessage({
            conversationId,
            workspaceId: context.workspaceId,
            userId: context.userId,
            role: "user",
            content: lastUserMsg.content,
          });
        }
        if (turnResult.finalMessage?.content) {
          await dependencies.conversationRepo.appendMessage({
            conversationId,
            workspaceId: context.workspaceId,
            userId: context.userId,
            role: "assistant",
            content: turnResult.finalMessage.content,
            tokensCount: turnResult.usage.totalTokens,
          });
        }

        // Ciclo de Sumarização Canônica Real (Threshold -> Chamada -> Scoped Update -> Fail-safe)
        const msgCount = await dependencies.conversationRepo.countMessages(
          conversationId,
          context.workspaceId,
        );
        const shouldSummarize = shouldSummarizeConversation({
          messageCount: msgCount,
          estimatedTokens: turnResult.usage.totalTokens,
        });

        if (shouldSummarize) {
          try {
            const recentAll = await dependencies.conversationRepo.listRecentMessages(
              conversationId,
              context.workspaceId,
              SUMMARIZATION_THRESHOLD_MESSAGES + 5,
            );
            const historyForSummary = recentAll.map((m) => ({
              role: m.role,
              content: m.content,
            }));

            const summarizerRunner: SummarizerRunner =
              dependencies.summarizerRunner ||
              (async (msgs, opts) => {
                const summarizerLlm = dependencies.runnerFactory(opts?.model || DEFAULT_SUMMARY_MODEL);
                const resp = await summarizerLlm.generateCompletion(msgs, []);
                return resp.message.content || "";
              });

            const newSummary = await generateConversationSummary({
              historyMessages: historyForSummary,
              previousSummary: loadedSummary,
              runner: summarizerRunner,
              options: { correlationId, model: DEFAULT_SUMMARY_MODEL },
            });

            if (newSummary && newSummary.trim()) {
              await dependencies.conversationRepo.updateSummary(
                conversationId,
                context.workspaceId,
                context.userId,
                newSummary.trim(),
              );
            }
          } catch (sumErr) {
            // Fail-safe: log de auditoria sem quebrar o turno do usuário
            console.warn("[handler] Falha ao gerar/atualizar resumo da conversa:", sumErr);
            if (dependencies.auditLogger) {
              await dependencies.auditLogger.logEvent({
                userId: context.userId,
                workspaceId: context.workspaceId,
                toolName: "ai_summary_failed",
                durationMs: 0,
                status: "error",
                errorCode: "WALLET_AI_SUMMARY_FAILED",
                metadata: {
                  correlationId,
                  conversationId,
                  error: sumErr instanceof Error ? sumErr.message : String(sumErr),
                },
              });
            }
          }
        }
      } catch (err) {
        console.warn("[handler] Falha ao persistir mensagens na memória:", err);
      }
    }

    if (dependencies.auditLogger) {
      const rawMetadata = {
        correlationId,
        conversationId,
        model: selectedModel,
        iterations: turnResult.iterations,
        tokens: turnResult.usage.totalTokens,
        estimatedCostUsd,
        loopDetected: turnResult.loopDetected ?? false,
        maxIterationsReached: turnResult.maxIterationsReached ?? false,
        toolCallsLimitReached: turnResult.toolCallsLimitReached ?? false,
        errorCode: turnResult.errorCode,
        contextTruncated,
      };

      await dependencies.auditLogger.logEvent({
        userId: context.userId,
        workspaceId: context.workspaceId,
        toolName: "wallet_ai_orchestrator",
        durationMs,
        status: "success",
        recordsCount: turnResult.toolCallsExecuted.length,
        metadata: redactSensitiveAiData(rawMetadata) as Record<string, unknown>,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: turnResult.finalMessage,
        toolCalls: turnResult.toolCallsExecuted,
        action_proposals: turnResult.actionProposals ?? [],
        iterations: turnResult.iterations,
        usage: turnResult.usage,
        estimatedCostUsd,
        loopDetected: turnResult.loopDetected ?? false,
        maxIterationsReached: turnResult.maxIterationsReached ?? false,
        toolCallsLimitReached: turnResult.toolCallsLimitReached ?? false,
        errorCode: turnResult.errorCode,
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
    } else if (err instanceof AiModelNotAllowedError) {
      status = err.status;
      rawError = err.message;
      standardCode = err.code;
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
