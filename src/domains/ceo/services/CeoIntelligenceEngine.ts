/**
 * CeoIntelligenceEngine.ts
 *
 * Motor de Inteligência Executiva e Análise Comercial do Wallet CEO 2.0 / 2.1.
 *
 * Princípios norteadores:
 * 1. Base quantitativa estrita: toda afirmação executiva possui fonte, período e critério de cálculo.
 * 2. Recomendações fundamentadas para a operação da Rodo Point:
 *    - Combos de café e salgados
 *    - Venda adicional de bebidas
 *    - Horários de ociosidade / menor movimento
 *    - Estoque crítico com risco de ruptura
 *    - CMV e ausência de fichas técnicas
 *    - Variações anômalas de despesas
 * 3. Plano de Ação Estruturado com Gateway de Autorização:
 *    - Nenhuma ação executada automaticamente sem aprovação expressa do gestor
 * 4. Ciclo de Vida Determinístico de Experimentos Comerciais:
 *    - Hipótese -> Métrica -> Período -> Baseline -> Acompanhamento -> Resultado Observado
 */

import { CeoExecutiveKpis, TopProdutoFaturamento } from "./CeoFinancialMetricsService";
import { FinancialConsolidationReport } from "@/domains/finance/services/FinancialConsolidationService";
import { CeoPeriodRange } from "../utils/ceoDateRanges";
import { GrowthOpportunity, CommercialExperiment } from "../types";

export interface BriefingSection {
  titulo: string;
  destaque: string;
  conteudo: string;
  fonte: string;
  periodo: string;
  criterioCalculo: string;
  status: "positivo" | "atencao" | "critico" | "neutro";
}

export interface ExecutiveBriefing {
  dataGeracao: string;
  periodoRotulo: string;
  resumoGeral: string;
  secoes: BriefingSection[];
  alertasQualidadeDados: string[];
  oportunidadesPrioritarias: string[];
  pendenciasFinanceiras: string[];
}

export interface RodoPointOpportunityInput {
  kpis: CeoExecutiveKpis;
  topProducts?: TopProdutoFaturamento[];
  salesByHour?: Array<{ hour: string; frontCashier: number; otherOrigins: number }>;
  criticalStock?: Array<{ id: string; product: string; stock: number; minStock: number; depot?: string }>;
  consolidationReport?: FinancialConsolidationReport;
}

export interface StructuredActionProposal {
  id: string;
  oportunidadeId: string;
  titulo: string;
  objetivo: string;
  evidencia: string;
  justificativa: string;
  prioridade: "alta" | "media" | "baixa";
  responsavel: string;
  prazoSugerido: string;
  indicadorSucesso: string;
  riscoEstimado: "baixo" | "medio" | "alto";
  mitigacaoRisco: string;
  statusAprovacao: "aguardando_aprovacao" | "aprovada" | "rejeitada" | "em_execucao";
  resultadoObservado?: string;
  requerAprovacaoProprietario: boolean;
}

