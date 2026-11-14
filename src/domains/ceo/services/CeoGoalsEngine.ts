/**
 * CeoGoalsEngine.ts
 *
 * Motor canônico de cálculos para metas semanais e mensais do Wallet CEO (Etapa 09).
 * Realiza cálculos de progresso, ritmo (pacing), projeções inteligentes (linear e
 * ajustada por peso dos dias da semana), comparativo de períodos equivalentes
 * e tratamento estrito de timezone 'America/Sao_Paulo'.
 */

import {
  BusinessGoal,
  BusinessGoalCalculationResult,
  BusinessGoalIndicator,
  BusinessGoalPeriodType,
} from '../types';
import {
  getSaoPauloDateString,
  getSaoPauloParts,
} from './CeoFinancialMetricsService';

export interface DayOfWeekWeightMap {
  [dayOfWeek: number]: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
}

export interface CalculateGoalPacingParams {
  goal: BusinessGoal;
  currentValue?: number;
  referenceDate?: Date;
  previousPeriodValue?: number | null;
  dayOfWeekWeights?: DayOfWeekWeightMap | null;
}

export interface PreviousPeriodDates {
  data_inicio_ant: string;
  data_fim_ant: string;
}

/**
 * Converte uma data no formato 'YYYY-MM-DD' para objeto Date no meio-dia UTC,
 * garantindo consistência aritmética sem sofrer desvios de timezone local.
 * Tolerante a valores nulos, vazios ou ISO strings com timestamp.
 */
export function parseDateToNoonUtc(dateStr?: string | null): Date {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  }
  const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  const parts = cleanStr.split('-');
  if (parts.length < 3) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  }
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Retorna os limites canônicos do período anterior equivalente para uma meta semanal ou mensal.
 * - Semanal: desloca exatamente 7 dias para trás no início e no fim.
 * - Mensal: desloca para o mês anterior equivalente, respeitando dias limites do mês.
 */
export function getPreviousPeriodDates(
  periodo_tipo: BusinessGoalPeriodType,
  data_inicio: string,
  data_fim: string
): PreviousPeriodDates {
  const noonInicio = parseDateToNoonUtc(data_inicio);
  const noonFim = parseDateToNoonUtc(data_fim);

  if (periodo_tipo === 'semanal') {
    const inicioAntDate = new Date(noonInicio.getTime() - 7 * 86400000);
    const fimAntDate = new Date(noonFim.getTime() - 7 * 86400000);
    return {
      data_inicio_ant: getSaoPauloDateString(inicioAntDate),
      data_fim_ant: getSaoPauloDateString(fimAntDate),
    };
  }

  // Mensal: cálculo do mês anterior seguro
  const cleanInicio = (data_inicio || '').includes('T') ? (data_inicio || '').split('T')[0] : (data_inicio || '');
  const cleanFim = (data_fim || '').includes('T') ? (data_fim || '').split('T')[0] : (data_fim || '');
  const partsInicio = cleanInicio.split('-');
  const partsFim = cleanFim.split('-');

  const ano = parseInt(partsInicio[0] || '2026', 10);
  const mes = parseInt(partsInicio[1] || '1', 10);
  const diaInicio = parseInt(partsInicio[2] || '1', 10);
  const diaFim = parseInt(partsFim[2] || '30', 10);

  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAntPad = String(mesAnt).padStart(2, '0');

  // Dias no mês anterior
  const diasNoMesAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
  const diaInicioAnt = Math.min(diaInicio, diasNoMesAnt);
  const diaFimAnt = Math.min(diaFim, diasNoMesAnt);

  return {
    data_inicio_ant: `${anoAnt}-${mesAntPad}-${String(diaInicioAnt).padStart(2, '0')}`,
    data_fim_ant: `${anoAnt}-${mesAntPad}-${String(diaFimAnt).padStart(2, '0')}`,
  };
}

/**
 * Calcula a ponderação histórica dos dias da semana (0 = Domingo a 6 = Sábado)
 * a partir de uma série temporal diária (ex: últimos 30 dias de vendas).
 */
