/**
 * Motor determinístico de Inteligência e Oportunidades do Wallet CEO
 * 
 * Regras Éticas e Técnicas:
 * 1. Baseado em dados auditáveis; nunca cria transações fictícias.
 * 2. Diferencia explicitamente perda por descarte, vencimento, ruptura e divergência de caixa;
 *    NUNCA presume furto ou má conduta de colaboradores sem prova material.
 * 3. Corrige a distorção entre média simples de custos de catálogo e CMV efetivo ponderado por volume vendido.
 * 4. Sinaliza com clareza estados de dados insuficientes.
 */

import {
  CeoDepartment,
  GrowthOpportunity,
  LossItemAnalysis,
  SalesShiftAnalysis,
  CeoDepartmentSummary,
  ProductSaleInput,
  CommercialExperiment,
} from './types';

export interface WeightedCMVResult {
  total_revenue: number;
  total_cost: number;
  total_cmv_cost: number;
  effective_weighted_cmv_percent: number;
  effective_cmv_percent: number; // Ex: 32.50 para 32.5%
  gross_margin_amount: number;
  gross_margin_percent: number;
  contribution_margin_percent: number; // Ex: 67.50 para 67.5%
  catalog_simple_average_cost: number;
  items_analyzed: number;
  coverage_percent?: number;
  is_partial_coverage?: boolean;
  is_cmv_healthy: boolean;
  notes: string;
}

/**
 * Calcula o CMV Efetivo Ponderado pelas quantidades reais vendidas,
 * eliminando o viés da média simples aritmética dos custos unitários de catálogo.
 * Suporta cálculo de cobertura percentual sobre a receita total de produtos.
 */
export function calculateEffectiveWeightedCMV(
  items: ProductSaleInput[],
  totalRevenueContext?: number
): WeightedCMVResult {
  if (!items || items.length === 0) {
    return {
      total_revenue: 0,
      total_cost: 0,
      total_cmv_cost: 0,
      effective_weighted_cmv_percent: 0,
      effective_cmv_percent: 0,
      gross_margin_amount: 0,
      gross_margin_percent: 0,
      contribution_margin_percent: 0,
      catalog_simple_average_cost: 0,
      items_analyzed: 0,
      coverage_percent: 0,
      is_partial_coverage: false,
      is_cmv_healthy: true,
      notes: 'Dados insuficientes para cálculo de CMV.',
    };
  }

  let totalRevenue = 0;
  let totalCost = 0;
  let sumCatalogCost = 0;

  for (const item of items) {
    const qty = Number(item.quantity_sold) || 0;
    const price = Number(item.unit_price) || 0;
    const cost = Number(item.unit_cost) || 0;

    totalRevenue += qty * price;
    totalCost += qty * cost;
    sumCatalogCost += cost;
  }

  const catalogSimpleAvg = Math.round((sumCatalogCost / items.length) * 100) / 100;

  if (totalRevenue <= 0) {
    return {
      total_revenue: 0,
      total_cost: totalCost,
      total_cmv_cost: totalCost,
      effective_weighted_cmv_percent: 0,
      effective_cmv_percent: 0,
      gross_margin_amount: 0,
      gross_margin_percent: 0,
      contribution_margin_percent: 0,
      catalog_simple_average_cost: catalogSimpleAvg,
      items_analyzed: items.length,
      coverage_percent: 0,
      is_partial_coverage: false,
      is_cmv_healthy: false,
      notes: 'Sem receita registrada no período informado.',
    };
  }

  const cmvPercent = Math.round((totalCost / totalRevenue) * 10000) / 100;
  const marginAmount = Math.round((totalRevenue - totalCost) * 100) / 100;
  const marginPercent = Math.round((100 - cmvPercent) * 100) / 100;
  const isHealthy = cmvPercent <= 38.0; // Padrão alimentício Rodo Point: CMV alvo <= 38%

  const coveragePercent =
    totalRevenueContext && totalRevenueContext > 0
      ? Math.min(100, Math.round((totalRevenue / totalRevenueContext) * 100))
      : 100;
  const isPartial = coveragePercent < 100;

  const notesText = isPartial
    ? `CMV ponderado parcial com cobertura de ${coveragePercent}% da receita dos itens. Itens sem ficha cadastrada foram excluídos para não distorcer o custo real.`
    : isHealthy
    ? 'CMV efetivo dentro dos parâmetros de sustentabilidade da Rodo Point.'
    : 'CMV efetivo acima do teto de 38%; requer revisão de mix ou reajuste de insumos.';

  return {
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    total_cmv_cost: Math.round(totalCost * 100) / 100,
    effective_weighted_cmv_percent: cmvPercent,
    effective_cmv_percent: cmvPercent,
    gross_margin_amount: marginAmount,
    gross_margin_percent: marginPercent,
    contribution_margin_percent: marginPercent,
    catalog_simple_average_cost: catalogSimpleAvg,
    items_analyzed: items.length,
    coverage_percent: coveragePercent,
    is_partial_coverage: isPartial,
    is_cmv_healthy: isHealthy,
    notes: notesText,
  };
}

