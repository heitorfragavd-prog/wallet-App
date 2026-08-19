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
}

export type FinancialDataRow = Record<string, unknown>;
export type FinancialDataExecutor = (query: FinancialDataQuery) => Promise<FinancialDataRow[]>;

function assertScope(row: FinancialDataRow, context: AiExecutionContext): void {
  if (row.user_id !== context.userId || row.workspace_id !== context.workspaceId) {
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
    return {
      id: sourceId,
      sourceType,
      sourceId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      kind,
      amount: amount(row.valor),
      occurredOn: String(row.data),
      deduplicationKey: typeof row.deduplication_key === "string" && row.deduplication_key
        ? row.deduplication_key
        : `${sourceType}:${sourceId}`,
      description: String(row.descricao ?? "Sem descrição"),
    };
  });
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
          "id,user_id,workspace_id,descricao,valor,data,deduplication_key",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo,deduplication_key",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "receita" },
        }),
      ]);
      const recs = normalizeRecords(recRows, context, "receita", "income");
      const txs = normalizeRecords(txRows, context, "transacao", "income");
      return [...recs, ...txs];
    },
    async listExpenses(context, period) {
      const [despRows, txRows] = await Promise.all([
        execute(scopedQuery(
          "despesas",
          "id,user_id,workspace_id,descricao,valor,data,deduplication_key",
          context,
          period,
        )),
        execute({
          ...scopedQuery(
            "transacoes",
            "id,user_id,workspace_id,descricao,valor,data,tipo,deduplication_key",
            context,
            period,
          ),
          equals: { user_id: context.userId, workspace_id: context.workspaceId, tipo: "despesa" },
        }),
      ]);
      const desps = normalizeRecords(despRows, context, "despesa", "expense");
      const txs = normalizeRecords(txRows, context, "transacao", "expense");
      return [...desps, ...txs];
    },
    async listTransactions(context, period) {
      const rows = await execute(scopedQuery(
        "transacoes",
        "id,user_id,workspace_id,descricao,valor,data,tipo,deduplication_key",
        context,
        period,
      ));
      return normalizeRecords(rows, context, "transacao", "income");
    },
    async listBalances(context) {
      const rows = await execute(scopedQuery(
        "contas_usuario",
        "id,user_id,workspace_id,nome,tipo,saldo,saldo_atual",
        context,
      ));
      return rows.map((row): CanonicalBalance => {
        assertScope(row, context);
        return {
          accountId: String(row.id),
          name: String(row.nome),
          amount: amount(row.saldo_atual ?? row.saldo),
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
  };
}
