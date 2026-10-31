import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveWeightedCMV,
  detectCommercialGrowthOpportunities,
  detectLossAndWasteOpportunities,
  buildCeoDepartmentSummaries,
} from './growth-engine';
import { ProductSalesCMVRecord, OperationalLossEvent, CommercialExperiment } from './types';

describe('Wallet CEO — Motor Analítico de Crescimento & CMV', () => {
  const mockSales: ProductSalesCMVRecord[] = [
    {
      product_id: 'p-1',
      product_name: 'X-Tudo Especial',
      quantity_sold: 100, // Alto volume
      unit_price: 30.0,
      unit_cost: 10.0, // CMV unitário = 33.3%
      category: 'Lanches',
    },
    {
      product_id: 'p-2',
      product_name: 'Bebida Premium',
      quantity_sold: 2, // Baixíssimo volume
      unit_price: 50.0,
      unit_cost: 40.0, // CMV unitário = 80.0%
      category: 'Bebidas',
    },
  ];

  describe('calculateEffectiveWeightedCMV', () => {
    it('calcula o CMV ponderado pelo volume e faturamento real, evitando distorção da média simples', () => {
      const result = calculateEffectiveWeightedCMV(mockSales);

      // Faturamento total: (100 * 30) + (2 * 50) = 3000 + 100 = 3100
      expect(result.total_revenue).toBe(3100);

      // Custo total: (100 * 10) + (2 * 40) = 1000 + 80 = 1080
      expect(result.total_cost).toBe(1080);

      // Margem de contribuição: 3100 - 1080 = 2020
      expect(result.gross_margin_amount).toBe(2020);

      // CMV Ponderado Real: 1080 / 3100 = 34.84%
      expect(result.effective_weighted_cmv_percent).toBeCloseTo(34.84, 1);

      // Média simples seria (33.3% + 80%) / 2 = ~56.6%, o que seria completamente distorcido!
      expect(result.effective_weighted_cmv_percent).toBeLessThan(40);
    });

    it('trata listas vazias ou com valores zerados sem gerar NaN ou divisão por zero', () => {
      const result = calculateEffectiveWeightedCMV([]);
      expect(result.total_revenue).toBe(0);
      expect(result.total_cost).toBe(0);
      expect(result.effective_weighted_cmv_percent).toBe(0);
      expect(result.gross_margin_percent).toBe(0);
    });
  });

  describe('detectCommercialGrowthOpportunities', () => {
    it('detecta oportunidade de combo ao identificar lanche líder com baixa anexação de bebidas', () => {
      const salesWithDrinks: ProductSalesCMVRecord[] = [
        {
          product_id: 'p-lanche',
          product_name: 'X-Burguer da Casa',
          quantity_sold: 300,
          unit_price: 25.0,
          unit_cost: 8.0,
          category: 'Lanches',
        },
        {
          product_id: 'p-bebida',
          product_name: 'Refrigerante Lata',
          quantity_sold: 50, // Proporção 50/300 = 16.6% (< 40%)
          unit_price: 7.0,
          unit_cost: 2.2,
          category: 'Bebidas',
        },
      ];

      const opportunities = detectCommercialGrowthOpportunities(salesWithDrinks);
      expect(opportunities.length).toBeGreaterThan(0);

      const comboOpp = opportunities.find((o) => o.type === 'combo');
      expect(comboOpp).toBeDefined();
      expect(comboOpp?.title).toContain('Combo Promocional');
      expect(comboOpp?.potential_monthly_gain).toBeGreaterThan(0);
    });

    it('identifica oportunidade de reprecificação quando produto tem CMV superior a 40%', () => {
      const highCmvSales: ProductSalesCMVRecord[] = [
        {
          product_id: 'p-caro',
          product_name: 'Porção Especial de Camarão',
          quantity_sold: 40,
          unit_price: 50.0,
          unit_cost: 28.0, // CMV = 56% (> 40%)
          category: 'Porções',
        },
      ];

      const opportunities = detectCommercialGrowthOpportunities(highCmvSales);
      const pricingOpp = opportunities.find((o) => o.type === 'pricing');
      expect(pricingOpp).toBeDefined();
      expect(pricingOpp?.title).toContain('Ajuste de Preço');
      expect(pricingOpp?.impact_level).toBe('high');
    });
  });

  describe('detectLossAndWasteOpportunities', () => {
    it('agrupa perdas por categorias objetivas (vencimento, descarte, ruptura) sem emitir juízos acusatórios', () => {
      const events: OperationalLossEvent[] = [
        {
          id: 'l-1',
          category: 'vencimento',
          description: 'Queijo prato fora da validade',
          cost_amount: 250.0,
          occurred_at: '2026-10-20T10:00:00Z',
        },
        {
          id: 'l-2',
          category: 'vencimento',
          description: 'Presunto fatiado vencido no estoque frio',
          cost_amount: 150.0,
          occurred_at: '2026-10-22T10:00:00Z',
        },
        {
          id: 'l-3',
          category: 'ruptura',
          description: 'Falta de pão de hambúrguer no pico do almoço',
          cost_amount: 500.0,
          occurred_at: '2026-10-25T13:00:00Z',
        },
      ];

      const opps = detectLossAndWasteOpportunities(events);
      expect(opps.length).toBeGreaterThan(0);

      // Deve sugerir controle de validade para perdas por vencimento
      const expiryOpp = opps.find((o) => o.title.includes('Validade') || o.title.includes('Vencimento'));
      expect(expiryOpp).toBeDefined();
      expect(expiryOpp?.department).toBe('loss_waste');

      // Deve sugerir estoque mínimo para rupturas
      const stockOpp = opps.find((o) => o.title.includes('Ruptura') || o.title.includes('Estoque Mínimo'));
      expect(stockOpp).toBeDefined();
    });
  });

  describe('buildCeoDepartmentSummaries', () => {
    it('monta o resumo executivo dos 7 departamentos da diretoria com métricas e recomendações acionáveis', () => {
      const cmv = calculateEffectiveWeightedCMV(mockSales);
      const experiments: CommercialExperiment[] = [];
      const losses: OperationalLossEvent[] = [];

      const summaries = buildCeoDepartmentSummaries(cmv, [], experiments, losses);

      expect(summaries).toHaveLength(7);

      const deptKeys = summaries.map((s) => s.department);
      expect(deptKeys).toContain('commercial_growth');
      expect(deptKeys).toContain('cmv_pricing');
      expect(deptKeys).toContain('loss_waste');
      expect(deptKeys).toContain('delivery_channels');
      expect(deptKeys).toContain('staff_productivity');
      expect(deptKeys).toContain('finance_margins');
      expect(deptKeys).toContain('growth_lab');

      // Verifica se cada departamento tem métricas e recomendações
      summaries.forEach((s) => {
        expect(s.metrics.length).toBeGreaterThan(0);
        expect(s.recommendations.length).toBeGreaterThan(0);
        expect(['optimal', 'attention', 'critical', 'dados_insuficientes']).toContain(s.status);
      });
    });

    it('marca cmv_pricing como dados_insuficientes de forma honesta quando não houver fichas ou itens analisados', () => {
      const emptyCmv = calculateEffectiveWeightedCMV([]);
      expect(emptyCmv.has_sufficient_data).toBe(false);
      expect(emptyCmv.is_cmv_healthy).toBe(false);

      const summaries = buildCeoDepartmentSummaries(emptyCmv, [], [], []);
      const cmvDept = summaries.find((s) => s.department === 'cmv_pricing');
      expect(cmvDept).toBeDefined();
      expect(cmvDept?.status).toBe('dados_insuficientes');
      expect(cmvDept?.metrics?.find((m) => m.label === 'CMV Ponderado')?.value).toBe('Dados insuficientes');
    });

    it('utiliza o faturamento real do workspace e reflete despesas operacionais no departamento finance_margins', () => {
      const emptyCmv = calculateEffectiveWeightedCMV([]);
      const summaries = buildCeoDepartmentSummaries(emptyCmv, [], [], [], {
        realRevenue: 287430.50,
        realExpenses: 45610.25,
      });

      const finDept = summaries.find((s) => s.department === 'finance_margins');
      expect(finDept).toBeDefined();
      expect(finDept?.status).toBe('optimal');
      expect(finDept?.metrics?.find((m) => m.label === 'Faturamento Base')?.value).toContain('287.430,50');
      expect(finDept?.metrics?.find((m) => m.label === 'Resultado Operacional')?.value).toContain('241.820,25');
    });
  });
});
