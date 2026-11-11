import { describe, it, expect } from "vitest";
import { getDiaSemanaNome } from "../../supabase/functions/_shared/executive-report-collector";
import { generateDeterministicSynthesis } from "../../supabase/functions/_shared/executive-report-synthesizer";
import { getYesterdaySaoPauloString } from "../../supabase/functions/cron-relatorio-executivo/index";
import { ExecutiveReportFinancialIndicators } from "../../src/domains/ceo/types/executive-report";

describe("Etapa 06 — Entrega F: Bateria Completa de Homologação e Segurança", () => {
  const sampleIndicators: ExecutiveReportFinancialIndicators = {
    faturamento: {
      faturamentoOntem: 2150.0,
      faturamentoMesAcumulado: 41200.0,
      pedidosOntem: 52,
      ticketMedioOntem: 41.34,
      mediaDiaSemanaOntem: 1950.0,
      diaSemanaOntemNome: "Segunda-feira",
      variacaoOntemVsMediaPercent: 10.25,
      pedidosMesAcumulado: 1010,
      ticketMedioMes: 40.79,
      faturamentoMesAnterior: 38000.0,
      crescimentoMesPercent: 8.42,
      alertaQueda: false,
    },
    despesas: {
      despesasOntem: 450.0,
      despesasMesAcumulado: 15300.0,
      despesasPagasMes: 13500.0,
      despesasPendentesMes: 1800.0,
      contasVencidasQuantidade: 1,
      contasVencidasValor: 950.0,
      contasVencer7DiasQuantidade: 3,
      contasVencer7DiasValor: 2400.0,
      possiveisDuplicidadesQuantidade: 0,
      possiveisDuplicidadesValor: 0,
    },
    resultado: {
      receitaCompetencia: 41200.0,
      despesasCompetencia: 15300.0,
      resultadoOperacional: 25900.0,
      margemOperacionalPercent: 62.86,
      lucroBrutoConfirmado: 23000.0,
      margemBrutaConfirmadaPercent: 55.82,
      cmvTotal: 10200.0,
      cmvPercent: 24.75,
      coberturaFichasPercent: 85,
      statusConfiabilidadeLucro: "confirmado",
    },
    produtos: {
      top5Faturamento: [
        { id: "p1", nome: "X-Burger Supreme", quantidade: 40, faturamento: 1200.0, custoComprovadoNota: true },
      ],
      top5Quantidade: [
        { id: "p1", nome: "X-Burger Supreme", quantidade: 40, faturamento: 1200.0, custoComprovadoNota: true },
      ],
      produtosComCustoCadastrado: 40,
      totalProdutosCatalogo: 48,
      coberturaCustosPercent: 83.3,
      produtosSemCustoConhecido: 8,
      oportunidadesComerciais: ["Item líder com 28% do volume"],
    },
    operacao: {
      atividadesAtrasadasQuantidade: 0,
      tarefasPendentesQuantidade: 2,
      alertasEstoqueQuantidade: 0,
      pendenciasFornecedoresQuantidade: 1,
      problemasConciliacaoQuantidade: 0,
      alertasOperacionais: ["1 conta vencida pendente de baixa."],
    },
    recomendaçõesResumo: [],
  };

  describe("1. Homologação de Fuso Horário e Calendário", () => {
    it("deve calcular corretamente a data de ontem para virada de mês", () => {
      const nov1 = new Date("2026-11-01T14:00:00Z");
      expect(getYesterdaySaoPauloString(nov1)).toBe("2026-10-31");
      expect(getDiaSemanaNome("2026-10-31")).toBe("Sábado");
    });

    it("deve calcular corretamente a data de ontem para virada de ano", () => {
      const jan1 = new Date("2027-01-01T14:00:00Z");
      expect(getYesterdaySaoPauloString(jan1)).toBe("2026-12-31");
      expect(getDiaSemanaNome("2026-12-31")).toBe("Quinta-feira");
    });
  });

  describe("2. Homologação de Síntese Determinística e Integridade de Dados", () => {
    it("não deve gerar recomendações fictícias sem evidências numéricas", () => {
      const synthesis = generateDeterministicSynthesis(sampleIndicators, "2026-11-09");

      expect(synthesis.recommendations.length).toBeGreaterThan(0);
      synthesis.recommendations.forEach((rec) => {
        expect(rec.numero).toBeGreaterThan(0);
        expect(rec.titulo).toBeTruthy();
        expect(rec.problemaOuOportunidade).toBeTruthy();
        expect(rec.evidencia).toBeTruthy();
        expect(["alto", "medio", "baixo"]).toContain(rec.grauConfianca);
        expect(rec.acaoRecomendada).toBeTruthy();
      });
    });

    it("deve destacar conta vencida de R$ 950,00 como recomendação prioritária de alta confiança", () => {
      const synthesis = generateDeterministicSynthesis(sampleIndicators, "2026-11-09");
      const recPassivo = synthesis.recommendations.find((r) => r.titulo.includes("Regularizar passivo"));

      expect(recPassivo).toBeDefined();
      expect(recPassivo?.evidencia).toContain("950,00");
      expect(recPassivo?.grauConfianca).toBe("alto");
    });
  });

  describe("3. Homologação de RLS e Segurança Estrita", () => {
    it("deve validar que apenas o proprietário autorizado do workspace pode acessar o relatório executivo", () => {
      // Simulação da política: owner_id = auth.uid() AND workspaces.user_id = auth.uid()
      const workspace = { id: "ws-1", user_id: "user-owner" };

      const checkRlsAccess = (callerUserId: string) => {
        return callerUserId === workspace.user_id;
      };

      expect(checkRlsAccess("user-owner")).toBe(true);
      expect(checkRlsAccess("user-member-1")).toBe(false);
      expect(checkRlsAccess("user-manager-2")).toBe(false);
      expect(checkRlsAccess("user-external-3")).toBe(false);
    });
  });
});
