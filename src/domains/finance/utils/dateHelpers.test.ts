import { describe, it, expect } from "vitest";
import {
  formatarDataParaSaoPaulo,
  getHojeSaoPaulo,
  calcularTotalReceitasDoDia,
  formatarData,
  TIMEZONE_SP,
} from "./dateHelpers";

describe("dateHelpers — timezone America/Sao_Paulo e cálculo de receitas", () => {
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

  describe("calcularTotalReceitasDoDia", () => {
    it("calcula soma de receitas do dia respeitando timezone SP", () => {
      const receitas = [
        { data: "2026-09-07", valor: 100 },
        { data: "2026-09-07T15:00:00.000Z", valor: 200 },
        { data: "2026-09-08T01:25:00.000Z", valor: 50 }, // 22:25 de 07/09 em SP!
        { data: "2026-09-07T02:00:00.000Z", valor: 70 }, // 23:00 de 06/09 em SP!
      ];

      // Para referência 2026-09-07: 100 + 200 + 50 = 350 (exclui 70 que é de 06/09 em SP)
      const total = calcularTotalReceitasDoDia(receitas, "2026-09-07");
      expect(total).toBe(350);
    });

    it("retorna 0 para lista vazia ou nula", () => {
      expect(calcularTotalReceitasDoDia([])).toBe(0);
      expect(calcularTotalReceitasDoDia(null as unknown as [])).toBe(0);
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
