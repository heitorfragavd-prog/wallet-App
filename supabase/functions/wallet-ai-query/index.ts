import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { authorizeAiRequest } from "../_shared/ai/auth.ts";
import { createFinancialRepository } from "../_shared/ai/financial-repository.ts";
import { createQueryToolCatalog, executeQueryTool } from "../_shared/ai/query-tools.ts";
import { createWalletAiQueryHandler } from "./handler.ts";
import {
  createSupabaseAuthorizationDependencies,
  executeSupabaseFinancialQuery,
  type SupabaseClientLike,
  writeSupabaseAiAudit,
} from "./supabase-adapter.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("wallet_ai_server_configuration_missing");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as SupabaseClientLike;

const authorizationDependencies = createSupabaseAuthorizationDependencies(adminClient);
const repository = createFinancialRepository((query) =>
  executeSupabaseFinancialQuery(adminClient, query)
);
const catalog = createQueryToolCatalog(repository);

const handler = createWalletAiQueryHandler({
  authorize: (request, workspaceId) =>
    authorizeAiRequest(request, workspaceId, authorizationDependencies),
  executeTool: (tool, args, context) => executeQueryTool(tool, args, context, catalog),
  writeAudit: (event) => writeSupabaseAiAudit(adminClient, event),
});

Deno.serve(handler);
