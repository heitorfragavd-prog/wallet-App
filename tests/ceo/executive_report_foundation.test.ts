import { describe, it, expect } from "vitest";
import {
  CeoExecutiveReport,
  ExecutiveRecommendation,
  ExecutiveReportFinancialIndicators,
} from "../../src/domains/ceo/types/executive-report";

describe("Etapa 06 — Entrega A: Fundação e Tipagem Canônica dos Relatórios Executivos", () => {
  it("deve estruturar corretamente os 6 blocos canônicos do relatório", () => {
    const mockIndicators: ExecutiveReportFinancialIndicators = {
      faturamento: {
        faturamentoOntem: 1540.5,
        faturamentoMesAcumulado: 34500.2,
        pedidosOntem: 42,
        ticketMedioOntem: 36.67,
        mediaDiaSemanaOntem: 1420.0,
        diaSemanaOntemNome: "Segunda-feira",
        variacaoOntemVsMediaPercent: 8.48,
        pedidosMesAcumulado: 850,
        ticketMedioMes: 40.58,
        faturamentoMesAnterior: 32000.0,
        crescimentoMesPercent: 7.81,
        alertaQueda: false,
      },
      despesas: {
        despesasOntem: 420.0,
        despesasMesAcumulado: 12450.0,
        despesasPagasMes: 11000.0,
        despesasPendentesMes: 1450.0,
        contasVencidasQuantidade: 0,
        contasVencidasValor: 0,
        contasVencer7DiasQuantidade: 3,
        contasVencer7DiasValor: 1250.0,
        possiveisDuplicidadesQuantidade: 0,
        possiveisDuplicidadesValor: 0,
      },
      resultado: {
        receitaCompetencia: 34500.2,
        despesasCompetencia: 12450.0,
        resultadoOperacional: 22050.2,
        margemOperacionalPercent: 63.91,
        lucroBrutoConfirmado: 18500.0,
        margemBrutaConfirmadaPercent: 53.62,
        cmvTotal: 8400.0,
        cmvPercent: 24.34,
        coberturaFichasPercent: 85.0,
        statusConfiabilidadeLucro: "confirmado",
      },
      produtos: {
        top5Faturamento: [
          {
            id: "p1",
            nome: "Hambúrguer Clássico",
            quantidade: 25,
            faturamento: 750.0,
            custoUnitario: 12.0,
            margemEstimadaPercent: 60.0,
            custoComprovadoNota: true,
          },
        ],
        top5Quantidade: [
          {
            id: "p1",
            nome: "Hambúrguer Clássico",
            quantidade: 25,
            faturamento: 750.0,
            custoUnitario: 12.0,
            margemEstimadaPercent: 60.0,
            custoComprovadoNota: true,
          },
        ],
        produtosComCustoCadastrado: 45,
        totalProdutosCatalogo: 50,
        coberturaCustosPercent: 90.0,
        produtosSemCustoConhecido: 5,
        oportunidadesComerciais: ["Elevar combo do item mais vendido no horário das 19h"],
      },
      operacao: {
        atividadesAtrasadasQuantidade: 0,
        tarefasPendentesQuantidade: 2,
        alertasEstoqueQuantidade: 1,
        pendenciasFornecedoresQuantidade: 0,
        problemasConciliacaoQuantidade: 0,
        alertasOperacionais: ["Estoque de insumo X abaixo do ponto de reposição"],
      },
      recomendaçõesResumo: ["Rever margem de combos", "Acompanhar estoque de insumos"],
    };

    const mockRecommendations: ExecutiveRecommendation[] = [
      {
        numero: 1,
        titulo: "Oportunidade no Combo Noturno",
        problemaOuOportunidade: "O Hambúrguer Clássico responde por 48% das vendas das segundas-feiras.",
        evidencia: "25 unidades vendidas ontem, crescimento de 12% vs média.",
        impactoEstimado: "+ R$ 450,00 semanais de margem bruta adicional",
        grauConfianca: "alto",
        acaoRecomendada: "Criar combo com bebida de margem 75% no PDV e delivery.",
      },
    ];

    const report: CeoExecutiveReport = {
      id: "report-uuid-1",
      workspace_id: "ws-1",
      owner_id: "owner-1",
      reference_date: "2026-11-09",
      generated_at: new Date().toISOString(),
      period_type: "daily",
      period_start: "2026-11-09T00:00:00.000Z",
      period_end: "2026-11-09T23:59:59.999Z",
      financial_indicators: mockIndicators,
      executive_summary: "Desempenho sólido de segunda-feira com faturamento acima da média semanal.",
      recommendations: mockRecommendations,
      status: "completed",
      sources_consulted: ["eyemobile", "despesas", "fichas_tecnicas"],
      data_quality_alerts: [],
      ai_model: "gemini-1.5-pro",
      ai_tokens_used: 1200,
      ai_estimated_cost_usd: 0.0045,
      dispatch_status: { app: true, telegram: true },
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(report.status).toBe("completed");
    expect(report.financial_indicators.faturamento.faturamentoOntem).toBe(1540.5);
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0].grauConfianca).toBe("alto");
  });

  describe("Regras de Idempotência e Unicidade", () => {
    it("deve compor a chave única de versão do relatório", () => {
      const workspaceId = "ws-alpha";
      const referenceDate = "2026-11-09";
      const periodType = "daily";
      const version = 1;

      const idempotencyKey = `${workspaceId}:${referenceDate}:${periodType}:v${version}`;
      expect(idempotencyKey).toBe("ws-alpha:2026-11-09:daily:v1");
    });
  });
});
