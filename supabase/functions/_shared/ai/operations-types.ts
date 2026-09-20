/**
 * Operations Agent — Canonical Contracts and Types (Etapa 9.5B)
 * Fechamento de Caixa, Conciliação Operacional e Eyemobile PDV.
 */

export type PaymentMethod =
  | "dinheiro"
  | "debito"
  | "credito"
  | "pix"
  | "voucher"
  | "outros";

export type ClosingStatus =
  | "exato"
  | "sobra"
  | "furo"
  | "divergencia_meio_pagamento";

export interface OperationalTransaction {
  id: string;
  workspaceId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  amount: number; // Em Reais (decimal positivo)
  type: "receita" | "despesa";
  paymentMethod: PaymentMethod;
  description: string;
  source: "local" | "eyemobile";
  metadata?: Record<string, unknown>;
}

export interface CashClosingInput {
  workspaceId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  shift?: string;
  reportedTotal?: number;
  reportedByMethod?: Partial<Record<PaymentMethod, number>>;
  correlationId?: string;
}

export interface PaymentMethodDifference {
  expected: number;
  reported: number;
  difference: number;
  status: "exato" | "sobra" | "furo";
}

export interface CashClosingResult {
  workspaceId: string;
  date: string;
  shift?: string;
  expectedTotal: number;
  reportedTotal: number;
  difference: number;
  differencesByMethod: Record<PaymentMethod, PaymentMethodDifference>;
  status: ClosingStatus;
  warnings: string[];
  correlationId: string;
  summaryMessage: string;
}

export interface EyemobileProductRecord {
  id: string;
  workspaceId: string;
  produtoId?: string;
  codigoBarras?: string;
  nome: string;
  custoAtual: number;
  estoqueAtual: number;
}

export interface EyemobileSalesQueryInput {
  workspaceId: string;
  startDate: string;
  endDate?: string;
  correlationId?: string;
}

export interface EyemobileSalesResult {
  workspaceId: string;
  period: { start: string; end: string };
  totalSales: number;
  transactionsCount: number;
  averageTicket: number;
  salesByMethod: Record<PaymentMethod, number>;
  source: "eyemobile_api_realtime" | "banco_local" | "nenhuma";
  warnings: string[];
}

export interface UpdateEyemobileCostInput {
  produtoId?: string;
  produtoNome?: string;
  codigoBarras?: string;
  novoCusto: number;
  quantidadeEstoque?: number;
  motivo?: string;
}

export type OperationsEventName =
  | "operations_query_started"
  | "operations_query_completed"
  | "closing_validation_started"
  | "closing_validation_completed"
  | "closing_divergence_detected"
  | "eyemobile_read_completed"
  | "operations_proposal_created"
  | "operations_error";

export type OperationsErrorCode =
  | "WALLET_AI_OPERATIONS_INVALID_INPUT"
  | "WALLET_AI_OPERATIONS_DATA_UNAVAILABLE"
  | "WALLET_AI_OPERATIONS_RECONCILIATION_FAILED"
  | "WALLET_AI_OPERATIONS_FORBIDDEN"
  | "WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH";

export class OperationsError extends Error {
  public readonly code: OperationsErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: OperationsErrorCode, message: string, details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = "OperationsError";
    this.code = code;
    this.details = details;
  }
}
