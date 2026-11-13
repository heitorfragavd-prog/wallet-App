/**
 * etapa9_gate5_gate6_especialistas_e_alertas.test.ts
 *
 * Testes automatizados para Integração de Metas com Especialistas e Alertas Inteligentes (Etapa 09 - Gates 5 e 6).
 * Valida roteamento dos especialistas, respostas determinísticas de metas,
 * síntese multidepartamental e segregação de privacidade entre canais executivos e de grupo.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  routeUserQueryToSpecialists,
  buildFinancialSpecialistDeterministicResponse,
} from '../../supabase/functions/_shared/ai/specialist-router';
import { CeoGoalsAlertService } from '@/domains/ceo/services/CeoGoalsAlertService';
import { BusinessGoal } from '@/domains/ceo/types';
import { NotificationDispatcherService } from '@/domains/notifications/services/NotificationDispatcherService';

describe('Gate 5 & Gate 6: Especialistas de Metas e Alertas Inteligentes', () => {
  describe('Gate 5: Roteamento e Respostas dos Especialistas', () => {
    it('1. roteia perguntas sobre metas para o Especialista Financeiro em modo determinístico', () => {
      const planWeekly = routeUserQueryToSpecialists('Como está nossa meta desta semana?');
      expect(planWeekly.primarySpecialist).toBe('financeiro');
      expect(planWeekly.isDeterministicPossible).toBe(true);

      const planMonthly = routeUserQueryToSpecialists('Quanto falta para bater a meta do mês?');
      expect(planMonthly.primarySpecialist).toBe('financeiro');
      expect(planMonthly.isDeterministicPossible).toBe(true);

      const planPacing = routeUserQueryToSpecialists('Qual o ritmo da meta?');
      expect(planPacing.primarySpecialist).toBe('financeiro');
      expect(planPacing.isDeterministicPossible).toBe(true);
    });

    it('2. constrói resposta determinística exata quando meta ativa está configurada', () => {
      const mockGoal = {
        id: 'g-1',
        workspaceId: 'ws-1',
        titulo: 'Meta Semanal de Vendas',
        indicador: 'faturamento',
        periodoTipo: 'semanal',
        dataInicio: '2026-11-09',
        dataFim: '2026-11-15',
        ano: 2026,
        mes: null,
        semanaDoAno: 46,
        valorAlvo: 50000,
        valorRealizado: 30000,
        unidade: 'monetario',
        status: 'ativa',
        categoriaOuProduto: null,
        eyemobileProductId: null,
        observacoes: null,
        createdAt: '2026-11-09T00:00:00Z',
      };

      const res = buildFinancialSpecialistDeterministicResponse(
        'Como está nossa meta desta semana?',
        { goals: [mockGoal] }
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain('Agente Financeiro — Acompanhamento de Metas');
      expect(res.answer).toContain('Alvo:* R$ 50000.00');
      expect(res.answer).toContain('Realizado:* R$ 30000.00 (60.0%)');
      expect(res.answer).toContain('Restante para Bater:* R$ 20000.00');
    });

    it('3. informa ausência de meta sem inventar números fictícios quando não há meta ativa', () => {
      const res = buildFinancialSpecialistDeterministicResponse(
        'Como está nossa meta desta semana?',
        { goals: [] }
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain('Não há nenhuma meta empresarial ativa cadastrada');
      expect(res.answer).not.toContain('R$ 191.50');
      expect(res.answer).not.toContain('R$ 2767.48');
    });
  });

  describe('Gate 6: Alertas e Segregação de Notificações Privadas vs Grupo', () => {
    const sampleGoalAtRisk: BusinessGoal = {
      id: 'goal-risk-1',
      workspace_id: 'ws-test-1',
      created_by: 'owner-1',
      titulo: 'Meta Semanal de Faturamento',
      indicador: 'faturamento',
      periodo_tipo: 'semanal',
      data_inicio: '2026-11-09',
      data_fim: '2026-11-15',
      ano: 2026,
      semana_do_ano: 46,
      valor_alvo: 70000,
      valor_realizado: 20000, // No dia 4/7, 20k de 70k é ~28% (muito abaixo dos 57% esperados -> crítico)
      unidade: 'monetario',
      status: 'ativa',
      history: [],
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    };

    const sampleGoalAchieved: BusinessGoal = {
      id: 'goal-achieved-1',
      workspace_id: 'ws-test-1',
      created_by: 'owner-1',
      titulo: 'Meta Mensal de Vendas',
      indicador: 'faturamento',
      periodo_tipo: 'mensal',
      data_inicio: '2026-11-01',
      data_fim: '2026-11-30',
      ano: 2026,
      mes: 11,
      valor_alvo: 100000,
      valor_realizado: 105000, // 105% atingido
      unidade: 'monetario',
      status: 'ativa',
      history: [],
      created_at: '2026-10-31T00:00:00Z',
      updated_at: '2026-10-31T00:00:00Z',
    };

    it('4. detecta meta em risco e gera notificação executiva com números e notificação de grupo sem números', () => {
      // Data de referência: 12 de novembro (quinta-feira, 4º dia da semana de 7)
      const refDate = new Date(Date.UTC(2026, 10, 12, 12, 0, 0));

      const evaluations = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [sampleGoalAtRisk],
        workspaceId: 'ws-test-1',
        referenceDate: refDate,
      });

      expect(evaluations.length).toBe(1);
      const evalItem = evaluations[0];
      expect(evalItem.type).toBe('pacing_risk');
      expect(evalItem.statusRitmo).toBe('critico');

      // Notificação Executiva Privada: contém valores confidenciais e diretiva
      const priv = evalItem.privateExecutiveNotification;
      expect(priv.target_role).toBe('owner');
      expect(priv.prioridade).toBe('urgente');
      expect(priv.mensagem).toContain('Ritmo Atual:');
      expect(priv.mensagem).toContain('Ritmo Necessário:');
      expect(priv.metadata?.is_confidential).toBe(true);

      // Notificação Segura de Grupo: texto motivacional SEM valores em R$
      const group = evalItem.safeGroupNotification;
      expect(group.target_role).toBe('all');
      expect(group.prioridade).toBe('media');
      expect(group.mensagem).toContain('Foco no Objetivo da Semana');
      expect(group.mensagem).not.toContain('70000');
      expect(group.mensagem).not.toContain('20000');
      expect(group.mensagem).not.toContain('R$');
      expect(group.metadata?.is_confidential).toBe(false);
    });

    it('5. detecta meta batida (100%+) e gera celebração executiva e celebração motivacional de equipe', () => {
      const evaluations = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [sampleGoalAchieved],
        workspaceId: 'ws-test-1',
      });

      expect(evaluations.length).toBe(1);
      const evalItem = evaluations[0];
      expect(evalItem.type).toBe('goal_achieved');
      expect(evalItem.percentualAtingido).toBe(105);

      // Privada tem detalhes financeiros
      expect(evalItem.privateExecutiveNotification.mensagem).toContain('105.0%');
      expect(evalItem.privateExecutiveNotification.target_role).toBe('owner');

      // Grupo tem celebração geral
      expect(evalItem.safeGroupNotification.mensagem).toContain('Parabéns Equipe!');
      expect(evalItem.safeGroupNotification.mensagem).not.toContain('105000');
    });

    it('6. despacha notificação executiva e celebração de grupo através de NotificationDispatcherService', async () => {
      const dispatchSpy = vi.spyOn(NotificationDispatcherService, 'dispatch').mockResolvedValue({
        success: true,
        workspace_id: 'ws-test-1',
      });

      const evaluations = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [sampleGoalAchieved],
        workspaceId: 'ws-test-1',
      });

      await CeoGoalsAlertService.dispatchEvaluation(evaluations[0], { sendGroupCelebration: true });

      // Verificamos que foram disparadas duas mensagens: 1 privada e 1 de grupo
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy.mock.calls[0][0].target_role).toBe('owner');
      expect(dispatchSpy.mock.calls[1][0].target_role).toBe('all');
    });
  });
});
