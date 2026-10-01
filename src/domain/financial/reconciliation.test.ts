import { describe, it, expect } from 'vitest';
import {
  reconcileSettlement,
  assertReconciliationInvariant,
  FinancialInvariantViolationError,
  SettlementAccount
} from './reconciliation';

describe('Domínio Financeiro: Conciliação e Invariantes', () => {
  const contaPJ: SettlementAccount = {
    id: 'acc-pj-01',
    name: 'Banco Itaú PJ',
    ownerType: 'PJ',
    workspaceId: 'ws-pj',
  };

  const contaPF: SettlementAccount = {
    id: 'acc-pf-01',
    name: 'Nubank PF',
    ownerType: 'PF',
    workspaceId: 'ws-pf',
  };

  it('deve conciliar transação com taxa MDR preservando a invariante fundamental em centavos', () => {
    // Venda de R$ 100,00 com taxa MDR de 2,50% (250 bps)
    const result = reconcileSettlement({
      transactionId: 'tx-001',
      grossAmount: '100.00',
      mdrRateBps: 250n,
      destinationAccount: contaPJ,
      targetWorkspaceType: 'PJ',
    });

    expect(result.grossAmountCents).toBe(10000n);
    expect(result.feeCents).toBe(250n); // R$ 2,50
    expect(result.netAmountCents).toBe(9750n); // R$ 97,50
    expect(result.netAmountCents).toBe(result.grossAmountCents - result.feeCents);
  });

  it('deve somar MDR e taxa de antecipação com exatidão', () => {
    // Venda de R$ 250,50 com MDR 1,99% (199 bps) e antecipação 1,50% (150 bps)
    const result = reconcileSettlement({
      transactionId: 'tx-002',
      grossAmount: '250.50', // 25050 centavos
      mdrRateBps: 199n,
      anticipationRateBps: 150n,
      destinationAccount: contaPJ,
      targetWorkspaceType: 'PJ',
    });

    // 25050 * 199 / 10000 = 498.495 -> 498n (half-up)
    // 25050 * 150 / 10000 = 375.750 -> 376n (half-up)
    // Total fee = 498 + 376 = 874n (R$ 8,74)
    expect(result.grossAmountCents).toBe(25050n);
    expect(result.feeCents).toBe(874n);
    expect(result.netAmountCents).toBe(24176n); // R$ 241,76
    expect(result.netAmountCents + result.feeCents).toBe(result.grossAmountCents);
  });

  it('deve bloquear quebra forçada da invariante contábil', () => {
    expect(() => {
      assertReconciliationInvariant(10000n, 250n, 9700n); // Deveria ser 9750n
    }).toThrow(FinancialInvariantViolationError);
  });

  it('deve bloquear violação de segregação patrimonial PF/PJ', () => {
    // Tentativa de liquidar recebível PJ em conta PF
    expect(() => {
      reconcileSettlement({
        transactionId: 'tx-003',
        grossAmount: '50.00',
        mdrRateBps: 200n,
        destinationAccount: contaPF,
        targetWorkspaceType: 'PJ', // Esperado PJ, mas conta é PF
      });
    }).toThrow(FinancialInvariantViolationError);
  });

  it('deve suportar arredondamento Banker\'s rounding', () => {
    const result = reconcileSettlement({
      transactionId: 'tx-004',
      grossAmount: '100.00',
      mdrRateBps: 250n,
      rounding: 'bankers',
      destinationAccount: contaPJ,
      targetWorkspaceType: 'PJ',
    });

    expect(result.netAmountCents + result.feeCents).toBe(result.grossAmountCents);
  });
});
