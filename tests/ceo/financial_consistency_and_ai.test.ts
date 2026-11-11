import { describe, it, expect, vi, beforeEach } from "vitest";
import { synthesizeExecutiveReport } from "../../supabase/functions/_shared/executive-report-synthesizer";
import { collectExecutiveReportIndicators } from "../../supabase/functions/_shared/executive-report-collector";
import { ExecutiveReportFinancialIndicators } from "../../supabase/functions/_shared/executive-report-types";

describe("Gate 2 e Gate 3 — Modelo de IA Atualizado e Consistência Financeira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gate 2: Síntese com Gemini 2.5 Flash", () => {
    it("deve utilizar gemini-2.5-flash com cálculo de tokens e custo conforme tabela", async () => {
      const aiResponsePayload = {
        executiveSummary: "Faturamento estável de R$ 5.000,00 com 30 pedidos.",
        recommendations: [
          {
            numero: 1,
            titulo: "Otimizar cardápio",
            problemaOuOportunidade: "Oportunidade de combo",
            evidencia: "Item líder gerou R$ 2.000,00",
            impactoEstimado: "R$ 300,00 / dia",
            grauConfianca: "alto" as const,
            acaoRecomendada: "Criar combo promocional",
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(aiResponsePayload) }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 400,
            candidatesTokenCount: 100,
            totalTokenCount: 500,
          },
        }),
      });

      // @ts-expect-error Mock global fetch
      global.fetch = mockFetch;

      const dummyIndicators = {
        faturamento: {
          faturamentoOntem: 1500,
          faturamentoMesAcumulado: 12000,
          pedidosOntem: 15,
          ticketMedioOntem: 100,
          mediaDiaSemanaOntem: 1400,
          diaSemanaOntemNome: "Segunda-feira",
          variacaoOntemVsMediaPercent: 7.1,
          pedidosMesAcumulado: 120,
          ticketMedioMes: 100,
          faturamentoMesAnterior: 10000,
          crescimentoMesPercent: 20,
          alertaQueda: false,
          mensagemAlerta: null,
        },
        despesas: {
          despesasOntem: 500,
          despesasMesAcumulado: 8000,
          despesasPagasMes: 7000,
          despesasPendentesMes: 1000,
          contasVencidasQuantidade: 0,
          contasVencidasValor: 0,
          contasVencer7DiasQuantidade: 2,
          contasVencer7DiasValor: 800,
          possiveisDuplicidadesQuantidade: 0,
          possiveisDuplicidadesValor: 0,
          alertaDespesasExtraordinarias: null,
        },
        resultado: {
          receitaCompetencia: 12000,
          despesasCompetencia: 8000,
          resultadoOperacional: 4000,
          margemOperacionalPercent: 33.3,
          lucroBrutoConfirmado: null,
          margemBrutaConfirmadaPercent: null,
          cmvTotal: null,
          cmvPercent: null,
          coberturaFichasPercent: 50,
          statusConfiabilidadeLucro: "parcial" as const,
          motivoConfiabilidade: "Custos apurados parcialmente.",
        },
        produtos: {
          top5Faturamento: [{ id: "1", nome: "Hambúrguer", quantidade: 50, faturamento: 2000, custoComprovadoNota: true }],
          top5Quantidade: [{ id: "1", nome: "Hambúrguer", quantidade: 50, faturamento: 2000, custoComprovadoNota: true }],
          produtosComCustoCadastrado: 5,
          totalProdutosCatalogo: 10,
          coberturaCustosPercent: 50,
          produtosSemCustoConhecido: 5,
          oportunidadesComerciais: [],
        },
        operacao: {
          lembretesPendentesQuantidade: 1,
          atividadesAtrasadasQuantidade: 0,
          statusIntegridadePDV: "normal" as const,
          fichasTecnicasAtualizadas: true,
          recomendaçõesResumo: [],
        },
      } as ExecutiveReportFinancialIndicators;

      const result = await synthesizeExecutiveReport({
        indicators: dummyIndicators,
        referenceDate: "2026-11-09",
        workspaceId: "ws-test",
        geminiApiKey: "fake-key",
      });

      expect(result.status).toBe("completed");
      expect(result.aiModel).toBe("gemini-2.5-flash");
      expect(result.aiTokensUsed).toBe(500);
      expect(result.aiEstimatedCostUsd).toBe(0.00006);
      expect(result.recommendations).toHaveLength(1);
    });

    it("deve acionar fallback determinístico em caso de erro 429 (quota excedida) ou 503", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      // @ts-expect-error Mock global fetch
      global.fetch = mockFetch;

      const dummyIndicators = {
        faturamento: {
          faturamentoOntem: 1000,
          faturamentoMesAcumulado: 5000,
          pedidosOntem: 10,
          ticketMedioOntem: 100,
          mediaDiaSemanaOntem: 1200,
          diaSemanaOntemNome: "Segunda-feira",
          variacaoOntemVsMediaPercent: -16.6,
          pedidosMesAcumulado: 50,
          ticketMedioMes: 100,
          faturamentoMesAnterior: 4500,
          crescimentoMesPercent: 11.1,
          alertaQueda: true,
          mensagemAlerta: "Queda de faturamento",
        },
        despesas: {
          despesasOntem: 200,
          despesasMesAcumulado: 3000,
          despesasPagasMes: 2500,
          despesasPendentesMes: 500,
          contasVencidasQuantidade: 0,
          contasVencidasValor: 0,
          contasVencer7DiasQuantidade: 0,
          contasVencer7DiasValor: 0,
          possiveisDuplicidadesQuantidade: 0,
          possiveisDuplicidadesValor: 0,
          alertaDespesasExtraordinarias: null,
        },
        resultado: {
          receitaCompetencia: 5000,
          despesasCompetencia: 3000,
          resultadoOperacional: 2000,
          margemOperacionalPercent: 40,
          lucroBrutoConfirmado: null,
          margemBrutaConfirmadaPercent: null,
          cmvTotal: null,
          cmvPercent: null,
          coberturaFichasPercent: 0,
          statusConfiabilidadeLucro: "dados_insuficientes" as const,
          motivoConfiabilidade: "Fichas técnicas não cadastradas.",
        },
        produtos: {
          top5Faturamento: [],
          top5Quantidade: [],
          produtosComCustoCadastrado: 0,
          totalProdutosCatalogo: 5,
          coberturaCustosPercent: 0,
          produtosSemCustoConhecido: 5,
          oportunidadesComerciais: [],
        },
        operacao: {
          lembretesPendentesQuantidade: 0,
          atividadesAtrasadasQuantidade: 0,
          statusIntegridadePDV: "normal" as const,
          fichasTecnicasAtualizadas: false,
          recomendaçõesResumo: [],
        },
      } as ExecutiveReportFinancialIndicators;

      const result = await synthesizeExecutiveReport({
        indicators: dummyIndicators,
        referenceDate: "2026-11-09",
        workspaceId: "ws-test",
        geminiApiKey: "fake-key",
      });

      expect(result.status).toBe("fallback_deterministic");
      expect(result.aiModel).toBe("deterministic_engine_v1");
      expect(result.dataQualityAlerts[0]).toContain("Gemini temporariamente indisponível ou limite de cota atingido");
      expect(result.executiveSummary).toContain("Relatório Executivo referente a 2026-11-09");
    });
  });

  describe("Gate 3: Consistência Financeira e Catálogo Real", () => {
    it("deve calcular cobertura de fichas sobre catálogo real sem hardcode de 50 produtos", async () => {
      const mockProdsEyemobile = Array.from({ length: 60 }, (_, i) => ({
        codigo: `em-${i}`,
        descricao: `Produto EM ${i}`,
        custo_atual: 10,
        preco_venda: 25,
      }));

      const mockProdsGerais = Array.from({ length: 40 }, (_, i) => ({
        id: `pg-${i}`,
        nome: `Produto Geral ${i}`,
        preco: 30,
        preco_custo: 12,
      }));

      const mockFichas = Array.from({ length: 15 }, (_, i) => ({
        id: `f-${i}`,
        produto_id: `em-${i}`,
        custo_total: 10,
      }));

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: mockProdsEyemobile, error: null }),
            };
          }
          if (table === "produtos") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: mockProdsGerais, error: null }),
            };
          }
          if (table === "fichas_tecnicas") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({ data: mockFichas, error: null }),
            };
          }
          const builder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          };
          return builder;
        }),
      };

      const { indicators } = await collectExecutiveReportIndicators(mockAdmin, {
        workspaceId: "ws-1",
        referenceDate: "2026-11-09",
      });

      expect(indicators.produtos.totalProdutosCatalogo).toBe(60);
      expect(indicators.produtos.produtosComCustoCadastrado).toBe(15);
      expect(indicators.produtos.coberturaCustosPercent).toBe(25);
      expect(indicators.resultado.coberturaFichasPercent).toBe(25);
      expect(indicators.resultado.statusConfiabilidadeLucro).toBe("parcial");
    });

    it("deve marcar 'dados_insuficientes' quando não houver fichas cadastradas", async () => {
      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === "produtos_eyemobile") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [{ codigo: "p1" }], error: null }) };
          }
          if (table === "produtos") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
          }
          if (table === "fichas_tecnicas") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
          }
          const builder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          };
          return builder;
        }),
      };

      const { indicators } = await collectExecutiveReportIndicators(mockAdmin, {
        workspaceId: "ws-1",
        referenceDate: "2026-11-09",
      });

      expect(indicators.resultado.coberturaFichasPercent).toBe(0);
      expect(indicators.resultado.statusConfiabilidadeLucro).toBe("dados_insuficientes");
      expect(indicators.resultado.motivoConfiabilidade).toContain("Fichas técnicas não cadastradas");
    });

    it("deve comparar faturamento do mês com período equivalente do mês anterior (MTD vs MTD equivalente)", async () => {
      const mockTransacoes = [
        { id: "t-nov-1", tipo: "receita", valor: 1000, data: "2026-11-05" },
        { id: "t-nov-2", tipo: "receita", valor: 1500, data: "2026-11-09" },
        { id: "t-out-1", tipo: "receita", valor: 1000, data: "2026-10-04" },
        { id: "t-out-2", tipo: "receita", valor: 1000, data: "2026-10-08" },
        { id: "t-out-later", tipo: "receita", valor: 10000, data: "2026-10-25" },
      ];

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === "transacoes") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn().mockResolvedValue({ data: mockTransacoes, error: null }),
            };
          }
          const builder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          };
          return builder;
        }),
      };

      const { indicators } = await collectExecutiveReportIndicators(mockAdmin, {
        workspaceId: "ws-1",
        referenceDate: "2026-11-09",
      });

      expect(indicators.faturamento.faturamentoMesAcumulado).toBe(2500);
      expect(indicators.faturamento.faturamentoMesAnterior).toBe(2000);
      expect(indicators.faturamento.crescimentoMesPercent).toBe(25);
    });
  });
});
