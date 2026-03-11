/**
 * FinanceService Unit Tests
 *
 * Tests getSummary and getMonthlyData with Supabase mocked.
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

// ── Tests ─────────────────────────────────────────────────────────

describe('FinanceService', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getSummary ─────────────────────────────────────────────────
  describe('getSummary', () => {
    it('calcula corretamente receitas, despesas e saldo', async () => {
      const chainReceitas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ valor: 1000 }, { valor: 500 }],
          error: null,
        }),
      };
      const chainDespesas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ valor: 300 }, { valor: 200 }],
          error: null,
        }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(chainReceitas as never)
        .mockReturnValueOnce(chainDespesas as never);

      const summary = await financeService.getSummary(userId);

      expect(summary.totalReceitas).toBe(1500);
      expect(summary.totalDespesas).toBe(500);
      expect(summary.saldo).toBe(1000);
    });

    it('calcula percentualGasto corretamente', async () => {
      const chainReceitas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ valor: 1000 }], error: null }),
      };
      const chainDespesas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [{ valor: 250 }], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(chainReceitas as never)
        .mockReturnValueOnce(chainDespesas as never);

      const summary = await financeService.getSummary(userId);
      expect(summary.percentualGasto).toBe(25); // 250/1000 * 100
    });

    it('retorna percentualGasto = 0 quando totalReceitas = 0 (evita divisão por zero)', async () => {
      const emptyChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(emptyChain as never)
        .mockReturnValueOnce(emptyChain as never);

      const summary = await financeService.getSummary(userId);
      expect(summary.percentualGasto).toBe(0);
      expect(summary.saldo).toBe(0);
    });

    it('lança erro quando Supabase falha', async () => {
      const errorChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockRejectedValue(new Error('DB error')),
      };

      vi.mocked(supabase.from).mockReturnValue(errorChain as never);

      await expect(financeService.getSummary(userId)).rejects.toThrow('DB error');
    });
  });

  // ── getMonthlyData ─────────────────────────────────────────────
  describe('getMonthlyData', () => {
    it('agrupa transações corretamente por mês', async () => {
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      const dateStr = `${currentYear}-${currentMonth}-15T00:00:00Z`;

      const chainReceitas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [{ valor: 1000, data: dateStr }],
          error: null,
        }),
      };
      const chainDespesas = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: [{ valor: 400, data: dateStr }],
          error: null,
        }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(chainReceitas as never)
        .mockReturnValueOnce(chainDespesas as never);

      const result = await financeService.getMonthlyData(userId, 1);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const mesAtual = result.find((m) => m.receitas > 0 || m.despesas > 0);
      expect(mesAtual?.receitas).toBe(1000);
      expect(mesAtual?.despesas).toBe(400);
    });

    it('retorna array vazio quando não há dados', async () => {
      const emptyChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(emptyChain as never)
        .mockReturnValueOnce(emptyChain as never);

      const result = await financeService.getMonthlyData(userId);
      expect(result).toEqual([]);
    });
  });
});
