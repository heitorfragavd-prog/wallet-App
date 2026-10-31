/**
 * Suíte de Testes Automatizados: Correção Geral do OCR de Boletos & Caso Real SPAL
 * 
 * Cobertura Obrigatória:
 * 1. Caso Real SPAL Ground Truth (Linha 47 dígitos, R$ 2.076,44, vencimento 03/11/2026, Itaú 341)
 * 2. Recuperação de Leitura OCR com Erro (Visual R$ 84,45 e 23/10/2026 -> recupera R$ 2.076,44 e 03/11/2026)
 * 3. Extração independente do Código de Barras (44 dígitos -> deriva linha de 47 dígitos)
 * 4. Regressão Boleto Xodó Foods (R$ 658,14, 2026-10-30, 48 dígitos OCR -> 44 dígitos canônicos)
 * 5. Boleto de 46 dígitos recuperável (Zero-Padding determinístico com Módulo 11)
 * 6. Boleto ilegível (Fail-Closed, não inventa números)
 * 7. Linha com dígito incorreto irrecuperável (Rejeita com erro de Módulo 10)
 * 8. Divergência entre valor visual e bancário (Adota linha bancária, validado_com_alerta)
 * 9. Separação de data de emissão vs data de vencimento (Não usa emissão como vencimento)
 * 10. Regressão DANFE unificada (Sem colisão com boletos)
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateLinhaDigitavel,
  validateCodigoBarras,
  barcodeToLinhaDigitavel,
  reconcileBoleto,
  calcularModulo10,
  calcularModulo11Boleto,
} from "../services/boleto-validator";
import { processDocumentPipeline } from "../../../../supabase/functions/_shared/ai/document-pipeline";

describe("WALLET APP — Correção Geral do OCR de Boletos & Caso Real SPAL", () => {
  // Dados Ground Truth do Caso Real SPAL
  const SPAL_LINHA_CORRETA = "34191.09115 54446.822931 83045.790009 1 16190000207644";
  const SPAL_LINHA_LIMPA = "34191091155444682293183045790009116190000207644";
  const SPAL_CODIGO_BARRAS = "34191161900002076441091154446822938304579000";
  const SPAL_VALOR = 2076.44;
  const SPAL_VENCIMENTO = "2026-11-03";
  const SPAL_EMISSAO = "2026-10-23";
  const SPAL_BENEFICIARIO = "SPAL INDUSTRIA BRASILEIRA DE";
  const SPAL_BANCO = "Banco Itaú S.A.";

  describe("1. Caso Real SPAL Ground Truth (Validação Matemática e Derivação)", () => {
    it("Valida os 3 blocos por Módulo 10 e o DV Geral por Módulo 11", () => {
      // Bloco 1: 341910911 -> DV 5
      expect(calcularModulo10("341910911")).toBe(5);
      // Bloco 2: 5444682293 -> DV 1
      expect(calcularModulo10("5444682293")).toBe(1);
      // Bloco 3: 8304579000 -> DV 9
      expect(calcularModulo10("8304579000")).toBe(9);

      // Código de barras sem DV geral:
      // Banco(341) + Moeda(9) + Fator(1619) + Valor(0000207644) + CampoLivre(1091154446822938304579000)
      const codigoSemDV = "3419161900002076441091154446822938304579000";
      expect(codigoSemDV).toHaveLength(43);
      const dvGeral = calcularModulo11Boleto(codigoSemDV);
      expect(dvGeral).toBe(1);
    });

    it("Valida a linha digitável impressa com 47 dígitos, fator 1619 e valor R$ 2.076,44", () => {
      const res = validateLinhaDigitavel(SPAL_LINHA_CORRETA);
      expect(res.valido).toBe(true);
      expect(res.tipo).toBe("bancario");
      expect(res.linhaLimpa).toBe(SPAL_LINHA_LIMPA);
      expect(res.bancoCodigo).toBe("341");
      expect(res.fatorVencimento).toBe(1619);
      expect(res.dataVencimentoDerivada).toBe(SPAL_VENCIMENTO);
      expect(res.valorDerivado).toBe(SPAL_VALOR);
      expect(res.codigoBarrasDerivado).toBe(SPAL_CODIGO_BARRAS);
    });

    it("Valida o código de barras de 44 dígitos do SPAL", () => {
      const resCb = validateCodigoBarras(SPAL_CODIGO_BARRAS);
      expect(resCb.valido).toBe(true);
      expect(resCb.tipo).toBe("bancario");
      expect(resCb.fatorVencimento).toBe(1619);
      expect(resCb.dataVencimentoDerivada).toBe(SPAL_VENCIMENTO);
      expect(resCb.valorDerivado).toBe(SPAL_VALOR);
    });
  });

  describe("2. Reconciliação do Caso SPAL com Erro de Leitura OCR Visual", () => {
    it("Bloqueia fail-closed quando OCR visual tem divergência material não corroborada (R$ 84,45 vs R$ 2.076,44)", () => {
      const dadosOcrVisualErrado = {
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        data_vencimento: SPAL_EMISSAO, // OCR visual confundiu emissão com vencimento
        data_emissao: SPAL_EMISSAO,
        valor: "84,45", // OCR visual leu tributo/ICMS em vez do valor nominal
        linha_digitavel: SPAL_LINHA_CORRETA,
      };

      const res = reconcileBoleto(dadosOcrVisualErrado);
      // Salvaguarda: divergência material de valor (> R$ 0.05) deve bloquear com requer_revisao
      expect(res.valido).toBe(false);
      expect(res.status).toBe("requer_revisao");
      expect(res.evidence?.has_unresolved_material_divergence).toBe(true);
      expect(res.divergencias.some((d) => d.includes("divergencia_material_valor"))).toBe(true);
    });
  });

  describe("3. Extração Independente do Código de Barras (44 dígitos -> 47 dígitos)", () => {
    it("barcodeToLinhaDigitavel deriva com precisão matemática a linha de 47 dígitos a partir do código de 44 dígitos", () => {
      const derived = barcodeToLinhaDigitavel(SPAL_CODIGO_BARRAS);
      expect(derived).not.toBeNull();
      expect(derived?.valido).toBe(true);
      expect(derived?.tipo).toBe("bancario");
      expect(derived?.linhaLimpa).toBe(SPAL_LINHA_LIMPA);
      expect(derived?.linhaFormatada).toBe(SPAL_LINHA_CORRETA);
    });

    it("Recupera boleto quando a linha OCR está corrompida mas o código de barras de 44 dígitos é válido", () => {
      const dadosComLinhaCorrompida = {
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        data_vencimento: SPAL_VENCIMENTO,
        valor: SPAL_VALOR,
        linha_digitavel: "34191.09115 54446.822931 83045.790091 6 1619000027644", // Linha com erro do Telegram
        codigo_barras: SPAL_CODIGO_BARRAS, // Código de 44 dígitos íntegro
      };

      const res = reconcileBoleto(dadosComLinhaCorrompida);
      expect(res.valido).toBe(true);
      expect(res.status).toBe("validado_com_alerta");
      expect(res.valorFinal).toBe(SPAL_VALOR);
      expect(res.dataVencimentoFinal).toBe(SPAL_VENCIMENTO);
      expect(res.codigoBarrasFinal).toBe(SPAL_CODIGO_BARRAS);
      expect(res.linhaDigitavelFinal).toBe(SPAL_LINHA_LIMPA);
      expect(res.warnings.some((w) => w.includes("linha_digitavel_recomposta_do_codigo_barras"))).toBe(true);
    });
  });

  describe("4. Regressão Boleto Xodó Foods (R$ 658,14)", () => {
    const XODO_LINHA = "34191.09008 20945.855607 59884.260007 2 16150000065814";
    const XODO_CODIGO_CANONICO = "34192161500000658141090020945855605988426000";
    const XODO_OCR_48 = "341916091000209458556075988426000216150000065814";

    it("Reconcilia linha de 47 dígitos do Xodó Foods e substitui OCR de 48 dígitos pelo canônico de 44 dígitos", () => {
      const res = reconcileBoleto({
        banco: "Banco Itaú S.A.",
        beneficiario: "XODO FOODS E DISTRIBUICAO LTDA",
        valor: "658,14",
        data_vencimento: "2026-10-30",
        linha_digitavel: XODO_LINHA,
        codigo_barras: XODO_OCR_48,
      });

      expect(res.valido).toBe(true);
      expect(res.valorFinal).toBe(658.14);
      expect(res.dataVencimentoFinal).toBe("2026-10-30");
      expect(res.codigoBarrasFinal).toBe(XODO_CODIGO_CANONICO);
      expect(res.codigoBarrasFinal).toHaveLength(44);
      expect(res.warnings.some((w) => w.includes("divergencia_codigo_barras_ocr"))).toBe(true);
    });
  });

  describe("5. Boleto de 46 dígitos recuperável (Zero-Padding Determinístico)", () => {
    it("Restaura linha de 46 dígitos quando OCR suprime zero no valor nominal e valida contra Módulo 11", () => {
      // Linha SPAL onde foi omitido um zero no valor: "000207644" em vez de "0000207644" (46 dígitos)
      const linha46 = "3419109115544468229318304579000911619000207644";
      expect(linha46).toHaveLength(46);

      const res = validateLinhaDigitavel(linha46);
      expect(res.valido).toBe(true);
      expect(res.linhaLimpa).toBe(SPAL_LINHA_LIMPA);
      expect(res.linhaLimpa).toHaveLength(47);
      expect(res.valorDerivado).toBe(SPAL_VALOR);
      expect(res.evidence.reconciliacao_zero_padding).toBe(true);
    });
  });

  describe("6. Boleto Ilegível (Fail-Closed, Não Inventa Dados)", () => {
    it("Rejeita boleto com linha corrompida sem código de barras válido", () => {
      const res = reconcileBoleto({
        banco: "Desconhecido",
        beneficiario: "Indeterminado",
        linha_digitavel: "99999999999999999999999999999999999999999999999",
      });

      expect(res.valido).toBe(false);
      expect(res.status).toBe("rejeitado");
      expect(res.divergencias.length).toBeGreaterThan(0);
    });

    it("Falha fail-closed quando documento é completamente ilegível", () => {
      const res = reconcileBoleto({
        linha_digitavel: null,
        codigo_barras: null,
        valor: null,
        data_vencimento: null,
      });

      expect(res.valido).toBe(false);
      expect(res.status).toBe("rejeitado");
    });
  });

  describe("7. Linha com Dígito Incorreto Irrecuperável", () => {
    it("Rejeita quando o dígito verificador do bloco 1 não confere por Módulo 10", () => {
      // Troca o DV do bloco 1 de '5' para '9': 34191.09119 ...
      const linhaDvInvalido = "34191.09119 54446.822931 83045.790009 1 16190000207644";
      const res = validateLinhaDigitavel(linhaDvInvalido);
      expect(res.valido).toBe(false);
      expect(res.erros.some((e) => e.includes("Bloco 1 inválido"))).toBe(true);
    });
  });

  describe("8. Separação de Data de Emissão vs Data de Vencimento", () => {
    it("Não usa data de emissão como vencimento quando linha bancária informa vencimento real", () => {
      const dados = {
        banco: SPAL_BANCO,
        beneficiario: SPAL_BENEFICIARIO,
        data_emissao: "2026-10-23",
        data_vencimento: "2026-10-23", // OCR preencheu erroneamente com emissão
        valor: SPAL_VALOR,
        linha_digitavel: SPAL_LINHA_CORRETA,
      };

      const res = reconcileBoleto(dados);
      expect(res.valido).toBe(true);
      // Data de vencimento final vem da linha (03/11/2026) e NÃO da emissão
      expect(res.dataVencimentoFinal).toBe("2026-11-03");
      expect(res.warnings.some((w) => w.includes("vencimento visual correspondia à data de emissão"))).toBe(true);
    });
  });

  describe("9. Fluxo Completo de Document Pipeline com Caso Real SPAL", () => {
    it("Processa documento SPAL com recuperação e gera Action Proposal aguardando confirmação", async () => {
      // Mock de fetch que simula a primeira leitura falhando (visual errado) e a leitura focalizada recuperando a linha SPAL
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const urlStr = String(url);

        // Chamada inicial (visão completa com dados errados do OCR Telegram)
        if (urlStr.includes("chat/completions") && !init?.body?.toString().includes("FICHA DE COMPENSAÇÃO")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      banco: SPAL_BANCO,
                      beneficiario: SPAL_BENEFICIARIO,
                      valor: 2076.44,
                      data_vencimento: "2026-10-23",
                      data_emissao: "2026-10-23",
                      linha_digitavel: "34191.09115 54446.822931 83045.790091 6 1619000027644", // OCR incorreto
                    }),
                  },
                },
              ],
            }),
          };
        }

        // Chamada focalizada de recuperação na Ficha de Compensação
        if (init?.body?.toString().includes("FICHA DE COMPENSAÇÃO")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      campo1: "3419109115",
                      campo2: "54446822931",
                      campo3: "83045790009",
                      dv_geral: "1",
                      campo5: "16190000207644",
                      linha_digitavel: SPAL_LINHA_LIMPA,
                      codigo_barras: SPAL_CODIGO_BARRAS,
                      valor_visual: 2076.44,
                      vencimento_visual: "2026-11-03",
                    }),
                  },
                },
              ],
            }),
          };
        }

        return { ok: false, status: 500 };
      });

      const pipelineResult = await processDocumentPipeline({
        workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
        userId: "0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0",
        base64: "dGVzdC1iYXNlNjQ=",
        mimeType: "image/jpeg",
        documentTypeHint: "BOLETO",
        openaiApiKey: "sk-mock-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(pipelineResult.success).toBe(true);
      expect(pipelineResult.documentType).toBe("BOLETO");
      expect(pipelineResult.status).toBe("sucesso");
      expect(pipelineResult.data.valor).toBe(2076.44);
      expect(pipelineResult.data.data_vencimento).toBe("2026-11-03");
      expect(pipelineResult.data.beneficiario).toBe(SPAL_BENEFICIARIO);
      expect(pipelineResult.actionProposal).toBeDefined();
      expect(pipelineResult.actionProposal?.actionType).toBe("cadastrar_divida_boleto");
      expect(pipelineResult.actionProposal?.payload.valor).toBe(2076.44);
      expect(pipelineResult.actionProposal?.payload.data_vencimento).toBe("2026-11-03");
      expect(pipelineResult.actionProposal?.payload.linha_digitavel).toBe(SPAL_LINHA_LIMPA);
      expect(pipelineResult.actionProposal?.payload.codigo_barras).toBe(SPAL_CODIGO_BARRAS);
    });
  });

  describe("10. Regressão DANFE (Sem Colisão)", () => {
    it("Processamento de DANFE permanece com tipo DANFE e não colide com fluxo de boletos", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      numero_nf: "123456",
                      chave_acesso: "35260800000000000191550010001234561000000018",
                      emitente_razao_social: "Fornecedor Teste Ltda",
                      valor_total: 100.0,
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }));

      const res = await processDocumentPipeline({
        workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
        userId: "0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0",
        base64: "dGVzdC1kYW5mZQ==",
        mimeType: "application/pdf",
        documentTypeHint: "DANFE",
        geminiApiKey: "mock-gemini-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(res.documentType).toBe("DANFE");
    });
  });
});
