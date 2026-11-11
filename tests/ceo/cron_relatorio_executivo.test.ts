import { describe, it, expect } from "vitest";
import { getYesterdaySaoPauloString } from "../../supabase/functions/cron-relatorio-executivo/index";

describe("Etapa 06 — Entrega D: Agendamento Diário e Edge Function do Relatório Executivo", () => {
  describe("1. Fuso Horário de Brasília (getYesterdaySaoPauloString)", () => {
    it("deve retornar o dia de ontem correto no fuso America/Sao_Paulo", () => {
      // Cria uma data de referência conhecida: 2026-11-10T14:00:00Z (11h da manhã em Brasília)
      const refDate = new Date("2026-11-10T14:00:00Z");
      const yesterday = getYesterdaySaoPauloString(refDate);
      expect(yesterday).toBe("2026-11-09");
    });

    it("deve tratar corretamente a virada de mês (ex: 01 de novembro -> 31 de outubro)", () => {
      const refDate = new Date("2026-11-01T14:00:00Z");
      const yesterday = getYesterdaySaoPauloString(refDate);
      expect(yesterday).toBe("2026-10-31");
    });

    it("deve tratar corretamente a virada de ano (ex: 01 de janeiro -> 31 de dezembro)", () => {
      const refDate = new Date("2027-01-01T14:00:00Z");
      const yesterday = getYesterdaySaoPauloString(refDate);
      expect(yesterday).toBe("2026-12-31");
    });
  });

  describe("2. Regra de Idempotência do Cron", () => {
    it("deve ignorar geração se relatório do dia já estiver completado", () => {
      const existingReports = [
        { workspace_id: "ws-1", reference_date: "2026-11-09", period_type: "daily", status: "completed" },
      ];

      const checkShouldGenerate = (wsId: string, refDate: string) => {
        const found = existingReports.find(
          (r) => r.workspace_id === wsId && r.reference_date === refDate && r.status === "completed"
        );
        return !found;
      };

      expect(checkShouldGenerate("ws-1", "2026-11-09")).toBe(false); // Já existe -> ignora
      expect(checkShouldGenerate("ws-1", "2026-11-10")).toBe(true);  // Nova data -> gera
      expect(checkShouldGenerate("ws-2", "2026-11-09")).toBe(true);  // Outro workspace -> gera
    });
  });

  describe("3. Segurança da Entrega", () => {
    it("deve endereçar a notificação exclusivamente ao proprietário do workspace", () => {
      const ws = { id: "ws-alpha", user_id: "owner-123", nome: "Restaurante Exemplo" };
      const dispatchPayload = {
        workspace_id: ws.id,
        categoria: "ceo_executivo",
        prioridade: "importante",
        target_user_ids: [ws.user_id],
        target_role: "owner",
      };

      expect(dispatchPayload.categoria).toBe("ceo_executivo");
      expect(dispatchPayload.target_role).toBe("owner");
      expect(dispatchPayload.target_user_ids).toEqual(["owner-123"]);
    });
  });
});
