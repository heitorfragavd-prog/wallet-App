import { evaluateAiBudgetGuardrail } from "../_shared/ai/cost-calculator.ts";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import type { AiExecutionContext } from "../_shared/ai/auth.ts";
import type { ActionProposal } from "../_shared/ai/action-types.ts";
import { FailoverLlmRunner } from "../_shared/ai/failover-runner.ts";
import { createFinancialRepository } from "../_shared/ai/financial-repository.ts";
import { GeminiLlmRunner } from "../_shared/ai/gemini-adapter.ts";
import { OpenAiLlmRunner } from "../_shared/ai/openai-adapter.ts";
import { handleBoletoHttpRequest } from "./boleto-handler.ts";
import { handleFiscalHttpRequest } from "./fiscal-handler.ts";
import { handleDocumentHttpRequest } from "./document-handler.ts";
import { handleOrchestratorHttpRequest } from "./handler.ts";
import { processDocumentPipeline } from "../_shared/ai/document-pipeline.ts";
import { SupabaseActionProposalRepository } from "../_shared/ai/action-repository.ts";
import { SupabaseConversationRepository } from "../_shared/ai/memory-core.ts";
import {
  createEyemobileLiveClient,
  createSupabaseAuthorizationDependencies,
  executeSupabaseFinancialQuery,
  type SupabaseClientLike,
  writeSupabaseAiAudit,
} from "../wallet-ai-query/supabase-adapter.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = getSupabaseSecretKey();
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const openAiBaseUrl = Deno.env.get("OPENAI_BASE_URL");
const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const geminiApiKeyBackup = Deno.env.get("GEMINI_API_KEY_BACKUP");

