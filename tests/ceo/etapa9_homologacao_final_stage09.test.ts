import { describe, it, expect } from 'vitest';
import {
  parseDateToNoonUtc,
  getPreviousPeriodDates,
  calculateDayOfWeekWeights,
  calculateGoalPacing,
  computeRealizedValueFromRecords,
  calculateDayOfWeekAdjustedProjection,
} from '../../src/domains/ceo/services/CeoGoalsEngine';
import { CeoGoalsAlertService } from '../../src/domains/ceo/services/CeoGoalsAlertService';
import type { BusinessGoal } from '../../src/domains/ceo/types';

describe('ETAPA 09 — HOMOLOGAÇÃO FINAL: METAS SEMANAIS E MENSAIS INTELIGENTES', () => {
  describe('Gate 7.1 — Bateria de Casos de Borda de Calendário, Fuso e Anos Bissextos', () => {
    it('deve normalizar corretamente datas para o meio-dia UTC evitando deslocamento de fuso (America/Sao_Paulo UTC-3)', () => {
      const d1 = parseDateToNoonUtc('2026-02-28');
      expect(d1.getUTCFullYear()).toBe(2026);
      expect(d1.getUTCMonth()).toBe(1); // Fev
      expect(d1.getUTCDate()).toBe(28);
      expect(d1.getUTCHours()).toBe(12);

      const d2 = parseDateToNoonUtc('2026-03-01');
      expect(d2.getUTCFullYear()).toBe(2026);
      expect(d2.getUTCMonth()).toBe(2); // Mar
      expect(d2.getUTCDate()).toBe(1);
      expect(d2.getUTCHours()).toBe(12);
    });

    it('deve calcular período anterior corretamente para ano bissexto (fevereiro)', () => {
      // Fevereiro de 2028 é bissexto (29 dias)
      const prevFebLeap = getPreviousPeriodDates('mensal', '2028-03-01', '2028-03-31');
      expect(prevFebLeap.data_inicio_ant).toBe('2028-02-01');
      expect(prevFebLeap.data_fim_ant).toBe('2028-02-29');

      // Fevereiro de 2026 não é bissexto (28 dias)
      const prevFebNonLeap = getPreviousPeriodDates('mensal', '2026-03-01', '2026-03-31');
      expect(prevFebNonLeap.data_inicio_ant).toBe('2026-02-01');
      expect(prevFebNonLeap.data_fim_ant).toBe('2026-02-28');
    });

    it('deve calcular período anterior corretamente na virada de ano (Janeiro -> Dezembro do ano anterior)', () => {
      const prevYearTurn = getPreviousPeriodDates('mensal', '2026-01-01', '2026-01-31');
      expect(prevYearTurn.data_inicio_ant).toBe('2025-12-01');
      expect(prevYearTurn.data_fim_ant).toBe('2025-12-31');
    });

    it('deve calcular período semanal anterior exato (-7 dias) mesmo cruzando virada de mês', () => {
      const prevWeekCross = getPreviousPeriodDates('semanal', '2026-03-02', '2026-03-08');
      expect(prevWeekCross.data_inicio_ant).toBe('2026-02-23');
      expect(prevWeekCross.data_fim_ant).toBe('2026-03-01');
    });

    it('deve lidar com pesos de dias da semana mesmo com dados parciais ou zerados', () => {
      const emptyWeights = calculateDayOfWeekWeights([]);
      expect(Object.keys(emptyWeights)).toHaveLength(7);
      // Distribuição uniforme (1.0 para cada)
      Object.values(emptyWeights).forEach((w) => {
        expect(w).toBe(1.0);
      });

      const sales = [
        { date: '2026-03-02', valor: 500 }, // Segunda (1)
        { date: '2026-03-07', valor: 2500 }, // Sábado (6)
      ];
      const weights = calculateDayOfWeekWeights(sales);
      expect(weights[6]).toBeGreaterThan(weights[1]);
    });
  });

  describe('Gate 7.2 — Ciclo de Vida Ponta a Ponta: Criação -> Pacing -> Alerta -> Conclusão', () => {
    const mockGoal: BusinessGoal = {
      id: 'goal-e2e-1',
      workspace_id: 'ws-wonder-1',
      created_by: 'user-owner',
      titulo: 'Meta de Faturamento Semanal - Semana 46',
      indicador: 'faturamento',
      periodo_tipo: 'semanal',
      data_inicio: '2026-11-09',
      data_fim: '2026-11-15',
      ano: 2026,
      semana_do_ano: 46,
      valor_alvo: 70000,
      valor_realizado: 0,
      unidade: 'monetario',
      status: 'ativa',
      history: [],
      created_at: '2026-11-09T08:00:00Z',
      updated_at: '2026-11-09T08:00:00Z',
    };

    it('Fase 1: No início do período com ritmo baixo, deve detectar atraso crítico e alertar os canais corretos', () => {
      // Dia 3 de 7 (passaram 3 dias: 9, 10, 11). Realizado apenas 10.000 de 70.000.
      const refDate = parseDateToNoonUtc('2026-11-11');
      const pacing = calculateGoalPacing({
        goal: mockGoal,
        currentValue: 10000,
        referenceDate: refDate,
        previousPeriodValue: 50000,
      });

      expect(pacing.status_ritmo).toBe('critico');
      expect(pacing.percentual_atingido).toBeCloseTo(14.28, 1);
      expect(pacing.media_diaria_necessaria).toBeGreaterThan(pacing.media_diaria_atual);

      // Avaliação de alertas via CeoGoalsAlertService
      const evals = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [{ ...mockGoal, valor_realizado: 10000 }],
        workspaceId: 'ws-wonder-1',
        referenceDate: refDate,
      });

      expect(evals).toHaveLength(1);
      expect(evals[0].type).toBe('pacing_risk');
      expect(evals[0].statusRitmo).toBe('critico');

      // Formatação segregada
      const priv = evals[0].privateExecutiveNotification;
      expect(priv.target_role).toBe('owner');
      expect(priv.mensagem).toContain('CRÍTICO');
      expect(priv.mensagem).toContain('R$'); // Contém valores financeiros privados

      const grp = evals[0].safeGroupNotification;
      expect(grp.target_role).toBe('all');
      expect(grp.mensagem).not.toContain('70.000'); // Não expõe metas absolutas em canais operacionais
      expect(grp.mensagem).toContain('Foco no Objetivo');
    });

    it('Fase 2: No meio do período após plano corretivo, vendas sobem e o ritmo entra em conformidade', () => {
      // Dia 5 de 7 (9 a 13). Realizado 52.000 de 70.000.
      const refDate = parseDateToNoonUtc('2026-11-13');
      const pacing = calculateGoalPacing({
        goal: mockGoal,
        currentValue: 52000,
        referenceDate: refDate,
        previousPeriodValue: 50000,
      });

      expect(['no_ritmo', 'adiantado']).toContain(pacing.status_ritmo);
      expect(pacing.projecao_linear).toBeGreaterThanOrEqual(70000);

      const evals = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [{ ...mockGoal, valor_realizado: 52000 }],
        workspaceId: 'ws-wonder-1',
        referenceDate: refDate,
      });
      // Como o ritmo normalizou e não atingiu 100% ainda, não emite alertas de risco
      expect(evals).toHaveLength(0);
    });

    it('Fase 3: No final do período, meta é 100% atingida gerando alerta de celebração', () => {
      // Dia 7 de 7. Realizado 75.000 de 70.000 => 107.1%
      const refDate = parseDateToNoonUtc('2026-11-15');
      const pacing = calculateGoalPacing({
        goal: mockGoal,
        currentValue: 75000,
        referenceDate: refDate,
        previousPeriodValue: 50000,
      });

      expect(pacing.percentual_atingido).toBeGreaterThanOrEqual(100);
      expect(pacing.status_ritmo).toBe('adiantado');

      const evals = CeoGoalsAlertService.evaluateGoalsAlerts({
        goals: [{ ...mockGoal, valor_realizado: 75000 }],
        workspaceId: 'ws-wonder-1',
        referenceDate: refDate,
      });
      expect(evals).toHaveLength(1);
      expect(evals[0].type).toBe('goal_achieved');

      // Notificação de grupo celebra a equipe com segurança
      const grp = evals[0].safeGroupNotification;
      expect(grp.mensagem).toContain('atingida com sucesso');
    });
  });

  describe('Gate 7.3 — Verificação dos 8 Indicadores Oficiais e Tratamento de Custos Desconhecidos', () => {
    it('deve calcular corretamente indicador de margem e ignorar vendas canceladas', () => {
      const recordsWithCost = [
        { valor_total: 100, custo_total: 40, cancelado: false },
        { valor_total: 200, custo_total: 80, cancelado: false },
        { valor_total: 500, custo_total: 200, cancelado: true }, // Cancelado
      ];
      const res = computeRealizedValueFromRecords({ indicador: 'margem', sales: recordsWithCost });
      // Receita = 300, Custo = 120, Lucro Bruto = 180 => Margem = 60%
      expect(res).toBeCloseTo(60, 1);
    });

    it('deve computar resultado operacional subtraindo despesas reais', () => {
      const sales = [{ valor_total: 50000, cancelado: false }];
      const expenses = [{ valor: 35000, cancelado: false }];
      const resOp = computeRealizedValueFromRecords({
        indicador: 'resultado_operacional',
        sales,
        expenses,
      });
      expect(resOp).toBe(15000);
    });

    it('deve computar despesas isoladas com segurança', () => {
      const expenses = [
        { valor: 1200, cancelado: false },
        { valor: 800, cancelado: false },
        { valor: 500, cancelado: true },
      ];
      const totalExp = computeRealizedValueFromRecords({
        indicador: 'despesas',
        sales: [],
        expenses,
      });
      expect(totalExp).toBe(2000);
    });

    it('deve computar faturamento, pedidos e ticket médio', () => {
      const sales = [
        { valor_total: 200, cancelado: false },
        { valor_total: 300, cancelado: false },
      ];
      expect(computeRealizedValueFromRecords({ indicador: 'faturamento', sales })).toBe(500);
      expect(computeRealizedValueFromRecords({ indicador: 'pedidos', sales })).toBe(2);
      expect(computeRealizedValueFromRecords({ indicador: 'ticket_medio', sales })).toBe(250);
    });

    it('deve filtrar produtos por categoria específica quando configurado', () => {
      const sales = [
        { categoria: 'Bebidas', valor_total: 50, cancelado: false },
        { categoria: 'Alimentos', valor_total: 90, cancelado: false },
        { categoria: 'Bebidas', valor_total: 20, cancelado: false },
      ];
      const bebidas = computeRealizedValueFromRecords({
        indicador: 'produto_categoria',
        sales,
        categoriaOuProduto: 'bebidas',
      });
      expect(bebidas).toBe(70); // 50 + 20
    });
  });

  describe('Gate 7.4 — Projeções Lineares e Ponderadas por Dia da Semana', () => {
    it('deve calcular projeção ajustada considerando maior peso nos finais de semana', () => {
      // 6 dias: Quinta (4) até Terça
      const refDate = parseDateToNoonUtc('2026-11-12'); // Quinta (4)
      const weights = { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.5, 6: 2.0 };
      // 4 dias decorridos de 6 totais (faltam 2 dias: Sexta e Sábado)
      // mediaDiaria = 1000, realizado = 4000
      // Sexta: 1000 * 1.5 = 1500; Sábado: 1000 * 2.0 = 2000
      // Projeção ajustada: 4000 + 1500 + 2000 = 7500
      const projAdjusted = calculateDayOfWeekAdjustedProjection(
        4000,
        1000,
        refDate,
        4,
        6,
        weights
      );
      // Projeção ajustada é maior que a projeção simples pelo peso do final de semana
      expect(projAdjusted).toBe(7500);
      expect(projAdjusted).toBeGreaterThan(4000 + 1000 * 2); // 6000 linear puro
    });
  });
});