export function calculateDayOfWeekWeights(
  dailySales: Array<{ date: string; valor: number }>
): DayOfWeekWeightMap {
  const sums: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  for (const item of dailySales) {
    if (!item.date || typeof item.valor !== 'number') continue;
    const noon = parseDateToNoonUtc(item.date);
    const dow = noon.getUTCDay();
    sums[dow] += item.valor;
    counts[dow] += 1;
  }

  const averages: Record<number, number> = {};
  let totalAverage = 0;
  let validDaysCount = 0;

  for (let dow = 0; dow < 7; dow++) {
    const avg = counts[dow] > 0 ? sums[dow] / counts[dow] : 0;
    averages[dow] = avg;
    if (counts[dow] > 0) {
      totalAverage += avg;
      validDaysCount += 1;
    }
  }

  const baselineDailyAverage = validDaysCount > 0 ? totalAverage / validDaysCount : 0;
  const weights: DayOfWeekWeightMap = {};

  for (let dow = 0; dow < 7; dow++) {
    if (baselineDailyAverage > 0 && averages[dow] > 0) {
      weights[dow] = averages[dow] / baselineDailyAverage;
    } else {
      weights[dow] = 1.0; // peso neutro quando sem dados
    }
  }

  return weights;
}

/**
 * Determina o status de ritmo de execução da meta (pacing)
 * - 'adiantado': >= 5% acima do esperado proporcional
 * - 'no_ritmo': entre -5% e +5% do esperado proporcional
 * - 'em_atraso': entre 5% e 20% abaixo do esperado proporcional
 * - 'critico': mais de 20% abaixo do esperado proporcional
 */
export function determinePacingStatus(
  percentualAtingido: number,
  diasDecorridos: number,
  diasTotais: number
): 'adiantado' | 'no_ritmo' | 'em_atraso' | 'critico' {
  if (diasTotais <= 0 || diasDecorridos <= 0) {
    return 'no_ritmo';
  }

  // Se já atingiu 100% ou mais da meta, está adiantado independentemente do prazo
  if (percentualAtingido >= 100) {
    return 'adiantado';
  }

  const esperadoProporcional = (diasDecorridos / diasTotais) * 100;
  if (esperadoProporcional <= 0) {
    return 'no_ritmo';
  }

  const limiarAdiantado = esperadoProporcional * 1.05;
  const limiarNoRitmoMin = esperadoProporcional * 0.95;
  const limiarAtrasoMin = esperadoProporcional * 0.80;

  if (percentualAtingido >= limiarAdiantado) {
    return 'adiantado';
  }
  if (percentualAtingido >= limiarNoRitmoMin) {
    return 'no_ritmo';
  }
  if (percentualAtingido >= limiarAtrasoMin) {
    return 'em_atraso';
  }
  return 'critico';
}

/**
 * Calcula a projeção ajustada pelos pesos dos dias da semana restantes
 */
export function calculateDayOfWeekAdjustedProjection(
  valorRealizado: number,
  mediaDiariaAtual: number,
  referenceNoon: Date,
  diasDecorridos: number,
  diasTotais: number,
  weights?: DayOfWeekWeightMap | null
): number {
  const diasRestantes = Math.max(0, diasTotais - diasDecorridos);
  if (diasRestantes === 0) {
    return valorRealizado;
  }
  if (diasDecorridos === 0 || mediaDiariaAtual <= 0) {
    return 0;
  }
  if (!weights) {
    return mediaDiariaAtual * diasTotais;
  }

  let projectedRemaining = 0;
  for (let step = 1; step <= diasRestantes; step++) {
    const futureDayNoon = new Date(referenceNoon.getTime() + step * 86400000);
    const dow = futureDayNoon.getUTCDay();
    const weight = weights[dow] ?? 1.0;
    projectedRemaining += mediaDiariaAtual * weight;
  }

  return Number((valorRealizado + projectedRemaining).toFixed(2));
}

/**
 * Motor central de cálculo de performance e ritmo de uma meta empresarial.
 */
