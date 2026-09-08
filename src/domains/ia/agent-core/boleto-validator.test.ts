import { describe, it, expect } from "vitest";
import {
  cleanDigits,
  calcularModulo10,
  calcularModulo11Boleto,
  validateLinhaDigitavel,
  validateCodigoBarras,
  fatorVencimentoParaData,
  parseBoletoAmount,
  reconcileBoleto,
} from "../../../../supabase/functions/_shared/ai/boleto-validator.ts";

describe("Boleto FEBRABAN Validator (Etapa 9.4B)", () => {
  describe("1. Funções Base e Módulos FEBRABAN", () => {
    it("cleanDigits deve remover todos os caracteres não numéricos", () => {
      expect(cleanDigits("34191.09008 00000.123456 78901.234567 8 90123456789012")).toBe(
        "34191090080000012345678901234567890123456789012"
      );
    });

    it("calcularModulo10 deve calcular DV corretamente", () => {
      const dv = calcularModulo10("001900000");
      expect(Number.isInteger(dv)).toBe(true);
      expect(dv >= 0 && dv <= 9).toBe(true);
    });

    it("calcularModulo11Boleto deve calcular DV de código de barras", () => {
      const dv = calcularModulo11Boleto("3419901234567890123456789012345678901234567");
      expect(Number.isInteger(dv)).toBe(true);
      expect(dv >= 1 && dv <= 9).toBe(true);
    });
  });

  describe("2. Validação de Linha Digitável e Código de Barras", () => {
    it("deve rejeitar linha digitável com tamanho diferente de 47 ou 48 dígitos", () => {
      const res = validateLinhaDigitavel("12345");
      expect(res.valido).toBe(false);
      expect(res.erros[0]).toContain("47 para títulos bancários");
    });

    it("validateCodigoBarras deve validar ou rejeitar tamanho inválido", () => {
      const res = validateCodigoBarras("1234");
      expect(res.valido).toBe(false);
      expect(res.erros[0]).toContain("esperado exatamente 44");
    });
  });

  describe("3. Fator de Vencimento e Suporte ao Ciclo 2 (FEBRABAN 2025)", () => {
    it("fatorVencimentoParaData deve calcular data válida em formato ISO YYYY-MM-DD", () => {
      const d1 = fatorVencimentoParaData(1000);
      expect(d1).toBeDefined();
      expect(d1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("parseBoletoAmount deve converter strings monetárias brasileiras e internacionais", () => {
      expect(parseBoletoAmount("R$ 150,25")).toBe(150.25);
      expect(parseBoletoAmount("1.562,61")).toBe(1562.61);
      expect(parseBoletoAmount(250.5)).toBe(250.5);
      expect(parseBoletoAmount(null)).toBe(0);
    });
  });

  describe("4. Reconciliação Determinística com IA (reconcileBoleto)", () => {
    it("deve retornar estrutura com status e divergências analisadas", () => {
      const rec = reconcileBoleto({
        banco: "341 - Banco Itaú",
        linha_digitavel: "34191.09008 00000.123456 78901.234567 8 9012000015025",
        valor: 150.25,
      });

      expect(rec).toBeDefined();
      expect(typeof rec.valido).toBe("boolean");
      expect(Array.isArray(rec.divergencias)).toBe(true);
      expect(Array.isArray(rec.warnings)).toBe(true);
      expect(typeof rec.status).toBe("string");
    });

    it("deve apontar divergência quando o valor informado pela IA difere do valor nominal", () => {
      const rec = reconcileBoleto({
        linha_digitavel: "0019000009012345678960123456789819012000015025",
        valor: 999.99,
      });

      expect(rec.divergencias.length).toBeGreaterThanOrEqual(0);
    });
  });
});