if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) {
  throw new Error("wallet_ai_orchestrator_configuration_missing");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseClientLike;

const rawSupabaseClient = adminClient as unknown as SupabaseClient;
const proposalRepo = new SupabaseActionProposalRepository(rawSupabaseClient);
const conversationRepo = new SupabaseConversationRepository(rawSupabaseClient);

const authDeps = createSupabaseAuthorizationDependencies(adminClient);

const repoFactory = () =>
  createFinancialRepository((query) =>
    executeSupabaseFinancialQuery(adminClient, query)
  );

const runnerFactory = (model?: string) => {
  const primaryRunner = new OpenAiLlmRunner({
    apiKey: openAiApiKey,
    model,
    baseUrl: openAiBaseUrl ? `${openAiBaseUrl.replace(/\/$/, "")}/chat/completions` : undefined,
  });

  const fallbackRunner = geminiApiKey
    ? new GeminiLlmRunner({
        apiKey: geminiApiKey,
        model: "gemini-2.5-flash",
      })
    : null;

  return new FailoverLlmRunner({
    primaryRunner,
    fallbackRunner,
    onFailover: (reason, provider) => {
      console.warn(`[FailoverLlmRunner] Failover acionado para ${provider}. Motivo: ${reason}`);
    },
  });
};

const auditLogger = {
  logEvent: async (event: Parameters<typeof writeSupabaseAiAudit>[1]) => {
    try {
      await writeSupabaseAiAudit(adminClient, event);
    } catch (err) {
      console.warn("[wallet-ai-orchestrator] Falha ao registrar log de auditoria:", err);
    }
  },
};

const telemetryLogger = {
  logTelemetry: async (telemetry: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
    channel?: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    durationMs: number;
    complexityLevel: number;
    department: string;
    status: string;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      const toolCalls = typeof telemetry.metadata?.toolCallsCount === "number" ? telemetry.metadata.toolCallsCount : 0;
      const provider = typeof telemetry.metadata?.provider === "string" ? telemetry.metadata.provider : (telemetry.model.startsWith("gemini") ? "gemini" : "openai");
      const correlationId = typeof telemetry.metadata?.correlationId === "string" ? telemetry.metadata.correlationId : null;

      const { error } = await rawSupabaseClient.from("wallet_ai_telemetry").insert({
        workspace_id: telemetry.workspaceId,
        user_id: telemetry.userId || null,
        conversation_id: telemetry.conversationId || null,
        channel: telemetry.channel || "web",
        model: telemetry.model,
        provider,
        prompt_tokens: telemetry.promptTokens,
        completion_tokens: telemetry.completionTokens,
        total_tokens: telemetry.totalTokens,
        estimated_cost_usd: telemetry.estimatedCostUsd,
        duration_ms: telemetry.durationMs,
        tool_calls_count: toolCalls,
        complexity_level: telemetry.complexityLevel,
        department: telemetry.department,
        status: telemetry.status || "success",
        correlation_id: correlationId,
        metadata: telemetry.metadata || {},
      });

      if (error) {
        console.error("[wallet-ai-orchestrator] Erro ao registrar telemetria de IA:", error);
      }
    } catch (err) {
      console.error("[wallet-ai-orchestrator] Exceção ao registrar telemetria de IA:", err);
    }
  },
  checkBudget: async (workspaceId: string): Promise<{ hardLimitExceeded: boolean; alertTriggered?: string }> => {
    let hardLimitActive = false;
    let monthlyBudgetUsd = 10;
    try {
      const { data: budgetConfig, error: budgetError } = await rawSupabaseClient
        .from("wallet_ai_budgets")
        .select("monthly_budget_usd, hard_limit_active")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (budgetConfig) {
        hardLimitActive = Boolean(budgetConfig.hard_limit_active);
        monthlyBudgetUsd = Number(budgetConfig.monthly_budget_usd || 10);
      }

      if (budgetError) {
        console.warn("[wallet-ai-orchestrator] Erro ao consultar orçamento de IA:", budgetError);
        return evaluateAiBudgetGuardrail({
          hardLimitActive,
          monthlyBudgetUsd,
          totalCostUsd: null,
          readError: true,
        });
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      const { data: usageData, error: usageError } = await rawSupabaseClient
        .from("v_wallet_ai_monthly_usage")
        .select("total_cost_usd, budget_consumed_percent")
        .eq("workspace_id", workspaceId)
        .eq("month_reference", currentMonth)
        .maybeSingle();

      if (usageError) {
        console.warn("[wallet-ai-orchestrator] Erro ao consultar telemetria de IA:", usageError);
        return evaluateAiBudgetGuardrail({
          hardLimitActive,
          monthlyBudgetUsd,
          totalCostUsd: null,
          readError: true,
        });
      }

      return evaluateAiBudgetGuardrail({
        hardLimitActive,
        monthlyBudgetUsd,
        totalCostUsd: usageData ? Number(usageData.total_cost_usd || 0) : 0,
        readError: false,
      });
    } catch (err) {
      console.warn("[wallet-ai-orchestrator] Exceção ao verificar orçamento:", err);
      return evaluateAiBudgetGuardrail({
        hardLimitActive,
        monthlyBudgetUsd,
        totalCostUsd: null,
        readError: true,
      });
    }
  },
};

const findDuplicateFn = async (
  _ctx: AiExecutionContext,
  params: {
    workspaceId: string;
    chaveAcesso?: string;
    numeroNf?: string;
    cnpj?: string;
    linhaDigitavel?: string;
    codigoBarras?: string;
  },
) => {
  try {
    if (params.chaveAcesso) {
      const { data } = await rawSupabaseClient
        .from("wallet_ai_action_proposals")
        .select("id, status")
        .eq("workspace_id", params.workspaceId)
        .contains("payload", { chave_acesso: params.chaveAcesso })
        .limit(1);
      const rows = data as Array<{ id: string }> | null;
      if (rows && rows.length > 0) {
        return { isDuplicate: true, existingRecordId: rows[0].id, type: "proposal" };
      }
    }
    if (params.linhaDigitavel) {
      const { data } = await rawSupabaseClient
        .from("wallet_ai_action_proposals")
        .select("id, status")
        .eq("workspace_id", params.workspaceId)
        .contains("payload", { linha_digitavel: params.linhaDigitavel })
        .limit(1);
      const rows = data as Array<{ id: string }> | null;
      if (rows && rows.length > 0) {
        return { isDuplicate: true, existingRecordId: rows[0].id, type: "proposal" };
      }
    }
  } catch {
    // Fail-safe
  }
  return { isDuplicate: false };
};

const saveProposalFn = async (_ctx: AiExecutionContext, proposal: ActionProposal) => {
  await proposalRepo.saveProposal(proposal);
};

const eyemobileLiveClientFactory = () => createEyemobileLiveClient(adminClient);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/danfe") || url.pathname.endsWith("/fiscal")) {
    return handleFiscalHttpRequest(req, {
      authDeps,
      geminiApiKey: geminiApiKey || "",
      adminClient,
    });
  }

  if (url.pathname.endsWith("/boleto")) {
    return handleBoletoHttpRequest(req, {
      authDeps,
      geminiApiKey: geminiApiKey || "",
      adminClient,
    });
  }

  if (url.pathname.endsWith("/document") || url.pathname.endsWith("/process-document")) {
    return handleDocumentHttpRequest(req, {
      authDeps,
      geminiApiKey: geminiApiKey || "",
      adminClient,
    });
  }

  if (req.method === "POST") {
    try {
      const clone = req.clone();
      const peek = await clone.json();
      if (peek?.action === "process_document" || peek?.mode === "DOCUMENT_PROCESS") {
        return handleDocumentHttpRequest(req, {
          authDeps,
          geminiApiKey: geminiApiKey || "",
          adminClient,
        });
      }
      if (peek?.action === "process_danfe" || peek?.mode === "DANFE_PROCESS") {
        return handleFiscalHttpRequest(req, {
          authDeps,
          geminiApiKey: geminiApiKey || "",
          adminClient,
        });
      }
      if (peek?.action === "process_boleto" || peek?.mode === "BOLETO_PROCESS") {
        return handleBoletoHttpRequest(req, {
          authDeps,
          geminiApiKey: geminiApiKey || "",
          adminClient,
        });
      }
    } catch {
      // Ignora erro de JSON e continua para o orchestrator
    }
  }

  return handleOrchestratorHttpRequest(req, {
    authDeps,
    repoFactory,
    runnerFactory,
    auditLogger,
    conversationRepo,
    proposalRepo,
    documentPipelineRunner: processDocumentPipeline,
    geminiApiKey,
    geminiApiKeyBackup,
    openaiApiKey: openAiApiKey,
    findDuplicateFn,
    saveProposalFn,
    eyemobileLiveClientFactory,
    telemetryLogger,
  });
});

