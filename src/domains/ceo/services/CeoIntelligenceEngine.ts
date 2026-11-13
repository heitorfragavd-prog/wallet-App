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
import {
  GrowthOpportunity,
  CommercialExperiment,
  StructuredBaseline,
  AutomatedExperimentMeasurement,
  EvaluationClassification,
  BaselineMeasurementType,
  ExperimentKpiType,
} from "../types";

export interface BriefingSection {
  titulo: string;
  destaque: string;
  valor?: string;
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

    // 5. Despesas e Resultado Operacional Preliminar
    if (kpis.despesasMes > 0) {
      const despStr = `R$ ${kpis.despesasMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      const resStr = `R$ ${kpis.resultadoOperacional.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      secoes.push({
        titulo: "Despesas e Resultado Operacional Preliminar",
        destaque: resStr,
        conteudo: `Despesas pagas consolidadas: ${despStr}. Resultado operacional preliminar (caixa): ${resStr} (${kpis.margemOperacionalPercent != null ? `${kpis.margemOperacionalPercent}% de margem preliminar` : "sem margem apurada"}). Custos ausentes: CMV e tributos não parametrizados.`,
        fonte: "Módulo Financeiro / FinancialConsolidationService",
        periodo: `${range.inicioStr} a ${range.fimStr}`,
        criterioCalculo: "Receita líquida deduplicada menos despesas consolidadas no regime de caixa/competência (sem contagem dupla). Não reflete lucro líquido definitivo por ausência de CMV e tributos.",
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

    // 7. CMV e Rentabilidade Real Auditada
    if (kpis.cmvConfirmado !== null && kpis.cmvConfirmado > 0) {
      const valorFormatado = `R$ ${kpis.cmvConfirmado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      secoes.push({
        titulo: "Rentabilidade e Custos Reais",
        destaque: valorFormatado,
        valor: valorFormatado,
        conteudo: `CMV auditado por notas fiscais: ${valorFormatado} (${kpis.cmvPercent}% da receita apurada com custo). Lucro bruto comprovado: R$ ${kpis.lucroBrutoConfirmado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'} com margem bruta média de ${kpis.margemBrutaConfirmadaPercent}%.`,
        fonte: "produtos_eyemobile (custo_atual) e nf_itens (Notas Fiscais SPAL/Brasnorte)",
        periodo: `${range.inicioStr} a ${range.fimStr}`,
        criterioCalculo: `Cruzamento determinístico de compras auditadas com vendas PDV. Cobertura atual: ${kpis.coberturaCmvPercent}% da receita.`,
        status: "positivo",
      });

      if (kpis.coberturaCmvPercent < 100) {
        oportunidadesPrioritarias.push(
          `Cadastrar ficha técnica de receitas próprias (como pão de queijo e combos) para elevar a cobertura de CMV de ${kpis.coberturaCmvPercent}% para 100%.`
        );
      }
    } else if (kpis.cmvStatus === "dados_insuficientes") {
      alertasQualidadeDados.push(
        "Ausência de custos unitários e fichas técnicas cadastradas. O custo real de mercadorias (CMV) não pôde ser aferido."
      );
      oportunidadesPrioritarias.push(
        "Vincular notas fiscais de atacado aos produtos para viabilizar controle de margem de contribuição."
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
    const effectiveKpis = kpis || CeoFinancialMetricsService.getEmptyKpis();

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
    const totalRev = effectiveKpis.faturamentoMes;
    if (totalRev > 0) {
      const totalSampleRev = topProducts.reduce((acc, p) => acc + p.faturamento, 0);
      const isPartialSample = totalSampleRev < totalRev * 0.90;

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
        const probDesc = isPartialSample
          ? `Na amostra dos produtos líderes analisados, bebidas representam ${(bevRatio * 100).toFixed(1)}% do faturamento total da loja (R$ ${bevTotal.toFixed(2)} de R$ ${totalRev.toFixed(2)}). Análise amostral condicionada aos itens no ranking.`
          : `Bebidas representam ${(bevRatio * 100).toFixed(1)}% do faturamento de vendas no período (R$ ${bevTotal.toFixed(2)} de R$ ${totalRev.toFixed(2)}).`;

        const calcLimit = isPartialSample
          ? "Hipótese baseada na amostra de produtos mais vendidos. Vendas de bebidas fora do ranking dos itens líderes não constam nesta amostra."
          : "Impacto financeiro condicionado à elasticidade de demanda e margem unitária por tipo de bebida.";

        opps.push({
          id: "opp-bebidas-lunch",
          workspace_id: workspaceId,
          department: "comercial",
          title: "Potencialização de Bebidas Geladas no Almoço",
          problem_description: probDesc,
          description: "Posicionar refrigeradores visíveis próximos ao balcão e oferecer sugestivamente bebida no momento do pedido.",
          hypothesis: "Oferecer sugestivamente opção de bebida bem gelada durante o atendimento eleva a proporção de pedidos com itens agregados.",
          recommended_action: "Incentivar venda sugestiva de refrigerantes, sucos e água no caixa e certificar posicionamento dos expositores.",
          estimated_financial_impact: null,
          potential_monthly_gain: null,
          confidence_score: isPartialSample ? 0.55 : 0.65,
          status: "identificada",
          nature: "hipotese_comercial",
          simulation_premises: isPartialSample
            ? "Hipótese amostral baseada nos produtos líderes observados no período."
            : "Venda sugestiva por impulso em momentos de refeição.",
          calculation_limitations: calcLimit,
          formula_or_criteria: `Proporção apurada: faturamento de bebidas na amostra (R$ ${bevTotal.toFixed(2)}) / faturamento total (R$ ${totalRev.toFixed(2)}) = ${(bevRatio * 100).toFixed(1)}%.`,
          evidence_data: {
            source: "eyemobile_categories",
            has_sufficient_data: !isPartialSample,
            is_partial_sample: isPartialSample,
            sample_revenue: totalSampleRev,
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
    if (effectiveKpis.cmvStatus === "dados_insuficientes") {
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
   * Gate 2 — Validação Rigorosa de Baseline Real
   *
   * Requisitos:
   * 1. Métrica estruturada (indicador, período de referência, valor inicial, fonte, unidade, amostra, confiabilidade).
   * 2. Não iniciar sem baseline.
   * 3. Não aceitar valor '0' como baseline sem confirmação de que o valor real era zero (sample_size > 0).
   * 4. Não aceitar texto genérico ('pendente', 'a definir', etc.).
   */
  public static validateBaseline(
    rawBaseline: unknown,
    options?: {
      sampleSize?: number;
      indicator?: string;
      source?: string;
    }
  ): {
    valid: boolean;
    reason?: string;
    baseline?: StructuredBaseline;
  } {
    if (rawBaseline === null || rawBaseline === undefined || rawBaseline === '') {
      return {
        valid: false,
        reason: 'O experimento não pode ser iniciado sem um baseline comprovado.',
      };
    }

    // Se já for um StructuredBaseline
    if (typeof rawBaseline === 'object' && rawBaseline !== null) {
      const b = rawBaseline as Partial<StructuredBaseline>;
      if (!b.indicator || b.indicator.trim() === '') {
        return { valid: false, reason: 'Indicador do baseline não informado.' };
      }
      if (b.initial_value === undefined || b.initial_value === null || !Number.isFinite(b.initial_value)) {
        return { valid: false, reason: 'Valor numérico inicial do baseline inválido.' };
      }
      if (b.initial_value === 0 && (!b.sample_size || b.sample_size <= 0)) {
        return {
          valid: false,
          reason: "O valor '0' não é aceito como baseline sem comprovação documental de que o valor real era zero.",
        };
      }
      return {
        valid: true,
        baseline: {
          indicator: b.indicator,
          reference_period: b.reference_period || 'Últimos 30 dias',
          initial_value: b.initial_value,
          formatted_value: b.formatted_value || (b.unit === 'R$' ? `R$ ${b.initial_value.toFixed(2)}` : `${b.initial_value}`),
          unit: b.unit || 'R$',
          source: b.source || 'eyemobile_pdv',
          sample_size: b.sample_size || (options?.sampleSize ?? 1),
          reliability: b.reliability || 'alta',
          measurement_type: b.measurement_type || 'automatica',
          notes: b.notes,
        },
      };
    }

    // Se for string ou number
    const strVal = String(rawBaseline).trim();
    const genericRe = /^(pendente|a definir|definir|teste|nao informado|não informado|n\/a|null|undefined)$/i;
    if (genericRe.test(strVal)) {
      return {
        valid: false,
        reason: 'Texto genérico não é aceito como baseline comprovado.',
      };
    }

    const clean = strVal.replace(/[^0-9,-]/g, '').replace(',', '.');
    const parsedNum = parseFloat(clean);

    if (isNaN(parsedNum)) {
      return {
        valid: false,
        reason: 'Não foi possível extrair um valor numérico comprovado do baseline informado.',
      };
    }

    if (parsedNum === 0) {
      const sample = options?.sampleSize ?? 0;
      if (sample <= 0) {
        return {
          valid: false,
          reason: "O valor '0' não é aceito como baseline sem confirmação de que o valor real era zero com amostra observada.",
        };
      }
    }

    return {
      valid: true,
      baseline: {
        indicator: options?.indicator || 'Faturamento / Ticket',
        reference_period: 'Período anterior ao experimento',
        initial_value: parsedNum,
        formatted_value: strVal,
        unit: strVal.includes('R$') ? 'R$' : strVal.includes('%') ? '%' : 'unidades',
        source: options?.source || 'eyemobile_pdv',
        sample_size: options?.sampleSize ?? 1,
        reliability: (options?.sampleSize ?? 0) >= 7 ? 'alta' : 'media',
        measurement_type: 'automatica',
      },
    };
  }

  /**
   * Helper para normalização de tipo de KPI a partir de texto livre ou valor canônico
   */
  public static resolveKpiType(raw?: string | null): ExperimentKpiType {
    const text = String(raw || '').toLowerCase().trim();
    if (text.includes('ticket')) return 'ticket_medio';
    if (text.includes('pedido') || text.includes('transa') || text.includes('volume')) return 'pedidos';
    if (text.includes('produto') || text.includes('item') || text.includes('unidade')) return 'produto_vendido';
    if (text.includes('margem')) return 'margem';
    return 'faturamento';
  }

  /**
   * Gate 3 & Gate 1 — Medição Automática de Experimentos Comerciais a partir de Vendas do PDV
   * Suporta 5 tipos de KPIs oficiais:
   * 1. ticket_medio: Variação de valor médio por pedido
   * 2. faturamento: Variação de receita média diária
   * 3. pedidos: Variação de volume de pedidos diários
   * 4. produto_vendido: Variação de quantidade de item vendido do catálogo Eyemobile
   * 5. margem: Variação de margem bruta/operacional em %
   *
   * Requisitos:
   * 1. Desconsiderar vendas canceladas ou estornadas.
   * 2. Comparar período do experimento com baseline histórico.
   * 3. Apresentar resultado financeiro medido, variação percentual real e observações analisadas.
   * 4. Diferenciar medição automática comprovada de manual e estimada.
   */
  public static measureExperimentFromSales(params: {
    experiment: CommercialExperiment;
    sales: Array<{
      valor: number;
      data: string;
      status?: string;
      cancelada?: boolean;
      tipo?: string;
      custo?: number;
      itens?: Array<{
        nome?: string;
        produto_id?: string;
        quantidade: number;
        valor_unitario?: number;
        custo_unitario?: number;
      }>;
    }>;
    baselineDailyAverage?: number;
    baselineSampleSize?: number;
    baselinePeriod?: string;
    experimentDaysCount?: number;
    measurementType?: BaselineMeasurementType;
    kpiType?: ExperimentKpiType | string;
    targetProductName?: string;
    targetProductId?: string;
  }): AutomatedExperimentMeasurement {
    const {
      experiment,
      sales,
      baselineDailyAverage = 0,
      baselineSampleSize = 0,
      baselinePeriod = 'Período de referência histórico',
      experimentDaysCount,
      measurementType = 'automatica',
      kpiType,
      targetProductName,
      targetProductId,
    } = params;

    const resolvedKpiType: ExperimentKpiType = kpiType
      ? CeoIntelligenceEngine.resolveKpiType(kpiType)
      : CeoIntelligenceEngine.resolveKpiType(experiment.target_kpi);

    // 1. Desconsiderar vendas canceladas ou estornadas
    const validSales = (sales || []).filter((s) => {
      const st = (s.status || '').toLowerCase();
      if (st === 'cancelada' || st === 'estornada' || st === 'cancelled') return false;
      if (s.cancelada === true) return false;
      if (s.tipo && s.tipo !== 'receita') return false;
      return Number(s.valor || 0) > 0;
    });

    const sampleSize = validSales.length;
    const totalRevenue = validSales.reduce((acc, s) => acc + Number(s.valor || 0), 0);
    const averageTicket = sampleSize > 0 ? Math.round((totalRevenue / sampleSize) * 100) / 100 : 0;

    const distinctDates = new Set(validSales.map((s) => s.data.slice(0, 10)));
    const calculatedDays = distinctDates.size;
    const daysCount = Math.max(1, experimentDaysCount || calculatedDays || 1);

    // Variáveis por KPI
    let currentValue = 0;
    let indicatorName = experiment.target_kpi || 'Faturamento Diário';
    let deltaAbs = 0;
    let deltaPercent: number | null = null;
    let financialImpact = 0;

    switch (resolvedKpiType) {
      case 'ticket_medio': {
        indicatorName = experiment.target_kpi || 'Ticket Médio';
        currentValue = averageTicket;
        deltaAbs = Math.round((currentValue - baselineDailyAverage) * 100) / 100;
        if (baselineDailyAverage > 0) {
          deltaPercent = Math.round(((currentValue - baselineDailyAverage) / baselineDailyAverage) * 1000) / 10;
        }
        financialImpact = Math.round(deltaAbs * sampleSize * 100) / 100;
        break;
      }

      case 'pedidos': {
        indicatorName = experiment.target_kpi || 'Pedidos por Dia';
        currentValue = Math.round((sampleSize / daysCount) * 100) / 100;
        deltaAbs = Math.round((currentValue - baselineDailyAverage) * 100) / 100;
        if (baselineDailyAverage > 0) {
          deltaPercent = Math.round(((currentValue - baselineDailyAverage) / baselineDailyAverage) * 1000) / 10;
        }
        financialImpact = Math.round(deltaAbs * daysCount * averageTicket * 100) / 100;
        break;
      }

      case 'produto_vendido': {
        indicatorName =
          experiment.target_kpi ||
          (targetProductName ? `Vendas de ${targetProductName}` : 'Produtos Vendidos por Dia');

        let totalProductQty = 0;
        let totalProductRevenue = 0;

        for (const s of validSales) {
          if (s.itens && s.itens.length > 0) {
            for (const it of s.itens) {
              const matchName = targetProductName
                ? (it.nome || '').toLowerCase().includes(targetProductName.toLowerCase())
                : false;
              const matchId = targetProductId ? it.produto_id === targetProductId : false;

              if (matchName || matchId || (!targetProductName && !targetProductId)) {
                totalProductQty += Number(it.quantidade || 0);
                totalProductRevenue += Number(it.quantidade || 0) * Number(it.valor_unitario || 0);
              }
            }
          }
        }

        if (totalProductQty === 0 && !targetProductName && !targetProductId) {
          totalProductQty = sampleSize;
        }

        currentValue = Math.round((totalProductQty / daysCount) * 100) / 100;
        deltaAbs = Math.round((currentValue - baselineDailyAverage) * 100) / 100;
        if (baselineDailyAverage > 0) {
          deltaPercent = Math.round(((currentValue - baselineDailyAverage) / baselineDailyAverage) * 1000) / 10;
        }

        const avgPrice =
          totalProductQty > 0 && totalProductRevenue > 0
            ? totalProductRevenue / totalProductQty
            : averageTicket;
        financialImpact = Math.round(deltaAbs * daysCount * avgPrice * 100) / 100;
        break;
      }

      case 'margem': {
        indicatorName = experiment.target_kpi || 'Margem Operacional (%)';
        const totalCost = validSales.reduce((acc, s) => {
          if (s.custo != null && Number.isFinite(s.custo)) return acc + Number(s.custo);
          if (s.itens && s.itens.length > 0) {
            return (
              acc +
              s.itens.reduce(
                (iacc, it) => iacc + Number(it.custo_unitario || 0) * Number(it.quantidade || 1),
                0
              )
            );
          }
          return acc;
        }, 0);

        const currentMarginPercent =
          totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : 0;

        currentValue = currentMarginPercent;
        deltaAbs = Math.round((currentValue - baselineDailyAverage) * 100) / 100;
        if (baselineDailyAverage > 0) {
          deltaPercent = Math.round(((currentValue - baselineDailyAverage) / baselineDailyAverage) * 1000) / 10;
        }

        financialImpact = Math.round(((deltaAbs / 100) * totalRevenue) * 100) / 100;
        break;
      }

      case 'faturamento':
      default: {
        indicatorName = experiment.target_kpi || 'Faturamento Diário';
        currentValue = Math.round((totalRevenue / daysCount) * 100) / 100;
        deltaAbs = Math.round((currentValue - baselineDailyAverage) * 100) / 100;
        if (baselineDailyAverage > 0) {
          deltaPercent = Math.round(((currentValue - baselineDailyAverage) / baselineDailyAverage) * 1000) / 10;
        }
        financialImpact = Math.round(deltaAbs * daysCount * 100) / 100;
        break;
      }
    }

    // Suficiência estatística: mínimo 3 dias com vendas ou mínimo 5 pedidos
    const isStatisticallySufficient = calculatedDays >= 3 || sampleSize >= 5;

    let classification: EvaluationClassification = 'dados_indisponiveis';
    let notes = '';

    if (sampleSize === 0) {
      classification = 'dados_indisponiveis';
      notes = 'Nenhuma venda confirmada registrada no período do experimento.';
    } else if (!isStatisticallySufficient) {
      classification = 'inconcluso';
      notes = `Amostra preliminar (${sampleSize} vendas em ${calculatedDays} dias). Necessário maior período para relevância estatística.`;
    } else if (deltaAbs > 0) {
      classification = 'favoravel';
      notes = `Resultado favorável em ${indicatorName} com impacto financeiro incremental medido de R$ ${financialImpact.toFixed(2)}.`;
    } else {
      classification = 'desfavoravel';
      notes = `Resultado desfavorável em ${indicatorName} com variação de ${deltaAbs > 0 ? '+' : ''}${deltaAbs} em relação ao baseline.`;
    }

    return {
      experimentId: experiment.id,
      kpiType: resolvedKpiType,
      baseline: {
        indicator: indicatorName,
        value: baselineDailyAverage,
        sampleSize: baselineSampleSize,
        period: baselinePeriod,
      },
      measurement: {
        currentValue,
        sampleSize,
        period: `${experiment.start_date} até o momento (${daysCount} dias operacionais)`,
        totalRevenue,
        orderCount: sampleSize,
        averageTicket,
      },
      delta: {
        absolute: deltaAbs,
        percent: deltaPercent,
      },
      financialImpact,
      classification,
      measurementType,
      isStatisticallySufficient,
      notes,
    };
  }

  /**
   * 4.4 — Ciclo de Vida de Experimentos Comerciais (antes/depois e baseline)
   * Avaliação estatisticamente válida:
   * - Nunca inventa 100% de ganho quando baseline é 0 ou ausente.
   * - Classificação rigorosa: favoravel, desfavoravel, inconcluso, dados_indisponiveis.
   */
  public static evaluateExperimentProgress(
    experiment: CommercialExperiment,
    currentKpiValue: number
  ): {
    status: CommercialExperiment["status"];
    evolucaoPercent: number | null;
    resultadoObservado: string;
    conclusaoRecomendada: "manter" | "encerrar" | "ajustar";
    classificacao: EvaluationClassification;
    baselineComprovado: boolean;
  } {
    const parsePtBrNumber = (val: string | number | undefined | null): number => {
      if (val == null) return 0;
      if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
      const clean = String(val).replace(/[^0-9,-]/g, "").replace(",", ".");
      return parseFloat(clean) || 0;
    };

    const hasBaseline = experiment.baseline_value !== undefined && experiment.baseline_value !== null && experiment.baseline_value !== '';
    const baseline = parsePtBrNumber(experiment.baseline_value);
    const target = parsePtBrNumber(experiment.target_value) || baseline;

    if (!hasBaseline || baseline <= 0) {
      return {
        status: experiment.status,
        evolucaoPercent: null,
        resultadoObservado: `Baseline: Não informado ou não comprovado -> Atual: ${currentKpiValue.toFixed(2)}. Não é possível calcular ganho percentual sem baseline inicial comprovado.`,
        conclusaoRecomendada: "ajustar",
        classificacao: "dados_indisponiveis",
        baselineComprovado: false,
      };
    }

    const evolucaoPercent = Math.round(((currentKpiValue - baseline) / baseline) * 1000) / 10;
    const atingiuMeta = target > baseline ? currentKpiValue >= target : currentKpiValue <= target;
    const conclusaoRecomendada = atingiuMeta ? "manter" : evolucaoPercent > 0 ? "ajustar" : "encerrar";

    let classificacao: EvaluationClassification = "inconcluso";
    if (atingiuMeta || evolucaoPercent > 0) {
      classificacao = "favoravel";
    } else {
      classificacao = "desfavoravel";
    }

    const resultadoObservado = `Baseline: ${experiment.baseline_value} -> Atual: ${currentKpiValue.toFixed(2)} (${
      evolucaoPercent >= 0 ? "+" : ""
    }${evolucaoPercent}%). Meta: ${experiment.target_value || "A definir"}.`;

    return {
      status: experiment.status,
      evolucaoPercent,
      resultadoObservado,
      conclusaoRecomendada,
      classificacao,
      baselineComprovado: true,
    };
  }
}
