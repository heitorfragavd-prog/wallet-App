import { describe, it, expect } from "vitest";
import { formatarDataParaSaoPaulo, getHojeSaoPaulo, formatarData } from "./dateHelpers";

describe("dateHelpers — fuso America/Sao_Paulo", () => {
  describe("formatarDataParaSaoPaulo", () => {
    it("converte timestamp UTC de 02:30Z (23:30 em SP) para o dia anterior (2026-09-03)", () => {
      const resultado = formatarDataParaSaoPaulo("2026-09-04T02:30:00.000Z");
      expect(resultado).toBe("2026-09-03");
    });

    it("converte timestamp UTC de 02:59:59.999Z para o dia anterior (2026-09-03)", () => {
      const resultado = formatarDataParaSaoPaulo("2026-09-04T02:59:59.999Z");
      expect(resultado).toBe("2026-09-03");
    });

    it("converte timestamp UTC de 03:00:00.000Z para o dia atual (2026-09-04)", () => {
      const resultado = formatarDataParaSaoPaulo("2026-09-04T03:00:00.000Z");
      expect(resultado).toBe("2026-09-04");
    });

    it("converte timestamp UTC de 23:30Z para o mesmo dia em São Paulo", () => {
      const resultado = formatarDataParaSaoPaulo("2026-09-04T23:30:00.000Z");
      expect(resultado).toBe("2026-09-04");
    });

    it("preserva valores que já sÿo apenas data YYYY-MM-DD sem recuo", () => {
      expect(formatarDataParaSaoPaulo("2026-09-03")).toBe("2026-09-03");
      expect(formatarDataParaSaoPaulo("2026-09-04")).toBe("2026-09-04");
      expect(formatarDataParaSaoPaulo("2026-01-01")).toBe("2026-01-01");
      expect(formatarDataParaSaoPaulo("2026-12-31")).toBe("2026-12-31");
    });

    it("suporta objetos Date válidos", () => {
      const date = new Date("2026-09-04T02:30:00.000Z");
      expect(formatarDataParaSaoPaulo(date)).toBe("2026-09-03");
    });

    it("trata valores nulos, vazios ou inválidos com fallback seguro sem crash", () => {
      expect(formatarDataParaSaoPaulo(null)).toBe("");
      expect(formatarDataParaSaoPaulo(undefined)).toBe("");
      expect(formatarDataParaSaoPaulo("")).toBe("");
      expect(formatarDataParaSaoPaulo("invalid-date")).toBe("");
      expect(formatarDataParaSaoPaulo(new Date(NaN))).toBe("");
    });
  });

  describe("getHojeSaoPaulo", () => {
    it("retorna uma data no formato YYYY-MM-DD", () => {
      const hoje = getHojeSaoPaulo();
      expect(hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("formatarData", () => {
    it("formata string YYYY-MM-DD para DD/MM/YYYY", () => {
      expect(formatarData("2026-09-03")).toBe("03/09/2026");
      expect(formatarData("")).toBe("");
    });
  });
});
