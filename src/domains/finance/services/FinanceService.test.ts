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
});
