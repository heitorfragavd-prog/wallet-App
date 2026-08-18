import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  CanonicalFinancialSummary,
  FinancialPeriodContext,
  FinancialSourceReference,
  FinancialSourceType,
} from "./financial-types.ts";

export interface DeduplicationResult {
  records: CanonicalFinancialRecord[];
  duplicates: CanonicalFinancialRecord[];
}

export function deduplicateRecords(records: CanonicalFinancialRecord[]): DeduplicationResult {
  const seen = new Set<string>();
  const unique: CanonicalFinancialRecord[] = [];
  const duplicates: CanonicalFinancialRecord[] = [];

  for (const record of records) {
    if (seen.has(record.deduplicationKey)) {
      duplicates.push(record);
      continue;
    }
    seen.add(record.deduplicationKey);
    unique.push(record);
  }

  return { records: unique, duplicates };
}

function assertScope(records: CanonicalFinancialRecord[], context: FinancialPeriodContext): void {
  const mismatch = records.some(
    (record) => record.workspaceId !== context.workspaceId || record.userId !== context.userId,
  );
  if (mismatch) throw new Error("financial_record_scope_mismatch");
}

function buildSources(records: CanonicalFinancialRecord[]): FinancialSourceReference[] {
  const grouped = new Map<FinancialSourceType, string[]>();
  for (const record of records) {
    const ids = grouped.get(record.sourceType) ?? [];
    if (!ids.includes(record.sourceId)) ids.push(record.sourceId);
    grouped.set(record.sourceType, ids);
  }
  return [...grouped.entries()].map(([type, ids]) => ({ type, ids }));
}

export function buildFinancialSummary(
  records: CanonicalFinancialRecord[],
  balances: CanonicalBalance[],
  context: FinancialPeriodContext,
): CanonicalFinancialSummary {
  assertScope(records, context);
  const deduplicated = deduplicateRecords(records);
  const operationalIncome = deduplicated.records
    .filter((record) => record.kind === "income")
    .reduce((total, record) => total + record.amount, 0);
  const operationalExpenses = deduplicated.records
    .filter((record) => record.kind === "expense")
    .reduce((total, record) => total + record.amount, 0);
  const internalTransfers = deduplicated.records
    .filter((record) => record.kind === "transfer")
    .reduce((total, record) => total + record.amount, 0);
  const availableBalance = balances
    .filter((balance) => balance.type !== "credit_card" && balance.type !== "cartao_credito")
    .reduce((total, balance) => total + balance.amount, 0);

  const warnings: string[] = [];
  if (deduplicated.duplicates.length === 1) {
    warnings.push("1 registro duplicado foi desconsiderado.");
  } else if (deduplicated.duplicates.length > 1) {
    warnings.push(`${deduplicated.duplicates.length} registros duplicados foram desconsiderados.`);
  }

  return {
    period: { start: context.start, end: context.end },
    operationalIncome,
    operationalExpenses,
    cashResult: operationalIncome - operationalExpenses,
    internalTransfers,
    availableBalance,
    sources: buildSources(deduplicated.records),
    warnings,
    formulas: {
      cashResult: "receitas operacionais - despesas operacionais; transferências internas excluídas",
      availableBalance: "soma dos saldos de contas; cartões de crédito excluídos",
    },
  };
}