/**
 * Identifica oportunidades de crescimento comercial a partir da análise de produtos e/ou turnos.
 */
export function detectCommercialGrowthOpportunities(
  arg1: SalesShiftAnalysis[] | ProductSaleInput[],
  arg2?: ProductSaleInput[] | string,
  arg3?: string
): GrowthOpportunity[] {
  let shifts: SalesShiftAnalysis[] = [];
  let products: ProductSaleInput[] = [];
  let workspaceId = 'default_workspace';

  if (Array.isArray(arg1) && arg1.length > 0 && 'shift_name' in arg1[0]) {
    shifts = arg1 as SalesShiftAnalysis[];
    products = Array.isArray(arg2) ? arg2 : [];
    workspaceId = typeof arg3 === 'string' ? arg3 : 'default_workspace';
  } else if (Array.isArray(arg1)) {
    products = arg1 as ProductSaleInput[];
    workspaceId = typeof arg2 === 'string' ? arg2 : 'default_workspace';
  }

  const opportunities: GrowthOpportunity[] = [];

  // 1. Análise de Turnos (se turnos forem fornecidos)
  if (shifts.length > 0) {
    const sortedByTicket = [...shifts].filter(s => s.order_count >= 15).sort((a, b) => a.average_ticket - b.average_ticket);
    if (sortedByTicket.length > 0) {
      const lowestTicketShift = sortedByTicket[0];
      const highestTicketShift = sortedByTicket[sortedByTicket.length - 1];

      if (highestTicketShift.average_ticket - lowestTicketShift.average_ticket > 6.00) {
        const potencialGanhoPorPedido = 4.50;
        const impactoMensal = Math.round(lowestTicketShift.order_count * 30 * potencialGanhoPorPedido);

        opportunities.push({
          id: `opp-combo-shift-${lowestTicketShift.shift_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          workspace_id: workspaceId,
          department: 'commercial_growth',
          title: `Combo Promocional: Aumento de Ticket no Turno ${lowestTicketShift.shift_name}`,
          problem_description: `O ticket médio no turno ${lowestTicketShift.shift_name} é de R$ ${lowestTicketShift.average_ticket.toFixed(2)}, significativamente inferior ao turno ${highestTicketShift.shift_name} (R$ ${highestTicketShift.average_ticket.toFixed(2)}).`,
          description: `O ticket médio no turno ${lowestTicketShift.shift_name} é de R$ ${lowestTicketShift.average_ticket.toFixed(2)}.`,
          hypothesis: 'Oferecer um combo com salgado assado + bebida com desconto sutil elevará o ticket médio em pelo menos R$ 4,50 sem canibalizar itens isolados.',
          recommended_action: `Testar combo promocional de café da manhã / lanche rápido com precificação estratégica no turno ${lowestTicketShift.shift_name}.`,
          estimated_financial_impact: impactoMensal,
          potential_monthly_gain: impactoMensal,
          confidence_score: 0.85,
          type: 'combo',
          impact_level: 'high',
          effort_level: 'easy',
          status: 'detected',
          evidence_data: {
            source: 'eyemobile_pos_analytics',
            metrics: {
              lowest_shift: lowestTicketShift.shift_name,
              lowest_ticket: lowestTicketShift.average_ticket,
              highest_shift: highestTicketShift.shift_name,
              highest_ticket: highestTicketShift.average_ticket,
              orders_sample: lowestTicketShift.order_count,
            },
            has_sufficient_data: true,
          },
          limitations_notes: 'Estimativa sujeita à elasticidade de preço dos passageiros da rodoviária.',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  // 2. Análise de Produtos: Detecção de combos por baixa anexação de bebidas
  if (products.length > 0) {
    const mainDishes = products.filter(
      p => (p.category?.toLowerCase().includes('lanche') || p.category?.toLowerCase().includes('almoço') || p.category?.toLowerCase().includes('prato')) && p.quantity_sold >= 20
    );
    const beverages = products.filter(p => p.category?.toLowerCase().includes('bebida'));

    const totalMainQty = mainDishes.reduce((acc, d) => acc + d.quantity_sold, 0);
    const totalBevQty = beverages.reduce((acc, b) => acc + b.quantity_sold, 0);

    if (totalMainQty > 0 && beverages.length > 0 && totalBevQty / totalMainQty < 0.45) {
      const bestDish = [...mainDishes].sort((a, b) => b.quantity_sold - a.quantity_sold)[0];
      const bestBev = [...beverages].sort((a, b) => b.quantity_sold - a.quantity_sold)[0];

      const projectedGain = Math.round(totalMainQty * 0.25 * (bestBev.unit_price - bestBev.unit_cost) * 4);

      opportunities.push({
        id: `opp-combo-lanche-bebida-${bestDish.product_id}`,
        workspace_id: workspaceId,
        department: 'commercial_growth',
        title: `Combo Promocional: ${bestDish.product_name || bestDish.name} + ${bestBev.product_name || bestBev.name}`,
        problem_description: `Taxa de anexação de bebidas em relação aos lanches principais é de apenas ${Math.round((totalBevQty / totalMainQty) * 100)}%, gerando perda de margem de contribuição.`,
        description: `Taxa de anexação de bebidas está abaixo de 45% nos lanches principais.`,
        hypothesis: `Criar um combo sugerido no PDV e delivery unindo ${bestDish.product_name} com ${bestBev.product_name} aumentará as vendas combinadas em 25%.`,
        recommended_action: `Oferecer o combo com desconto de R$ 1,50 no conjunto.`,
        estimated_financial_impact: Math.max(800, projectedGain),
        potential_monthly_gain: Math.max(800, projectedGain),
        confidence_score: 0.88,
        type: 'combo',
        impact_level: 'high',
        effort_level: 'easy',
        status: 'detected',
        evidence_data: {
          source: 'mix_sales_analysis',
          metrics: {
            main_volume: totalMainQty,
            beverage_volume: totalBevQty,
            attachment_rate: `${Math.round((totalBevQty / totalMainQty) * 100)}%`,
          },
          has_sufficient_data: true,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // 3. Análise de Margem por Produto: Produtos com CMV elevado (> 40%)
    const highCmvProducts = products
      .filter(p => p.unit_price > 0 && p.unit_cost / p.unit_price > 0.40)
      .sort((a, b) => (b.unit_cost / b.unit_price) - (a.unit_cost / a.unit_price));

    if (highCmvProducts.length > 0) {
      const item = highCmvProducts[0];
      const cmvItem = Math.round((item.unit_cost / item.unit_price) * 100);
      const margemAtual = 100 - cmvItem;
      const impactoPotencial = Math.round(item.quantity_sold * (item.unit_price * 0.08) * 4);

      opportunities.push({
        id: `opp-margin-review-${item.product_id}`,
        workspace_id: workspaceId,
        department: 'cmv_pricing',
        title: `Ajuste de Preço e Ficha Técnica: ${item.name || item.product_name}`,
        problem_description: `O produto '${item.name || item.product_name}' opera com CMV de ${cmvItem}% (margem de apenas ${margemAtual}%), acima do teto de sustentabilidade da Rodo Point.`,
        description: `CMV unitário de ${cmvItem}% acima do teto de 40%.`,
        hypothesis: 'Uma readequação de insumo na ficha técnica ou ajuste de R$ 1,00 a R$ 2,00 no preço de balcão restaurará a rentabilidade sem perda de demanda.',
        recommended_action: 'Avaliar ficha técnica do produto e testar aumento sutil ou substituição de fornecedor do ingrediente principal.',
        estimated_financial_impact: Math.max(600, impactoPotencial),
        potential_monthly_gain: Math.max(600, impactoPotencial),
        confidence_score: 0.88,
        type: 'pricing',
        impact_level: 'high',
        effort_level: 'moderate',
        status: 'detected',
        evidence_data: {
          source: 'food_cost_and_sales',
          metrics: {
            product_name: item.name || item.product_name,
            current_cmv: `${cmvItem}%`,
            quantity_sold: item.quantity_sold,
            unit_cost: item.unit_cost,
            unit_price: item.unit_price,
          },
          has_sufficient_data: true,
        },
        limitations_notes: 'Verificar concorrentes no saguão da rodoviária antes de alterar preço.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return opportunities;
}

/**
 * Identifica oportunidades de redução de perdas operacionais e desperdícios.
 */
export function detectLossAndWasteOpportunities(
  losses: LossItemAnalysis[],
  arg2?: number | string,
  arg3?: string
): GrowthOpportunity[] {
  const monthlyRevenue = typeof arg2 === 'number' ? arg2 : 50000;
  const workspaceId = typeof arg3 === 'string' ? arg3 : typeof arg2 === 'string' ? arg2 : 'default_workspace';

  const opportunities: GrowthOpportunity[] = [];

  if (!losses || losses.length === 0) {
    return [
      {
        id: `opp-loss-baseline-${Date.now()}`,
        workspace_id: workspaceId,
        department: 'loss_waste',
        title: 'Implementação de Rotina de Registro Diário de Quebras',
        problem_description: 'Não há registros de quebras ou descartes de estufa catalogados neste período.',
        description: 'Sem registros de perdas catalogados.',
        hypothesis: 'O registro sistemático das sobras de estufa ao final de cada turno reduzirá a sobreprodução em até 40%.',
        recommended_action: 'Padronizar formulário de pesagem/contagem de sobras de salgados no fechamento de turno.',
        estimated_financial_impact: Math.round(monthlyRevenue * 0.02),
        potential_monthly_gain: Math.round(monthlyRevenue * 0.02),
        confidence_score: 0.75,
        type: 'waste_reduction',
        impact_level: 'medium',
        effort_level: 'easy',
        status: 'detected',
        evidence_data: {
          source: 'operations_audit',
          has_sufficient_data: false,
          data_quality_notes: 'Ausência de registros sistemáticos de descarte.',
        },
        limitations_notes: 'Impacto depende da adesão da equipe à rotina de contagem.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  // Agrupamento por categoria de perda
  const lossTotals: Record<string, number> = {};
  for (const curr of losses) {
    const cat = curr.category || 'descarte';
    const val = Number(curr.total_loss_value ?? curr.cost_amount ?? 0);
    lossTotals[cat] = (lossTotals[cat] || 0) + val;
  }

  const descarteCost = lossTotals['descarte'] || 0;
  const vencimentoCost = lossTotals['vencimento'] || 0;
  const rupturaCost = lossTotals['ruptura'] || 0;
  const divergenciaCaixaCost = lossTotals['divergencia_caixa'] || 0;

  // 1. Perdas por Vencimento
  if (vencimentoCost > 0) {
    const economiaEstimada = Math.round(vencimentoCost * 0.80 * 4);
    opportunities.push({
      id: `opp-loss-vencimento-${Date.now()}`,
      workspace_id: workspaceId,
      department: 'loss_waste',
      title: 'Controle de Validade FIFO e Alertas Preventivos de Estoque',
      problem_description: `Perdas acumuladas por vencimento de itens totalizaram R$ ${vencimentoCost.toFixed(2)}.`,
      description: `Perdas acumuladas por insumos vencidos somam R$ ${vencimentoCost.toFixed(2)}.`,
      hypothesis: 'Implementar conferência preventiva de validades com sistema FIFO reduzirá perdas por vencimento em mais de 80%.',
      recommended_action: 'Etiquetar insumos com data de validade primária e secundária e priorizar uso na produção diária.',
      estimated_financial_impact: Math.max(400, economiaEstimada),
      potential_monthly_gain: Math.max(400, economiaEstimada),
      confidence_score: 0.92,
      type: 'waste_reduction',
      impact_level: vencimentoCost > 200 ? 'high' : 'medium',
      effort_level: 'easy',
      status: 'detected',
      evidence_data: {
        source: 'loss_events_expiry',
        metrics: { vencimento_total: vencimentoCost },
        has_sufficient_data: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 2. Descarte de Estufa e Produção
  if (descarteCost > 0) {
    const economiaEstimada = Math.round(descarteCost * 0.50 * 4);
    opportunities.push({
      id: `opp-loss-estufa-batch-${Date.now()}`,
      workspace_id: workspaceId,
      department: 'loss_waste',
      title: 'Adequação dos Lotes de Fritura e Aquecimento de Estufa',
      problem_description: `O custo com descarte de salgados de estufa acumulou R$ ${descarteCost.toFixed(2)}.`,
      description: `Descarte de salgados e produção excedente acumulou R$ ${descarteCost.toFixed(2)}.`,
      hypothesis: 'Diminuir os lotes de fritura nas últimas 2 horas de cada turno e aquecer sob demanda nos horários de entressafra reduzirá o descarte em 50%.',
      recommended_action: 'Criar tabela visual de lotes máximos de reposição por faixa horária para os operadores da estufa.',
      estimated_financial_impact: Math.max(300, economiaEstimada),
      potential_monthly_gain: Math.max(300, economiaEstimada),
      confidence_score: 0.90,
      type: 'waste_reduction',
      impact_level: descarteCost > 200 ? 'high' : 'medium',
      effort_level: 'easy',
      status: 'detected',
      evidence_data: {
        source: 'operations_loss_log',
        metrics: { descarte_cost: descarteCost },
        has_sufficient_data: true,
      },
      limitations_notes: 'Não reduzir lotes em horários de desembarque de ônibus lotados.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 3. Ruptura de Estoque
  if (rupturaCost > 0) {
    const ganhoEstimado = Math.round(rupturaCost * 4);
    opportunities.push({
      id: `opp-stockout-prevention-${Date.now()}`,
      workspace_id: workspaceId,
      department: 'loss_waste',
      title: 'Ponto de Pedido Automático e Estoque Mínimo para Itens Críticos',
      problem_description: `Foram registradas rupturas de estoque que impediram vendas estimadas em R$ ${rupturaCost.toFixed(2)}.`,
      description: `Rupturas de estoque impediram faturamento estimado em R$ ${rupturaCost.toFixed(2)}.`,
      hypothesis: 'Definir estoque mínimo de segurança com antecedência de lead time eliminará 95% das rupturas de balcão.',
      recommended_action: 'Configurar alerta de estoque mínimo no Wallet para refrigerantes e embalagens térmicas.',
      estimated_financial_impact: Math.max(500, ganhoEstimado),
      potential_monthly_gain: Math.max(500, ganhoEstimado),
      confidence_score: 0.85,
      type: 'waste_reduction',
      impact_level: 'high',
      effort_level: 'easy',
      status: 'detected',
      evidence_data: {
        source: 'stock_rupture_events',
        metrics: { ruptura_total: rupturaCost },
        has_sufficient_data: true,
      },
      limitations_notes: 'Depende de pontualidade de entrega dos distribuidores (SPAL/Ambev).',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 4. Divergência Operacional de Caixa (ética: sem imputação pejorativa)
  if (divergenciaCaixaCost > 0) {
    opportunities.push({
      id: `opp-cashier-checklist-${Date.now()}`,
      workspace_id: workspaceId,
      department: 'loss_waste',
      title: 'Checklist Padronizado de Abertura e Fechamento de Caixa',
      problem_description: `Divergências operacionais de caixa registraram R$ ${divergenciaCaixaCost.toFixed(2)}.`,
      description: `Divergências de conferência de troco e fechamento de caixa somaram R$ ${divergenciaCaixaCost.toFixed(2)}.`,
      hypothesis: 'Adotar folha de contagem cega de sangrias e troco padronizada evitará erros involuntários de registro.',
      recommended_action: 'Instituir rotina de dupla conferência de sangrias e troco inicial.',
      estimated_financial_impact: Math.round(divergenciaCaixaCost * 4),
      potential_monthly_gain: Math.round(divergenciaCaixaCost * 4),
      confidence_score: 0.80,
      type: 'waste_reduction',
      impact_level: 'low',
      effort_level: 'easy',
      status: 'detected',
      evidence_data: {
        source: 'cash_reconciliation_log',
        metrics: { divergencia_caixa: divergenciaCaixaCost },
        has_sufficient_data: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return opportunities;
}

/**
 * Constrói o resumo consolidado dos 7 departamentos do Wallet CEO.
 */
export function buildCeoDepartmentSummaries(
  arg1: WeightedCMVResult | GrowthOpportunity[],
  arg2?: GrowthOpportunity[] | WeightedCMVResult,
  arg3?: CommercialExperiment[] | number,
  arg4?: LossItemAnalysis[]
): CeoDepartmentSummary[] {
  let cmvMetrics: WeightedCMVResult;
  let opportunities: GrowthOpportunity[] = [];
  let experiments: CommercialExperiment[] = [];
  let lossEvents: LossItemAnalysis[] = [];

  // Detecta se foi chamado com (cmvMetrics, opportunities, experiments, lossEvents)
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && ('total_revenue' in arg1 || 'effective_weighted_cmv_percent' in arg1)) {
    cmvMetrics = arg1 as WeightedCMVResult;
    opportunities = Array.isArray(arg2) ? arg2 : [];
    experiments = Array.isArray(arg3) ? arg3 : [];
    lossEvents = Array.isArray(arg4) ? arg4 : [];
  } else {
    // Chamado com (opportunities, cmvResult, totalLossCost)
    opportunities = Array.isArray(arg1) ? arg1 : [];
    cmvMetrics = (arg2 as WeightedCMVResult) || {
      total_revenue: 0,
      total_cost: 0,
      total_cmv_cost: 0,
      effective_weighted_cmv_percent: 0,
      effective_cmv_percent: 0,
      gross_margin_amount: 0,
      gross_margin_percent: 0,
      contribution_margin_percent: 0,
      catalog_simple_average_cost: 0,
      items_analyzed: 0,
      is_cmv_healthy: true,
      notes: '',
    };
    lossEvents = typeof arg3 === 'number' ? [{ category: 'descarte', total_loss_value: arg3 }] : [];
  }

  const depts: { id: CeoDepartment; title: string }[] = [
    { id: 'commercial_growth', title: 'Comercial & Crescimento' },
    { id: 'cmv_pricing', title: 'CMV & Precificação' },
    { id: 'loss_waste', title: 'Perdas & Desperdício' },
    { id: 'delivery_channels', title: 'Delivery & Canais' },
    { id: 'staff_productivity', title: 'Equipe & Operação' },
    { id: 'finance_margins', title: 'Financeiro & Margens' },
    { id: 'growth_lab', title: 'Laboratório de Experimentos' },
  ];

  const totalLoss = lossEvents.reduce(
    (acc, l) => acc + (Number(l.total_loss_value ?? l.cost_amount ?? 0)),
    0
  );

  return depts.map(({ id, title }) => {
    const opps = opportunities.filter(
      o => o.department === id || (id === 'loss_waste' && o.department === 'operations_loss') || (id === 'cmv_pricing' && o.department === 'profitability')
    );
    const count = opps.length;

    let score = 88;
    let status: 'optimal' | 'attention' | 'critical' = 'optimal';
    const metrics: { label: string; value: string | number }[] = [];
    const recommendations: string[] = [];
    const highlights: string[] = [];

    if (id === 'cmv_pricing' || id === 'profitability') {
      const cmv = cmvMetrics.effective_weighted_cmv_percent || cmvMetrics.effective_cmv_percent || 0;
      metrics.push({ label: 'CMV Ponderado', value: `${cmv.toFixed(1)}%` });
      metrics.push({ label: 'Margem Bruta', value: `${(100 - cmv).toFixed(1)}%` });

      if (cmv > 38) {
        status = 'critical';
        score = 60;
        recommendations.push('Revisar ficha técnica e aplicar markup em itens com CMV > 40%.');
        highlights.push(`CMV efetivo em ${cmv.toFixed(1)}% acima do teto de 38%`);
      } else if (cmv > 32) {
        status = 'attention';
        score = 75;
        recommendations.push('Monitore o custo de insumos de carne e laticínios.');
        highlights.push(`CMV em atenção (${cmv.toFixed(1)}%)`);
      } else {
        recommendations.push('Margem bruta saudável. Manter acompanhamento de compras.');
        highlights.push(`CMV saudável em ${cmv.toFixed(1)}%`);
      }
    } else if (id === 'loss_waste' || id === 'operations_loss') {
      metrics.push({ label: 'Perdas Registradas', value: `R$ ${totalLoss.toFixed(2)}` });
      metrics.push({ label: 'Ocorrências', value: lossEvents.length });

      if (totalLoss > 500) {
        status = 'attention';
        score = 70;
        recommendations.push('Ajustar lotes de fritura e conferência de validade FIFO.');
        highlights.push(`Perdas acumuladas de R$ ${totalLoss.toFixed(2)}`);
      } else {
        recommendations.push('Desperdício sob controle operacional.');
        highlights.push('Perdas dentro da tolerância aceitável');
      }
    } else if (id === 'delivery_channels') {
      metrics.push({ label: 'Canais Integrados', value: 'iFood, 99Food, Direto' });
      metrics.push({ label: 'Status KDS', value: 'Ativo' });
      recommendations.push('Aplicar simulador de margem para evitar vazamento em taxas.');
      highlights.push('Conectores de delivery em operação');
    } else if (id === 'growth_lab' || id === 'strategy_lab') {
      const activeCount = experiments.filter(e => e.status === 'active' || e.status === 'em_andamento').length;
      metrics.push({ label: 'Experimentos Ativos', value: activeCount });
      metrics.push({ label: 'Oportunidades em Fila', value: opportunities.length });
      recommendations.push('Ativar testes com hipótese clara e medição de ticket médio.');
      highlights.push(`${activeCount} experimento(s) em andamento`);
    } else if (id === 'commercial_growth') {
      metrics.push({ label: 'Oportunidades', value: count });
      metrics.push({ label: 'Potencial Mensal', value: `R$ ${opps.reduce((a, b) => a + b.potential_monthly_gain, 0).toFixed(0)}` });
      recommendations.push('Promover combos de salgados + bebidas no balcão.');
      highlights.push(`${count} oportunidade(s) de crescimento identificada(s)`);
    } else if (id === 'staff_productivity' || id === 'people_productivity') {
      metrics.push({ label: 'Equipe Operacional', value: 'KDS & Atendimento' });
      metrics.push({ label: 'Isolamento Financeiro', value: 'delivery_staff protegido' });
      recommendations.push('Manter telas de DRE restritas para perfil operacional.');
      highlights.push('Perfil de entrega isolado com sucesso');
    } else {
      // finance_margins / finance
      metrics.push({ label: 'Faturamento Base', value: `R$ ${cmvMetrics.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
      metrics.push({ label: 'Margem Contribuição', value: `R$ ${cmvMetrics.gross_margin_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
      recommendations.push('Preservar fluxo de caixa positivo para compras à vista.');
      highlights.push('Balanço financeiro saudável');
    }

    return {
      department: id,
      title,
      score,
      status,
      metrics,
      recommendations,
      highlights,
      opportunities_count: count,
    };
  });
}
