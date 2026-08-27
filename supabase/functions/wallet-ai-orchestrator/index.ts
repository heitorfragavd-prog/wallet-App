import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { FailoverLlmRunner } from "../_shared/ai/failover-runner.ts";
import { createFinancialRepository } from "../_shared/ai/financial-repository.ts";
import { GeminiLlmRunner } from "../_shared/ai/gemini-adapter.ts";
import { OpenAiLlmRunner } from "../_shared/ai/openai-adapter.ts";
import { handleOrchestratorHttpRequest } from "./handler.ts";
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
const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) {
  throw new Error("wallet_ai_orchestrator_configuration_missing");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseClientLike;

const authDeps = createSupabaseAuthorizationDependencies(adminClient);

const repoFactory = () =>
  createFinancialRepository((query) =>
    executeSupabaseFinancialQuery(adminClient, query)
  );

const runnerFactory = (model?: string) => {
  const primaryRunner = new OpenAiLlmRunner({
    apiKey: openAiApiKey,
    model,
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
    await writeSupabaseAiAudit(adminClient, event);
  },
};

// O adminClient do Supabase JS expõe functions.invoke() nativamente.
// O cast para SupabaseClientLike já inclui o campo optional `functions`.
// createEyemobileLiveClient usa o service_role para invocar eyemobile-sync
// passando user_id no body (aceito pelo eyemobile-sync quando isServiceRole=true).
const eyemobileLiveClientFactory = () => createEyemobileLiveClient(adminClient);

Deno.serve((req: Request) =>
  handleOrchestratorHttpRequest(req, {
    authDeps,
    repoFactory,
    runnerFactory,
    auditLogger,
    eyemobileLiveClientFactory,
  })
);

