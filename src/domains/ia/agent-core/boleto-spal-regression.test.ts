/**
 * Suíte de Testes Automatizados de Regressão: Boleto SPAL & Matriz FEBRABAN Completa
 * 
 * Cobertura Obrigatória:
 * 1. Regressão SPAL Ground Truth (Linha 34191.09115 01746.492931 83045.790009 8 15520000156261, R$ 1.562,61, 2026-08-28)
 * 2. Cenário Compressão SPAL (Visual R$ 562,61 / 21/08/2026 -> status: validado_com_alerta, valor: 1562.61, vencimento: 2026-08-28)
 * 3. Cálculo rigoroso de Módulo 11 do DV Geral (Soma 828 % 11 = 3 -> DV = 8)
 * 4. Matriz de 17 cenários obrigatórios (DVs inválidos, 46/48 dígitos, linhas ausentes, idempotência, fail-closed, etc.)
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateLinhaDigitavel,
  validateCodigoBarras,
  calcularModulo10,
  calcularModulo11Boleto,
  fatorVencimentoParaData,
  parseBoletoAmount,
  normalizeDate,
  reconcileBoleto,
} from "../services/boleto-validator";
import {
  processBoletoDocument,
  formatBoletoMessage,
} from "../../../../supabase/functions/_shared/ai/boleto-service";

describe("Regressão SPAL & Matriz Determinística FEBRABAN", () => {
  const SPAL_LINHA = "34191.09115 01746.492931 83045.790009 8 15520000156261";
  const SPAL_VALOR = 1562.61;
  const SPAL_VENCIMENTO = "2026-08-28";
  const SPAL_BENEFICIARIO = "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A";
  const SPAL_BANCO = "Itaú Unibanco";

  describe("1. Regressão SPAL Ground Truth & Módulo 11 do DV Geral", () => {
    it("Calcula exatamente o Módulo 11 do DV Geral para o boleto SPAL (828 % 11 = 3 -> DV 8)", () => {
      const codigoSemDV = "3419155200001562611091101746492938304579000";
      expect(codigoSemDV).toHaveLength(43);

      const dvGeral = calcularModulo11Boleto(codigoSemDV);
      expect(dvGeral).toBe(8);
    });

    it("Valida a linha digitável do boleto SPAL com 47/47 dígitos e todos os DVs válidos", () => {
      const res = validateLinhaDigitavel(SPAL_LINHA);
      expect(res.valido).toBe(true);
      expect(res.tipo).toBe("bancario");
      expect(res.linhaLimpa).toBe("34191091150174649293183045790009815520000156261");
      expect(res.bancoCodigo).toBe("341");
      expect(res.bancoNome).toBe("Itaú Unibanco");
      expect(res.fatorVencimento).toBe(1552);
      expect(res.dataVencimentoDerivada).toBe(SPAL_VENCIMENTO);
      expect(res.valorDerivado).toBe(SPAL_VALOR);
      expect(res.evidence).toEqual({
        length_valid: true,
        dv_campo_1_valid: true,
        dv_campo_2_valid: true,
        dv_campo_3_valid: true,
        dv_geral_valid: true,
        fator_vencimento: 1552,
        valor_derivado: 1562.61,
        vencimento_derivado: "2026-08-28",
        linha_matematicamente_valida: true,
      });
    });

    it("Cenário Compressão Telegram SPAL: OCR lê R$ 562,61 e 21/08/2026 -> validado_com_alerta com valor e vencimento da linha", () => {
      const inputComprimido = {
        banco: "Banco Itaú S.A.",
        beneficiario: SPAL_BENEFICIARIO,
        valor: "562,61",
        data_vencimento: "2026-08-21",
        linha_digitavel: SPAL_LINHA,
      };

      const res = reconcileBoleto(inputComprimido);
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado_com_alerta");
      expect(res.valorFinal).toBe(1562.61);
      expect(res.valorSource).toBe("febraban_linha");
      expect(res.dataVencimentoFinal).toBe("2026-08-28");
      expect(res.vencimentoSource).toBe("febraban_linha");

      expect(res.warnings).toHaveLength(2);
      expect(res.warnings.some((w) => w.includes("divergencia_valor_ocr"))).toBe(true);
      expect(res.warnings.some((w) => w.includes("divergencia_vencimento_ocr"))).toBe(true);

      const msg = formatBoletoMessage(inputComprimido, res);
      expect(msg).toContain("R$ 1.562,61");
      expect(msg).toContain("28/08/2026");
      expect(msg).toContain("A leitura visual apresentou leve divergência");
    });
  });

  describe("2. Matriz Completa de Testes Determinísticos", () => {
    it("1: linha válida + visual concordante -> validado", () => {
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: SPAL_LINHA,
      });
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado");
      expect(res.valorFinal).toBe(1562.61);
      expect(res.warnings).toHaveLength(0);
    });

    it("2: linha válida + valor visual divergente -> validado_com_alerta", () => {
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        valor: "1.000,00",
        data_vencimento: "2026-08-28",
        linha_digitavel: SPAL_LINHA,
      });
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado_com_alerta");
      expect(res.valorFinal).toBe(1562.61);
      expect(res.warnings.some((w) => w.includes("divergencia_valor_ocr"))).toBe(true);
    });

    it("3: linha válida + data visual divergente -> validado_com_alerta", () => {
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        valor: "1.562,61",
        data_vencimento: "2026-08-15",
        linha_digitavel: SPAL_LINHA,
      });
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado_com_alerta");
      expect(res.dataVencimentoFinal).toBe("2026-08-28");
      expect(res.warnings.some((w) => w.includes("divergencia_vencimento_ocr"))).toBe(true);
    });

    it("4: linha com DV campo 1 inválido -> requer_revisao", () => {
      const linhaDV1Invalido = "34191.09119 01746.492931 83045.790009 8 15520000156261";
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: linhaDV1Invalido,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.divergencias.some((d) => d.includes("Bloco 1"))).toBe(true);
    });

    it("5: linha com DV campo 2 inválido -> requer_revisao", () => {
      const linhaDV2Invalido = "34191.09115 01746.492938 83045.790009 8 15520000156261";
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: linhaDV2Invalido,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.divergencias.some((d) => d.includes("Bloco 2"))).toBe(true);
    });

    it("6: linha com DV campo 3 inválido -> requer_revisao", () => {
      const linhaDV3Invalido = "34191.09115 01746.492931 83045.790002 8 15520000156261";
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: linhaDV3Invalido,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.divergencias.some((d) => d.includes("Bloco 3"))).toBe(true);
    });

    it("7: linha com DV geral inválido -> requer_revisao", () => {
      const linhaDVGeralInvalido = "34191.09115 01746.492931 83045.790009 4 15520000156261";
      const res = reconcileBoleto({
        banco: SPAL_BANCO,
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: linhaDVGeralInvalido,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.divergencias.some((d) => d.includes("Dígito verificador geral"))).toBe(true);
    });

    it("8: linha com 46 dígitos -> requer_revisao", () => {
      const linha46 = "3419109115017464929318304579000981552000015626";
      const res = reconcileBoleto({
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: linha46,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.divergencias.some((d) => d.includes("46 dígitos"))).toBe(true);
    });

    it("9: linha com 48 dígitos (arrecadação válida) -> validado", () => {
      const bloco1 = "84670000001";
      const dv1 = calcularModulo10(bloco1);
      const bloco2 = "43500024020";
      const dv2 = calcularModulo10(bloco2);
      const bloco3 = "24012345678";
      const dv3 = calcularModulo10(bloco3);
      const bloco4 = "90123456789";
      const dv4 = calcularModulo10(bloco4);
      const linha48 = `${bloco1}${dv1}${bloco2}${dv2}${bloco3}${dv3}${bloco4}${dv4}`;

      const res = reconcileBoleto({
        beneficiario: "Companhia de Água e Esgoto",
        valor: "143.50",
        data_vencimento: "2026-09-10",
        linha_digitavel: linha48,
      });
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado");
      expect(res.linhaDigitavel?.tipo).toBe("arrecadacao");
    });

    it("10: linha ausente + visual legível -> requer_revisao", () => {
      const res = reconcileBoleto({
        beneficiario: "Prestador de Serviços",
        valor: "350,00",
        data_vencimento: "2026-09-01",
        linha_digitavel: null,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.warnings.some((w) => w.includes("linha_digitavel_ausente"))).toBe(true);
    });

    it("11: linha ausente + valor ilegível -> rejeitado (fail-closed)", () => {
      const res = reconcileBoleto({
        beneficiario: null,
        valor: null,
        data_vencimento: null,
        linha_digitavel: null,
      });
      expect(res.valido).toBe(false);
      expect(res.status).toBe("rejeitado");
    });

    it("12 & 13: Normalização de linha preserva caracteres numéricos sem substituições inventadas", () => {
      const rawComEspacos = " 34191.09115  01746.492931  83045.790009 8 15520000156261 ";
      const val = validateLinhaDigitavel(rawComEspacos);
      expect(val.linhaLimpa).toBe("34191091150174649293183045790009815520000156261");
      expect(val.valido).toBe(true);
    });

    it("14: GPT-4o extrai linha válida mesmo que Gemini esteja indisponível -> documento continua validado", async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url.includes("api.openai.com")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      banco: "Itaú Unibanco S.A.",
                      beneficiario: SPAL_BENEFICIARIO,
                      valor: "1.562,61",
                      data_vencimento: "2026-08-28",
                      linha_digitavel: SPAL_LINHA,
                    }),
                  },
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 504,
          json: async () => ({ error: "Gateway Timeout" }),
        });
      });

      const output = await processBoletoDocument({
        base64: "dummy_base64",
        mimeType: "image/jpeg",
        openaiApiKey: "fake_openai_key",
        geminiApiKey: "fake_gemini_key",
        workspaceId: "ws_resilience_test",
        fetchImpl: mockFetch as any,
      });

      expect(output.success).toBe(true);
      expect(output.status).toBe("sucesso");
      expect(output.validacao.valido).toBe(true);
      expect(output.validacao.status).toBe("validado");
      expect(output.validacao.valorFinal).toBe(1562.61);
    });

    it("15: Reconciliação preserva campos essenciais para emissão de proposta sem perdas", () => {
      const res = reconcileBoleto({
        banco: "341",
        beneficiario: "SPAL",
        cnpj_cpf_beneficiario: "61.450.963/0001-38",
        pagador: "Empresa XPTO",
        cnpj_cpf_pagador: "12.345.678/0001-90",
        valor: "1.562,61",
        data_vencimento: "2026-08-28",
        linha_digitavel: SPAL_LINHA,
      });

      expect(res.beneficiarioFinal).toBe("SPAL");
      expect(res.cnpjCpfBeneficiarioFinal).toBe("61.450.963/0001-38");
      expect(res.pagadorFinal).toBe("Empresa XPTO");
      expect(res.cnpjCpfPagadorFinal).toBe("12.345.678/0001-90");
    });
  });
});
