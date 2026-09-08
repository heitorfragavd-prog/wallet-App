/**
 * FinanceService Unit Tests
 *
 * Tests getSummary and getMonthlyData with Supabase mocked.
 * O serviço consolida 3 fontes: receitas + transacoes(tipo=receita) + despesas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { financeService } from './FinanceService';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

// ── Helpers ─────────────────────────────────────────────────────
// Cadeia "thenable": funciona para qualquer profundidade de chain
// (select.eq, select.eq.eq, select.eq.gte...) — await resolve { data, error }.
const makeChain = (data: unknown[], error: unknown = null) => {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  } as never;
};

const makeErrorChain = (message: string) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.reject(new Error(message)).then(resolve, reject),
} as never);

// Ordem das consultas em getSummary/getMonthlyData:
// 1) receitas  2) transacoes (tipo=receita)  3) despesas
const mockFromSequence = (...chains: never[]) => {
  const mocked = vi.mocked(supabase.from);
  chains.forEach((chain) => mocked.mockReturnValueOnce(chain));
};

// ── Tests ─────────────────────────────────────────────────────────

describe('FinanceService', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getSummary ─────────────────────────────────────────────────
  describe('getSummary', () => {
    it('calcula corretamente receitas, despesas e saldo', async () => {
      mockFromSequence(
        makeChain([{ valor: 1000 }, { valor: 500 }]), // receitas
        makeChain([]),                                 // transacoes receita
        makeChain([{ valor: 300 }, { valor: 200 }]),   // despesas
      );

      const summary = await financeService.getSummary(userId);

      expect(summary.totalReceitas).toBe(1500);
      expect(summary.totalDespesas).toBe(500);
      expect(summary.saldo).toBe(1000);
    });

    it('soma transacoes de receita junto com as receitas diretas', async () => {
      mockFromSequence(
        makeChain([{ valor: 1000 }]),
        makeChain([{ valor: 200, descricao: 'Venda avulsa', observacoes: null, metodo_pagamento: 'pix' }]),
        makeChain([{ valor: 300 }]),
      );

      const summary = await financeService.getSummary(userId);
      expect(summary.totalReceitas).toBe(1200);
    });

    it('Eyemobile PDV: só conta o que foi em dinheiro', async () => {
      mockFromSequence(
        makeChain([]),
        makeChain([
          { valor: 100, descricao: 'Venda PDV Eyemobile', observacoes: null, metodo_pagamento: 'DINHEIRO' },
          { valor: 999, descricao: 'Venda PDV Eyemobile', observacoes: null, metodo_pagamento: 'PIX' },
          { valor: 888, descricao: 'Integrado via Eyemobile API', observacoes: null, metodo_pagamento: 'CREDITO' },
        ]),
        makeChain([]),
      );

      const summary = await financeService.getSummary(userId);
      expect(summary.totalReceitas).toBe(100); // só o dinheiro entra
    });

    it('calcula percentualGasto corretamente', async () => {
      mockFromSequence(
        makeChain([{ valor: 1000 }]),
        makeChain([]),
        makeChain([{ valor: 250 }]),
      );

      const summary = await financeService.getSummary(userId);
      expect(summary.percentualGasto).toBe(25); // 250/1000 * 100
    });

    it('retorna percentualGasto = 0 quando totalReceitas = 0 (evita divisão por zero)', async () => {
      mockFromSequence(makeChain([]), makeChain([]), makeChain([]));

      const summary = await financeService.getSummary(userId);
      expect(summary.percentualGasto).toBe(0);
      expect(summary.saldo).toBe(0);
    });

    it('lança erro quando Supabase falha', async () => {
      mockFromSequence(makeErrorChain('DB error'), makeChain([]), makeChain([]));

      await expect(financeService.getSummary(userId)).rejects.toThrow('DB error');
    });
  });

  // ── getMonthlyData ─────────────────────────────────────────────
  describe('getMonthlyData', () => {
    it('agrupa transações corretamente por mês', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${currentMonth}-15T00:00:00Z`;

      mockFromSequence(
        makeChain([{ valor: 1000, data: dateStr }]), // receitas
        makeChain([]),                                // transacoes receita
        makeChain([{ valor: 400, data: dateStr }]),   // despesas
      );

      const result = await financeService.getMonthlyData(userId, 1);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const mesAtual = result.find((m) => m.receitas > 0 || m.despesas > 0);
      expect(mesAtual?.receitas).toBe(1000);
      expect(mesAtual?.despesas).toBe(400);
    });

    it('inclui transacoes de receita no mês correto e filtra PDV não-dinheiro', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${currentMonth}-15T00:00:00Z`;

      mockFromSequence(
        makeChain([]),
        makeChain([
          { valor: 50, data: dateStr, descricao: 'Venda PDV', observacoes: null, metodo_pagamento: 'DINHEIRO' },
          { valor: 999, data: dateStr, descricao: 'Venda PDV', observacoes: null, metodo_pagamento: 'PIX' },
        ]),
        makeChain([]),
      );

      const result = await financeService.getMonthlyData(userId, 1);
      const mesAtual = result.find((m) => m.receitas > 0);
      expect(mesAtual?.receitas).toBe(50);
    });

    it('retorna array vazio quando não há dados', async () => {
      mockFromSequence(makeChain([]), makeChain([]), makeChain([]));

      const result = await financeService.getMonthlyData(userId);
      expect(result).toEqual([]);
    });
  });

  describe('calculateBalance', () => {
    it('calcula saldo positivo quando receitas superam despesas', () => {
      expect(financeService.calculateBalance(1500, 500)).toBe(1000);
    });

    it('calcula saldo negativo quando despesas superam receitas', () => {
      expect(financeService.calculateBalance(500, 1500)).toBe(-1000);
    });

    it('calcula saldo zero quando iguais', () => {
      expect(financeService.calculateBalance(350.5, 350.5)).toBe(0);
    });
  });

  describe('calculateBudgetUsage', () => {
    it('calcula porcentagem consumida corretamente', () => {
      expect(financeService.calculateBudgetUsage(250, 1000)).toBe(25);
    });

    it('limita o uso em 100% quando o orçamento é estourado', () => {
      expect(financeService.calculateBudgetUsage(1500, 1000)).toBe(100);
    });

    it('retorna 0 quando o orçamento for zero ou negativo', () => {
      expect(financeService.calculateBudgetUsage(100, 0)).toBe(0);
      expect(financeService.calculateBudgetUsage(100, -500)).toBe(0);
    });
  });

  describe('createDebt (motor de parcelamento de dívidas)', () => {
    it('cria parcelas distribuindo centavos na última parcela e vincula parent_id', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'div-1' }, { id: 'div-2' }, { id: 'div-3' }],
          error: null,
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'dividas') {
          return {
            insert: mockInsert,
            update: mockUpdate,
          } as never;
        }
        return {} as never;
      });

      const result = await financeService.createDebt({
        userId,
        descricao: 'Empréstimo Bancário',
        valorTotal: 100.00,
        totalParcelas: 3,
        dataVencimentoInicial: '2026-01-31',
        credor: 'Banco do Brasil',
      });

      expect(result.id).toBe('div-1');
      expect(mockInsert).toHaveBeenCalledTimes(1);

      const rowsInserted = mockInsert.mock.calls[0][0];
      expect(rowsInserted).toHaveLength(3);

      // Parcela 1: 33.33
      expect(rowsInserted[0].valor_total).toBe(33.33);
      expect(rowsInserted[0].data_vencimento).toBe('2026-01-31');
      expect(rowsInserted[0].descricao).toBe('Empréstimo Bancário (1/3)');

      // Parcela 2: Fevereiro clampado para 28
      expect(rowsInserted[1].valor_total).toBe(33.33);
      expect(rowsInserted[1].data_vencimento).toBe('2026-02-28');

      // Parcela 3: Absorve a diferença do arredondamento: 100 - (33.33 * 2) = 33.34
      expect(rowsInserted[2].valor_total).toBe(33.34);
      expect(rowsInserted[2].data_vencimento).toBe('2026-03-31');

      // Verifica vinculação do parent_id
      expect(mockUpdate).toHaveBeenCalledWith({ parent_id: 'div-1' });
    });

    it('lança erro se a inserção no Supabase falhar', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
        }),
      } as never);

      await expect(
        financeService.createDebt({
          userId,
          descricao: 'Dívida Falha',
          valorTotal: 50,
          totalParcelas: 1,
          dataVencimentoInicial: '2026-05-10',
          credor: 'Loja',
        })
      ).rejects.toThrow('DB Error');
    });
  });

  describe('createTransaction (motor de parcelamento de transações)', () => {
    it('cria transação parcelada e vincula ao parent_id', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'tx-1' }, { id: 'tx-2' }],
          error: null,
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'transacoes') {
          return {
            insert: mockInsert,
            update: mockUpdate,
          } as never;
        }
        return {} as never;
      });

      const result = await financeService.createTransaction({
        userId,
        descricao: 'Compra Notebook',
        tipo: 'despesa',
        valorTotal: 500.00,
        totalParcelas: 2,
        dataInicial: '2026-06-15',
      });

      expect(result.id).toBe('tx-1');
      expect(mockInsert).toHaveBeenCalledTimes(1);

      const rows = mockInsert.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0].valor).toBe(250.00);
      expect(rows[0].descricao).toBe('Compra Notebook (1/2)');
      expect(rows[1].valor).toBe(250.00);
      expect(rows[1].descricao).toBe('Compra Notebook (2/2)');

      expect(mockUpdate).toHaveBeenCalledWith({ parent_id: 'tx-1' });
    });
  });
});
