import {
  AiAuthorizationError,
  authorizeAiRequest,
  canRoleAccessFinancialData,
  canRoleAccessCeoBrain,
  isCeoExecutiveAuthorized,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import { FINANCIAL_TOOLS, type QueryToolCatalog } from "../_shared/ai/query-tools.ts";
import {
  DEFAULT_SUMMARY_MODEL,
  validateAndResolveModel,
  AiModelNotAllowedError,
} from "../_shared/ai/model-policy.ts";
import {
  calculateEstimatedCost,
} from "../_shared/ai/cost-calculator.ts";
import {
  redactSensitiveAiData,
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
  WALLET_CEO_SYSTEM_PROMPT,
  WALLET_OPERATIONAL_SYSTEM_PROMPT,
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
import type { IActionProposalRepository } from "../_shared/ai/action-repository.ts";
import type { EyemobileLiveClient } from "../wallet-ai-query/supabase-adapter.ts";
import {
  SPECIALIST_AGENTS_REGISTRY,
  SpecialistAgentId,
  authorizeSpecialistAccess,
} from "../_shared/ai/specialist-registry.ts";
import {
  routeUserQueryToSpecialists,
  fetchAndExecuteFinancialSpecialist,
  buildFinancialSpecialistDeterministicResponse,
} from "../_shared/ai/specialist-router.ts";

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
  proposalRepo?: IActionProposalRepository;
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
  /** Factory para o cliente ao vivo do Eyemobile. Opcional — se ausente, usa cache sincronizado. */
  eyemobileLiveClientFactory?: (context: AiExecutionContext) => EyemobileLiveClient;
  telemetryLogger?: {
    logTelemetry(telemetry: {
      workspaceId: string;
      userId: string;
      conversationId?: string;
      channel?: string;
      model: string;
      agentBrain?: "ceo" | "operational";
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      durationMs: number;
      complexityLevel: number;
      department: string;
      status: string;
      metadata?: Record<string, unknown>;
    }): Promise<void>;
    checkBudget?(workspaceId: string): Promise<{ hardLimitExceeded: boolean; alertTriggered?: string }>;
  };
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
    const requestedAgentType: "ceo" | "operational" = body.agent_type === "ceo" ? "ceo" : "operational";

    // Seleção de Modelo por Complexidade (Nível 1, 2, 3) e Roteamento Departamental
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const userPromptText = typeof lastUserMessage?.content === "string" ? lastUserMessage.content : "";

    // Roteamento oficial dos Sete Especialistas do Wallet CEO 3.0
    const routingPlan = routeUserQueryToSpecialists(userPromptText);
    const primarySpecialistContract = SPECIALIST_AGENTS_REGISTRY[routingPlan.primarySpecialist];

    let complexityLevel: number = routingPlan.complexityLevel;
    let detectedDepartment = primarySpecialistContract?.department || "geral";
    let defaultModelForComplexity = routingPlan.model === "gemini-2.5-flash" ? "gpt-4o-mini" : routingPlan.model;

    const promptLower = userPromptText.toLowerCase();
    if (
      promptLower.includes("plano de") ||
      promptLower.includes("90 dia") ||
      promptLower.includes("estratég") ||
      promptLower.includes("estrateg") ||
      promptLower.includes("crescimento") ||
      promptLower.includes("laboratório") ||
      promptLower.includes("experimento") ||
      promptLower.includes("aumentar meu lucro") ||
      promptLower.includes("monte um plano")
    ) {
      complexityLevel = 3;
      detectedDepartment = "laboratorio_experimentos";
      defaultModelForComplexity = "gpt-4o";
    } else if (
      promptLower.includes("analise") ||
      promptLower.includes("análise") ||
      promptLower.includes("despesa") ||
      promptLower.includes("produto") ||
      promptLower.includes("canal") ||
      promptLower.includes("delivery") ||
      promptLower.includes("ifood") ||
      promptLower.includes("cmv") ||
      promptLower.includes("margem") ||
      promptLower.includes("desperdício") ||
      promptLower.includes("desperdicio")
    ) {
      complexityLevel = 2;
      detectedDepartment = promptLower.includes("cmv") || promptLower.includes("margem")
        ? "cmv_precificacao"
        : promptLower.includes("despesa")
        ? "financeiro_margens"
        : promptLower.includes("delivery") || promptLower.includes("canal")
        ? "delivery_canais"
        : "comercial_crescimento";
      defaultModelForComplexity = "gpt-4o-mini";
    }

    const rawModel = typeof body.model === "string" ? body.model.trim() : defaultModelForComplexity;
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

    // ─── GATEWAY CANÔNICO DE PROPOSTAS DE AÇÃO (Gate 1) ───
    if (body.action === "confirm_proposal" || body.action === "confirm_action") {
      const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
      if (!proposalId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "missing_proposal_id",
            code: "WALLET_AI_INVALID_PAYLOAD",
            correlation_id: correlationId,
          }),
          { status: 400, headers: responseHeaders },
        );
      }

      context = await authorizeAiRequest(
        request,
        workspaceId,
        dependencies.authDeps,
        conversationId,
        correlationId,
      );

      if (!dependencies.proposalRepo) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "action_repository_unavailable",
            code: "WALLET_AI_ACTION_ERROR",
            correlation_id: correlationId,
          }),
          { status: 500, headers: responseHeaders },
        );
      }

      const userRole = context.role || (dependencies.authDeps.getUserRole
        ? await dependencies.authDeps.getUserRole(workspaceId, context.userId)
        : "owner");

      const confirmResult = await dependencies.proposalRepo.confirmProposalAtomically(
        proposalId,
        context,
        userRole,
      );

      if (!confirmResult.success || !confirmResult.proposal) {
        const httpStatus =
          confirmResult.code === "WALLET_AI_ACTION_ALREADY_PROCESSED"
            ? 409
            : confirmResult.code === "WALLET_AI_ACTION_EXPIRED"
            ? 410
            : confirmResult.code === "WALLET_AI_ACTION_INVALID"
            ? 404
            : 403;
        return new Response(
          JSON.stringify({
            success: false,
            error: confirmResult.error || "Falha na confirmação da proposta de ação.",
            code: confirmResult.code || "WALLET_AI_ACTION_FORBIDDEN",
            correlation_id: correlationId,
          }),
          { status: httpStatus, headers: responseHeaders },
        );
      }

      if (dependencies.auditLogger) {
        await dependencies.auditLogger.logEvent({
          userId: context.userId,
          workspaceId: context.workspaceId,
          toolName: "confirm_proposal",
          durationMs: Date.now() - startTime,
          status: "success",
          recordsCount: 1,
          metadata: {
            proposal_id: confirmResult.proposal.id,
            action_type: confirmResult.proposal.actionType,
            risk_level: confirmResult.proposal.riskLevel,
            confirmed_by: context.userId,
            user_role: userRole,
          },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "confirmed",
          proposal: confirmResult.proposal,
          correlation_id: correlationId,
        }),
        { status: 200, headers: responseHeaders },
      );
    }

    if (body.action === "cancel_proposal" || body.action === "cancel_action") {
      const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
      if (!proposalId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "missing_proposal_id",
            code: "WALLET_AI_INVALID_PAYLOAD",
            correlation_id: correlationId,
          }),
          { status: 400, headers: responseHeaders },
        );
      }

      context = await authorizeAiRequest(
        request,
        workspaceId,
        dependencies.authDeps,
        conversationId,
        correlationId,
      );

      if (!dependencies.proposalRepo) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "action_repository_unavailable",
            code: "WALLET_AI_ACTION_ERROR",
            correlation_id: correlationId,
          }),
          { status: 500, headers: responseHeaders },
        );
      }

      const userRole = context.role || (dependencies.authDeps.getUserRole
        ? await dependencies.authDeps.getUserRole(workspaceId, context.userId)
        : "owner");

      const cancelResult = await dependencies.proposalRepo.cancelProposalAtomically(
        proposalId,
        context,
        userRole,
      );

      if (!cancelResult.success) {
        const httpStatus =
          cancelResult.code === "WALLET_AI_ACTION_ALREADY_PROCESSED"
            ? 409
            : cancelResult.code === "WALLET_AI_ACTION_INVALID"
            ? 404
            : 403;
        return new Response(
          JSON.stringify({
            success: false,
            error: cancelResult.error || "Falha ao descartar proposta de ação.",
            code: cancelResult.code || "WALLET_AI_ACTION_FORBIDDEN",
            correlation_id: correlationId,
          }),
          { status: httpStatus, headers: responseHeaders },
        );
      }

      if (dependencies.auditLogger) {
        await dependencies.auditLogger.logEvent({
          userId: context.userId,
          workspaceId: context.workspaceId,
          toolName: "cancel_proposal",
          durationMs: Date.now() - startTime,
          status: "success",
          recordsCount: 1,
          metadata: {
            proposal_id: proposalId,
            action_type: cancelResult.proposal?.actionType,
            risk_level: cancelResult.proposal?.riskLevel,
            cancelled_by: context.userId,
            user_role: userRole,
          },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "cancelled",
          proposal: cancelResult.proposal,
          correlation_id: correlationId,
        }),
        { status: 200, headers: responseHeaders },
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

    const userRole = context.role || (dependencies.authDeps.getUserRole
      ? await dependencies.authDeps.getUserRole(workspaceId, context.userId)
      : "owner");

    // ─── GATE 0: AUTORIZAÇÃO EXECUTIVA SERVER-SIDE PARA O CÉREBRO CEO ───
    if (requestedAgentType === "ceo") {
      const isOwner = context.isOwner ?? (userRole === "owner" || userRole === "proprietario");
      const isExecutiveDelegated = userRole === "executive" || userRole === "ceo";

      if (!canRoleAccessCeoBrain(userRole, { isOwner, isExecutiveDelegated })) {
        if (dependencies.auditLogger) {
          await dependencies.auditLogger.logEvent({
            userId: context.userId,
            workspaceId: context.workspaceId,
            toolName: "wallet_ai_ceo_access_denied",
            durationMs: Date.now() - startTime,
            status: "error",
            errorCode: "WALLET_AI_FORBIDDEN",
            metadata: {
              correlationId,
              requestedAgentType: "ceo",
              userRole,
              isOwner,
              reason: "unauthorized_ceo_brain_access",
            },
          });
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: "forbidden_ceo_access",
            code: "WALLET_AI_FORBIDDEN",
            message: `Acesso negado: o Wallet CEO é o assistente executivo privado do proprietário do workspace. O papel '${userRole}' não possui prerrogativa executiva delegada neste workspace.`,
            correlation_id: correlationId,
          }),
          { status: 403, headers: responseHeaders },
        );
      }
    }



    if (!canRoleAccessFinancialData(userRole)) {
      const promptText = messages.map((m) => m.content).join(" ").toLowerCase();
      const financialTerms = [
        "faturamento", "lucro", "despesa", "saldo", "dre", "margem",
        "custo", "investimento", "receita", "cmv", "venda"
      ];
      const hasFinancialTerms = financialTerms.some((term) => promptText.includes(term));
      if (hasFinancialTerms) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "forbidden_financial_access",
            code: "WALLET_AI_FORBIDDEN",
            message: `O papel '${userRole}' não possui autorização para consultar dados financeiros (faturamento, lucro, despesas, saldos, DRE, margens, custos e receitas).`,
            correlation_id: correlationId,
          }),
          { status: 403, headers: responseHeaders },
        );
      }
    }

    // ─── GATE 0 & GATE 10: AUTORIZAÇÃO DO ESPECIALISTA SERVER-SIDE ───
    const rawRoleStr = String(userRole).toLowerCase();
    const isOwnerRole = (context.isOwner === true) || (rawRoleStr === "owner" || rawRoleStr === "proprietario" || rawRoleStr === "ceo");
    const normSpecialistRole: "owner" | "admin" | "member" = isOwnerRole
      ? "owner"
      : (rawRoleStr === "admin" || rawRoleStr === "administrador" || rawRoleStr === "gerente" || rawRoleStr === "executive")
      ? "admin"
      : "member";

    const primaryAuth = authorizeSpecialistAccess(routingPlan.primarySpecialist, normSpecialistRole);
    if (!primaryAuth.authorized) {
      if (dependencies.auditLogger) {
        await dependencies.auditLogger.logEvent({
          userId: context.userId,
          workspaceId: context.workspaceId,
          toolName: "wallet_ai_specialist_access_denied",
          durationMs: Date.now() - startTime,
          status: "error",
          errorCode: "WALLET_AI_FORBIDDEN",
          metadata: {
            correlationId,
            specialist: routingPlan.primarySpecialist,
            userRole,
            reason: primaryAuth.reason,
          },
        });
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: "forbidden_specialist_access",
          code: "WALLET_AI_FORBIDDEN",
          message: primaryAuth.reason,
          correlation_id: correlationId,
        }),
        { status: 403, headers: responseHeaders },
      );
    }

    if (routingPlan.coordinatingCeo) {
      for (const contrib of routingPlan.contributingSpecialists) {
        const cAuth = authorizeSpecialistAccess(contrib, normSpecialistRole);
        if (!cAuth.authorized) {
          if (dependencies.auditLogger) {
            await dependencies.auditLogger.logEvent({
              userId: context.userId,
              workspaceId: context.workspaceId,
              toolName: "wallet_ai_specialist_access_denied",
              durationMs: Date.now() - startTime,
              status: "error",
              errorCode: "WALLET_AI_FORBIDDEN",
              metadata: {
                correlationId,
                specialist: contrib,
                userRole,
                reason: cAuth.reason,
              },
            });
          }
          return new Response(
            JSON.stringify({
              success: false,
              error: "forbidden_specialist_access",
              code: "WALLET_AI_FORBIDDEN",
              message: cAuth.reason,
              correlation_id: correlationId,
            }),
            { status: 403, headers: responseHeaders },
          );
        }
      }
    }

    // ─── GATE 1: EXECUÇÃO DETERMINÍSTICA DO AGENTE FINANCEIRO (Zero Custo de IA) ───
    if (routingPlan.isDeterministicPossible && routingPlan.primarySpecialist === "financeiro") {
      const repository = dependencies.repoFactory(context);
      const detResult = await fetchAndExecuteFinancialSpecialist(
        userPromptText,
        context,
        repository,
      );

      if (detResult.handled && detResult.answer) {
        const durationMs = Date.now() - startTime;
        if (dependencies.telemetryLogger) {
          try {
            await dependencies.telemetryLogger.logTelemetry({
              workspaceId: context.workspaceId,
              userId: context.userId,
              conversationId,
              channel: typeof body.channel === "string" ? body.channel : "web",
              model: "deterministic",
              agentBrain: requestedAgentType,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              durationMs,
              complexityLevel: routingPlan.complexityLevel,
              department: SPECIALIST_AGENTS_REGISTRY.financeiro.department,
              status: "success",
              metadata: {
                specialist_agent_id: "financeiro",
                deterministic: true,
                coordinating_ceo: false,
              },
            });
          } catch (telErr) {
            console.warn("[handler] Falha na telemetria determinística:", telErr);
          }
        }

        if (dependencies.auditLogger) {
          await dependencies.auditLogger.logEvent({
            userId: context.userId,
            workspaceId: context.workspaceId,
            toolName: "deterministic_financial_specialist",
            durationMs,
            status: "success",
            recordsCount: 1,
            metadata: {
              correlationId,
              conversationId,
              specialist: "financeiro",
              model: "deterministic",
            },
          });
        }

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
                channel: "web",
              });
            }
            await dependencies.conversationRepo.appendMessage({
              conversationId,
              workspaceId: context.workspaceId,
              userId: context.userId,
              role: "assistant",
              content: detResult.answer,
              tokensCount: 0,
              channel: "web",
            });
          } catch (mErr) {
            console.warn("[handler] Falha ao persistir mensagem determinística na memória:", mErr);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            text: detResult.answer,
            message: {
              role: "assistant",
              content: detResult.answer,
            },
            specialist: "financeiro",
            department: SPECIALIST_AGENTS_REGISTRY.financeiro.department,
            model: "deterministic",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            estimatedCostUsd: 0,
            toolCalls: [],
            action_proposals: [],
            iterations: 0,
            conversation_id: conversationId,
            correlation_id: correlationId,
          }),
          { status: 200, headers: responseHeaders },
        );
      }
    }

    let effectiveAgentType: "ceo" | "operational" = requestedAgentType;

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
          if (conv.agent_type) {
            // Conversa do CEO exige autorização executiva
            if (conv.agent_type === "ceo" && !canRoleAccessCeoBrain(userRole)) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "forbidden_ceo_access",
                  code: "WALLET_AI_FORBIDDEN",
                  message: `Acesso negado: histórico executivo protegido. O papel '${userRole}' não possui autorização para acessar esta conversa do WALLET CEO.`,
                  correlation_id: correlationId,
                }),
                { status: 403, headers: responseHeaders },
              );
            }
            if (conv.agent_type !== requestedAgentType) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "conversation_agent_mismatch",
                  code: "WALLET_AI_INVALID_CONVERSATION",
                  message: `A conversa solicitada é do tipo '${conv.agent_type}' e não pode ser acessada pelo cérebro '${requestedAgentType}'.`,
                  correlation_id: correlationId,
                }),
                { status: 400, headers: responseHeaders },
              );
            }
                        effectiveAgentType = conv.agent_type === "ceo" ? "ceo" : "operational";
          }
          loadedSummary = conv.summary;
          const recent = await dependencies.conversationRepo.listRecentMessages(
            conversationId,
            context.workspaceId,
            DEFAULT_RECENT_MESSAGES,
          );
          const historyAsLlm: LlmMessage[] = recent.map((m) => ({
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: m.content,
            tool_calls: m.tool_calls as LlmMessage["tool_calls"],
          }));
          const currentMsg = messages[messages.length - 1];
          const activePromptForTurn = effectiveAgentType === "ceo" ? WALLET_CEO_SYSTEM_PROMPT : WALLET_OPERATIONAL_SYSTEM_PROMPT;
          const ctxResult = buildTurnContext({
            systemPrompt: activePromptForTurn,
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

    let chosenSystemPrompt = effectiveAgentType === "ceo" ? WALLET_CEO_SYSTEM_PROMPT : WALLET_OPERATIONAL_SYSTEM_PROMPT;

    // Injeção de Contexto do Especialista Designado ou Coordenação Multidepartamental
    if (routingPlan.coordinatingCeo) {
      chosenSystemPrompt += `\n\n[COORDENAÇÃO EXECUTIVA WALLET CEO: MULTIDEPARTAMENTAL]\nVocê está coordenando os seguintes especialistas: ${routingPlan.contributingSpecialists.map((s) => SPECIALIST_AGENTS_REGISTRY[s]?.name || s).join(", ")}.\nSintetize a resposta com visão executiva holística cruzando faturamento bruto (PDV), CMV de insumos (Estoque) e despesas operacionais/lucro líquido (Financeiro).`;
    } else if (primarySpecialistContract) {
      chosenSystemPrompt += `\n\n[ESPECIALISTA DESIGNADO: ${primarySpecialistContract.name} — ${primarySpecialistContract.department}]\n${primarySpecialistContract.systemPromptSnippet}`;
    }

    // Salvaguarda de Modelo: para cérebro operacional, modelos econômicos protegem orçamento
    let effectiveModel = selectedModel;
    if (effectiveAgentType === "operational" && effectiveModel === "gpt-4o") {
      effectiveModel = "gpt-4o-mini";
    }

    const repository = dependencies.repoFactory(context);
    const eyemobileClient = dependencies.eyemobileLiveClientFactory?.(context);
    let catalog = createQueryToolCatalog(repository, { extended: true, eyemobileClient });

    // Filtragem de ferramentas executivas exclusivas do CEO
    const CEO_EXCLUSIVE_TOOLS = new Set([
      "consultar_resumo_executivo_ceo",
      "consultar_analise_despesas_ceo",
      "consultar_oportunidades_ceo",
      "propor_experimento_comercial",
    ]);

    if (effectiveAgentType !== "ceo" || !canRoleAccessCeoBrain(userRole)) {
      const nonCeoCatalog: QueryToolCatalog = {};
      for (const [toolName, handler] of Object.entries(catalog)) {
        if (!CEO_EXCLUSIVE_TOOLS.has(toolName)) {
          nonCeoCatalog[toolName] = handler;
        }
      }
      catalog = nonCeoCatalog;
    }

    if (!canRoleAccessFinancialData(userRole)) {
      const safeCatalog: QueryToolCatalog = {};
      for (const [toolName, handler] of Object.entries(catalog)) {
        if (!FINANCIAL_TOOLS.has(toolName)) {
          safeCatalog[toolName] = handler;
        }
      }
      catalog = safeCatalog;
    }

    // Filtragem de ferramentas pela Allowlist do Especialista (Gate 10)
    const allowedToolsSet = new Set<string>();
    if (routingPlan.coordinatingCeo) {
      for (const specId of routingPlan.contributingSpecialists) {
        const spec = SPECIALIST_AGENTS_REGISTRY[specId];
        if (spec) {
          spec.allowedTools.forEach((t) => allowedToolsSet.add(t));
        }
      }
      if (effectiveAgentType === "ceo" && canRoleAccessCeoBrain(userRole)) {
        CEO_EXCLUSIVE_TOOLS.forEach((t) => allowedToolsSet.add(t));
      }
    } else if (primarySpecialistContract) {
      primarySpecialistContract.allowedTools.forEach((t) => allowedToolsSet.add(t));
    }

    if (allowedToolsSet.size > 0) {
      const specialistRestrictedCatalog: QueryToolCatalog = {};
      for (const [toolName, handler] of Object.entries(catalog)) {
        if (allowedToolsSet.has(toolName)) {
          specialistRestrictedCatalog[toolName] = handler;
        }
      }
      catalog = specialistRestrictedCatalog;
    }

    const runner = dependencies.runnerFactory(effectiveModel);

    // Verificação de Limite de Orçamento de IA ($10 USD mensal)
    if (dependencies.telemetryLogger?.checkBudget) {
      const budgetCheck = await dependencies.telemetryLogger.checkBudget(context.workspaceId);
      if (budgetCheck?.hardLimitExceeded) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "budget_limit_exceeded",
            code: "WALLET_AI_BUDGET_EXCEEDED",
            message: "O limite de orçamento mensal de IA foi atingido ($10.00 USD). Por favor, verifique as configurações no painel.",
            correlation_id: correlationId,
          }),
          { status: 429, headers: responseHeaders }
        );
      }
    }

    // Execução do loop de orquestração (teto de 5 iterações garantido por padrão)
    const turnResult = await runOrchestratorTurn(turnInputMessages, context, catalog, runner, {
      systemPromptOverride: chosenSystemPrompt,
    });
    const durationMs = Date.now() - startTime;

    const estimatedCostUsd = calculateEstimatedCost(selectedModel, turnResult.usage);

    // Persistência canônica das Propostas de Ação geradas no turno
    if (dependencies.saveProposalFn && turnResult.actionProposals && turnResult.actionProposals.length > 0) {
      for (const proposal of turnResult.actionProposals) {
        try {
          await dependencies.saveProposalFn(context, proposal);
        } catch (propErr) {
          console.warn("[handler] Falha ao persistir proposta no banco:", propErr);
        }
      }
    }

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
            channel: "web",
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
            channel: "web",
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

    if (dependencies.telemetryLogger) {
      try {
        await dependencies.telemetryLogger.logTelemetry({
          workspaceId: context.workspaceId,
          userId: context.userId,
          conversationId,
          channel: typeof body.channel === "string" ? body.channel : "web",
          model: effectiveModel,
          agentBrain: effectiveAgentType,
          promptTokens: turnResult.usage.promptTokens,
          completionTokens: turnResult.usage.completionTokens,
          totalTokens: turnResult.usage.totalTokens,
          estimatedCostUsd,
          durationMs,
          complexityLevel,
          department: primarySpecialistContract?.department || detectedDepartment,
          status: "success",
          metadata: {
            correlationId,
            specialist_agent_id: routingPlan.primarySpecialist,
            coordinating_ceo: routingPlan.coordinatingCeo,
            iterations: turnResult.iterations,
            toolCallsCount: turnResult.toolCallsExecuted.length,
            provider: turnResult.provider ?? "openai",
            fallback: turnResult.fallback ?? false,
          },
        });
      } catch (telErr) {
        console.warn("[handler] Falha ao registrar telemetria de IA:", telErr);
      }
    }

    if (dependencies.auditLogger) {
      const rawMetadata = {
        correlationId,
        conversationId,
        specialist: routingPlan.primarySpecialist,
        model: selectedModel,
        iterations: turnResult.iterations,
        tokens: turnResult.usage.totalTokens,
        estimatedCostUsd,
        loopDetected: turnResult.loopDetected ?? false,
        maxIterationsReached: turnResult.maxIterationsReached ?? false,
        toolCallsLimitReached: turnResult.toolCallsLimitReached ?? false,
        errorCode: turnResult.errorCode,
        contextTruncated,
        provider: turnResult.provider ?? "openai",
        fallback: turnResult.fallback ?? false,
        fallbackReason: turnResult.fallbackReason ?? null,
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
        specialist: routingPlan.primarySpecialist,
        department: primarySpecialistContract?.department || detectedDepartment,
        coordinating_ceo: routingPlan.coordinatingCeo,
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
        provider: turnResult.provider ?? "openai",
        fallback: turnResult.fallback ?? false,
        fallbackReason: turnResult.fallbackReason ?? null,
      }),
      { status: 200, headers: responseHeaders },
    );
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const correlationId = (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
    ).slice(0, 8).toUpperCase();

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
      } else if (msg.includes("openai_api_error_429") || msg === "openai_quota_exceeded") {
        status = 429;
        rawError = "rate_limit_exceeded";
        standardCode = "WALLET_AI_PROVIDER_RATE_LIMIT";
      } else if (msg === "openai_invalid_key") {
        status = 401;
        rawError = "openai_invalid_key";
        standardCode = "WALLET_AI_PROVIDER_ERROR";
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

