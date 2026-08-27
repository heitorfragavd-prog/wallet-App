/**
 * Testes Automatizados — Document Intelligence: Boleto na Wallet IA (Etapa 2.2A)
 *
 * Cobertura:
 * A. boleto PDF válido -> classificado como BOLETO
 * B. foto de boleto -> BOLETO
 * C. linha digitável com pontuação -> normalizada e formatada
 * D. linha digitável inválida -> requer_revisao com motivo explícito
 * E. valor BR "1.234,56" -> 1234.56
 * F. vencimento extraído e normalizado
 * G. beneficiário e CNPJ/CPF preservados
 * H. DANFE não é classificada como boleto
 * I. comprovante não é classificado como boleto
 * J. nenhuma mutação de conta/despesa/estoque
 * K. workspace isolado
 * L. proposta de revisão sem cadastro automático
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyDocument } from "../types/document";
import {
  validateLinhaDigitavel,
  validateCodigoBarras,
  parseBoletoAmount,
  normalizeDate,
  normalizeCpfCnpj,
  reconcileBoleto,
} from "../services/boleto-validator";
import {
  processBoletoDocument,
  formatBoletoMessage,
} from "../../../../supabase/functions/_shared/ai/boleto-service";

describe("Document Intelligence — Boleto na Wallet IA (Etapa 2.2A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Classificação Determinística (classifyDocument)", () => {
    it("A: boleto em PDF válido é classificado como BOLETO", () => {
      const res = classifyDocument("boleto_itau_agosto.pdf", "application/pdf", "Segue o boleto para pagamento");
      expect(res.tipo).toBe("BOLETO");
      expect(res.confianca).toBeGreaterThanOrEqual(0.85);
    });

    it("B: foto de boleto é classificada como BOLETO", () => {
      const res = classifyDocument("IMG_20260827_1530.jpg", "image/jpeg", "Foto da fatura de energia com linha digitável e código de barras");
      expect(res.tipo).toBe("BOLETO");
      expect(res.confianca).toBeGreaterThanOrEqual(0.85);
    });

    it("H: DANFE / Nota Fiscal NUNCA é classificada como BOLETO", () => {
      const res1 = classifyDocument("DANFE_000832082.pdf", "application/pdf", "Nota Fiscal Brasnorte");
      expect(res1.tipo).toBe("DANFE");

      const res2 = classifyDocument("nfe_fornecedor.jpg", "image/jpeg", "chave de acesso 31260831908617000133550010008320821035268195 cálculo do imposto");
      expect(res2.tipo).toBe("DANFE");
    });

    it("I: Comprovante de pagamento NUNCA é classificado como BOLETO", () => {
      const res1 = classifyDocument("comprovante_pix.pdf", "application/pdf", "Comprovante de pagamento realizado");
      expect(res1.tipo).toBe("COMPROVANTE");

      const res2 = classifyDocument("recibo_ted.png", "image/png", "Transferência realizada com sucesso");
      expect(res2.tipo).toBe("COMPROVANTE");
    });
  });

  describe("2. Validação Determinística de Linha Digitável e Código de Barras", () => {
    // Linha Itaú Válida com fator 1575 (vencimento 20/09/2026) e valor R$ 1.250,00
    const LINHA_ITAU_VALIDA = "34191.79001 01043.510047 91020.150008 5 15750000125000";

    it("C: linha digitável com pontuação é normalizada e formatada corretamente", () => {
      const res = validateLinhaDigitavel(LINHA_ITAU_VALIDA);
      expect(res.valido).toBe(true);
      expect(res.tipo).toBe("bancario");
      expect(res.linhaLimpa).toBe("34191790010104351004791020150008515750000125000");
      expect(res.bancoCodigo).toBe("341");
      expect(res.bancoNome).toBe("Itaú Unibanco");
      expect(res.valorDerivado).toBe(1250.00);
      expect(res.dataVencimentoDerivada).toBe("2026-09-20");
      expect(res.codigoBarrasDerivado).toHaveLength(44);
    });

    it("D: linha digitável com tamanho inválido ou DV errado -> valido=false, requer_revisao", () => {
      // 1. Tamanho incompleto
      const resIncompleta = validateLinhaDigitavel("3419179001010435100479102015000");
      expect(resIncompleta.valido).toBe(false);
      expect(resIncompleta.motivo).toMatch(/dígitos/i);

      // 2. DV errado no Bloco 1 (trocando '1' por '9')
      const resDVErrado = validateLinhaDigitavel("34191790090104351004791020150008515750000125000");
      expect(resDVErrado.valido).toBe(false);
      expect(resDVErrado.erros[0]).toMatch(/Dígito verificador do Bloco 1/i);
    });

    it("E: parser monetário determinístico trata formatos BR e US", () => {
      expect(parseBoletoAmount("1.234,56")).toBe(1234.56);
      expect(parseBoletoAmount("R$ 1.234,56")).toBe(1234.56);
      expect(parseBoletoAmount("1234.56")).toBe(1234.56);
      expect(parseBoletoAmount(1234.56)).toBe(1234.56);
      expect(parseBoletoAmount("0,00")).toBe(0);
      expect(parseBoletoAmount(null)).toBe(0);
    });

    it("F: normalização de data para YYYY-MM-DD e DD/MM/YYYY", () => {
      const d1 = normalizeDate("20/09/2026");
      expect(d1.iso).toBe("2026-09-20");
      expect(d1.formattedBr).toBe("20/09/2026");

      const d2 = normalizeDate("2026-09-20");
      expect(d2.iso).toBe("2026-09-20");
      expect(d2.formattedBr).toBe("20/09/2026");
    });

    it("G: beneficiário, CPF/CNPJ e pagador são preservados e formatados", () => {
      const cnpj = normalizeCpfCnpj("12345678000190");
      expect(cnpj.valido).toBe(true);
      expect(cnpj.formatted).toBe("12.345.678/0001-90");

      const cpf = normalizeCpfCnpj("12345678901");
      expect(cpf.valido).toBe(true);
      expect(cpf.formatted).toBe("123.456.789-01");
    });
  });

  describe("3. Reconciliação e Proposta Segura (reconcileBoleto & formatBoletoMessage)", () => {
    it("J & L: Boleto válido monta proposta segura SEM mutação de contas", () => {
      const dados = {
        banco: "Itaú Unibanco",
        beneficiario: "Companhia Energética de Minas Gerais",
        cnpj_cpf_beneficiario: "17.155.730/0001-64",
        pagador: "Minha Empresa LTDA",
        cnpj_cpf_pagador: "43.031.317/0001-06",
        data_vencimento: "2026-09-20",
        valor: "1.250,00",
        linha_digitavel: "34191.79001 01043.510047 91020.150008 5 15750000125000",
      };

      const validacao = reconcileBoleto(dados);
      expect(validacao.valido).toBe(true);
      expect(validacao.status).toBe("ok");
      expect(validacao.valorFinal).toBe(1250.00);

      const msg = formatBoletoMessage(dados, validacao);
      expect(msg).toContain("📄 **Boleto Identificado**");
      expect(msg).toContain("🏦 **Banco:** Itaú Unibanco");
      expect(msg).toContain("🏢 **Beneficiário:** Companhia Energética de Minas Gerais");
      expect(msg).toContain("💰 **Valor:** R$ 1.250,00");
      expect(msg).toContain("🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*");
      expect(msg).toContain("*Posso preparar este boleto para cadastro.*");
    });

    it("Divergência entre valor impresso e linha digitável marca status requer_revisao", () => {
      const dadosComDivergencia = {
        banco: "Itaú",
        beneficiario: "Fornecedor X",
        valor: "2.500,00", // Diverge dos 1.250,00 da linha digitável!
        linha_digitavel: "34191.79001 01043.510047 91020.150008 5 15750000125000",
      };

      const validacao = reconcileBoleto(dadosComDivergencia);
      expect(validacao.status).toBe("requer_revisao");
      expect(validacao.divergencias.some((d) => d.includes("Divergência de valor"))).toBe(true);

      const msg = formatBoletoMessage(dadosComDivergencia, validacao);
      expect(msg).toContain("📄 **Boleto Identificado (Requer Revisão)**");
      expect(msg).toContain("Divergência de valor");
      expect(msg).toContain("🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*");
    });
  });

  describe("4. Pipeline Completo de Extração (processBoletoDocument)", () => {
    it("K: Executa pipeline de ponta a ponta com mock e workspace isolado", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        banco: "Itaú Unibanco (341)",
                        beneficiario: "CEMIG Distribuição S.A.",
                        cnpj_cpf_beneficiario: "06.981.180/0001-16",
                        pagador: "Heitor Fraga ME",
                        data_vencimento: "2026-09-20",
                        valor: 450.75,
                        linha_digitavel: "34191.79001 01043.510047 91020.150008 5 15750000045075",
                        codigo_barras: "34195157500000450751790001043510049102015000",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      });

      const output = await processBoletoDocument({
        base64: "dummy_base64_boleto",
        mimeType: "application/pdf",
        geminiApiKey: "fake_gemini_key",
        workspaceId: "ws_test_isolation_123",
        fetchImpl: mockFetch as any,
      });

      expect(output.success).toBe(true);
      expect(output.status).toBe("sucesso");
      expect(output.dados.beneficiario).toBe("CEMIG Distribuição S.A.");
      expect(output.validacao.valorFinal).toBe(450.75);
      expect(output.mensagemFormatada).toContain("CEMIG Distribuição S.A.");
      expect(output.mensagemFormatada).toContain("🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*");
    });
  });
});
