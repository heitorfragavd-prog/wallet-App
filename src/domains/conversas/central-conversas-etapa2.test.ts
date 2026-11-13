import { describe, expect, it, vi } from "vitest";
import {
  determineShiftByTime,
  extractCashClosingFromTextDeterministic,
  extractTimeFromText,
  processFechamentoGrupoTurn,
} from "../../../supabase/functions/_shared/ai/group-governance";

describe("Central de Conversas — Etapa 2: Fechamento Automatizado & Governança", () => {
  describe("Regra de Turnos 13h30 & Extração de Horários", () => {
    it("classifica corretamente antes e a partir de 13h30", () => {
      expect(determineShiftByTime("08:00")).toBe("manha");
      expect(determineShiftByTime("11:45")).toBe("manha");
      expect(determineShiftByTime("13:29")).toBe("manha");
      expect(determineShiftByTime("13:30")).toBe("noite");
      expect(determineShiftByTime("13:31")).toBe("noite");
      expect(determineShiftByTime("19:00")).toBe("noite");
      expect(determineShiftByTime("23:15")).toBe("noite");
    });

    it("extrai horários em múltiplos formatos brasileiros", () => {
      expect(extractTimeFromText("Envelope fechado às 13:30")).toBe("13:30");
      expect(extractTimeFromText("Voucher emitido 13h30")).toBe("13:30");
      expect(extractTimeFromText("Cupom fiscal 09:15:42")).toBe("09:15");
      expect(extractTimeFromText("Turno tarde 18H45")).toBe("18:45");
      expect(extractTimeFromText("Sem horario informado")).toBeNull();
    });
  });

  describe("Classificação de Formas de Pagamento & Vouchers", () => {
    it("reconhece comprovantes de voucher (VR, VA, Alimentação, Refeição, Sodexo, Ticket, Alelo, Ben)", () => {
      const text = `Fechamento Rodo Point 10/11/2026
Dinheiro: R$ 450,00
Pix: R$ 300,00
Débito: R$ 200,00
Crédito: R$ 150,00
Voucher: R$ 85,50
Sobra: R$ 0,00`;

      const parsed = extractCashClosingFromTextDeterministic(text);
      expect(parsed).not.toBeNull();
      expect(parsed?.dataFechamento).toBe("2026-11-10");
      expect(parsed?.envelopeTotal.dinheiro).toBe(450);
      expect(parsed?.envelopeTotal.pix).toBe(300);
      expect(parsed?.envelopeTotal.debito).toBe(200);
      expect(parsed?.envelopeTotal.credito).toBe(150);
      expect(parsed?.envelopeTotal.voucher).toBe(85.5);
      expect(parsed?.envelopeTotal.total).toBe(1185.5);
      expect(parsed?.sobraInformada).toBe(0);
    });

    it("distribui voucher no Caixa 1 se horário for manhã (< 13h30) e Caixa 2 se for noite (>= 13h30)", () => {
      const textManha = "Fechamento Caixa 1 11:30 - Dinheiro: 100,00 Voucher: 40,00";
      const parsedManha = extractCashClosingFromTextDeterministic(textManha);
      expect(parsedManha?.turnoHint).toBe("manha");
      expect(parsedManha?.caixa1.voucher).toBe(40);
      expect(parsedManha?.envelopeTotal.voucher).toBe(40);

      const textNoite = "Fechamento Caixa 2 15:45 - Dinheiro: 250,00 Voucher: 65,00";
      const parsedNoite = extractCashClosingFromTextDeterministic(textNoite);
      expect(parsedNoite?.turnoHint).toBe("noite");
      expect(parsedNoite?.caixa2.voucher).toBe(65);
      expect(parsedNoite?.envelopeTotal.voucher).toBe(65);
    });
  });

  describe("Resposta Determinística no Telegram (Gate 4)", () => {
    it("produz exatamente a estrutura padronizada solicitada pelo usuário", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "fechamentos_caixa") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({ data: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "fech-test-123" } }),
                }),
              }),
            };
          }
          if (table === "transacoes") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: async () => ({
                      data: [
                        { id: "tx-1", valor: 100, metodo_pagamento: "dinheiro", observacoes: "Venda: #101" },
                        { id: "tx-2", valor: 50, metodo_pagamento: "pix", observacoes: "Venda: #102" },
                        { id: "tx-3", valor: 25, metodo_pagamento: "voucher", observacoes: "Venda: #103" },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const result = await processFechamentoGrupoTurn({
        supabase: mockSupabase as never,
        workspaceId: "ws-rodo-point",
        userId: "user-admin",
        userRole: "admin",
        grupoId: "grupo-fechamento",
        conversationId: "conv-fechamento",
        text: `🧾 Fechamento 11/11/2026
Dinheiro: R$ 100,00
Pix: R$ 50,00
Débito: R$ 0,00
Crédito: R$ 0,00
Voucher: R$ 25,00
Total: R$ 175,00
Sobra: R$ 0,00`,
      });

      expect(result.handled).toBe(true);
      expect(result.fechamentoId).toBe("fech-test-123");

      const lines = result.responseText.split("\n");
      expect(lines[0]).toBe("🧾 FECHAMENTO — RODO POINT");
      expect(lines[1]).toBe("📅 Data: 11/11/2026");
      expect(lines[2]).toContain("💵 Dinheiro: R$ 100,00");
      expect(lines[3]).toContain("💳 Débito: R$ 0,00");
      expect(lines[4]).toContain("💳 Crédito: R$ 0,00");
      expect(lines[5]).toContain("📲 Pix: R$ 50,00");
      expect(lines[6]).toContain("🎫 Voucher: R$ 25,00");
      expect(lines[7]).toContain("💰 Total: R$ 175,00");
      expect(lines[8]).toContain("📊 Sobra/Falta: R$ 0,00");
      expect(lines[9]).toBe("Status: Conferido");
      expect(result.responseText).toContain("🖥️ Eyemobile: R$ 175,00 (3 vendas apuradas)");
    });
  });

  describe("Acumulação Multi-Foto & Mesclagem Cumulativa (Gate 3)", () => {
    it("mescla Caixa 1 (Manhã) e Caixa 2 (Noite) atualizando o mesmo registro pendente", async () => {
      const existingRecord = {
        id: "fech-existing-456",
        data_fechamento: "2026-11-11",
        caixa1: { dinheiro: 200, voucher: 30, total: 230 },
        caixa2: {},
        envelope_total: { dinheiro: 200, voucher: 30, total: 230 },
        status: "pendente_conferencia",
        observacao: "Turno da manhã",
      };

      const updateSpy = vi.fn(() => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { id: "fech-existing-456" } }),
          }),
        }),
      }));

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "fechamentos_caixa") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({ data: existingRecord }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: updateSpy,
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "fech-existing-456" } }),
                }),
              }),
            };
          }
          if (table === "transacoes") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: async () => ({
                      data: [
                        { id: "tx-m1", valor: 230, metodo_pagamento: "dinheiro", observacoes: "Venda: #201" },
                        { id: "tx-n1", valor: 350, metodo_pagamento: "cartao_debito", observacoes: "Venda: #202" },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const result = await processFechamentoGrupoTurn({
        supabase: mockSupabase as never,
        workspaceId: "ws-rodo-point",
        userId: "user-operador",
        userRole: "operador",
        grupoId: "grupo-fechamento",
        conversationId: "conv-fechamento",
        text: `Caixa 2 Turno Noite 21:00
Débito: R$ 350,00
Total: R$ 350,00`,
      });

      expect(result.handled).toBe(true);
      expect(result.fechamentoId).toBe("fech-existing-456");
      expect(updateSpy).toHaveBeenCalled();

      // Verifica se a resposta combinou os dados de Caixa 1 e Caixa 2
      expect(result.responseText).toContain("💰 Total: R$ 580,00");
      expect(result.responseText).toContain("Status: Conferido");
    });
  });
});
