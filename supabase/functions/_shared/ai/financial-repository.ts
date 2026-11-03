import type { AiExecutionContext } from "./auth.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialRecordKind,
  FinancialSourceType,
} from "./financial-types.ts";
import type { CanonicalDebt, DatePeriod, FinancialQueryRepository } from "./query-tools.ts";

export interface FinancialDataQuery {
  table: "receitas" | "despesas" | "transacoes" | "contas_usuario" | "dividas";
  columns: string;
  equals: { user_id: string; workspace_id: string; [key: string]: unknown };
  dateRange?: { column: "data" | "data_vencimento"; start: string; end: string };
  /** Optional LIKE filter: { column, pattern }. Applied with SQL LIKE operator. */
  like?: { column: string; pattern: string };
}

export type FinancialDataRow = Record<string, unknown>;
export type FinancialDataExecutor = (query: FinancialDataQuery) => Promise<FinancialDataRow[]>;

function assertScope(row: FinancialDataRow, context: AiExecutionContext): void {
  if (row.workspace_id !== context.workspaceId) {
    throw new Error("repository_scope_mismatch");
  }
}

function amount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error("invalid_financial_amount");
  return parsed;
}

function normalizeRecords(
  rows: FinancialDataRow[],
  context: AiExecutionContext,
  sourceType: FinancialSourceType,
  defaultKind: FinancialRecordKind,
): CanonicalFinancialRecord[] {
  return rows.map((row) => {
    assertScope(row, context);
    const sourceId = String(row.id);
    const kind = sourceType === "transacao"
      ? row.tipo === "transferencia"
        ? "transfer"
        : row.tipo === "despesa"
          ? "expense"
          : "income"
      : defaultKind;
    const desc = String(row.descricao ?? "Sem descrição");
    const matchEyemobile = desc.match(/Venda Eyemobile\s*#(\d+)/i);
    const dedup = typeof row.deduplication_key === "string" && row.deduplication_key
      ? row.deduplication_key
      : matchEyemobile
        ? `eyemobile:sale:${matchEyemobile[1]}`
        : `${sourceType}:${sourceId}`;

    return {
      id: sourceId,
      sourceType,
      sourceId,
      workspaceId: context.workspaceId,
      userId: String(row.user_id || context.userId),
      kind,
      amount: amount(row.valor),
      occurredOn: String(row.data),
      deduplicationKey: dedup,
      description: desc,
    };
  });
}

function deduplicateCanonicalRecords(records: CanonicalFinancialRecord[]): CanonicalFinancialRecord[] {
  const seen = new Set<string>();
  const out: CanonicalFinancialRecord[] = [];
  for (const r of records) {
    if (r.deduplicationKey) {
      if (seen.has(r.deduplicationKey)) continue;
      seen.add(r.deduplicationKey);
    }
    out.push(r);
  }
  return out;
}

function scopedQuery(
  table: FinancialDataQuery["table"],
  columns: string,
  context: AiExecutionContext,
  period?: DatePeriod,
  dateColumn: "data" | "data_vencimento" = "data",
): FinancialDataQuery {
  return {
    table,
    columns,
    equals: { user_id: context.userId, workspace_id: context.workspaceId },
    dateRange: period ? { column: dateColumn, ...period } : undefined,
  };
}

export function createFinancialRepository(execute: FinancialDataExecutor): FinancialQueryRepository {
  return {
    async listRevenues(context, period) {
      const [recRows, txRows] = await Promise.all([
        execute(scopedQuery(
          "receitas",
          "id,user_id,workspace_id,descricao,valor,data",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "receita" },
        }),
      ]);
      const recs = normalizeRecords(recRows, context, "receita", "income");
      const txs = normalizeRecords(txRows, context, "transacao", "income");
      return deduplicateCanonicalRecords([...recs, ...txs]);
    },
    async listExpenses(context, period) {
      const [despRows, txRows] = await Promise.all([
        execute(scopedQuery(
          "despesas",
          "id,user_id,workspace_id,descricao,valor,data",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "despesa" },
        }),
      ]);
      const desps = normalizeRecords(despRows, context, "despesa", "expense");
      const txs = normalizeRecords(txRows, context, "transacao", "expense");
      return deduplicateCanonicalRecords([...desps, ...txs]);
    },
    async listTransactions(context, period) {
      const rows = await execute(scopedQuery(
        "transacoes",
        "id,user_id,workspace_id,descricao,valor,data,tipo",
        context,
        period,
      ));
      return deduplicateCanonicalRecords(normalizeRecords(rows, context, "transacao", "income"));
    },
    async listBalances(context) {
      const rows = await execute(scopedQuery(
        "contas_usuario",
        "id,user_id,workspace_id,nome,tipo,saldo_atual",
        context,
      ));
      return rows.map((row): CanonicalBalance => {
        assertScope(row, context);
        return {
          accountId: String(row.id),
          name: String(row.nome),
          amount: amount(row.saldo_atual ?? (row as Record<string, unknown>).saldo),
          type: String(row.tipo),
        };
      });
    },
    async listDebts(context, period) {
      const rows = await execute(scopedQuery(
        "dividas",
        "id,user_id,workspace_id,descricao,valor_total,valor_pago,data_vencimento,status",
        context,
        period,
        "data_vencimento",
      ));
      return rows.map((row): CanonicalDebt => {
        assertScope(row, context);
        return {
          id: String(row.id),
          description: String(row.descricao),
          originalAmount: amount(row.valor_total),
          paidAmount: amount(row.valor_pago),
          dueOn: typeof row.data_vencimento === "string" ? row.data_vencimento : null,
          status: String(row.status),
        };
      });
    },
    async listSalesPDV(context, period) {
      // Fonte canônica de vendas brutas do PDV Eyemobile no banco.
      // Consulta todas as vendas da loja no workspace_id (inclui sincronizações por usuário integrador).
      const rows = await execute({
        table: "transacoes",
        columns: "id,user_id,workspace_id,descricao,valor,data,tipo",
        equals: { workspace_id: context.workspaceId, tipo: "receita" },
        dateRange: period ? { column: "data", ...period } : undefined,
        like: { column: "descricao", pattern: "Venda Eyemobile %" },
      });
      return deduplicateCanonicalRecords(normalizeRecords(rows, context, "transacao", "income"));
    },
  };
}
