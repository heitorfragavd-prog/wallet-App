export type FinancialSourceType = "receita" | "despesa" | "transacao";
export type FinancialRecordKind = "income" | "expense" | "transfer";

export interface CanonicalFinancialRecord {
  id: string;
  sourceType: FinancialSourceType;
  sourceId: string;
  workspaceId: string;
  userId: string;
  kind: FinancialRecordKind;
  amount: number;
  occurredOn: string;
  deduplicationKey: string;
  description: string;
}

export interface CanonicalBalance {
  accountId: string;
  name: string;
  amount: number;
  type: string;
}

export interface FinancialPeriodContext {
  userId: string;
  workspaceId: string;
  start: string;
  end: string;
}

export interface FinancialSourceReference {
  type: FinancialSourceType;
  ids: string[];
}

export interface CanonicalFinancialSummary {
  period: { start: string; end: string };
  operationalIncome: number;
  operationalExpenses: number;
  cashResult: number;
  internalTransfers: number;
  availableBalance: number;
  sources: FinancialSourceReference[];
  warnings: string[];
  formulas: {
    cashResult: string;
    availableBalance: string;
  };
}
