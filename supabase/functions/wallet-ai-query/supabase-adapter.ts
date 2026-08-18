import type { AuthorizationDependencies } from "../_shared/ai/auth.ts";
import type {
  FinancialDataQuery,
  FinancialDataRow,
} from "../_shared/ai/financial-repository.ts";
import type { AiQueryAuditEvent } from "./handler.ts";

interface QueryResult<T> {
  data: T | null;
  error: unknown | null;
}

interface SupabaseQueryLike extends PromiseLike<QueryResult<FinancialDataRow[]>> {
  select(columns: string): SupabaseQueryLike;
  eq(column: string, value: unknown): SupabaseQueryLike;
  gte(column: string, value: unknown): SupabaseQueryLike;
  lte(column: string, value: unknown): SupabaseQueryLike;
  maybeSingle(): Promise<QueryResult<{ id: string }>>;
  insert(value: unknown): PromiseLike<{ error: unknown | null }>;
}

export interface SupabaseClientLike {
  auth?: {
    getUser(accessToken: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown | null;
    }>;
  };
  from(table: string): SupabaseQueryLike;
}

export async function executeSupabaseFinancialQuery(
  client: SupabaseClientLike,
  query: FinancialDataQuery,
): Promise<FinancialDataRow[]> {
  let builder = client.from(query.table).select(query.columns);
  builder = builder.eq("user_id", query.equals.user_id);
  builder = builder.eq("workspace_id", query.equals.workspace_id);
  if (query.dateRange) {
    builder = builder.gte(query.dateRange.column, query.dateRange.start);
    builder = builder.lte(query.dateRange.column, query.dateRange.end);
  }
  const result = await builder;
  if (result.error) throw new Error("financial_query_failed");
  return result.data ?? [];
}

export function createSupabaseAuthorizationDependencies(
  client: SupabaseClientLike,
): AuthorizationDependencies {
  if (!client.auth) throw new Error("supabase_auth_unavailable");
  return {
    async getUser(accessToken) {
      const { data, error } = await client.auth!.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    async findOwnedWorkspace(workspaceId, userId) {
      const { data, error } = await client
        .from("workspaces")
        .select("id")
        .eq("id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return { id: data.id };
    },
  };
}

export async function writeSupabaseAiAudit(
  client: SupabaseClientLike,
  event: AiQueryAuditEvent,
): Promise<void> {
  const { error } = await client.from("wallet_ai_audit_events").insert({
    user_id: event.userId,
    workspace_id: event.workspaceId,
    tool_name: event.tool,
    execution_status: event.status,
    duration_ms: Math.max(0, Math.round(event.durationMs)),
    error_code: event.errorCode ?? null,
  });
  if (error) throw new Error("audit_write_failed");
}
