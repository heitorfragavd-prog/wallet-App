import { describe, it, expect } from 'vitest';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { CommercialExperiment } from '@/domains/ceo/types';

describe('ETAPA 08 — PR B: Avaliação Científica de Progresso de Experimentos Comerciais', () => {
  const baseExperiment: CommercialExperiment = {
    id: 'exp-eval-1',
    workspace_id: 'ws-rodo-point-test',
    title: 'Combo Expresso & Salgado',
    hypothesis: 'Oferecer combo matinal eleva ticket médio',
    department: 'commercial_growth',
    start_date: '2026-11-01',
    status: 'em_andamento',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  };

  it('calcula evolução percentual e recomenda "manter" quando atinge ou supera a meta com baseline em string pt-BR', () => {
    const exp: CommercialExperiment = {
      ...baseExperiment,
      baseline_value: 'R$ 20,00',
      target_value: 'R$ 25,00',
    };

    const res = CeoIntelligenceEngine.evaluateExperimentProgress(exp, 26.5);

    expect(res.evolucaoPercent).toBe(32.5); // (26.5 - 20) / 20 = +32.5%
    expect(res.conclusaoRecomendada).toBe('manter');
    expect(res.resultadoObservado).toContain('+32.5%');
    expect(res.resultadoObservado).toContain('Atual: 26.50');
  });

  it('recomenda "ajustar" quando o progresso é positivo mas ainda não atingiu a meta', () => {
    const exp: CommercialExperiment = {
      ...baseExperiment,
      baseline_value: 'R$ 20,00',
      target_value: 'R$ 25,00',
    };

    const res = CeoIntelligenceEngine.evaluateExperimentProgress(exp, 22.0);

    expect(res.evolucaoPercent).toBe(10.0); // +10%
    expect(res.conclusaoRecomendada).toBe('ajustar');
  });

  it('recomenda "encerrar" quando o progresso é nulo ou negativo', () => {
    const exp: CommercialExperiment = {
      ...baseExperiment,
      baseline_value: 'R$ 20,00',
      target_value: 'R$ 25,00',
    };

    const res = CeoIntelligenceEngine.evaluateExperimentProgress(exp, 18.0);

    expect(res.evolucaoPercent).toBe(-10.0);
    expect(res.conclusaoRecomendada).toBe('encerrar');
  });

  it('trata graciosamente experimentos com baseline numérico nativo', () => {
    const exp: CommercialExperiment = {
      ...baseExperiment,
      baseline_value: 50,
      target_value: 70,
    };

    const res = CeoIntelligenceEngine.evaluateExperimentProgress(exp, 75);

    expect(res.evolucaoPercent).toBe(50.0);
    expect(res.conclusaoRecomendada).toBe('manter');
  });

  it('trata com segurança baseline ausente (undefined ou null) sem lançar exceção', () => {
    const exp: CommercialExperiment = {
      ...baseExperiment,
      baseline_value: undefined,
      target_value: undefined,
    };

    const res = CeoIntelligenceEngine.evaluateExperimentProgress(exp, 15.0);

    expect(res.evolucaoPercent).toBe(100);
    expect(res.conclusaoRecomendada).toBe('ajustar');
    expect(res.resultadoObservado).toContain('Baseline: Não informado');
  });
});
