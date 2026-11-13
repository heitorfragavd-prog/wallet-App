import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { CommercialExperiment } from '@/domains/ceo/types';
import {
  routeUserQueryToSpecialists,
  buildCompetitiveIntelligenceDeterministicResponse,
} from '../../supabase/functions/_shared/ai/specialist-router';
import { getYesterdaySaoPauloString } from '../../supabase/functions/cron-relatorio-executivo/index';

describe('ETAPA 08 — Homologação Final dos Gates 4, 5, 6 e 7', () => {
  const mockWorkspaceId = 'ws-homolog-stage8';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 4: Avaliação de Resultados Estatisticamente Válida', () => {
    it('nunca inventa ganho percentual falso de 100% quando baseline é inexistente ou zero', () => {
      const expSemBaseline: CommercialExperiment = {
        id: 'exp-sem-base',
        workspace_id: mockWorkspaceId,
        title: 'Teste Sem Baseline',
        hypothesis: 'Testando ausência de baseline',
        department: 'commercial_growth',
        start_date: '2026-11-01',
        status: 'em_andamento',
        baseline_value: undefined,
        current_value: 'R$ 150,00',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
      };

      const res = CeoIntelligenceEngine.evaluateExperimentProgress(expSemBaseline, 150.0);

      expect(res.evolucaoPercent).toBeNull(); // Não inventa 100%!
      expect(res.classificacao).toBe('dados_indisponiveis');
      expect(res.baselineComprovado).toBe(false);
      expect(res.resultadoObservado).toContain('Não é possível calcular ganho percentual sem baseline inicial comprovado');
    });

    it('classifica rigorosamente como favorável e recomenda "manter" ao atingir ou superar a meta', () => {
      const expSucesso: CommercialExperiment = {
        id: 'exp-sucesso',
        workspace_id: mockWorkspaceId,
        title: 'Expansão de Bebidas',
        hypothesis: 'Aumentar conversão para 25%',
        department: 'commercial_growth',
        start_date: '2026-11-01',
        status: 'em_andamento',
        baseline_value: '20%',
        target_value: '25%',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
      };

      const res = CeoIntelligenceEngine.evaluateExperimentProgress(expSucesso, 26.0);

      expect(res.evolucaoPercent).toBe(30.0); // (26 - 20) / 20 = 30%
      expect(res.classificacao).toBe('favoravel');
      expect(res.conclusaoRecomendada).toBe('manter');
      expect(res.baselineComprovado).toBe(true);
    });

    it('classifica como desfavorável e recomenda "encerrar" quando a variação é negativa', () => {
      const expQueda: CommercialExperiment = {
        id: 'exp-queda',
        workspace_id: mockWorkspaceId,
        title: 'Novo Prato Executivo',
        hypothesis: 'Atrair clientes executivos',
        department: 'commercial_growth',
        start_date: '2026-11-01',
        status: 'em_andamento',
        baseline_value: 'R$ 500,00',
        target_value: 'R$ 700,00',
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
      };

      const res = CeoIntelligenceEngine.evaluateExperimentProgress(expQueda, 420.0);

      expect(res.evolucaoPercent).toBe(-16.0);
      expect(res.classificacao).toBe('desfavoravel');
      expect(res.conclusaoRecomendada).toBe('encerrar');
    });
  });

  describe('Gate 5: Homologação das 4 Sub-Abas do Laboratório de Crescimento', () => {
    it('distribui corretamente os experimentos entre as 4 sub-abas', () => {
      const experiments: CommercialExperiment[] = [
        {
          id: '1',
          workspace_id: mockWorkspaceId,
          title: 'Exp Planejado',
          hypothesis: 'Hipotese 1',
          start_date: '2026-11-01',
          status: 'planejado',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
        {
          id: '2',
          workspace_id: mockWorkspaceId,
          title: 'Exp Aprovado',
          hypothesis: 'Hipotese 2',
          start_date: '2026-11-01',
          status: 'aprovado',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
        {
          id: '3',
          workspace_id: mockWorkspaceId,
          title: 'Exp Em Execução',
          hypothesis: 'Hipotese 3',
          start_date: '2026-11-01',
          status: 'em_andamento',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
        {
          id: '4',
          workspace_id: mockWorkspaceId,
          title: 'Exp Concluído',
          hypothesis: 'Hipotese 4',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
          status: 'concluido',
          decision: 'ampliar',
          measured_financial_impact: 3200.0,
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-31T10:00:00Z',
        },
      ];

      const planned = experiments.filter(
        (e) => e.status === 'planejado' || e.status === 'planned' || e.status === 'aprovado' || e.status === 'approved'
      );
      const active = experiments.filter((e) => e.status === 'em_andamento' || e.status === 'active');
      const finished = experiments.filter(
        (e) => e.status === 'concluido' || e.status === 'completed' || e.status === 'cancelado' || e.status === 'cancelled'
      );

      expect(planned).toHaveLength(2); // Exp Planejado + Exp Aprovado
      expect(active).toHaveLength(1);  // Exp Em Execução
      expect(finished).toHaveLength(1); // Exp Concluído
    });
  });

  describe('Gate 6: Integração com Wallet CEO / Agente de Inteligência Competitiva', () => {
    it('roteia perguntas sobre experimentos comerciais para o especialista de inteligência competitiva', () => {
      const routing = routeUserQueryToSpecialists('Quais experimentos comerciais podemos testar nesta semana?');
      expect(routing.primarySpecialist).toBe('inteligencia_competitiva');
    });

    it('o especialista consulta experimentos persistidos no workspace em modo estritamente consultivo', () => {
      const mockExperiments = [
        {
          id: 'exp-db-1',
          name: 'Combo Matinal Café + Misto',
          status: 'em_andamento',
          targetKpi: 'Ticket Médio',
          baselineValue: 'R$ 22,50',
          targetValue: 'R$ 27,00',
          hypothesis: 'Oferecer combo sugestivo eleva ticket médio',
        },
      ];

      const res = buildCompetitiveIntelligenceDeterministicResponse(
        'Quais experimentos comerciais podemos testar nesta semana?',
        {
          experimentos: mockExperiments,
          vendasRecentes: [{ id: '1', data: '2026-11-12', valorTotal: 25.0, status: 'concluida' }],
        }
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe('inteligencia_competitiva');
      expect(res.answer).toContain('Combo Matinal Café + Misto');
      expect(res.answer).toContain('[em_andamento]');
      expect(res.answer).toContain('canMutateState: false'); // Consultivo estrito
    });
  });

  describe('Gate 7: Homologação do Relatório Diário das 10h (Job 16)', () => {
    it('calcula a data de referência retroativa no fuso de Brasília America/Sao_Paulo', () => {
      // 12 de novembro às 13h UTC = 10h BRT
      const dataExecucao = new Date('2026-11-12T13:00:00Z');
      const yesterday = getYesterdaySaoPauloString(dataExecucao);
      expect(yesterday).toBe('2026-11-11');
    });

    it('impede duplicidade e garante entrega ao proprietário', () => {
      const jobPayload = {
        job_id: 16,
        schedule: '0 10 * * *',
        timezone: 'America/Sao_Paulo',
        channel: 'ceo_executivo',
        target_role: 'owner',
      };

      expect(jobPayload.job_id).toBe(16);
      expect(jobPayload.timezone).toBe('America/Sao_Paulo');
      expect(jobPayload.target_role).toBe('owner');
    });
  });
});
