/**
 * etapa9_gate3_motor_calculos.test.ts
 *
 * Testes unitários do motor de cálculos semanais e mensais do Wallet CEO (Etapa 09 - Gate 3).
 * Valida projeções lineares, ponderação de dias da semana, pacing status, cálculo
 * de períodos equivalentes e integridade dos 8 indicadores.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDateToNoonUtc,
  getPreviousPeriodDates,
  calculateDayOfWeekWeights,
  determinePacingStatus,
  calculateDayOfWeekAdjustedProjection,
  calculateGoalPacing,
  computeRealizedValueFromRecords,
} from '@/domains/ceo/services/CeoGoalsEngine';
import { BusinessGoal } from '@/domains/ceo/types';

describe('Gate 3: Motor de Cálculos de Metas (CeoGoalsEngine)', () => {
  const mockGoal: BusinessGoal = {
    id: 'goal-uuid-1',
    workspace_id: 'workspace-uuid-1',
    created_by: 'user-uuid-1',
    titulo: 'Meta Semanal de Faturamento',
    indicador: 'faturamento',
    periodo_tipo: 'semanal',
    data_inicio: '2026-11-09',
    data_fim: '2026-11-15',
    ano: 2026,
    semana_do_ano: 46,
    valor_alvo: 50000,
    valor_realizado: 25000,
    unidade: 'monetario',
    status: 'ativa',
    history: [],
    created_at: '2026-11-08T10:00:00Z',
    updated_at: '2026-11-08T10:00:00Z',
  };

  it('1. parseDateToNoonUtc garante data sem drift de fuso', () => {
    const d = parseDateToNoonUtc('2026-11-12');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(10); // 0-based: Novembro = 10
    expect(d.getUTCDate()).toBe(12);
    expect(d.getUTCHours()).toBe(12);
  });

  it('2. getPreviousPeriodDates calcula semana e mês anterior canônico', () => {
    // Semanal: desloca exatamente 7 dias
    const prevWeekly = getPreviousPeriodDates('semanal', '2026-11-09', '2026-11-15');
    expect(prevWeekly.data_inicio_ant).toBe('2026-11-02');
    expect(prevWeekly.data_fim_ant).toBe('2026-11-08');

    // Mensal: desloca para o mês anterior e ajusta dias limites (Fevereiro)
    const prevMonthly = getPreviousPeriodDates('mensal', '2026-03-01', '2026-03-31');
    expect(prevMonthly.data_inicio_ant).toBe('2026-02-01');
    expect(prevMonthly.data_fim_ant).toBe('2026-02-28');

    // Virada de ano
    const prevYear = getPreviousPeriodDates('mensal', '2027-01-01', '2027-01-31');
    expect(prevYear.data_inicio_ant).toBe('2026-12-01');
    expect(prevYear.data_fim_ant).toBe('2026-12-31');
  });

  it('3. calculateDayOfWeekWeights normaliza pesos por dia da semana', () => {
    // Simula 7 dias com maior peso na sexta (5) e sábado (6)
    const mockDaily = [
      { date: '2026-11-08', valor: 2000 }, // Domingo (0)
      { date: '2026-11-09', valor: 1000 }, // Segunda (1)
      { date: '2026-11-10', valor: 1000 }, // Terça (2)
      { date: '2026-11-11', valor: 1000 }, // Quarta (3)
      { date: '2026-11-12', valor: 1000 }, // Quinta (4)
      { date: '2026-11-13', valor: 3000 }, // Sexta (5)
      { date: '2026-11-14', valor: 5000 }, // Sábado (6)
    ];

    const weights = calculateDayOfWeekWeights(mockDaily);
    expect(weights[5]).toBeGreaterThan(weights[1]); // Sexta > Segunda
    expect(weights[6]).toBeGreaterThan(weights[5]); // Sábado > Sexta
    expect(weights[1]).toBeCloseTo(weights[2], 1); // Segunda ~ Terça
  });

  it('4. determinePacingStatus classifica rigorosamente adiantado, no_ritmo, em_atraso e critico', () => {
    const diasTotais = 10;
    const diasDecorridos = 5; // Metade do período decorrido (esperado = 50%)

    // Se realizou 60% (60 >= 50 * 1.05 = 52.5) -> adiantado
    expect(determinePacingStatus(60, diasDecorridos, diasTotais)).toBe('adiantado');

    // Se realizou 50% (dentro de 47.5% e 52.5%) -> no_ritmo
    expect(determinePacingStatus(50, diasDecorridos, diasTotais)).toBe('no_ritmo');

    // Se realizou 42% (entre 40% e 47.5%) -> em_atraso
    expect(determinePacingStatus(42, diasDecorridos, diasTotais)).toBe('em_atraso');

    // Se realizou 35% (< 40%) -> critico
    expect(determinePacingStatus(35, diasDecorridos, diasTotais)).toBe('critico');

    // Se atingiu 100% da meta mesmo no início do período -> adiantado
    expect(determinePacingStatus(100, 1, 30)).toBe('adiantado');
  });

  it('5. calculateDayOfWeekAdjustedProjection pondera dias futuros', () => {
    const noonRef = parseDateToNoonUtc('2026-11-12'); // Quinta-feira (4)
    // Supondo pesos onde Sexta (5) tem peso 1.5 e Sábado (6) tem peso 2.0
    const weights = { 0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.5, 6: 2.0 };
    // 4 dias decorridos de 6 totais (faltam 2 dias: Sexta e Sábado)
    // mediaDiaria = 1000, realizado = 4000
    // Sexta projeta 1000 * 1.5 = 1500; Sábado projeta 1000 * 2.0 = 2000
    // Total ajustado: 4000 + 1500 + 2000 = 7500
    const proj = calculateDayOfWeekAdjustedProjection(4000, 1000, noonRef, 4, 6, weights);
    expect(proj).toBe(7500);
  });

  it('6. calculateGoalPacing calcula métricas completas para meta semanal em andamento', () => {
    // Meta de 50.000 para 2026-11-09 até 2026-11-15 (7 dias)
    // Supondo referência em 2026-11-12 (quinta-feira, 4º dia) com 25.000 realizado
    const refDate = new Date(Date.UTC(2026, 10, 12, 12, 0, 0));

    const result = calculateGoalPacing({
      goal: mockGoal,
      currentValue: 25000,
      referenceDate: refDate,
      previousPeriodValue: 20000,
    });

    expect(result.dias_totais).toBe(7);
    expect(result.dias_decorridos).toBe(4);
    expect(result.dias_restantes).toBe(3);
    expect(result.valor_alvo).toBe(50000);
    expect(result.valor_realizado).toBe(25000);
    expect(result.valor_restante).toBe(25000);
    expect(result.percentual_atingido).toBe(50);
    expect(result.media_diaria_atual).toBe(6250); // 25000 / 4
    expect(result.media_diaria_necessaria).toBe(8333.33); // 25000 / 3
    expect(result.projecao_linear).toBe(43750); // 6250 * 7
    expect(result.status_ritmo).toBe('em_atraso'); // Esperado no dia 4/7 é ~57.14%, 50% é < 95% do esperado
    expect(result.comparativo_periodo_anterior?.valor_realizado_anterior).toBe(20000);
    expect(result.comparativo_periodo_anterior?.delta_percent).toBe(25); // (25000 - 20000) / 20000 = +25%
    expect(result.is_periodo_fechado).toBe(false);
  });

  it('6. calculateGoalPacing lida com meta encerrada e meta futura', () => {
    // Meta futura (hoje é antes de data_inicio)
    const futureDate = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));
    const futureResult = calculateGoalPacing({
      goal: mockGoal,
      referenceDate: futureDate,
    });
    expect(futureResult.dias_decorridos).toBe(0);
    expect(futureResult.dias_restantes).toBe(7);
    expect(futureResult.media_diaria_atual).toBe(0);
    expect(futureResult.projecao_linear).toBe(0);
    expect(futureResult.status_ritmo).toBe('no_ritmo');

    // Meta encerrada (hoje é depois de data_fim)
    const pastDate = new Date(Date.UTC(2026, 10, 20, 12, 0, 0));
    const pastResult = calculateGoalPacing({
      goal: mockGoal,
      currentValue: 55000,
      referenceDate: pastDate,
    });
    expect(pastResult.dias_decorridos).toBe(7);
    expect(pastResult.dias_restantes).toBe(0);
    expect(pastResult.is_periodo_fechado).toBe(true);
    expect(pastResult.projecao_linear).toBe(55000); // Período fechado projeta o próprio realizado
    expect(pastResult.media_diaria_necessaria).toBe(0);
    expect(pastResult.status_ritmo).toBe('adiantado');
  });

  it('7. computeRealizedValueFromRecords calcula corretamente cada indicador', () => {
    const mockSales = [
      { valor_total: 100, quantidade: 2, categoria: 'Bebidas', produto_nome: 'Refrigerante', eyemobile_product_id: 'p1', custo_total: 40, is_combo: false },
      { valor_total: 200, quantidade: 1, categoria: 'Lanches', produto_nome: 'Combo Burger', eyemobile_product_id: 'p2', custo_total: 80, is_combo: true },
      { valor_total: 50, quantidade: 1, categoria: 'Sobremesas', produto_nome: 'Sorvete', cancelado: true }, // Cancelado deve ser ignorado
    ];
    const mockExpenses = [
      { valor: 70, cancelado: false },
      { valor: 30, cancelado: true }, // Cancelado ignorado
    ];

    // Faturamento: 100 + 200 = 300
    expect(computeRealizedValueFromRecords({ indicador: 'faturamento', sales: mockSales })).toBe(300);

    // Pedidos: 2 válidos
    expect(computeRealizedValueFromRecords({ indicador: 'pedidos', sales: mockSales })).toBe(2);

    // Ticket Médio: 300 / 2 = 150
    expect(computeRealizedValueFromRecords({ indicador: 'ticket_medio', sales: mockSales })).toBe(150);

    // Despesas: 70
    expect(computeRealizedValueFromRecords({ indicador: 'despesas', sales: [], expenses: mockExpenses })).toBe(70);

    // Resultado Operacional: 300 - 70 = 230
    expect(computeRealizedValueFromRecords({ indicador: 'resultado_operacional', sales: mockSales, expenses: mockExpenses })).toBe(230);

    // Margem: (300 - 120) / 300 = 60%
    expect(computeRealizedValueFromRecords({ indicador: 'margem', sales: mockSales })).toBe(60);

    // Produto/Categoria específico por categoria
    expect(computeRealizedValueFromRecords({ indicador: 'produto_categoria', sales: mockSales, categoriaOuProduto: 'bebidas' })).toBe(100);

    // Produto específico por ID
    expect(computeRealizedValueFromRecords({ indicador: 'produto_categoria', sales: mockSales, eyemobileProductId: 'p2' })).toBe(200);

    // Combos: 1 combo vendido
    expect(computeRealizedValueFromRecords({ indicador: 'combos', sales: mockSales })).toBe(1);
  });
});
