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
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
    documentPipelineRunner: processDocumentPipeline,
    geminiApiKey,
    geminiApiKeyBackup,
    openaiApiKey: openAiApiKey,
    findDuplicateFn,
    saveProposalFn,
    eyemobileLiveClientFactory,
  });
});

