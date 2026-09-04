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
  like(column: string, pattern: string): SupabaseQueryLike;
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
  functions?: {
    invoke(
      name: string,
      options?: { body?: unknown },
    ): Promise<{ data: unknown; error: Error | null }>;
  };
}

// ─── Eyemobile Live Client ────────────────────────────────────────────────────

export type EyemobileSalesSource = "eyemobile_live" | "eyemobile_sync_cache";

export interface EyemobileSalesResult {
  total: number;
  source: EyemobileSalesSource;
  stale: boolean;
  warning?: string;
  period: { start: string; end: string };
}

/**
 * Interface para buscar vendas brutas do PDV Eyemobile.
 * Implementação primária: eyemobile-sync DASHBOARD (ao vivo).
 * Fallback: tabela transacoes (cache sincronizado).
 */
export interface EyemobileLiveClient {
  fetchSales(
    userId: string,
    workspaceId: string,
    start: string,
    end: string,
  ): Promise<EyemobileSalesResult>;
}

/**
 * Cria um EyemobileLiveClient usando o adminClient do Supabase.
 *
 * Estratégia:
 * 1. Tenta eyemobile-sync DASHBOARD (ao vivo via API Eyemobile).
 *    - Passa user_id server-side (token service_role); eyemobile-sync aceita user_id no body.
 *    - Extrai kpis.totalRevenue → source="eyemobile_live", stale=false.
 * 2. Se falhar (API offline, credenciais ausentes, erro de rede):
 *    - Lê transacoes WHERE LIKE 'Venda Eyemobile %' (cache sincronizado).
 *    - source="eyemobile_sync_cache", stale=true.
 * 3. Se ambos falharem: lança erro explícito (nunca retorna R$0 como se fosse real).
 */
export function createEyemobileLiveClient(client: SupabaseClientLike): EyemobileLiveClient {
  return {
    async fetchSales(userId, workspaceId, start, end): Promise<EyemobileSalesResult> {
      const period = { start, end };

      // ── 1. Tentativa online: eyemobile-sync DASHBOARD ──────────────────────
      if (client.functions) {
        try {
          const { data, error } = await client.functions.invoke("eyemobile-sync", {
            body: {
              mode: "DASHBOARD",
              user_id: userId,       // aceito pelo service_role sem autenticação extra
              workspace_id: workspaceId,
              start_date: start,
              end_date: end,
            },
          });

          if (!error && data) {
            const response = data as Record<string, unknown>;
            if (response.success !== false && response.configured !== false) {
              // Extrai kpis.totalRevenue do dashboard ao vivo
              const kpis = response.kpis as Record<string, unknown> | undefined;
              const totalRevenue = typeof kpis?.totalRevenue === "number"
                ? kpis.totalRevenue
                : null;

              if (totalRevenue !== null) {
                return { total: totalRevenue, source: "eyemobile_live", stale: false, period };
              }

              // configured=true mas sem kpis → tenta extrair via buildEyemobileDashboard
              // O DASHBOARD retorna `sales[]` diretamente; soma os totais
              const sales = Array.isArray(response.sales) ? response.sales : [];
              if (sales.length > 0) {
                const total = (sales as Array<Record<string, unknown>>)
                  .filter((s) => !s.cancelled && s.completed !== false)
                  .reduce((sum, s) => sum + (Number(s.total ?? s.amount ?? s.value ?? 0)), 0);
                return { total, source: "eyemobile_live", stale: false, period };
              }

              // Eyemobile respondeu mas sem vendas para o período → total real é 0
              if (response.configured === true) {
                return { total: 0, source: "eyemobile_live", stale: false, period };
              }
            }

            // configured=false → Eyemobile não está configurado para este usuário
            // Não há dados ao vivo nem cache útil
            if (response.configured === false) {
              throw new Error("eyemobile_not_configured");
            }
          }
        } catch (liveErr: unknown) {
          const msg = liveErr instanceof Error ? liveErr.message : String(liveErr);
          if (msg === "eyemobile_not_configured") throw liveErr;
          // Falha de rede/API → cai para cache
          console.warn("[buscar_vendas_pdv] eyemobile-sync indisponível, usando cache:", msg);
        }
      }

      // ── 2. Fallback: tabela transacoes (cache sincronizado) ─────────────────
      type QueryResult2 = { data: FinancialDataRow[] | null; error: unknown };
      let cacheResult: QueryResult2;
      try {
        cacheResult = await (
          client
            .from("transacoes")
            .select("id,user_id,workspace_id,valor,data")
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId)
            .eq("tipo", "receita" as unknown)
            .like("descricao", "Venda Eyemobile %")
            .gte("data", start)
            .lte("data", end) as unknown as Promise<QueryResult2>
        );
      } catch {
        throw new Error("eyemobile_vendas_unavailable");
      }

      if (cacheResult.error || !cacheResult.data) {
        throw new Error("eyemobile_vendas_unavailable");
      }


      const total = cacheResult.data.reduce((sum, r) => sum + Number(r.valor ?? 0), 0);
      return {
        total,
        source: "eyemobile_sync_cache",
        stale: true,
        warning: "Estou usando os dados sincronizados mais recentes; vendas recentes podem ainda não aparecer.",
        period,
      };
    },
  };
}


export async function executeSupabaseFinancialQuery(
  client: SupabaseClientLike,
  query: FinancialDataQuery,
): Promise<FinancialDataRow[]> {

  let builder = client.from(query.table).select(query.columns);
  for (const [key, value] of Object.entries(query.equals)) {
    if (value !== undefined) {
      builder = builder.eq(key, value);
    }
  }
  if (query.dateRange) {
    builder = builder.gte(query.dateRange.column, query.dateRange.start);
    builder = builder.lte(query.dateRange.column, query.dateRange.end);
  }
  if (query.like) {
    builder = builder.like(query.like.column, query.like.pattern);
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
