/**
 * CeoGoalsAlertService.ts
 *
 * Serviço de Alertas e Notificações Inteligentes para Metas Empresariais (Etapa 09 - Gate 6).
 * Avalia ritmo (pacing), detecta metas em risco ('critico' / 'em_atraso') e metas batidas (100%+),
 * gerando mensagens detalhadas para canais executivos privados e mensagens motivacionais sem
 * valores confidenciais para grupos ou colaboradores.
 */

import {
  BusinessGoal,
  BusinessGoalCalculationResult,
} from '../types';
import {
  calculateGoalPacing,
  DayOfWeekWeightMap,
} from './CeoGoalsEngine';
import {
  NotificationDispatcherService,
  DispatchNotificationParams,
  DispatchNotificationResponse,
} from '@/domains/notifications/services/NotificationDispatcherService';

export type GoalAlertType = 'pacing_risk' | 'goal_achieved' | 'period_ending';

export interface GoalAlertEvaluation {
  goalId: string;
  titulo: string;
  type: GoalAlertType;
  statusRitmo: BusinessGoalCalculationResult['status_ritmo'];
  percentualAtingido: number;
  valorAlvo: number;
  valorRealizado: number;
  valorRestante: number;
  diasRestantes: number;
  mediaDiariaAtual: number;
  mediaDiariaNecessaria: number;
  // Mensagem executiva privada (contém números e diretivas confidenciais)
  privateExecutiveNotification: DispatchNotificationParams;
  // Mensagem segura para canais de grupo (sem expor valores financeiros sensíveis)
  safeGroupNotification: DispatchNotificationParams;
}

