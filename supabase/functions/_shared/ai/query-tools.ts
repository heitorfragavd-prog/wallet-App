import type { AiExecutionContext } from "./auth.ts";
import { buildFinancialSummary } from "./financial-core.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialPeriodContext,
  FinancialSourceReference,
} from "./financial-types.ts";
import type { EyemobileLiveClient } from "../../wallet-ai-query/supabase-adapter.ts";

export interface DatePeriod {
  start: string;
  end: string;
}

export interface CanonicalDebt {
  id: string;
  description: string;
  originalAmount: number;
  paidAmount: number;
  dueOn: string | null;
  status: string;
}

export interface FinancialQueryRepository {
  listRevenues(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listExpenses(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listTransactions(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listBalances(context: AiExecutionContext): Promise<CanonicalBalance[]>;
  listDebts(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalDebt[]>;
  /**
   * Vendas brutas do PDV Eyemobile.
   * Fonte: tabela `transacoes` WHERE descricao LIKE 'Venda Eyemobile %'.
   * Retorna o valor BRUTO do que foi vendido no caixa — diferente de receitas
   * (que incluem Pix/Cartão líquidos, manuais etc.).
   */
  listSalesPDV(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
}


export interface QueryToolResult<T = unknown> {
  tool: string;
  period: DatePeriod | null;
  filters: { user_id: string; workspace_id: string };
  data: T;
  sources: FinancialSourceReference[];
  formulas: Record<string, string>;
  warnings: string[];
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AiExecutionContext,
) => Promise<QueryToolResult>;

export type QueryToolCatalog = Record<string, ToolHandler>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validatePeriod(args: Record<string, unknown>): DatePeriod {
  const start = args.start;
  const end = args.end;
  if (
    typeof start !== "string" ||
    typeof end !== "string" ||
    !ISO_DATE.test(start) ||
    !ISO_DATE.test(end) ||
    start > end
  ) {
    throw new Error("invalid_period");
  }
  return { start, end };
}

function monthlyPeriod(args: Record<string, unknown>): DatePeriod {
  const year = args.year;
  const month = args.month;
  if (!Number.isInteger(year) || !Number.isInteger(month) || Number(month) < 1 || Number(month) > 12) {
    throw new Error("invalid_period");
  }
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { start, end: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
}

function baseResult<T>(
  tool: string,
  context: AiExecutionContext,
  period: DatePeriod | null,
  data: T,
  sources: FinancialSourceReference[] = [],
  formulas: Record<string, string> = {},
  warnings: string[] = [],
): QueryToolResult<T> {
  return {
    tool,
    period,
    filters: { user_id: context.userId, workspace_id: context.workspaceId },
    data,
    sources,
    formulas,
    warnings,
  };
}

function sourceReferences(records: CanonicalFinancialRecord[]): FinancialSourceReference[] {
  const grouped = new Map<FinancialSourceReference["type"], string[]>();
  for (const record of records) {
    const ids = grouped.get(record.sourceType) ?? [];
    ids.push(record.sourceId);
    grouped.set(record.sourceType, ids);
  }
  return [...grouped.entries()].map(([type, ids]) => ({ type, ids }));
}

export function createQueryToolCatalog(
  repository: FinancialQueryRepository,
  eyemobileClient?: EyemobileLiveClient,
): QueryToolCatalog {
  return {
    buscar_receitas: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listRevenues(context, period);
      return baseResult(
        "buscar_receitas",
        context,
        period,
        records,
        sourceReferences(records),
        {},
        ["ATENÇÃO: esta tool retorna RECEITAS FINANCEIRAS registradas na Wallet (Pix/Cartão líquidos + dinheiro PDV + manuais). Para VENDAS BRUTAS do PDV Eyemobile, use buscar_vendas_pdv."],
      );
    },
    buscar_vendas_pdv: async (args, context) => {
      // Etapa 1.4b: usa Eyemobile ao vivo (eyemobile-sync DASHBOARD) se disponível.
      // workspace/userId vêm do AiExecutionContext server-side — nunca do LLM.
      const period = validatePeriod(args);

      if (eyemobileClient) {
        try {
          const result = await eyemobileClient.fetchSales(
            context.userId,
            context.workspaceId,
            period.start,
            period.end,
          );
          const warnings: string[] = [];
          if (result.stale && result.warning) warnings.push(result.warning);
          return baseResult(
            "buscar_vendas_pdv",
            context,
            period,
            { total: result.total, source: result.source, stale: result.stale },
            [],
            { totalBruto: "faturamento bruto do PDV Eyemobile no período", source: result.source },
            warnings,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // eyemobile_not_configured → informar usuário explicitamente
          if (msg === "eyemobile_not_configured") {
            return baseResult(
              "buscar_vendas_pdv",
              context,
              period,
              { total: null, source: "eyemobile_not_configured", stale: true },
              [],
              {},
              ["Eyemobile não está configurado para este workspace. Não é possível consultar vendas do PDV."],
            );
          }
          // eyemobile_vendas_unavailable → ambas as fontes falharam
          if (msg === "eyemobile_vendas_unavailable") {
            return baseResult(
              "buscar_vendas_pdv",
              context,
              period,
              { total: null, source: "unavailable", stale: true },
              [],
              {},
              ["Não foi possível consultar as vendas do PDV Eyemobile no momento. Tente novamente em instantes."],
            );
          }
          // Erro inesperado — propaga para o orchestrator
          throw err;
        }
      }

      // Fallback sem eyemobileClient: lê tabela sincronizada
      const records = await repository.listSalesPDV(context, period);
      const totalBruto = records.reduce((sum, r) => sum + r.amount, 0);
      return baseResult(
        "buscar_vendas_pdv",
        context,
        period,
        { total: totalBruto, source: "eyemobile_sync_cache", stale: true },
        sourceReferences(records),
        { totalBruto: "soma dos valores brutos das vendas PDV Eyemobile sincronizadas" },
        ["Usando dados sincronizados (eyemobile-sync DASHBOARD indisponível). Vendas recentes podem não aparecer."],
      );
    },
    buscar_despesas: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listExpenses(context, period);
      return baseResult("buscar_despesas", context, period, records, sourceReferences(records));
    },
    buscar_transacoes: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listTransactions(context, period);
      return baseResult("buscar_transacoes", context, period, records, sourceReferences(records));
    },
    consultar_saldos: async (_args, context) => {
      const balances = await repository.listBalances(context);
      return baseResult(
        "consultar_saldos",
        context,
        null,
        balances,
        [],
        { availableBalance: "soma dos saldos de contas; cartões de crédito excluídos" },
      );
    },
    consultar_dividas: async (args, context) => {
      const period = validatePeriod(args);
      const debts = await repository.listDebts(context, period);
      return baseResult(
        "consultar_dividas",
        context,
        period,
        debts,
        [],
        { outstandingAmount: "valor original - valor pago" },
      );
    },
    consultar_resumo_mensal: async (args, context) => {
      const period = monthlyPeriod(args);
      const [revenues, expenses, transactions, balances] = await Promise.all([
        repository.listRevenues(context, period),
        repository.listExpenses(context, period),
        repository.listTransactions(context, period),
        repository.listBalances(context),
      ]);
      const summaryContext: FinancialPeriodContext = {
        userId: context.userId,
        workspaceId: context.workspaceId,
        ...period,
      };
      const summary = buildFinancialSummary(
        [...revenues, ...expenses, ...transactions],
        balances,
        summaryContext,
      );
      return baseResult(
        "consultar_resumo_mensal",
        context,
        period,
        summary,
        summary.sources,
        summary.formulas,
        summary.warnings,
      );
    },
  };
}

export async function executeQueryTool(
  tool: string,
  args: Record<string, unknown>,
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
): Promise<QueryToolResult> {
  const handler = catalog[tool];
  if (!handler) throw new Error("tool_not_allowed");
  return handler(args, context);
}
