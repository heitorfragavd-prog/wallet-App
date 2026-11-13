import { describe, it, expect } from 'vitest';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { CommercialExperiment } from '@/domains/ceo/types';

describe('ETAPA 08 — Gate 1: Homologação Real da Medição Automática por KPI', () => {
  const baseExperiment: CommercialExperiment = {
    id: 'exp-test-01',
    workspace_id: 'ws-123',
    hypothesis: 'Oferta de combo matinal café + pão de queijo aumenta ticket médio e receita',
    start_date: '2026-11-01',
    status: 'em_andamento',
  };

  it('1. Mede corretamente KPI de ticket_medio com base em vendas válidas e exclui canceladas', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Ticket Médio',
      baseline_value: 20.0,
    };

    const sales = [
      { valor: 30.0, data: '2026-11-01T08:00:00Z', tipo: 'receita' },
      { valor: 35.0, data: '2026-11-01T09:00:00Z', tipo: 'receita' },
      { valor: 25.0, data: '2026-11-02T08:00:00Z', tipo: 'receita' },
      { valor: 30.0, data: '2026-11-02T10:00:00Z', tipo: 'receita' },
      { valor: 30.0, data: '2026-11-03T08:00:00Z', tipo: 'receita' },
      { valor: 100.0, data: '2026-11-03T11:00:00Z', status: 'cancelada', tipo: 'receita' }, // Ignorada
      { valor: 50.0, data: '2026-11-03T12:00:00Z', cancelada: true, tipo: 'receita' }, // Ignorada
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 20.0,
      baselineSampleSize: 100,
    });

    // 5 vendas válidas: 30 + 35 + 25 + 30 + 30 = 150 -> Ticket médio = 150 / 5 = 30.00
    expect(result.measurement.orderCount).toBe(5);
    expect(result.measurement.totalRevenue).toBe(150);
    expect(result.measurement.currentValue).toBe(30.0);
    expect(result.baseline.value).toBe(20.0);
    expect(result.delta.absolute).toBe(10.0);
    expect(result.delta.percent).toBe(50.0);
    // Impacto financeiro = delta * sampleSize = 10 * 5 = 50.00
    expect(result.financialImpact).toBe(50.0);
    expect(result.classification).toBe('favoravel');
    expect(result.isStatisticallySufficient).toBe(true);
  });

  it('2. Mede corretamente KPI de faturamento (receita média diária)', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Faturamento Diário',
      baseline_value: 1000.0,
    };

    // 3 dias: 1500 no dia 1, 1500 no dia 2, 1500 no dia 3 + extras
    const sales = [
      { valor: 1500.0, data: '2026-11-01T10:00:00Z', tipo: 'receita' },
      { valor: 1500.0, data: '2026-11-02T10:00:00Z', tipo: 'receita' },
      { valor: 1500.0, data: '2026-11-03T10:00:00Z', tipo: 'receita' },
      { valor: 500.0, data: '2026-11-03T12:00:00Z', tipo: 'receita' },
      { valor: 500.0, data: '2026-11-03T14:00:00Z', tipo: 'receita' },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 1000.0,
      experimentDaysCount: 3,
    });

    // Total 5500 em 3 dias -> média diária = 1833.33
    expect(result.measurement.currentValue).toBe(1833.33);
    expect(result.delta.absolute).toBe(833.33);
    expect(result.financialImpact).toBe(2499.99);
    expect(result.classification).toBe('favoravel');
  });

  it('3. Mede corretamente KPI de pedidos (volume diário de transações)', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Quantidade de Pedidos',
      baseline_value: 2.0, // 2 pedidos por dia
    };

    // 6 pedidos em 2 dias (3 pedidos por dia)
    const sales = [
      { valor: 20.0, data: '2026-11-01T08:00:00Z', tipo: 'receita' },
      { valor: 20.0, data: '2026-11-01T10:00:00Z', tipo: 'receita' },
      { valor: 20.0, data: '2026-11-01T12:00:00Z', tipo: 'receita' },
      { valor: 20.0, data: '2026-11-02T08:00:00Z', tipo: 'receita' },
      { valor: 20.0, data: '2026-11-02T10:00:00Z', tipo: 'receita' },
      { valor: 20.0, data: '2026-11-02T12:00:00Z', tipo: 'receita' },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 2.0,
      experimentDaysCount: 2,
    });

    expect(result.measurement.orderCount).toBe(6);
    expect(result.measurement.currentValue).toBe(3.0); // 6 / 2 = 3 pedidos/dia
    expect(result.delta.absolute).toBe(1.0);
    expect(result.delta.percent).toBe(50.0);
    // Impacto financeiro = delta (1 pedido/dia) * 2 dias * ticket médio (R$ 20) = R$ 40
    expect(result.financialImpact).toBe(40.0);
    expect(result.classification).toBe('favoravel');
  });

  it('4. Mede corretamente KPI de produto_vendido (unidades vendidas de item específico)', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Venda de Produto',
      baseline_value: 5.0, // 5 unidades por dia
    };

    // Vendas com itens contendo Pão de Queijo
    const sales = [
      {
        valor: 50.0,
        data: '2026-11-01T08:00:00Z',
        tipo: 'receita',
        itens: [
          { nome: 'Pão de Queijo Tradicional', quantidade: 4, valor_unitario: 5.0 },
          { nome: 'Café Espresso', quantidade: 2, valor_unitario: 15.0 },
        ],
      },
      {
        valor: 40.0,
        data: '2026-11-02T08:00:00Z',
        tipo: 'receita',
        itens: [
          { nome: 'Pão de Queijo Tradicional', quantidade: 6, valor_unitario: 5.0 },
        ],
      },
      {
        valor: 30.0,
        data: '2026-11-03T08:00:00Z',
        tipo: 'receita',
        itens: [
          { nome: 'Pão de Queijo Tradicional', quantidade: 8, valor_unitario: 5.0 },
        ],
      },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 5.0,
      experimentDaysCount: 3,
      targetProductName: 'Pão de Queijo',
    });

    // 4 + 6 + 8 = 18 unidades em 3 dias -> 6.0 unidades/dia
    expect(result.measurement.currentValue).toBe(6.0);
    expect(result.delta.absolute).toBe(1.0);
    expect(result.delta.percent).toBe(20.0);
    // Impacto financeiro = 1 unidade/dia * 3 dias * R$ 5,00 = R$ 15,00
    expect(result.financialImpact).toBe(15.0);
    expect(result.classification).toBe('favoravel');
  });

  it('5. Mede corretamente KPI de margem (%) com apuração de custos', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Margem Operacional',
      baseline_value: 30.0, // 30% de margem no baseline
    };

    // Receita 500, Custo 250 -> Margem = 50%
    const sales = [
      { valor: 100.0, custo: 50.0, data: '2026-11-01T08:00:00Z', tipo: 'receita' },
      { valor: 100.0, custo: 50.0, data: '2026-11-02T08:00:00Z', tipo: 'receita' },
      { valor: 100.0, custo: 50.0, data: '2026-11-03T08:00:00Z', tipo: 'receita' },
      { valor: 100.0, custo: 50.0, data: '2026-11-04T08:00:00Z', tipo: 'receita' },
      { valor: 100.0, custo: 50.0, data: '2026-11-05T08:00:00Z', tipo: 'receita' },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 30.0,
    });

    expect(result.measurement.currentValue).toBe(50.0);
    expect(result.delta.absolute).toBe(20.0);
    expect(result.delta.percent).toBe(66.7);
    expect(result.financialImpact).toBe(100.0);
    expect(result.classification).toBe('favoravel');
  });

  it('6. Classifica como inconcluso quando a amostra é insuficiente (< 3 dias e < 5 vendas)', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Faturamento',
      baseline_value: 100.0,
    };

    // Apenas 2 vendas em 1 dia
    const sales = [
      { valor: 150.0, data: '2026-11-01T08:00:00Z', tipo: 'receita' },
      { valor: 150.0, data: '2026-11-01T09:00:00Z', tipo: 'receita' },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 100.0,
    });

    expect(result.isStatisticallySufficient).toBe(false);
    expect(result.classification).toBe('inconcluso');
    expect(result.notes).toContain('Amostra preliminar');
  });

  it('7. Classifica como dados_indisponiveis quando não há nenhuma venda válida', () => {
    const experiment: CommercialExperiment = {
      ...baseExperiment,
      target_kpi: 'Ticket Médio',
      baseline_value: 25.0,
    };

    const sales = [
      { valor: 100.0, data: '2026-11-01T08:00:00Z', status: 'cancelada' },
      { valor: 50.0, data: '2026-11-02T08:00:00Z', cancelada: true },
    ];

    const result = CeoIntelligenceEngine.measureExperimentFromSales({
      experiment,
      sales,
      baselineDailyAverage: 25.0,
    });

    expect(result.measurement.sampleSize).toBe(0);
    expect(result.classification).toBe('dados_indisponiveis');
    expect(result.notes).toContain('Nenhuma venda confirmada registrada');
  });
});
