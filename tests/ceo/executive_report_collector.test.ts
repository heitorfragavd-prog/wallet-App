import { describe, it, expect, vi } from "vitest";
import {
  deduplicateRevenuesCollector,
  getDiaSemanaNome,
  collectExecutiveReportIndicators,
} from "../../supabase/functions/_shared/executive-report-collector";

describe("Etapa 06 — Entrega B: Coleta e Cálculo Determinístico dos Indicadores", () => {
  describe("1. Deduplicação de Receitas (deduplicateRevenuesCollector)", () => {
    it("deve remover vendas repetidas sincronizadas pelo Eyemobile", () => {
      const transacoes = [
        { id: "t1", tipo: "receita", valor: 100, data: "2026-11-09", observacoes: "Venda: #1001" },
        { id: "t2", tipo: "receita", valor: 100, data: "2026-11-09", observacoes: "Venda: #1001" }, // Duplicada
        { id: "t3", tipo: "receita", valor: 250, data: "2026-11-09", descricao: "Venda Eyemobile #1002" },
        { id: "t4", tipo: "receita", valor: 80, data: "2026-11-09", deduplication_key: "sale-999" },
        { id: "t5", tipo: "receita", valor: 80, data: "2026-11-09", deduplication_key: "sale-999" }, // Duplicada
      ];

      const resultado = deduplicateRevenuesCollector(transacoes);
      expect(resultado).toHaveLength(3);
      expect(resultado.map((r) => r.id)).toEqual(["t1", "t3", "t4"]);
    });
  });

  describe("2. Identificação de Dia da Semana", () => {
    it("deve mapear corretamente as datas para o dia da semana em português", () => {
      // 2026-11-09 é uma segunda-feira
      expect(getDiaSemanaNome("2026-11-09")).toBe("Segunda-feira");
      expect(getDiaSemanaNome("2026-11-08")).toBe("Domingo");
      expect(getDiaSemanaNome("2026-11-07")).toBe("Sábado");
    });
  });

  describe("3. Coletor de Indicadores com Mock Supabase", () => {
    it("deve processar e consolidar os blocos com precisão matemática", async () => {
      const mockSupabaseAdmin = {
        from: vi.fn((table: string) => {
          if (table === "transacoes") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn(() =>
                Promise.resolve({
                  data: [
                    { id: "t1", tipo: "receita", valor: 500, data: "2026-11-09", itens: [{ nome: "Burger", quantidade: 10, valor_total: 500 }] },
                    { id: "t2", tipo: "receita", valor: 300, data: "2026-11-09", itens: [{ nome: "Fritas", quantidade: 15, valor_total: 300 }] },
                    { id: "t3", tipo: "receita", valor: 1200, data: "2026-11-02" }, // Segunda-feira anterior (W-1)
                    { id: "t4", tipo: "receita", valor: 2000, data: "2026-10-15" }, // Mês anterior
                  ],
                  error: null,
                })
              ),
            };
          }

          if (table === "despesas") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              lte: vi.fn(() =>
                Promise.resolve({
                  data: [
                    { id: "d1", descricao: "Energia", valor: 400, data: "2026-11-09", pago: true },
                    { id: "d2", descricao: "Insumos", valor: 600, data: "2026-11-05", pago: false },
                  ],
                  error: null,
                })
              ),
            };
          }

          if (table === "dividas") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn(() =>
                Promise.resolve({
                  data: [
                    { id: "div1", descricao: "Fornecedor Carne", valor_total: 1500, valor_restante: 1500, data_vencimento: "2026-11-01", status: "pendente" }, // Vencida
                    { id: "div2", descricao: "Boleto Bebidas", valor_total: 800, valor_restante: 800, data_vencimento: "2026-11-12", status: "pendente" }, // A vencer em 7 dias
                  ],
                  error: null,
                })
              ),
            };
          }

          if (table === "fichas_tecnicas") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn(() => Promise.resolve({ data: [{ id: "f1", produto_id: "p1", custo_total: 15 }], error: null })),
            };
          }

          if (table === "lembretes") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
            };
          }

          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          };
        }),
      };

      const result = await collectExecutiveReportIndicators(mockSupabaseAdmin, {
        workspaceId: "ws-test",
        referenceDate: "2026-11-09",
      });

      expect(result.indicators.faturamento.faturamentoOntem).toBe(800); // 500 + 300
      expect(result.indicators.faturamento.pedidosOntem).toBe(2);
      expect(result.indicators.faturamento.ticketMedioOntem).toBe(400);

      expect(result.indicators.despesas.despesasOntem).toBe(400);
      expect(result.indicators.despesas.despesasPagasMes).toBe(400);
      expect(result.indicators.despesas.despesasPendentesMes).toBe(600);

      expect(result.indicators.despesas.contasVencidasQuantidade).toBe(1);
      expect(result.indicators.despesas.contasVencidasValor).toBe(1500);
      expect(result.indicators.despesas.contasVencer7DiasQuantidade).toBe(1);
      expect(result.indicators.despesas.contasVencer7DiasValor).toBe(800);

      expect(result.indicators.resultado.resultadoOperacional).toBe(1000); // Faturamento mês (500+300+1200=2000) - Despesas (1000)
      expect(result.indicators.produtos.top5Faturamento[0].nome).toBe("Burger");
      expect(result.indicators.produtos.top5Faturamento[0].faturamento).toBe(500);
    });
  });
});
