import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { createFinancialRepository } from "../_shared/ai/financial-repository.ts";
import { OpenAiLlmRunner } from "../_shared/ai/openai-adapter.ts";
import { handleOrchestratorHttpRequest } from "./handler.ts";
import { processDocumentPipeline } from "../_shared/ai/document-pipeline.ts";
import { SupabaseActionProposalRepository } from "../_shared/ai/action-repository.ts";
import {
  createSupabaseAuthorizationDependencies,
  executeSupabaseFinancialQuery,
  type SupabaseClientLike,
  writeSupabaseAiAudit,
} from "../wallet-ai-query/supabase-adapter.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const geminiApiKeyBackup = Deno.env.get("GEMINI_API_KEY_BACKUP");

if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) {
  throw new Error("wallet_ai_orchestrator_configuration_missing");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseClientLike;

const proposalRepo = new SupabaseActionProposalRepository(adminClient as any);

const authDeps = createSupabaseAuthorizationDependencies(adminClient);

const repoFactory = () =>
  createFinancialRepository((query) =>
    executeSupabaseFinancialQuery(adminClient, query)
  );

const runnerFactory = (model?: string) =>
  new OpenAiLlmRunner({
    apiKey: openAiApiKey,
    model,
  });

const auditLogger = {
  logEvent: async (event: Parameters<typeof writeSupabaseAiAudit>[1]) => {
    await writeSupabaseAiAudit(adminClient, event);
  },
};

const findDuplicateFn = async (
  _ctx: any,
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
      const { data } = await (adminClient as any)
        .from("wallet_ai_action_proposals")
        .select("id, status")
        .eq("workspace_id", params.workspaceId)
        .contains("payload", { chave_acesso: params.chaveAcesso })
        .limit(1);
      if (data && data.length > 0) {
        return { isDuplicate: true, existingRecordId: data[0].id, type: "proposal" };
      }
    }
    if (params.linhaDigitavel) {
      const { data } = await (adminClient as any)
        .from("wallet_ai_action_proposals")
        .select("id, status")
        .eq("workspace_id", params.workspaceId)
        .contains("payload", { linha_digitavel: params.linhaDigitavel })
        .limit(1);
      if (data && data.length > 0) {
        return { isDuplicate: true, existingRecordId: data[0].id, type: "proposal" };
      }
    }
  } catch {
    // Fail-safe
  }
  return { isDuplicate: false };
};

const saveProposalFn = async (_ctx: any, proposal: any) => {
  await proposalRepo.saveProposal(proposal);
};

Deno.serve((req: Request) =>
  handleOrchestratorHttpRequest(req, {
    authDeps,
    repoFactory,
    runnerFactory,
    auditLogger,
    documentPipelineRunner: processDocumentPipeline,
    geminiApiKey,
    geminiApiKeyBackup,
    openaiApiKey,
    findDuplicateFn,
    saveProposalFn,
  })
);

