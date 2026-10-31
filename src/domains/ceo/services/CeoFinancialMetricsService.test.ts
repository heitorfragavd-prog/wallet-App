import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CeoFinancialMetricsService } from './CeoFinancialMetricsService';

describe('CeoFinancialMetricsService — Auditoria de Dados 100% Reais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GATE A: Eliminação de Valores Fictícios', () => {
    it('getEmptyKpis deve retornar zeros, nulos e NENHUM valor financeiro hardcoded', () => {
      // @ts-expect-error acessando método privado para auditoria
      const emptyKpis = CeoFinancialMetricsService.getEmptyKpis();

      // Proibido conter os números fictícios auditados:
      expect(emptyKpis.faturamentoMes).toBe(0);
      expect(emptyKpis.faturamentoMes).not.toBe(287430.50);

      expect(emptyKpis.faturamentoOntem).toBe(0);
      expect(emptyKpis.faturamentoOntem).not.toBe(12845.30);

      expect(emptyKpis.despesasMes).toBe(0);
      expect(emptyKpis.despesasMes).not.toBe(45610.25);

      expect(emptyKpis.lucroEstimado).toBe(0);
      expect(emptyKpis.lucroEstimado).not.toBe(58420.10);

      expect(emptyKpis.cmvPercent).toBeNull();
      expect(emptyKpis.cmvPercent).not.toBe(32.4);

      expect(emptyKpis.crescimentoMesPercent).toBeNull();
      expect(emptyKpis.variacaoOntemVsMediaPercent).toBeNull();
      expect(emptyKpis.variacaoDespesasPercent).toBeNull();
      expect(emptyKpis.margemLucroPercent).toBeNull();

      expect(emptyKpis.cmvStatus).toBe('dados_insuficientes');
    });

    it('getSalesByChannel retorna array vazio ou canais reais, nunca porcentagens falsas pré-fabricadas', async () => {
      const result = await CeoFinancialMetricsService.getSalesByChannel('');
      expect(result).toEqual([]);

      // Nunca deve conter faturamentos hardcoded como R$ 82.492,55
      const values = result.map((c) => c.faturamento);
      expect(values).not.toContain(82492.55);
      expect(values).not.toContain(44264.30);
    });

    it('getTopProducts retorna array vazio caso não haja itens de pedido registrados', async () => {
      const result = await CeoFinancialMetricsService.getTopProducts('');
      expect(result).toEqual([]);

      // Não deve conter nomes mockados pré-fabricados
      const names = result.map((p) => p.produto);
      expect(names).not.toContain('X-Tudo Especial');
      expect(names).not.toContain('X-Bacon');
    });

    it('getMovementHeatmap não utiliza Math.random() e é determinístico para dados vazios', async () => {
      const result = await CeoFinancialMetricsService.getMovementHeatmap('');
      expect(result).toEqual([]);
    });
  });

  describe('GATE B & C: Tratamento Honesto de Indicadores', () => {
    it('quando o workspace for nulo ou vazio, retorna estado de dados vazios sem quebrar', async () => {
      const kpis = await CeoFinancialMetricsService.getExecutiveKpis('');
      expect(kpis.faturamentoMes).toBe(0);
      expect(kpis.despesasMes).toBe(0);
      expect(kpis.cmvPercent).toBeNull();
      expect(kpis.cmvStatus).toBe('dados_insuficientes');
      expect(kpis.acoesHoje.length).toBeGreaterThan(0);
    });
  });
});
