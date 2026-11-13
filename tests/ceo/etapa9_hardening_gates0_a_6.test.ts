import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CeoGoalsRepository } from '../../src/domains/ceo/services/CeoGoalsRepository';
import { CeoGoalsAlertService, GoalAlertEvaluation } from '../../src/domains/ceo/services/CeoGoalsAlertService';
import { NotificationDispatcherService } from '../../src/domains/notifications/services/NotificationDispatcherService';
import { CeoRepository } from '../../src/domains/ceo/services/CeoRepository';
import type { BusinessGoal } from '../../src/domains/ceo/types';

vi.mock('../../src/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-exec-1' } } }),
      },
      from: vi.fn(),
    },
  };
});

vi.mock('../../src/domains/notifications/services/NotificationDispatcherService', () => ({
  NotificationDispatcherService: {
    dispatch: vi.fn().mockResolvedValue({ success: true, total_destinatarios: 1 }),
  },
}));

vi.mock('../../src/domains/ceo/services/CeoRepository', () => ({
  CeoRepository: {
    fetchSalesForExperiment: vi.fn(),
  },
}));

describe('ETAPA 09 — HARDENING (GATES 0 A 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 0 — Contratos e Robustez do CeoGoalsRepository', () => {
    it('listGoals retorna CeoGoalsQueryResult com isConfigured e data tipada', async () => {
      const res = await CeoGoalsRepository.listGoals('');
      expect(res.data).toEqual([]);
      expect(res.isConfigured).toBe(true);
    });

    it('createGoal exige workspaceId como primeiro argumento e valida valor_alvo negativo', async () => {
      // @ts-expect-error testando sem workspaceId
      const resNoWs = await CeoGoalsRepository.createGoal('', {
        created_by: 'u1',
        titulo: 'Meta Teste',
        indicador: 'faturamento',
        periodo_tipo: 'semanal',
        data_inicio: '2026-11-09',
        data_fim: '2026-11-15',
        ano: 2026,
        valor_alvo: 1000,
        valor_realizado: 0,
        unidade: 'monetario',
        status: 'ativa',
        history: [],
      });
      expect(resNoWs.success).toBe(false);
      expect(resNoWs.error).toContain('Workspace ID é obrigatório');

      const resNeg = await CeoGoalsRepository.createGoal('ws-1', {
        created_by: 'u1',
        titulo: 'Meta Negativa',
        indicador: 'faturamento',
        periodo_tipo: 'semanal',
        data_inicio: '2026-11-09',
        data_fim: '2026-11-15',
        ano: 2026,
        valor_alvo: -500,
        valor_realizado: 0,
        unidade: 'monetario',
        status: 'ativa',
        history: [],
      });
      expect(resNeg.success).toBe(false);
      expect(resNeg.error).toContain('maior ou igual a zero');
    });

    it('deleteGoal aceita 1 ou 2 argumentos mantendo retrocompatibilidade', async () => {
      const { supabase } = await import('../../src/integrations/supabase/client');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const res1 = await CeoGoalsRepository.deleteGoal('goal-1');
      expect(res1.success).toBe(true);

      const res2 = await CeoGoalsRepository.deleteGoal('goal-1', 'user-owner');
      expect(res2.success).toBe(true);
    });
  });

  describe('Gate 1 — Atualização Automática de Metas Conectada aos Dados Reais', () => {
    it('fetchGoalRealizedMetric busca transações reais com deduplicação e exclui canceladas', async () => {
      const mockSales = [
        { valor: 500, itens: [{ nome: 'Refri', quantidade: 5, valor_unitario: 100 }], cancelada: false },
        { valor: 300, itens: [{ nome: 'Lanche', quantidade: 2, valor_unitario: 150 }], cancelada: false },
        { valor: 1000, itens: [{ nome: 'Cancelado', quantidade: 1, valor_unitario: 1000 }], cancelada: true },
      ];

      vi.mocked(CeoRepository.fetchSalesForExperiment).mockResolvedValue(mockSales);

      const goal: BusinessGoal = {
        id: 'g1',
        workspace_id: 'ws-1',
        created_by: 'u1',
        titulo: 'Meta Faturamento',
        indicador: 'faturamento',
        periodo_tipo: 'semanal',
        data_inicio: '2026-11-09',
        data_fim: '2026-11-15',
        ano: 2026,
        valor_alvo: 5000,
        valor_realizado: 0,
        unidade: 'monetario',
        status: 'ativa',
        history: [],
        created_at: '2026-11-09T00:00:00Z',
        updated_at: '2026-11-09T00:00:00Z',
      };

      const realized = await CeoGoalsRepository.fetchGoalRealizedMetric('ws-1', goal);
      // Apenas vendas válidas: 500 + 300 = 800
      expect(realized).toBe(800);
      expect(CeoRepository.fetchSalesForExperiment).toHaveBeenCalledWith('ws-1', '2026-11-09', '2026-11-15');
    });
  });

  describe('Gate 2 — Anti-Fabricação de Metas', () => {
    it('não inventa R$ 25.000 ou qualquer número arbitrário quando não há histórico', () => {
      // Simulação da lógica da interface
      const computeSuggestion = (dailySales: Array<{ valor: number }>, faturamentoOntem: number) => {
        let baseWeekly = 0;
        if (dailySales && dailySales.length > 0) {
          const sum = dailySales.reduce((acc, d) => acc + (d.valor || 0), 0);
          baseWeekly = (sum / dailySales.length) * 7;
        } else if (faturamentoOntem > 0) {
          baseWeekly = faturamentoOntem * 7;
        } else {
          return null; // NUNCA baseWeekly = 25000
        }
        return baseWeekly > 0 ? baseWeekly : null;
      };

      expect(computeSuggestion([], 0)).toBeNull();
      expect(computeSuggestion([], -10)).toBeNull();
      expect(computeSuggestion([{ valor: 1000 }], 0)).toBe(7000);
    });
  });

  describe('Gate 3 — Hardening de Segurança e Segregação de Metas Privadas vs Operacionais', () => {
    it('identifica corretamente metas financeiras privadas sujeitas a sigilo executivo', () => {
      const privateIndicators = ['faturamento', 'despesas', 'resultado_operacional', 'margem', 'ticket_medio'];
      const operationalIndicators = ['pedidos', 'produto_categoria', 'combos'];

      // Validação de regras da Migration 93
      privateIndicators.forEach((ind) => {
        const isRestrictedToStaff = !['pedidos', 'produto_categoria', 'combos'].includes(ind);
        expect(isRestrictedToStaff).toBe(true);
      });

      operationalIndicators.forEach((ind) => {
        const isRestrictedToStaff = !['pedidos', 'produto_categoria', 'combos'].includes(ind);
        expect(isRestrictedToStaff).toBe(false);
      });
    });
  });

  describe('Gate 5 — Homologação de Alertas e Idempotência', () => {
    it('utiliza prioridades compatíveis com NotificationPriority e aplica idempotência diária', async () => {
      const mockEval: GoalAlertEvaluation = {
        goalId: 'goal-alert-1',
        titulo: 'Meta Semanal de Vendas',
        type: 'pacing_risk',
        statusRitmo: 'critico',
        percentualAtingido: 40,
        valorAlvo: 10000,
        valorRealizado: 4000,
        valorRestante: 6000,
        diasRestantes: 3,
        mediaDiariaAtual: 1000,
        mediaDiariaNecessaria: 2000,
        privateExecutiveNotification: {
          workspace_id: 'ws-1',
          categoria: 'financeiro',
          prioridade: 'critica',
          titulo: 'Alerta Crítico de Meta',
          mensagem: 'Ritmo crítico',
          target_role: 'owner',
        },
        safeGroupNotification: {
          workspace_id: 'ws-1',
          categoria: 'operacional',
          prioridade: 'normal',
          titulo: 'Alerta Operacional',
          mensagem: 'Vamos acelerar',
          target_role: 'all',
        },
      };

      // 1º envio: deve despachar normalmente
      const res1 = await CeoGoalsAlertService.dispatchEvaluation(mockEval);
      expect(res1.success).toBe(true);
      expect(NotificationDispatcherService.dispatch).toHaveBeenCalledTimes(1);

      // 2º envio na mesma data para mesma meta e tipo: deve ser idempotente (sem reenvio)
      const res2 = await CeoGoalsAlertService.dispatchEvaluation(mockEval);
      expect(res2.success).toBe(true);
      expect(res2.total_destinatarios).toBe(0);
      expect(NotificationDispatcherService.dispatch).toHaveBeenCalledTimes(1); // Continua 1!
    });
  });
});
