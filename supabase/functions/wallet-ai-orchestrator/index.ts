import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { FailoverLlmRunner } from "../_shared/ai/failover-runner.ts";
import { createFinancialRepository } from "../_shared/ai/financial-repository.ts";
import { GeminiLlmRunner } from "../_shared/ai/gemini-adapter.ts";
import { OpenAiLlmRunner } from "../_shared/ai/openai-adapter.ts";
import { handleBoletoHttpRequest } from "./boleto-handler.ts";
import { handleFiscalHttpRequest } from "./fiscal-handler.ts";
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

  if (req.method === "POST") {
    try {
      const clone = req.clone();
      const peek = await clone.json();
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
    eyemobileLiveClientFactory,
  });
});