export function calculateGoalPacing(params: CalculateGoalPacingParams): BusinessGoalCalculationResult {
  const {
    goal,
    currentValue,
    referenceDate = new Date(),
    previousPeriodValue = null,
    dayOfWeekWeights = null,
  } = params;

  const rawAlvo = Number(goal?.valor_alvo || 0);
  const valorAlvo = Number.isFinite(rawAlvo) ? Math.max(0, rawAlvo) : 0;
  const rawRealizado = Number(currentValue !== undefined ? currentValue : goal?.valor_realizado || 0);
  const valorRealizado = Number.isFinite(rawRealizado) ? Math.max(0, rawRealizado) : 0;

  // Datas e Meio-Dia UTC para cálculo sem desvio
  const noonInicio = parseDateToNoonUtc(goal?.data_inicio);
  const noonFim = parseDateToNoonUtc(goal?.data_fim);

  const hojeParts = getSaoPauloParts(referenceDate);
  const noonHoje = parseDateToNoonUtc(hojeParts.dateString);

  // Quantidade total de dias do período da meta (inclusivo)
  const diffMs = noonFim.getTime() - noonInicio.getTime();
  const diasTotais = Math.max(1, Math.round(diffMs / 86400000) + 1);

  // Dias decorridos até hoje
  let diasDecorridos = 0;
  let isPeriodoFechado = false;

  if (noonHoje < noonInicio) {
    // Meta futura: não iniciou ainda
    diasDecorridos = 0;
    isPeriodoFechado = false;
  } else if (noonHoje > noonFim) {
    // Meta passada: período encerrado
    diasDecorridos = diasTotais;
    isPeriodoFechado = true;
  } else {
    // Meta em andamento (inclui hoje como dia em progresso)
    const elapsedMs = noonHoje.getTime() - noonInicio.getTime();
    diasDecorridos = Math.min(diasTotais, Math.round(elapsedMs / 86400000) + 1);
    isPeriodoFechado = false;
  }

  const diasRestantes = Math.max(0, diasTotais - diasDecorridos);

  // Percentual atingido e restante
  const rawPct = valorAlvo > 0 ? (valorRealizado / valorAlvo) * 100 : 0;
  const percentualAtingido = Number.isFinite(rawPct) ? Number(rawPct.toFixed(2)) : 0;
  const valorRestante = Number(Math.max(0, valorAlvo - valorRealizado).toFixed(2));

  // Médias diárias
  const mediaDiariaAtual = diasDecorridos > 0
    ? Number((valorRealizado / diasDecorridos).toFixed(2))
    : 0;

  const mediaDiariaNecessaria = diasRestantes > 0
    ? Number((valorRestante / diasRestantes).toFixed(2))
    : 0;

  // Projeção Linear
  let projecaoLinear = 0;
  if (isPeriodoFechado || diasRestantes === 0) {
    projecaoLinear = valorRealizado;
  } else if (diasDecorridos > 0) {
    const rawLinear = mediaDiariaAtual * diasTotais;
    projecaoLinear = Number.isFinite(rawLinear) ? Number(rawLinear.toFixed(2)) : valorRealizado;
  }

  // Projeção Ajustada por Dias da Semana
  const projecaoAjustada = calculateDayOfWeekAdjustedProjection(
    valorRealizado,
    mediaDiariaAtual,
    noonHoje,
    diasDecorridos,
    diasTotais,
    dayOfWeekWeights
  );

  // Status de ritmo
  const statusRitmo = determinePacingStatus(percentualAtingido, diasDecorridos, diasTotais);

  // Comparativo com período anterior
  let comparativo: BusinessGoalCalculationResult['comparativo_periodo_anterior'] = null;
  if (previousPeriodValue !== null && previousPeriodValue !== undefined) {
    const prevVal = Number(previousPeriodValue);
    if (Number.isFinite(prevVal)) {
      const deltaPercent = prevVal > 0
        ? Number((((valorRealizado - prevVal) / prevVal) * 100).toFixed(2))
        : null;

      comparativo = {
        valor_realizado_anterior: prevVal,
        delta_percent: deltaPercent !== null && Number.isFinite(deltaPercent) ? deltaPercent : null,
      };
    }
  }

  return {
    goalId: goal.id,
    indicador: goal.indicador,
    periodo_tipo: goal.periodo_tipo,
    data_inicio: goal.data_inicio,
    data_fim: goal.data_fim,
    valor_alvo: valorAlvo,
    valor_realizado: valorRealizado,
    percentual_atingido: percentualAtingido,
    valor_restante: valorRestante,
    dias_totais: diasTotais,
    dias_decorridos: diasDecorridos,
    dias_restantes: diasRestantes,
    media_diaria_atual: mediaDiariaAtual,
    media_diaria_necessaria: mediaDiariaNecessaria,
    projecao_linear: projecaoLinear,
    projecao_ajustada_dias_semana: projecaoAjustada,
    comparativo_periodo_anterior: comparativo,
    status_ritmo: statusRitmo,
    is_periodo_fechado: isPeriodoFechado,
  };
}

