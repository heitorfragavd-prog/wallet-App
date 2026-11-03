import { describe, it, expect } from "vitest";
import { CeoIntelligenceEngine } from "./CeoIntelligenceEngine";
import { CeoExecutiveKpis } from "./CeoFinancialMetricsService";
import { getCeoPeriodRange } from "../utils/ceoDateRanges";
import { FinancialConsolidationReport } from "@/domains/finance/services/FinancialConsolidationService";
import { CommercialExperiment } from "../types";

describe("CeoIntelligenceEngine — Gate 4: CEO Inteligente (Briefing, Recomendações e Experimentos)", () => {
  const workspaceId = "ws-rodo-point-test";
  const refDate = new Date("2026-11-02T12:00:00-03:00");
  const periodRange = getCeoPeriodRange("este_mes", refDate);

  const mockKpis: CeoExecutiveKpis = {
    faturamentoMes: 25400.5,
    faturamentoMesAnterior: 22100.0,
    crescimentoMesPercent: 14.9,
    pedidosMes: 850,
    crescimentoPedidosPercent: 8.2,
    ticketMedioMes: 29.88,
    crescimentoTicketMedioPercent: 6.2,
    resultadoOperacional: 8200.5,
    margemOperacionalPercent: 32.3,
    faturamentoOntem: 1250.0,
    mediaDiaSemanaOntem: 1100.0,
    variacaoOntemVsMediaPercent: 13.6,
    diaSemanaOntemNome: "Domingo",
    despesasMes: 17200.0,
    despesasMesAnterior: 15900.0,
    variacaoDespesasPercent: 8.2,
    lucroEstimado: 8200.5,
    margemLucroPercent: 32.3,
    cmvPercent: null,
    cmvStatus: "dados_insuficientes",
    coberturaFichasPercent: 0,
    acoesHoje: {
      numero: 2,
      itens: [{ id: "1", title: "Conferir Caixa", urgency: "normal" }],
    },
    dadosIndisponiveis: false,
  };

  it("4.1 — Gera Briefing Executivo quantitativo completo com fonte, período e critérios explícitos", () => {
    const briefing = CeoIntelligenceEngine.generateExecutiveBriefing({
      kpis: mockKpis,
      range: periodRange,
      topProducts: [
        {
          rank: 1,
          id: "p-cafe-1",
          produto: "Café Expresso Duplo",
          quantidade: 420,
          faturamento: 4200.0,
          percentualFaturamento: 16.5,
          margemEstimada: null,
        },
      ],
      criticalStockCount: 2,
    });

    expect(briefing.resumoGeral).toContain("25.400,50");
    expect(briefing.secoes.length).toBeGreaterThanOrEqual(4);

    // Todas as seções devem conter fonte, período e critério
    briefing.secoes.forEach((sec) => {
      expect(sec.fonte).toBeTruthy();
      expect(sec.periodo).toBeTruthy();
      expect(sec.criterioCalculo).toBeTruthy();
    });

    // Deve alertar sobre CMV e fichas técnicas
    expect(
      briefing.alertasQualidadeDados.some((a) => a.includes("fichas técnicas"))
    ).toBe(true);

    // Deve alertar sobre estoque crítico
    expect(
      briefing.alertasQualidadeDados.some((a) => a.includes("estoque"))
    ).toBe(true);
  });

  it("4.1.b — Inclui auditoria de duplicidades evitadas quando o relatório de consolidação é fornecido", () => {
    const consolidationReport: FinancialConsolidationReport = {
      workspaceId,
      totalBrutoOrigem: 3000,
      totalRegistrosOrigem: 4,
      lancamentosConciliados: 1,
      lancamentosUnicos: 3,
      duplicidadesConfirmadas: 1,
      duplicidadesEvitadasValor: 500,
      registrosPendentes: 1,
      totalPorCompetencia: 2500,
      totalPorCaixa: 2500,
      itensConsolidados: [],
      diferencasJustificadas: [],
    };

    const briefing = CeoIntelligenceEngine.generateExecutiveBriefing({
      kpis: mockKpis,
      range: periodRange,
      consolidationReport,
    });

    expect(
      briefing.alertasQualidadeDados.some((a) =>
        a.includes("Prevenção ativa de duplicidade") && a.includes("R$ 500.00")
      )
    ).toBe(true);

    expect(
      briefing.pendenciasFinanceiras.some((p) =>
        p.includes("1 lançamentos com valor e data coincidentes")
      )
    ).toBe(true);
  });

  it("4.2 — Identifica oportunidade de Combo Café + Salgado como hipótese comercial fundamentada sem números arbitrários", () => {
    const opps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
      kpis: mockKpis,
      topProducts: [
        {
          rank: 1,
          id: "p-cafe",
          produto: "Café com Leite Especial",
          quantidade: 500,
          faturamento: 3500,
          percentualFaturamento: 14,
          margemEstimada: null,
        },
        {
          rank: 2,
          id: "p-salgado",
          produto: "Pão de Queijo Mineiro",
          quantidade: 600,
          faturamento: 4200,
          percentualFaturamento: 16.5,
          margemEstimada: null,
        },
      ],
    });

    const comboOpp = opps.find((o) => o.id === "opp-combo-cafe-salgado");
    expect(comboOpp).toBeDefined();
    expect(comboOpp?.title).toContain("Combo Expresso & Salgado");
    expect(comboOpp?.nature).toBe("hipotese_comercial");
    // Sem ficha técnica, impacto financeiro não é inventado
    expect(comboOpp?.estimated_financial_impact).toBeNull();
    expect(comboOpp?.simulation_premises).toBeDefined();
    expect(comboOpp?.calculation_limitations).toContain("Sem fichas técnicas");
    expect(comboOpp?.evidence_data.cafe_sales).toBe(3500);
    expect(comboOpp?.evidence_data.salgado_sales).toBe(4200);
  });

  it("4.2.b — Identifica oportunidade de venda adicional de bebidas com classificação de hipótese comercial", () => {
    const opps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
      kpis: mockKpis,
      topProducts: [
        {
          rank: 1,
          id: "p-refrig",
          produto: "Refrigerante Lata",
          quantidade: 200,
          faturamento: 1400, // 1400 / 25400 = ~5.5% (abaixo de 25%)
          percentualFaturamento: 5.5,
          margemEstimada: null,
        },
      ],
    });

    const drinkOpp = opps.find((o) => o.id === "opp-bebidas-lunch");
    expect(drinkOpp).toBeDefined();
    expect(drinkOpp?.title).toContain("Bebidas Geladas");
    expect(drinkOpp?.nature).toBe("hipotese_comercial");
    expect(drinkOpp?.estimated_financial_impact).toBeNull();
    expect(drinkOpp?.problem_description).toContain("5.5%");
  });

  it("4.2.c — Identifica risco de ruptura com fórmula de reposição max(0, minStock*2 - stock) sem quantidade fixa", () => {
    const opps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
      kpis: mockKpis,
      criticalStock: [
        {
          id: "prod-agua-500",
          product: "Água Mineral 500ml",
          stock: 3,
          minStock: 20,
        },
      ],
    });

    const stockOpp = opps.find((o) => o.id.includes("opp-ruptura-"));
    expect(stockOpp).toBeDefined();
    expect(stockOpp?.department).toBe("estoque");
    expect(stockOpp?.nature).toBe("fato_observado");
    expect(stockOpp?.title).toContain("Água Mineral 500ml");
    // Fórmula: max(0, 20*2 - 3) = 37 unidades
    expect(stockOpp?.formula_or_criteria).toContain("37 unidades");
    expect(stockOpp?.recommended_action).toContain("37 unidades");
    expect(stockOpp?.recommended_action).not.toContain("50 unidades");
    expect(stockOpp?.estimated_financial_impact).toBeNull();
  });

  it("4.2.d — Identifica oportunidade de CMV sem inventar ganho financeiro arbitrário", () => {
    const opps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
      kpis: {
        ...mockKpis,
        cmvStatus: "dados_insuficientes",
      },
    });

    const cmvOpp = opps.find((o) => o.id === "opp-cmv-fichas-tecnicas");
    expect(cmvOpp).toBeDefined();
    expect(cmvOpp?.nature).toBe("fato_observado");
    expect(cmvOpp?.estimated_financial_impact).toBeNull();
    expect(cmvOpp?.calculation_limitations).toContain("Sem fichas técnicas homologadas");
  });

  it("4.3 — Cria proposta de Plano de Ação Estruturado com aprovação obrigatória do proprietário", () => {
    const opp = {
      id: "opp-combo-test",
      workspace_id: workspaceId,
      department: "comercial" as const,
      title: "Combo Promocional Manhã",
      problem_description: "Vendas separadas reduzem ticket",
      description: "Oferta casada café + salgado",
      hypothesis: "Aumenta compra casada",
      recommended_action: "Cadastrar combo no PDV",
      estimated_financial_impact: null,
      potential_monthly_gain: null,
      confidence_score: 0.70,
      nature: "hipotese_comercial" as const,
      status: "identificada" as const,
      evidence_data: { source: "eyemobile_items", has_sufficient_data: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const action = CeoIntelligenceEngine.createActionProposal(opp);

    expect(action.id).toContain("act-opp-combo-test");
    expect(action.requerAprovacaoProprietario).toBe(true);
    expect(action.statusAprovacao).toBe("aguardando_aprovacao");
    expect(action.responsavel).toBeTruthy();
    expect(action.prazoSugerido).toBeTruthy();
    expect(action.indicadorSucesso).toContain("Validação qualitativa");
  });

  it("4.4 — Avalia ciclo de vida de experimento comercial determinístico", () => {
    const experiment: CommercialExperiment = {
      id: "exp-1",
      workspace_id: workspaceId,
      title: "Combo Café + Salgado",
      hypothesis: "Aumenta ticket médio de R$ 25 para R$ 30",
      department: "comercial",
      target_kpi: "Ticket Médio",
      baseline_value: "R$ 25,00",
      current_value: "R$ 31,50",
      target_value: "R$ 30,00",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      status: "active",
      actions: ["Treinar caixa"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const evaluation = CeoIntelligenceEngine.evaluateExperimentProgress(experiment, 31.5);

    expect(evaluation.evolucaoPercent).toBe(26); // (31.5 - 25) / 25 = 26%
    expect(evaluation.conclusaoRecomendada).toBe("manter"); // Atingiu a meta de R$ 30,00
    expect(evaluation.resultadoObservado).toContain("31.50");
  });
});
