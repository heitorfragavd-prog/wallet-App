// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseDateToNoonUtc,
  getPreviousPeriodDates,
  calculateGoalPacing,
  calculateDayOfWeekWeights,
  computeRealizedValueFromRecords,
  determinePacingStatus,
} from './CeoGoalsEngine';
import { BusinessGoal } from '../types';

describe('CeoGoalsEngine Safety & Defensive Resilience', () => {
  it('safely parses null, undefined, invalid or ISO dates without crashing', () => {
    expect(() => parseDateToNoonUtc(null)).not.toThrow();
    expect(() => parseDateToNoonUtc(undefined)).not.toThrow();
    expect(() => parseDateToNoonUtc('')).not.toThrow();
    expect(() => parseDateToNoonUtc('invalid-date')).not.toThrow();
    expect(() => parseDateToNoonUtc('2026-11-14T10:00:00.000Z')).not.toThrow();

    const noon = parseDateToNoonUtc('2026-11-14');
    expect(noon.getUTCFullYear()).toBe(2026);
    expect(noon.getUTCMonth()).toBe(10); // November is 10 (0-indexed)
    expect(noon.getUTCDate()).toBe(14);
    expect(noon.getUTCHours()).toBe(12);
  });

  it('safely handles getPreviousPeriodDates with missing or ISO dates', () => {
    expect(() => getPreviousPeriodDates('semanal', '', '')).not.toThrow();
    expect(() => getPreviousPeriodDates('mensal', '', '')).not.toThrow();
    expect(() => getPreviousPeriodDates('semanal', '2026-11-14', '2026-11-20')).not.toThrow();
    
    const prevWeekly = getPreviousPeriodDates('semanal', '2026-11-14', '2026-11-20');
    expect(prevWeekly.data_inicio_ant).toBe('2026-11-07');
    expect(prevWeekly.data_fim_ant).toBe('2026-11-13');
  });

  it('safely calculates day of week weights from empty or malformed sales lists', () => {
    expect(() => calculateDayOfWeekWeights([])).not.toThrow();
    const weightsEmpty = calculateDayOfWeekWeights([]);
    expect(weightsEmpty[0]).toBe(1.0);

    const malformedSales = [
      { date: '', valor: 100 },
      // @ts-expect-error testing runtime safety
      { date: null, valor: 200 },
      // @ts-expect-error testing runtime safety
      { date: '2026-11-14', valor: null },
      { date: '2026-11-14', valor: 300 },
    ];
    expect(() => calculateDayOfWeekWeights(malformedSales)).not.toThrow();
  });

  it('safely calculates pacing for goals with null, undefined, NaN values and zero targets', () => {
    const brokenGoal: BusinessGoal = {
      id: 'g-test-broken',
      workspace_id: 'ws-1',
      created_by: 'u-1',
      titulo: 'Meta Teste Resiliência',
      indicador: 'faturamento',
      periodo_tipo: 'semanal',
      // @ts-expect-error testing null dates
      data_inicio: null,
      // @ts-expect-error testing null dates
      data_fim: null,
      ano: 2026,
      mes: 11,
      semana_do_ano: 46,
      valor_alvo: 0,
      valor_realizado: 0,
      unidade: 'monetario',
      categoria_ou_produto: null,
      eyemobile_product_id: null,
      status: 'ativa',
      descricao: null,
      observacoes: null,
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(() =>
      calculateGoalPacing({
        goal: brokenGoal,
        currentValue: undefined,
        referenceDate: new Date(),
        previousPeriodValue: null,
      })
    ).not.toThrow();

    const pacing = calculateGoalPacing({
      goal: brokenGoal,
      // @ts-expect-error testing NaN
      currentValue: NaN,
      referenceDate: new Date(),
      // @ts-expect-error testing NaN
      previousPeriodValue: NaN,
    });

    expect(Number.isFinite(pacing.valor_alvo)).toBe(true);
    expect(Number.isFinite(pacing.valor_realizado)).toBe(true);
    expect(Number.isFinite(pacing.percentual_atingido)).toBe(true);
    expect(Number.isFinite(pacing.projecao_linear)).toBe(true);
    expect(pacing.status_ritmo).toBeDefined();
  });

  it('safely computes realized value from records with undefined sales and expenses', () => {
    // @ts-expect-error testing runtime safety
    expect(() => computeRealizedValueFromRecords({})).not.toThrow();
    // @ts-expect-error testing runtime safety
    expect(computeRealizedValueFromRecords({ indicador: 'faturamento', sales: undefined })).toBe(0);
    // @ts-expect-error testing runtime safety
    expect(computeRealizedValueFromRecords({ indicador: 'despesas', expenses: undefined })).toBe(0);
    // @ts-expect-error testing runtime safety
    expect(computeRealizedValueFromRecords({ indicador: 'resultado_operacional', sales: null, expenses: null })).toBe(0);
  });

  it('correctly determines pacing status without throwing on edge numbers', () => {
    expect(determinePacingStatus(0, 0, 7)).toBe('no_ritmo');
    expect(determinePacingStatus(120, 3, 7)).toBe('adiantado');
    expect(determinePacingStatus(56, 4, 7)).toBe('no_ritmo');
    expect(determinePacingStatus(50, 4, 7)).toBe('em_atraso');
    expect(determinePacingStatus(10, 5, 7)).toBe('critico');
  });
});
