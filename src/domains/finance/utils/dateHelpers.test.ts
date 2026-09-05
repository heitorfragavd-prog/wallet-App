import { describe, it, expect } from "vitest";
import {
  formatarDataParaSaoPaulo,
  getHojeSaoPaulo,
  calcularTotalDespesasDoDia,
  formatarData,
  TIMEZONE_SP,
} from "./dateHelpers";

describe("dateHelpers — timezone America/Sao_Paulo e cálculo consolidado", () => {
  describe("TIMEZONE_SP", () => {
    it("utiliza America/Sao_Paulo como timezone oficial", () => {
      expect(TIMEZONE_SP).toBe("America/Sao_Paulo");
    });
  });

  describe("formatarDataParaSaoPaulo", () => {
    it("preserva string YYYY-MM-DD pura sem alteração", () => {
      expect(formatarDataParaSaoPaulo("2026-09-04")).toBe("2026-09-04");
      expect(formatarDataParaSaoPaulo("2026-01-01")).toBe("2026-01-01");
    });

    it("converte timestamp ISO UTC na madrugada (02:30 UTC) para o dia anterior em SP (23:30 SP)", () => {
      // 04/09 02:30 UTC = 03/09 23:30 em America/Sao_Paulo (UTC-3)
      expect(formatarDataParaSaoPaulo("2026-09-04T02:30:00.000Z")).toBe("2026-09-03");
    });

    it("converte timestamp ISO UTC à tarde (15:30 UTC) para a mesma data em SP (12:30 SP)", () => {
      expect(formatarDataParaSaoPaulo("2026-09-04T15:30:00.000Z")).toBe("2026-09-04");
    });

    it("converte timestamp ISO UTC do dia seguinte na madrugada (01:00 UTC) para o dia anterior em SP", () => {
      // 05/09 01:00 UTC = 04/09 22:00 em America/Sao_Paulo (UTC-3)
      expect(formatarDataParaSaoPaulo("2026-09-05T01:00:00.000Z")).toBe("2026-09-04");
    });

    it("trata valores nulos, vazios ou indefinidos retornando string vazia", () => {
      expect(formatarDataParaSaoPaulo(null)).toBe("");
      expect(formatarDataParaSaoPaulo(undefined)).toBe("");
      expect(formatarDataParaSaoPaulo("")).toBe("");
    });
  });

  describe("getHojeSaoPaulo", () => {
    it("retorna string no formato YYYY-MM-DD", () => {
      const hoje = getHojeSaoPaulo();
      expect(hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("calcularTotalDespesasDoDia", () => {
    it("calcula soma de despesas do dia ignorando despesas de outros dias", () => {
      const despesas = [
        { data: "2026-09-04", valor: 100.5 },
        { data: "2026-09-04T15:00:00.000Z", valor: 200 },
        { data: "2026-09-04T02:30:00.000Z", valor: 50 }, // em SP é 2026-09-03!
        { data: "2026-09-03", valor: 300 },
      ];

      // Para referência "2026-09-04": soma 100.5 + 200 = 300.50 (ignora 50 que é 03/09 e 300 que é 03/09)
      const total = calcularTotalDespesasDoDia(despesas, "2026-09-04");
      expect(total).toBe(300.5);
    });

    it("retorna 0 para lista vazia ou nula", () => {
      expect(calcularTotalDespesasDoDia([])).toBe(0);
      expect(calcularTotalDespesasDoDia(null as unknown as [])).toBe(0);
    });

    it("trata valores indefinidos ou nulos sem quebrar", () => {
      const despesas = [
        { data: "2026-09-04", valor: null },
        { data: "2026-09-04", valor: undefined },
        { data: "2026-09-04", valor: 150 },
      ];
      expect(calcularTotalDespesasDoDia(despesas, "2026-09-04")).toBe(150);
    });
  });

  describe("formatarData", () => {
    it("formata YYYY-MM-DD para dd/mm/aaaa", () => {
      expect(formatarData("2026-09-04")).toBe("04/09/2026");
    });

    it("formata ISO UTC respeitando timezone de São Paulo", () => {
      expect(formatarData("2026-09-04T02:30:00.000Z")).toBe("03/09/2026");
    });

    it("retorna vazio se input vazio", () => {
      expect(formatarData("")).toBe("");
    });
  });
});