export class CeoGoalsAlertService {
  /**
   * Avalia uma lista de metas ativas e produz alertas estruturados de ritmo ou celebração.
   */
  public static evaluateGoalsAlerts(params: {
    goals: BusinessGoal[];
    workspaceId: string;
    referenceDate?: Date;
    dayOfWeekWeights?: DayOfWeekWeightMap | null;
  }): GoalAlertEvaluation[] {
    const { goals, workspaceId, referenceDate = new Date(), dayOfWeekWeights = null } = params;
    const evaluations: GoalAlertEvaluation[] = [];

    const activeGoals = goals.filter((g) => g.status === 'ativa');

    for (const goal of activeGoals) {
      const pacing = calculateGoalPacing({
        goal,
        referenceDate,
        dayOfWeekWeights,
      });

      // 1. Meta Batida / Conquistada (100% ou mais)
      if (pacing.percentual_atingido >= 100) {
        const privateMsg =
          `🏆 *Meta Atingida com Sucesso!*\n\n` +
          `A meta "${goal.titulo}" atingiu ${pacing.percentual_atingido.toFixed(1)}% do objetivo planejado.\n` +
          `• *Alvo:* R$ ${pacing.valor_alvo.toLocaleString('pt-BR')}\n` +
          `• *Realizado:* R$ ${pacing.valor_realizado.toLocaleString('pt-BR')}\n` +
          `Excelente desempenho da operação!`;

        const groupMsg =
          `🎉 *Parabéns Equipe!*\n` +
          `Nossa meta semanal/mensal foi atingida com sucesso! Parabéns a todos pelo empenho e dedicação! 🚀`;

        evaluations.push({
          goalId: goal.id,
          titulo: goal.titulo,
          type: 'goal_achieved',
          statusRitmo: pacing.status_ritmo,
          percentualAtingido: pacing.percentual_atingido,
          valorAlvo: pacing.valor_alvo,
          valorRealizado: pacing.valor_realizado,
          valorRestante: pacing.valor_restante,
          diasRestantes: pacing.dias_restantes,
          mediaDiariaAtual: pacing.media_diaria_atual,
          mediaDiariaNecessaria: pacing.media_diaria_necessaria,
          privateExecutiveNotification: {
            workspace_id: workspaceId,
            categoria: 'financeiro',
            prioridade: 'normal',
            titulo: `🏆 Meta Atingida: ${goal.titulo}`,
            mensagem: privateMsg,
            target_role: 'owner',
            metadata: {
              goal_id: goal.id,
              percentual_atingido: pacing.percentual_atingido,
              is_confidential: true,
            },
          },
          safeGroupNotification: {
            workspace_id: workspaceId,
            categoria: 'operacional',
            prioridade: 'normal',
            titulo: '🎉 Meta da Equipe Conquistada!',
            mensagem: groupMsg,
            target_role: 'all',
            metadata: {
              goal_id: goal.id,
              is_confidential: false,
            },
          },
        });
        continue;
      }

      // 2. Meta em Risco ('critico' ou 'em_atraso' com dias restantes)
      if (
        (pacing.status_ritmo === 'critico' || pacing.status_ritmo === 'em_atraso') &&
        pacing.dias_restantes > 0 &&
        pacing.dias_decorridos > 0
      ) {
        const prioridade = pacing.status_ritmo === 'critico' ? 'critica' : 'importante';
        const nivelRisco = pacing.status_ritmo === 'critico' ? 'CRÍTICO' : 'ATENÇÃO';

        const privateMsg =
          `⚠️ *Alerta de Ritmo de Meta (${nivelRisco})*\n\n` +
          `A meta "${goal.titulo}" está abaixo do ritmo projetado:\n` +
          `• *Progresso:* ${pacing.percentual_atingido.toFixed(1)}% (Faltam R$ ${pacing.valor_restante.toLocaleString('pt-BR')})\n` +
          `• *Prazo:* Restam ${pacing.dias_restantes} dia(s)\n` +
          `• *Ritmo Atual:* R$ ${pacing.media_diaria_atual.toLocaleString('pt-BR')}/dia\n` +
          `• *Ritmo Necessário:* R$ ${pacing.media_diaria_necessaria.toLocaleString('pt-BR')}/dia\n\n` +
          `*Diretiva Sugerida:* Ativar ações comerciais no balcão e combos promocionais para recuperar o ritmo.`;

        const groupMsg =
          `📢 *Foco no Objetivo da Semana!*\n` +
          `Estamos entrando nos dias decisivos do nosso período. Vamos acelerar o atendimento e foco total nas vendas! 💪`;

        evaluations.push({
          goalId: goal.id,
          titulo: goal.titulo,
          type: 'pacing_risk',
          statusRitmo: pacing.status_ritmo,
          percentualAtingido: pacing.percentual_atingido,
          valorAlvo: pacing.valor_alvo,
          valorRealizado: pacing.valor_realizado,
          valorRestante: pacing.valor_restante,
          diasRestantes: pacing.dias_restantes,
          mediaDiariaAtual: pacing.media_diaria_atual,
          mediaDiariaNecessaria: pacing.media_diaria_necessaria,
          privateExecutiveNotification: {
            workspace_id: workspaceId,
            categoria: 'financeiro',
            prioridade,
            titulo: `⚠️ Ritmo Abaixo da Meta: ${goal.titulo}`,
            mensagem: privateMsg,
            target_role: 'owner',
            metadata: {
              goal_id: goal.id,
              status_ritmo: pacing.status_ritmo,
              is_confidential: true,
            },
          },
          safeGroupNotification: {
            workspace_id: workspaceId,
            categoria: 'operacional',
            prioridade: 'normal',
            titulo: '📢 Foco no Objetivo da Operação!',
            mensagem: groupMsg,
            target_role: 'all',
            metadata: {
              goal_id: goal.id,
              is_confidential: false,
            },
          },
        });
      }
    }

    return evaluations;
  }

  // Cache de idempotência em memória para evitar notificações duplicadas no mesmo dia/período
  private static dispatchedToday = new Set<string>();

  /**
   * Dispara a notificação executiva e/ou de grupo conforme permissão e canal,
   * garantindo idempotência estrita por meta, tipo de alerta e data.
   */
  public static async dispatchEvaluation(
    evaluation: GoalAlertEvaluation,
    options?: { sendGroupCelebration?: boolean; force?: boolean }
  ): Promise<DispatchNotificationResponse> {
    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = `${evaluation.goalId}:${evaluation.type}:${today}`;

    if (!options?.force && this.dispatchedToday.has(dedupKey)) {
      return {
        success: true,
        workspace_id: evaluation.privateExecutiveNotification.workspace_id,
        total_destinatarios: 0,
      };
    }

    // 1. Sempre envia a notificação executiva detalhada para os administradores
    const execRes = await NotificationDispatcherService.dispatch(
      evaluation.privateExecutiveNotification
    );

    if (execRes.success) {
      this.dispatchedToday.add(dedupKey);
    }

    // 2. Se for celebração de meta batida e habilitado, envia a mensagem segura para todos
    if (evaluation.type === 'goal_achieved' && options?.sendGroupCelebration) {
      await NotificationDispatcherService.dispatch(evaluation.safeGroupNotification);
    }

    return execRes;
  }
}
