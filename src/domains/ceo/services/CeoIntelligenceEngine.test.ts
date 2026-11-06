import { describe, it, expect } from 'vitest';
import { CeoIntelligenceEngine } from './CeoIntelligenceEngine';
import { CeoFinancialMetricsService } from './CeoFinancialMetricsService';
import { CeoPeriodRange } from '../utils/ceoDateRanges';

describe('CeoIntelligenceEngine — Auditoria Executiva do Briefing e Oportunidades', () => {
  const dummyRange: CeoPeriodRange = {
    tipo: 'mes_atual',
    rotulo: 'Novembro de 2026',
    inicioStr: '2026-11-01',
    fimStr: '2026-11-30',
  };

  it('gera ExecutiveBriefing sem erros quando kpis possui cmvConfirmado > 0 (previne citacoes is not defined)', () => {
    const kpis = CeoFinancialMetricsService.getEmptyKpis();
    kpis.faturamentoMes = 15000.0;
    kpis.cmvConfirmado = 4500.0;
    kpis.cmvPercent = 30.0;
    kpis.lucroBrutoConfirmado = 10500.0;
    kpis.margemBrutaConfirmadaPercent = 70.0;
    kpis.coberturaCmvPercent = 85.0;

    const briefing = CeoIntelligenceEngine.generateExecutiveBriefing({
      kpis,
      range: dummyRange,
      topProducts: [
        { rank: 1, id: '1', produto: 'Coca ks', quantidade: 50, faturamento: 350.0, percentualFaturamento: 10.0, margemEstimada: 75.7 },
      ],
    });

    expect(briefing).toBeDefined();
    expect(briefing.periodoRotulo).toBe('Novembro de 2026');
    const secaoRentabilidade = briefing.secoes.find((s) => s.titulo === 'Rentabilidade e Custos Reais');
    expect(secaoRentabilidade).toBeDefined();
    expect(secaoRentabilidade?.destaque).toContain('4.500,00');
    expect(secaoRentabilidade?.conteudo).toContain('CMV auditado por notas fiscais');
  });

  it('gera oportunidades estruturadas para a Rodo Point com base nos dados reais de faturamento e estoque', () => {
    const kpis = CeoFinancialMetricsService.getEmptyKpis();
    kpis.faturamentoMes = 20000.0;

    const opps = CeoIntelligenceEngine.detectRodoPointOpportunities('ws-rodo-point', {
      kpis,
      topProducts: [
        { rank: 1, id: '1', produto: 'Café Expresso', quantidade: 100, faturamento: 500.0, percentualFaturamento: 25.0, margemEstimada: null },
        { rank: 2, id: '2', produto: 'Pão de Queijo', quantidade: 80, faturamento: 400.0, percentualFaturamento: 20.0, margemEstimada: null },
      ],
      criticalStock: [
        { id: 'prod-skol', product: 'Skol 473 ML', stock: 2, minStock: 24, depot: 'Geladeira Principal' },
      ],
    });

    expect(opps.length).toBeGreaterThan(0);
    const combo = opps.find((o) => o.id === 'opp-combo-cafe-salgado');
    expect(combo).toBeDefined();
    expect(combo?.title).toContain('Combo Expresso & Salgado');

    const ruptura = opps.find((o) => o.id.startsWith('opp-ruptura'));
    expect(ruptura).toBeDefined();
    expect(ruptura?.title).toContain('Prevenção de Ruptura');
  });
});
