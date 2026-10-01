/**
 * Domínio Financeiro: Conciliação, Invariantes e Segregação PF/PJ.
 * Todas as operações operam estritamente sobre centavos inteiros (bigint).
 */

import { toCents, calculateRateCents, RoundingMode } from '@/utils/money';

export type AccountOwnerType = 'PF' | 'PJ';

export interface SettlementAccount {
  id: string;
  name: string;
  ownerType: AccountOwnerType;
  workspaceId: string;
}

export interface ReconciledTransaction {
  id: string;
  grossAmountCents: bigint;
  feeCents: bigint;
  netAmountCents: bigint;
  destinationAccount: SettlementAccount;
  reconciledAt: Date;
}

export interface SettlementInput {
  transactionId: string;
  grossAmount: number | string | bigint;
  mdrRateBps: bigint; // Taxa de adquirência em basis points (ex: 200n = 2.00%)
  anticipationRateBps?: bigint; // Taxa de antecipação opcional em basis points
  rounding?: RoundingMode;
  destinationAccount: SettlementAccount;
  targetWorkspaceType: AccountOwnerType;
}

/**
 * Erro de quebra de invariante contábil ou violação de segregação PF/PJ.
 */
export class FinancialInvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinancialInvariantViolationError';
  }
}

/**
 * Valida a invariante contábil fundamental de conciliação:
 * net_amount_cents = gross_amount_cents - fee_cents
 */
export function assertReconciliationInvariant(
  grossAmountCents: bigint,
  feeCents: bigint,
  netAmountCents: bigint
): void {
  if (netAmountCents !== grossAmountCents - feeCents) {
    throw new FinancialInvariantViolationError(
      `Invariante contábil violada: net (${netAmountCents}) !== gross (${grossAmountCents}) - fee (${feeCents})`
    );
  }
}

/**
 * Valida estritamente a segregação PF / PJ.
 * Impede a liquidação de recebíveis em contas de natureza divergente sem registro explícito.
 */
export function assertAccountSegregation(
  destinationAccount: SettlementAccount,
  expectedType: AccountOwnerType
): void {
  if (destinationAccount.ownerType !== expectedType) {
    throw new FinancialInvariantViolationError(
      `Violação de segregação patrimonial: tentativa de liquidar recebível ${expectedType} em conta ${destinationAccount.ownerType} ("${destinationAccount.name}")`
    );
  }
}

/**
 * Realiza o cálculo de liquidação e conciliação financeira de uma transação.
 * Aplica taxas de MDR e antecipação com invariante estrita e verificação de conta.
 */
export function reconcileSettlement(input: SettlementInput): ReconciledTransaction {
  // 1. Validação estrita de segregação PF/PJ
  assertAccountSegregation(input.destinationAccount, input.targetWorkspaceType);

  // 2. Normalização para centavos inteiros
  const grossCents = typeof input.grossAmount === 'bigint' 
    ? input.grossAmount 
    : toCents(input.grossAmount);

  if (grossCents < 0n) {
    throw new FinancialInvariantViolationError('Valor bruto da transação não pode ser negativo');
  }

  const rounding = input.rounding ?? 'half-up';

  // 3. Cálculo das taxas
  const mdrFeeCents = calculateRateCents(grossCents, input.mdrRateBps, rounding);
  const anticipationFeeCents = input.anticipationRateBps && input.anticipationRateBps > 0n
    ? calculateRateCents(grossCents, input.anticipationRateBps, rounding)
    : 0n;

  const totalFeeCents = mdrFeeCents + anticipationFeeCents;

  // 4. Determinação do valor líquido
  const netCents = grossCents - totalFeeCents;

  // 5. Garantia estrita da invariante contábil
  assertReconciliationInvariant(grossCents, totalFeeCents, netCents);

  return {
    id: input.transactionId,
    grossAmountCents: grossCents,
    feeCents: totalFeeCents,
    netAmountCents: netCents,
    destinationAccount: input.destinationAccount,
    reconciledAt: new Date(),
  };
}