export interface MetricCalculationInput {
  indicador: BusinessGoalIndicator;
  sales: Array<{
    valor_total: number;
    quantidade?: number;
    categoria?: string | null;
    produto_nome?: string | null;
    eyemobile_product_id?: string | null;
    custo_total?: number | null;
    is_combo?: boolean;
    cancelado?: boolean;
  }>;
  expenses?: Array<{
    valor: number;
    cancelado?: boolean;
  }>;
  categoriaOuProduto?: string | null;
  eyemobileProductId?: string | null;
}

/**
 * Computa o valor realizado agregado a partir de listas de transações e despesas.
 * Exclui transações canceladas e valida dados de custo para o cálculo de margem.
 */
export function computeRealizedValueFromRecords(input: MetricCalculationInput): number {
  const {
    indicador,
    sales = [],
    expenses = [],
    categoriaOuProduto,
    eyemobileProductId,
  } = input || ({} as MetricCalculationInput);

  const safeSales = Array.isArray(sales) ? sales : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const validSales = safeSales.filter((s) => s && !s.cancelado);

  switch (indicador) {
    case 'faturamento': {
      const total = validSales.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0);
      return Number(total.toFixed(2));
    }

    case 'pedidos': {
      return validSales.length;
    }

    case 'ticket_medio': {
      if (validSales.length === 0) return 0;
      const total = validSales.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0);
      return Number((total / validSales.length).toFixed(2));
    }

    case 'despesas': {
      const validExpenses = safeExpenses.filter((e) => e && !e.cancelado);
      const total = validExpenses.reduce((acc, e) => acc + (Number(e.valor) || 0), 0);
      return Number(total.toFixed(2));
    }

    case 'resultado_operacional': {
      const totalFaturamento = validSales.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0);
      const validExpenses = safeExpenses.filter((e) => e && !e.cancelado);
      const totalDespesas = validExpenses.reduce((acc, e) => acc + (Number(e.valor) || 0), 0);
      return Number((totalFaturamento - totalDespesas).toFixed(2));
    }

    case 'margem': {
      const totalFaturamento = validSales.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0);
      if (totalFaturamento <= 0) return 0;

      // Só calcula se houver custos conhecidos
      let custoTotal = 0;
      let temCustoConhecido = false;

      for (const s of validSales) {
        if (s.custo_total !== null && s.custo_total !== undefined) {
          custoTotal += Number(s.custo_total);
          temCustoConhecido = true;
        }
      }

      if (!temCustoConhecido) {
        return 0;
      }

      const lucroBruto = totalFaturamento - custoTotal;
      const margemPercent = (lucroBruto / totalFaturamento) * 100;
      return Number(margemPercent.toFixed(2));
    }

    case 'produto_categoria': {
      let filtered = validSales;
      if (eyemobileProductId) {
        filtered = filtered.filter((s) => s.eyemobile_product_id === eyemobileProductId);
      } else if (categoriaOuProduto) {
        const needle = categoriaOuProduto.toLowerCase().trim();
        filtered = filtered.filter((s) =>
          (s.categoria && s.categoria.toLowerCase().includes(needle)) ||
          (s.produto_nome && s.produto_nome.toLowerCase().includes(needle))
        );
      }
      const total = filtered.reduce((acc, s) => acc + (Number(s.valor_total) || 0), 0);
      return Number(total.toFixed(2));
    }

    case 'combos': {
      const comboSales = validSales.filter((s) => s.is_combo === true);
      const totalQty = comboSales.reduce((acc, s) => acc + (Number(s.quantidade) || 1), 0);
      return totalQty;
    }

    default:
      return 0;
  }
}