export class CeoIntelligenceEngine {
  /**
   * 4.1 — Geração de Briefing Executivo com rastreabilidade total (fonte, período e critério)
   */
  public static generateExecutiveBriefing(params: {
    kpis: CeoExecutiveKpis;
    range: CeoPeriodRange;
    topProducts?: TopProdutoFaturamento[];
    consolidationReport?: FinancialConsolidationReport;
    criticalStockCount?: number;
  }): ExecutiveBriefing {
    const { kpis, range, topProducts = [], consolidationReport, criticalStockCount = 0 } = params;

    const secoes: BriefingSection[] = [];
    const alertasQualidadeDados: string[] = [];
    const oportunidadesPrioritarias: string[] = [];
    const pendenciasFinanceiras: string[] = [];

    // 1. Desempenho de Faturamento e Vendas
    const faturamentoStr = `R$ ${kpis.faturamentoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const crescimentoStr =
      kpis.crescimentoMesPercent != null
        ? `${kpis.crescimentoMesPercent >= 0 ? "+" : ""}${kpis.crescimentoMesPercent}%`
        : "Sem histórico comparativo equivalente";

    secoes.push({
      titulo: "Faturamento e Receita",
      destaque: faturamentoStr,
      conteudo: `Faturamento bruto acumulado no período de ${range.rotulo}. Variação vs. período anterior equivalente: ${crescimentoStr}.`,
      fonte: "Eyemobile PDV / Transações de Receita",
      periodo: `${range.inicioStr} a ${range.fimStr}`,
      criterioCalculo: "Soma das vendas brutas concluídas e recebidas",
      status: (kpis.crescimentoMesPercent ?? 0) >= 0 ? "positivo" : "atencao",
    });

    // 2. Comportamento Ontem vs Média do Dia da Semana
    if (kpis.faturamentoOntem > 0) {
      const ontemStr = `R$ ${kpis.faturamentoOntem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      const variacaoOntem =
        kpis.variacaoOntemVsMediaPercent != null
          ? `${kpis.variacaoOntemVsMediaPercent >= 0 ? "+" : ""}${kpis.variacaoOntemVsMediaPercent}%`
          : "N/A";

      secoes.push({
        titulo: "Ontem vs. Padrão Histórico",
        destaque: ontemStr,
        conteudo: `Vendas de ontem (${kpis.diaSemanaOntemNome}): ${ontemStr}. Comparado com a média das últimas 4 semanas no mesmo dia da semana: ${variacaoOntem}.`,
        fonte: "Série Diária do PDV",
        periodo: "Último dia civil completo (00:00 às 23:59)",
        criterioCalculo: "Média aritmética das últimas 4 semanas do mesmo dia da semana em America/Sao_Paulo",
        status: (kpis.variacaoOntemVsMediaPercent ?? 0) >= 0 ? "positivo" : "atencao",
      });
    }

    // 3. Ticket Médio e Volume
    if (kpis.ticketMedioMes !== null) {
      secoes.push({
        titulo: "Ticket Médio",
        destaque: `R$ ${kpis.ticketMedioMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        conteudo: `Total de ${kpis.pedidosMes.toLocaleString("pt-BR")} pedidos processados, resultando em ticket médio por venda de R$ ${kpis.ticketMedioMes.toFixed(2)}.`,
        fonte: "Eyemobile Transações",
        periodo: `${range.inicioStr} a ${range.fimStr}`,
        criterioCalculo: "Faturamento total dividido pelo total de pedidos concluídos",
        status: "neutro",
      });
    }

    // 4. Produtos de Maior Giro
    if (topProducts.length > 0) {
      const top1 = topProducts[0];
      secoes.push({
        titulo: "Produto Carro-Chefe",
        destaque: `${top1.produto} (${top1.percentualFaturamento.toFixed(1)}% do faturamento)`,
        conteudo: `O item mais vendido movimentou ${top1.quantidade.toLocaleString("pt-BR")} unidades, gerando R$ ${top1.faturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        fonte: "Eyemobile Itens de Venda",
        periodo: `${range.inicioStr} a ${range.fimStr}`,
        criterioCalculo: "Soma das quantidades e faturamento por produto",
        status: "positivo",
      });
      oportunidadesPrioritarias.push(
        `Maximizar combos ancorados no item líder (${top1.produto}) para elevar itens por pedido.`
      );
    }

    // 5. Despesas e Resultado Operacional
    if (kpis.despesasMes > 0) {
      const despStr = `R$ ${kpis.despesasMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      const resStr = `R$ ${kpis.resultadoOperacional.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      secoes.push({
        titulo: "Despesas e Margem Operacional",
        destaque: resStr,
        conteudo: `Despesas consolidadas: ${despStr}. Resultado operacional real: ${resStr} (${kpis.margemOperacionalPercent != null ? `${kpis.margemOperacionalPercent}% de margem` : "sem margem apurada"}).`,
        fonte: "Módulo Financeiro / FinancialConsolidationService",
        periodo: `${range.inicioStr} a ${range.fimStr}`,
        criterioCalculo: "Receita bruta menos despesas consolidadas no regime de competência (sem contagem dupla)",
        status: kpis.resultadoOperacional >= 0 ? "positivo" : "critico",
      });
    } else {
      alertasQualidadeDados.push(
        "Módulo de despesas não preenchido ou sem lançamentos no período. O resultado operacional está temporariamente não apurado."
      );
    }

    // 6. Alertas de Dados e Auditoria Financeira
    if (consolidationReport) {
      if (consolidationReport.duplicidadesConfirmadas > 0) {
        alertasQualidadeDados.push(
          `Prevenção ativa de duplicidade: ${consolidationReport.duplicidadesConfirmadas} lançamentos duplicados identificados e eliminados (R$ ${consolidationReport.duplicidadesEvitadasValor.toFixed(2)} preservados do cômputo dobrado).`
        );
      }
      if (consolidationReport.registrosPendentes > 0) {
        pendenciasFinanceiras.push(
          `${consolidationReport.registrosPendentes} lançamentos com valor e data coincidentes aguardam conciliação definitiva sem interferência no caixa.`
        );
      }
    }

    // 7. CMV e Fichas Técnicas
    if (kpis.cmvStatus === "dados_insuficientes") {
      alertasQualidadeDados.push(
        "Ausência de fichas técnicas cadastradas. O custo real de mercadorias (CMV) não pôde ser aferido."
      );
      oportunidadesPrioritarias.push(
        "Cadastrar fichas técnicas dos 5 produtos de maior giro para viabilizar controle de margem de contribuição."
      );
    }

    // 8. Estoque crítico
    if (criticalStockCount > 0) {
      alertasQualidadeDados.push(
        `Alerta de estoque: ${criticalStockCount} ${criticalStockCount === 1 ? "produto está" : "produtos estão"} abaixo do estoque mínimo de segurança.`
      );
    }

    const resumoGeral = `Briefing Executivo para ${range.rotulo}: Faturamento de ${faturamentoStr} (${crescimentoStr} vs período equivalente). ${
      kpis.despesasMes > 0
        ? `Resultado operacional de R$ ${kpis.resultadoOperacional.toFixed(2)}.`
        : "Aguardando consolidação de custos operacionais."
    } ${
      alertasQualidadeDados.length > 0 ? `${alertasQualidadeDados.length} alertas de dados monitorados.` : ""
    }`;

    return {
      dataGeracao: new Date().toISOString(),
      periodoRotulo: range.rotulo,
      resumoGeral,
      secoes,
      alertasQualidadeDados,
      oportunidadesPrioritarias,
      pendenciasFinanceiras,
    };
  }

  /**
   * 4.2 — Motor de Oportunidades Fundamentadas para a Rodo Point
   */
  public static detectRodoPointOpportunities(
    workspaceId: string,
    inputs: RodoPointOpportunityInput
  ): GrowthOpportunity[] {
    const opps: GrowthOpportunity[] = [];
    const { kpis, topProducts = [], salesByHour = [], criticalStock = [], consolidationReport } = inputs;

    // 1. Combo Café da Manhã & Salgados
    const cafeProd = topProducts.find(
      (p) => p.produto.toLowerCase().includes("café") || p.produto.toLowerCase().includes("cafe")
    );
    const salgadoProd = topProducts.find(
      (p) =>
        p.produto.toLowerCase().includes("salgado") ||
        p.produto.toLowerCase().includes("pão de queijo") ||
        p.produto.toLowerCase().includes("pao de queijo") ||
        p.produto.toLowerCase().includes("coxinha")
    );

    if (cafeProd && salgadoProd) {
      opps.push({
        id: "opp-combo-cafe-salgado",
        workspace_id: workspaceId,
        department: "comercial",
        title: "Combo Expresso & Salgado Rodo Point",
        problem_description: `Venda não casada de ${cafeProd.produto} (R$ ${cafeProd.faturamento.toFixed(2)}) e ${salgadoProd.produto} (R$ ${salgadoProd.faturamento.toFixed(2)}).`,
        description: `Testar oferta casada (${cafeProd.produto} + ${salgadoProd.produto}) para elevar o ticket médio no turno matinal.`,
        hypothesis:
          "Oferecer combo café + salgado na tela do PDV ou no balcão pode incentivar compra casada entre clientes que consomem apenas um dos itens.",
        recommended_action:
          "Cadastrar produto combo experimental no Eyemobile PDV com preço integrado e orientar equipe para oferta ativa.",
        estimated_financial_impact: null,
        potential_monthly_gain: null,
        confidence_score: 0.70,
        status: "identificada",
        nature: "hipotese_comercial",
        simulation_premises:
          "Hipótese de conversão cruzada entre itens líderes matinais observados no PDV. Ganho líquido real depende da adesão e fichas técnicas.",
        calculation_limitations:
          "Sem fichas técnicas cadastradas, o ganho financeiro líquido não é projetado para evitar valores arbitrários.",
        formula_or_criteria: `Volumes observados no período: ${cafeProd.quantidade} un de ${cafeProd.produto} e ${salgadoProd.quantidade} un de ${salgadoProd.produto}.`,
        evidence_data: {
          source: "eyemobile_items",
          has_sufficient_data: true,
          cafe_sales: cafeProd.faturamento,
          salgado_sales: salgadoProd.faturamento,
          cafe_quantity: cafeProd.quantidade,
          salgado_quantity: salgadoProd.quantidade,
        },
      });
    }

    // 2. Venda Adicional de Bebidas no Almoço
    const totalRev = kpis.faturamentoMes;
    if (totalRev > 0) {
      const beverageSales = topProducts.filter((p) => {
        const name = p.produto.toLowerCase();
        return (
          name.includes("refrigerante") ||
          name.includes("coca") ||
          name.includes("suco") ||
          name.includes("água") ||
          name.includes("agua")
        );
      });
      const bevTotal = beverageSales.reduce((acc, p) => acc + p.faturamento, 0);
      const bevRatio = bevTotal / totalRev;

      if (bevRatio < 0.25) {
        opps.push({
          id: "opp-bebidas-lunch",
          workspace_id: workspaceId,
          department: "comercial",
          title: "Potencialização de Bebidas Geladas no Almoço",
          problem_description: `Bebidas representam ${(bevRatio * 100).toFixed(1)}% do faturamento de vendas no período (R$ ${bevTotal.toFixed(2)} de R$ ${totalRev.toFixed(2)}).`,
          description: "Posicionar refrigeradores visíveis próximos ao balcão e oferecer sugestivamente bebida no momento do pedido.",
          hypothesis: "Oferecer sugestivamente opção de bebida bem gelada durante o atendimento eleva a proporção de pedidos com itens agregados.",
          recommended_action: "Incentivar venda sugestiva de refrigerantes, sucos e água no caixa e certificar posicionamento dos expositores.",
          estimated_financial_impact: null,
          potential_monthly_gain: null,
          confidence_score: 0.65,
          status: "identificada",
          nature: "hipotese_comercial",
          simulation_premises: "Venda sugestiva por impulso em momentos de refeição.",
          calculation_limitations: "Impacto financeiro condicionado à elasticidade de demanda e margem unitária por tipo de bebida.",
          formula_or_criteria: `Proporção apurada: faturamento de bebidas (R$ ${bevTotal.toFixed(2)}) / faturamento total (R$ ${totalRev.toFixed(2)}) = ${(bevRatio * 100).toFixed(1)}%.`,
          evidence_data: {
            source: "eyemobile_categories",
            has_sufficient_data: true,
            beverage_ratio: bevRatio,
            beverage_revenue: bevTotal,
            total_revenue: totalRev,
          },
        });
      }
    }

    // 3. Ociosidade de Horários (Turno da Tarde)
    if (salesByHour.length > 0) {
      const afternoonHours = salesByHour.filter((h) => {
        const hourNum = parseInt(h.hour, 10);
        return hourNum >= 14 && hourNum <= 17;
      });
      const afternoonTotal = afternoonHours.reduce((acc, h) => acc + h.frontCashier + h.otherOrigins, 0);
      const allHoursTotal = salesByHour.reduce((acc, h) => acc + h.frontCashier + h.otherOrigins, 0);

      if (allHoursTotal > 0 && afternoonTotal / allHoursTotal < 0.15) {
        const afternoonPct = Math.round((afternoonTotal / allHoursTotal) * 100);
        opps.push({
          id: "opp-happy-hour-viagem",
          workspace_id: workspaceId,
          department: "comercial",
          title: "Promoção Parada da Tarde (14h às 17h)",
          problem_description: `O horário entre 14h e 17h concentra ${afternoonPct}% das vendas do período (R$ ${afternoonTotal.toFixed(2)} de R$ ${allHoursTotal.toFixed(2)}).`,
          description: "Oferta especial de lanche da tarde para atrair consumo no período de menor fluxo de clientes.",
          hypothesis: "Divulgar opções de lanche vespertino atrai paradas de ônibus e clientes em trânsito com consumo imediato.",
          recommended_action: "Exibir comunicação visual de lanche da tarde na entrada e balcão durante a faixa das 14h às 17h.",
          estimated_financial_impact: null,
          potential_monthly_gain: null,
          confidence_score: 0.60,
          status: "identificada",
          nature: "hipotese_comercial",
          simulation_premises: "Estímulo de consumo em horários com capacidade ociosa de atendimento.",
          calculation_limitations: "Sem contagem de fluxo externo de passageiros, o ganho financeiro adicional não é pré-calculado.",
          formula_or_criteria: `Vendas entre 14h e 17h: R$ ${afternoonTotal.toFixed(2)} (${afternoonPct}% do total).`,
          evidence_data: {
            source: "eyemobile_hourly",
            has_sufficient_data: true,
            afternoon_percentage: afternoonPct,
            afternoon_total: afternoonTotal,
          },
        });
      }
    }

    // 4. Estoque Crítico
    if (criticalStock.length > 0) {
      const topCritical = criticalStock[0];
      const suggestedReplenishment = Math.max(0, topCritical.minStock * 2 - topCritical.stock);
      opps.push({
        id: `opp-ruptura-${topCritical.id}`,
        workspace_id: workspaceId,
        department: "estoque",
        title: `Prevenção de Ruptura: ${topCritical.product}`,
        problem_description: `Estoque atual de ${topCritical.stock} unidades atingiu nível de atenção (mínimo de segurança: ${topCritical.minStock} unidades).`,
        description: `Risco de desabastecimento de ${topCritical.product} com potencial perda de vendas na conveniência.`,
        hypothesis: "Realizar reposição preventiva antes do esgotamento garante disponibilidade contínua e preserva o faturamento do item.",
        recommended_action: `Realizar conferência física do estoque e providenciar reposição sugerida de ${suggestedReplenishment} unidades [fórmula: max(0, minStock * 2 - saldoAtual)], calibrando conforme o giro diário conferido em loja.`,
        estimated_financial_impact: null,
        potential_monthly_gain: null,
        confidence_score: 0.90,
        status: "identificada",
        nature: "fato_observado",
        simulation_premises: "Parâmetros de estoque mínimo e reposição preventiva de segurança.",
        calculation_limitations: "Impacto financeiro de eventual ruptura varia de acordo com o giro diário médio e lead time do fornecedor.",
        formula_or_criteria: `Fórmula de reposição: max(0, ${topCritical.minStock} * 2 - ${topCritical.stock}) = ${suggestedReplenishment} unidades.`,
        evidence_data: {
          source: "estoque_real",
          has_sufficient_data: true,
          product_id: topCritical.id,
          stock: topCritical.stock,
          min_stock: topCritical.minStock,
          suggested_replenishment: suggestedReplenishment,
        },
      });
    }

    // 5. Custo de Mercadorias sem Ficha Técnica
    if (kpis.cmvStatus === "dados_insuficientes") {
      opps.push({
        id: "opp-cmv-fichas-tecnicas",
        workspace_id: workspaceId,
        department: "financeiro",
        title: "Implantação de Fichas Técnicas dos 5 Principais Produtos",
        problem_description: "Ausência de fichas técnicas cadastradas impede o cálculo contábil do CMV real e da margem de contribuição dos produtos.",
        description: "Estruturar receitas e custos de insumos para viabilizar controle de margens e auditoria de desperdícios.",
        hypothesis: "O cadastro sistemático de fichas técnicas permite apuração exata do custo dos pratos e sustentação de decisões de preço.",
        recommended_action: "Cadastrar fichas técnicas e custos de insumos dos 5 produtos de maior giro no módulo de Fichas Técnicas.",
        estimated_financial_impact: null,
        potential_monthly_gain: null,
        confidence_score: 0.85,
        status: "identificada",
        nature: "fato_observado",
        simulation_premises: "Governança de custos e controle de estoques de insumos.",
        calculation_limitations: "Sem fichas técnicas homologadas, o ganho financeiro em reais não pode ser estimado com rigor contábil.",
        formula_or_criteria: "Cobertura de fichas técnicas: 0%. Status de CMV: dados insuficientes.",
        evidence_data: {
          source: "fichas_tecnicas_audit",
          has_sufficient_data: false,
        },
      });
    }

    // 6. Prevenção de Inconsistências Financeiras
    if (consolidationReport && consolidationReport.registrosPendentes > 0) {
      const avoidedAmount = consolidationReport.duplicidadesEvitadasValor || 0;
      opps.push({
        id: "opp-conciliacao-pendente",
        workspace_id: workspaceId,
        department: "financeiro",
        title: "Conciliação Bancária de Despesas Pendentes",
        problem_description: `Identificados ${consolidationReport.registrosPendentes} lançamentos com valor e data coincidentes entre obrigações manuais e extratos bancários aguardando conciliação.`,
        description: "Vincular saídas bancárias às despesas registradas para assegurar conformidade do DRE com o fluxo de caixa.",
        hypothesis: "A conciliação tempestiva elimina riscos de duplicidade contábil e mantém a rastreabilidade financeira auditável.",
        recommended_action: "Revisar a fila de conciliação bancária no módulo financeiro e validar os lançamentos correspondentes.",
        estimated_financial_impact: avoidedAmount > 0 ? avoidedAmount : null,
        potential_monthly_gain: avoidedAmount > 0 ? avoidedAmount : null,
        confidence_score: 0.90,
        status: "identificada",
        nature: "fato_observado",
        simulation_premises: "Rastreabilidade contábil estrita entre faturas, despesas e liquidações bancárias.",
        calculation_limitations:
          avoidedAmount > 0
            ? `Valor de duplicidades evitadas já comprovado de R$ ${avoidedAmount.toFixed(2)}. As pendências remanescentes não alteram o caixa.`
            : "Os lançamentos pendentes não impactam o caixa até sua confirmação e classificação.",
        formula_or_criteria: `Relatório de consolidação financeira: ${consolidationReport.registrosPendentes} pendências e ${consolidationReport.duplicidadesConfirmadas} duplicidades prevenidas.`,
        evidence_data: {
          source: "financial_consolidation",
          has_sufficient_data: true,
          pending_count: consolidationReport.registrosPendentes,
          avoided_amount: avoidedAmount,
        },
      });
    }

    return opps;
  }

  /**
   * 4.3 — Plano de Ação Estruturado com Gateway de Autorização
   */
  public static createActionProposal(opp: GrowthOpportunity): StructuredActionProposal {
    const isHighPriority =
      (opp.estimated_financial_impact != null && opp.estimated_financial_impact > 1000) ||
      opp.nature === "fato_observado";

    const indicador = opp.estimated_financial_impact != null
      ? `Impacto financeiro auditado de +R$ ${opp.estimated_financial_impact.toFixed(2)}/mês`
      : `Validação qualitativa e operacional da hipótese (${opp.nature || "em análise"})`;

    return {
      id: `act-${opp.id}-${Date.now()}`,
      oportunidadeId: opp.id,
      titulo: opp.title,
      objetivo: opp.description || opp.problem_description,
      evidencia: `Dados auditados via ${opp.evidence_data?.source || "banco de dados"} com score de confiança ${(opp.confidence_score * 100).toFixed(0)}% (${opp.nature || "análise"}).`,
      justificativa: opp.hypothesis || "Aumento comprovado de eficiência e governança da operação.",
      prioridade: isHighPriority ? "alta" : "media",
      responsavel: "Gerência Operacional Rodo Point",
      prazoSugerido: "15 dias corridos",
      indicadorSucesso: indicador,
      riscoEstimado: "baixo",
      mitigacaoRisco: opp.calculation_limitations || "Teste piloto controlado sem alteração estrutural no preço de tabela.",
      statusAprovacao: "aguardando_aprovacao",
      requerAprovacaoProprietario: true,
    };
  }

  /**
   * 4.4 — Ciclo de Vida de Experimentos Comerciais (antes/depois e baseline)
   */
  public static evaluateExperimentProgress(
    experiment: CommercialExperiment,
    currentKpiValue: number
  ): {
    status: CommercialExperiment["status"];
    evolucaoPercent: number;
    resultadoObservado: string;
    conclusaoRecomendada: "manter" | "encerrar" | "ajustar";
  } {
    const parsePtBrNumber = (val: string): number => {
      if (!val) return 0;
      const clean = val.replace(/[^0-9,-]/g, "").replace(",", ".");
      return parseFloat(clean) || 0;
    };

    const baseline = parsePtBrNumber(experiment.baseline_value);
    const target = parsePtBrNumber(experiment.target_value) || baseline;

    let evolucaoPercent = 0;
    if (baseline > 0) {
      evolucaoPercent = Math.round(((currentKpiValue - baseline) / baseline) * 1000) / 10;
    } else if (currentKpiValue > 0) {
      evolucaoPercent = 100;
    }

    const atingiuMeta = target > baseline ? currentKpiValue >= target : currentKpiValue <= target;
    const conclusaoRecomendada = atingiuMeta ? "manter" : evolucaoPercent > 0 ? "ajustar" : "encerrar";

    const resultadoObservado = `Baseline: ${experiment.baseline_value} -> Atual: ${currentKpiValue.toFixed(2)} (${
      evolucaoPercent >= 0 ? "+" : ""
    }${evolucaoPercent}%). Meta: ${experiment.target_value}.`;

    return {
      status: experiment.status,
      evolucaoPercent,
      resultadoObservado,
      conclusaoRecomendada,
    };
  }
}
