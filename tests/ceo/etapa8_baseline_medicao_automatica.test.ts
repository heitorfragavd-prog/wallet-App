import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { CommercialExperiment, StructuredBaseline } from '@/domains/ceo/types';

describe('ETAPA 08 — Gate 2 & Gate 3: Baseline Real e Medição Financeira Automática', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockExperiment: CommercialExperiment = {
    id: 'exp-combo-1',
    workspace_id: 'ws-rodo-point',
    title: 'Combo Expresso & Salgado',
    hypothesis: 'Oferecer combo café + salgado matinal eleva ticket médio e faturamento',
    department: 'commercial_growth',
    target_kpi: 'Faturamento Diário',
    start_date: '2026-11-01',
    status: 'aprovado',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  };

  describe('Gate 2: Validação Rigorosa de Baseline Real', () => {
    it('rejeita início de experimento com baseline nulo, indefinido ou vazio', () => {
      const resNull = CeoIntelligenceEngine.validateBaseline(null);
      expect(resNull.valid).toBe(false);
      expect(resNull.reason).toMatch(/não pode ser iniciado sem um baseline/i);

      const resUndef = CeoIntelligenceEngine.validateBaseline(undefined);
      expect(resUndef.valid).toBe(false);

      const resEmpty = CeoIntelligenceEngine.validateBaseline('');
      expect(resEmpty.valid).toBe(false);
    });

    it('rejeita valor "0" como baseline quando não há comprovação de amostra', () => {
      const resZeroStr = CeoIntelligenceEngine.validateBaseline('0');
      expect(resZeroStr.valid).toBe(false);
      expect(resZeroStr.reason).toMatch(/não é aceito como baseline sem confirmação/i);

      const resZeroNum = CeoIntelligenceEngine.validateBaseline(0);
      expect(resZeroNum.valid).toBe(false);
    });

    it('aceita valor 0 quando há comprovação documental expressa de novo produto sem histórico', () => {
      const structuredZero: StructuredBaseline = {
        indicator: 'Faturamento de Produto Novo',
        reference_period: 'Outubro 2026',
        initial_value: 0,
        formatted_value: 'R$ 0,00 (Produto não existia)',
        unit: 'R$',
        source: 'eyemobile_pdv',
        sample_size: 30, // 30 dias observados confirmando 0 vendas
        reliability: 'alta',
        measurement_type: 'automatica',
        notes: 'Item cadastrado no catálogo recentemente, sem vendas no mês anterior.',
      };

      const res = CeoIntelligenceEngine.validateBaseline(structuredZero);
      expect(res.valid).toBe(true);
      expect(res.baseline?.initial_value).toBe(0);
      expect(res.baseline?.sample_size).toBe(30);
    });

    it('rejeita textos genéricos e placeholders como baseline comprovado', () => {
      expect(CeoIntelligenceEngine.validateBaseline('pendente').valid).toBe(false);
      expect(CeoIntelligenceEngine.validateBaseline('a definir').valid).toBe(false);
      expect(CeoIntelligenceEngine.validateBaseline('teste').valid).toBe(false);
      expect(CeoIntelligenceEngine.validateBaseline('não informado').valid).toBe(false);
      expect(CeoIntelligenceEngine.validateBaseline('n/a').valid).toBe(false);
    });

    it('aceita baseline numérico ou em formato pt-BR comprovado', () => {
      const resMoeda = CeoIntelligenceEngine.validateBaseline('R$ 1.250,50/dia', {
        sampleSize: 30,
        indicator: 'Faturamento Médio Diário',
      });
      expect(resMoeda.valid).toBe(true);
      expect(resMoeda.baseline?.initial_value).toBe(1250.5);
      expect(resMoeda.baseline?.unit).toBe('R$');
      expect(resMoeda.baseline?.reliability).toBe('alta');

      const resTicket = CeoIntelligenceEngine.validateBaseline('R$ 24,80', {
        sampleSize: 15,
        indicator: 'Ticket Médio',
      });
      expect(resTicket.valid).toBe(true);
      expect(resTicket.baseline?.initial_value).toBe(24.8);
    });
  });

  describe('Gate 3: Medição Financeira Automática a partir de Vendas Reais', () => {
    it('desconsidera vendas canceladas e estornadas da base de apuração', () => {
      const sales = [
        { valor: 100.0, data: '2026-11-01T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 50.0, data: '2026-11-01T11:00:00Z', status: 'cancelada', tipo: 'receita' }, // Cancelada
        { valor: 80.0, data: '2026-11-02T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 40.0, data: '2026-11-02T12:00:00Z', status: 'estornada', tipo: 'receita' }, // Estornada
        { valor: 120.0, data: '2026-11-03T10:00:00Z', status: 'concluida', tipo: 'receita' },
      ];

      const measurement = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: mockExperiment,
        sales,
        baselineDailyAverage: 80.0,
        baselineSampleSize: 30,
      });

      // Apenas as 3 vendas válidas (100 + 80 + 120 = 300)
      expect(measurement.measurement.sampleSize).toBe(3);
      expect(measurement.measurement.totalRevenue).toBe(300.0);
      expect(measurement.measurement.averageTicket).toBe(100.0);
    });

    it('calcula delta absoluto, impacto financeiro real e percentual vs baseline', () => {
      const sales = [
        { valor: 500.0, data: '2026-11-01T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 600.0, data: '2026-11-02T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 700.0, data: '2026-11-03T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 600.0, data: '2026-11-04T10:00:00Z', status: 'concluida', tipo: 'receita' },
      ]; // Total 2400 em 4 dias = 600/dia

      const measurement = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: mockExperiment,
        sales,
        baselineDailyAverage: 500.0, // Baseline: 500/dia
        baselineSampleSize: 30,
        experimentDaysCount: 4,
      });

      expect(measurement.measurement.currentValue).toBe(600.0);
      expect(measurement.delta.absolute).toBe(100.0); // +100/dia
      expect(measurement.delta.percent).toBe(20.0); // +20%
      expect(measurement.financialImpact).toBe(400.0); // 100/dia * 4 dias = 400
      expect(measurement.classification).toBe('favoravel');
      expect(measurement.measurementType).toBe('automatica');
      expect(measurement.isStatisticallySufficient).toBe(true);
    });

    it('classifica como "inconcluso" quando o período possui menos de 3 dias ou menos de 5 vendas', () => {
      const sales = [
        { valor: 150.0, data: '2026-11-01T10:00:00Z', status: 'concluida', tipo: 'receita' },
      ]; // Apenas 1 venda em 1 dia

      const measurement = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: mockExperiment,
        sales,
        baselineDailyAverage: 100.0,
      });

      expect(measurement.isStatisticallySufficient).toBe(false);
      expect(measurement.classification).toBe('inconcluso');
      expect(measurement.notes).toMatch(/amostra preliminar/i);
    });

    it('classifica como "dados_indisponiveis" quando não há nenhuma venda no período', () => {
      const measurement = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: mockExperiment,
        sales: [],
        baselineDailyAverage: 100.0,
      });

      expect(measurement.measurement.sampleSize).toBe(0);
      expect(measurement.classification).toBe('dados_indisponiveis');
      expect(measurement.notes).toMatch(/nenhuma venda confirmada/i);
    });

    it('não inventa ganho percentual fictício de 100% se o baseline histórico for 0', () => {
      const sales = [
        { valor: 200.0, data: '2026-11-01T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 250.0, data: '2026-11-02T10:00:00Z', status: 'concluida', tipo: 'receita' },
        { valor: 300.0, data: '2026-11-03T10:00:00Z', status: 'concluida', tipo: 'receita' },
      ];

      const measurement = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: mockExperiment,
        sales,
        baselineDailyAverage: 0, // Baseline zero!
      });

      expect(measurement.delta.percent).toBeNull(); // Não inventa 100%!
      expect(measurement.measurement.currentValue).toBe(250.0);
    });
  });
});
