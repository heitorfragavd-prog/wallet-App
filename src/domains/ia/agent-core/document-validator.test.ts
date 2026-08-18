import { describe, expect, it } from "vitest";
import {
  validateCpfCnpj,
  validateLinhaDigitavel,
  validateNotaFiscalItemsSum,
  validateIsoDate,
} from "../../../../supabase/functions/_shared/ai/document-validator";

describe("Deterministic Document Validator", () => {
  describe("validateCpfCnpj", () => {
    it("deve validar CNPJ válido", () => {
      expect(validateCpfCnpj("00.000.000/0001-91")).toBe(true);
      expect(validateCpfCnpj("00000000000191")).toBe(true);
    });

    it("deve rejeitar CNPJ inválido", () => {
      expect(validateCpfCnpj("00.000.000/0001-00")).toBe(false);
      expect(validateCpfCnpj("11.111.111/1111-11")).toBe(false);
    });

    it("deve validar CPF válido", () => {
      // CPF conhecido válido para testes (ex: com dígitos verificadores corretos)
      expect(validateCpfCnpj("52998224725")).toBe(true);
    });

    it("deve rejeitar CPF inválido", () => {
      expect(validateCpfCnpj("123.456.789-00")).toBe(false);
      expect(validateCpfCnpj("111.111.111-11")).toBe(false);
    });
  });

  describe("validateLinhaDigitavel", () => {
    it("deve aceitar linha digitável de 47 dígitos numéricos", () => {
      const linha = "34191.79001 01043.510047 91020.150008 5 98150000015000";
      const result = validateLinhaDigitavel(linha);
      expect(result.valid).toBe(true);
      expect(result.normalized?.length).toBe(47);
    });

    it("deve rejeitar linha digitável com tamanho inválido", () => {
      const linha = "123456789";
      const result = validateLinhaDigitavel(linha);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateNotaFiscalItemsSum", () => {
    it("deve validar quando a soma dos itens for exatamente igual ao valor total", () => {
      const itens = [
        { valor_total: 100.50, descricao: "Item 1", quantidade: 1, valor_unitario: 100.50 },
        { valor_total: 49.50, descricao: "Item 2", quantidade: 1, valor_unitario: 49.50 },
      ];
      const result = validateNotaFiscalItemsSum(itens, 150.00);
      expect(result.valid).toBe(true);
      expect(result.calculatedSum).toBe(150.00);
    });

    it("deve acusar divergência quando a soma dos itens não bater com o total", () => {
      const itens = [
        { valor_total: 100.00, descricao: "Item 1", quantidade: 1, valor_unitario: 100.00 },
      ];
      const result = validateNotaFiscalItemsSum(itens, 150.00);
      expect(result.valid).toBe(false);
      expect(result.diff).toBe(50.00);
    });
  });

  describe("validateIsoDate", () => {
    it("deve validar datas no formato YYYY-MM-DD", () => {
      expect(validateIsoDate("2026-08-17")).toBe(true);
      expect(validateIsoDate("2026-02-28")).toBe(true);
    });

    it("deve rejeitar datas inválidas ou fora de formato", () => {
      expect(validateIsoDate("17/08/2026")).toBe(false);
      expect(validateIsoDate("2026-02-31")).toBe(false);
      expect(validateIsoDate("not-a-date")).toBe(false);
    });
  });
});
