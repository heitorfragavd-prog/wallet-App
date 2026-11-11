import { describe, it, expect } from "vitest";
import {
  isAbruptStreamRewind,
  isArchivedTailTransaction,
  toSaoPauloDateString,
} from "../../supabase/functions/_shared/eyemobile-sequence-guard";

describe("eyemobile-sequence-guard (Blindagem Temporal Agnóstica a Anos)", () => {
  describe("isAbruptStreamRewind (Detecção de Quebra Temporal no Stream)", () => {
    it("deve permitir fluxo cronológico normal no mesmo ano (novembro/2026)", () => {
      const prev = "2026-11-10T20:00:00.000Z";
      const curr = "2026-11-10T20:15:00.000Z";
      expect(isAbruptStreamRewind(curr, prev)).toBe(false);
    });

    it("deve permitir virada de ano de 31/12/2026 para 01/01/2027 sem falso positivo", () => {
      const prev = "2026-12-31T23:55:00.000Z";
      const curr = "2027-01-01T00:10:00.000Z";
      expect(isAbruptStreamRewind(curr, prev)).toBe(false);
    });

    it("deve permitir fluxo em janeiro/2027 normalmente", () => {
      const prev = "2027-01-05T14:00:00.000Z";
      const curr = "2027-01-05T15:30:00.000Z";
      expect(isAbruptStreamRewind(curr, prev)).toBe(false);
    });

    it("deve permitir pequenas variações de relógio (até alguns dias entre turnos ou syncs)", () => {
      const prev = "2026-11-10T18:00:00.000Z";
      const curr = "2026-11-09T18:00:00.000Z"; // 1 dia atrás
      expect(isAbruptStreamRewind(curr, prev)).toBe(false);
    });

    it("deve detectar salto abrupto da esteira contemporânea (2026-11-10) para a cauda arquivada (2025-11-20)", () => {
      const prev = "2026-11-10T23:17:43.000Z";
      const curr = "2025-11-20T07:10:15.000Z"; // 355 dias para trás!
      expect(isAbruptStreamRewind(curr, prev)).toBe(true);
    });

    it("deve detectar salto abrupto em janeiro/2027 para a cauda arquivada de 2025", () => {
      const prev = "2027-01-10T12:00:00.000Z";
      const curr = "2025-11-20T07:10:15.000Z"; // 416 dias para trás!
      expect(isAbruptStreamRewind(curr, prev)).toBe(true);
    });
  });

  describe("isArchivedTailTransaction (Busca Binária Agnóstica a Anos)", () => {
    it("não deve considerar cauda arquivada se a data for próxima à data alvo em 2026", () => {
      const targetStartDate = "2026-11-03";
      const checkTx = "2026-10-25T10:00:00.000Z"; // 9 dias antes
      expect(isArchivedTailTransaction(checkTx, targetStartDate)).toBe(false);
    });

    it("deve identificar cauda de 2025 como arquivada ao buscar novembro/2026", () => {
      const targetStartDate = "2026-11-03";
      const checkTx = "2025-11-20T07:10:15.000Z"; // ~348 dias antes
      expect(isArchivedTailTransaction(checkTx, targetStartDate)).toBe(true);
    });

    it("deve identificar cauda de 2025 como arquivada ao buscar janeiro/2027", () => {
      const targetStartDate = "2027-01-05";
      const checkTx = "2025-11-20T07:10:15.000Z"; // ~411 dias antes
      expect(isArchivedTailTransaction(checkTx, targetStartDate)).toBe(true);
    });

    it("não deve considerar transações de dezembro/2026 como cauda ao buscar janeiro/2027", () => {
      const targetStartDate = "2027-01-05";
      const checkTx = "2026-12-28T18:00:00.000Z"; // apenas 8 dias antes
      expect(isArchivedTailTransaction(checkTx, targetStartDate)).toBe(false);
    });
  });

  describe("toSaoPauloDateString", () => {
    it("converte timestamp UTC para data local America/Sao_Paulo (GMT-3)", () => {
      // 2026-11-11T01:30:00Z UTC corresponde a 2026-11-10 às 22:30 em SP
      expect(toSaoPauloDateString("2026-11-11T01:30:00.000Z")).toBe("2026-11-10");
      // 2026-11-11T04:30:00Z UTC corresponde a 2026-11-11 às 01:30 em SP
      expect(toSaoPauloDateString("2026-11-11T04:30:00.000Z")).toBe("2026-11-11");
    });
  });
});
