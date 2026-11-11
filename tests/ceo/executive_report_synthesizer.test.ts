import { describe, it, expect, vi } from "vitest";
import {
  generateDeterministicSynthesis,
  synthesizeExecutiveReport,
} from "../../supabase/functions/_shared/executive-report-synthesizer";
import { ExecutiveReportFinancialIndicators } from "../../src/domains/ceo/types/executive-report";

describe("Etapa 06 — Entrega C: Síntese Executiva Inteligente e Fallback Determinístico", () => {
  const baseIndicators: ExecutiveReportFinancialIndicators = {
    faturamento: {
      faturamentoOntem: 1200,
      faturamentoMesAcumulado: 25000,
      pedidosOntem: 30,
      ticketMedioOntem: 40,
      mediaDiaSemanaOntem: 1800,
      diaSemanaOntemNome: "Segunda-feira",
      variacaoOntemVsMediaPercent: -33.3,
      pedidosMesAcumulado: 620,
      ticketMedioMes: 40.32,
      faturamentoMesAnterior: 22000,
      crescimentoMesPercent: 13.6,
      alertaQueda: true,
      mensagemAlerta: "Queda de 33.3% em relação à média das Segundas-feiras anteriores.",
    },
    despesas: {
      despesasOntem: 500,
      despesasMesAcumulado: 12000,
      despesasPagasMes: 10000,
      despesasPendentesMes: 2000,
      contasVencidasQuantidade: 2,
      contasVencidasValor: 2400,
      contasVencer7DiasQuantidade: 3,
      contasVencer7DiasValor: 3500,
      possiveisDuplicidadesQuantidade: 0,
      possiveisDuplicidadesValor: 0,
    },
    resultado: {
      receitaCompetencia: 25000,
      despesasCompetencia: 12000,
      resultadoOperacional: 13000,
      margemOperacionalPercent: 52.0,
      lucroBrutoConfirmado: 15000,
      margemBrutaConfirmadaPercent: 60.0,
      cmvTotal: 10000,
      cmvPercent: 40.0,
      coberturaFichasPercent: 80,
      statusConfiabilidadeLucro: "confirmado",
    },
    produtos: {
      top5Faturamento: [
        { id: "p1", nome: "X-Burger Especial", quantidade: 80, faturamento: 2800, custoComprovadoNota: true },
      ],
      top5Quantidade: [
        { id: "p1", nome: "X-Burger Especial", quantidade: 80, faturamento: 2800, custoComprovadoNota: true },
      ],
      produtosComCustoCadastrado: 30,
      totalProdutosCatalogo: 35,
      coberturaCustosPercent: 85,
      produtosSemCustoConhecido: 5,
      oportunidadesComerciais: ["Item de maior faturamento: X-Burger Especial"],
    },
    operacao: {
      atividadesAtrasadasQuantidade: 1,
      tarefasPendentesQuantidade: 3,
      alertasEstoqueQuantidade: 0,
      pendenciasFornecedoresQuantidade: 2,
      problemasConciliacaoQuantidade: 0,
      alertasOperacionais: ["1 atividade atrasada."],
    },
    recomendaçõesResumo: [],
  };

  it("deve gerar síntese determinística completa sem invocar IA", () => {
    const result = generateDeterministicSynthesis(baseIndicators, "2026-11-09");

    expect(result.executiveSummary).toContain("Relatório Executivo referente a 2026-11-09");
    expect(result.executiveSummary).toContain("25.000,00");
    expect(result.recommendations.length).toBeGreaterThanOrEqual(3);

    // Deve conter recomendação sobre a queda na segunda-feira
    const recQueda = result.recommendations.find((r) => r.titulo.includes("Investigar oscilação"));
    expect(recQueda).toBeDefined();
    expect(recQueda?.grauConfianca).toBe("alto");

    // Deve conter recomendação sobre as contas vencidas
    const recContas = result.recommendations.find((r) => r.titulo.includes("Regularizar passivo vencido"));
    expect(recContas).toBeDefined();
    expect(recContas?.grauConfianca).toBe("alto");
  });

  it("deve ativar fallback determinístico transparentemente quando chave de IA não for fornecida", async () => {
    const result = await synthesizeExecutiveReport({
      indicators: baseIndicators,
      referenceDate: "2026-11-09",
      workspaceId: "ws-1",
    });

    expect(result.status).toBe("fallback_deterministic");
    expect(result.aiModel).toBe("deterministic_engine_v1");
    expect(result.executiveSummary).toBeTruthy();
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.dataQualityAlerts[0]).toContain("Chave de IA não informada");
  });

  it("deve ativar fallback resiliente caso chamada externa de IA retorne erro", async () => {
    // Mock global fetch para simular falha HTTP 500 no Gemini
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("Service Unavailable", { status: 503 }))
    );

    try {
      const result = await synthesizeExecutiveReport({
        indicators: baseIndicators,
        referenceDate: "2026-11-09",
        workspaceId: "ws-1",
        geminiApiKey: "fake-key",
      });

      expect(result.status).toBe("fallback_deterministic");
      expect(result.dataQualityAlerts[0]).toContain("Ativado Fallback Determinístico");
      expect(result.executiveSummary).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
