import type { AiExecutionContext } from "./auth.ts";
import { buildFinancialSummary } from "./financial-core.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialPeriodContext,
  FinancialSourceReference,
} from "./financial-types.ts";

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

export function createQueryToolCatalog(repository: FinancialQueryRepository): QueryToolCatalog {
  return {
    buscar_receitas: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listRevenues(context, period);
      return baseResult("buscar_receitas", context, period, records, sourceReferences(records));
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
