/**
 * Testes Unitários e de Regressão — Conciliação Determinística do Número da NF-e
 * 
 * Regras:
 * 1. Chave de acesso oficial de 44 dígitos da SEFAZ é a fonte canônica fiscal primária.
 * 2. Posição estrutural dos 9 dígitos de nNF: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) = 25 dígitos iniciais, nNF são os 9 dígitos seguintes (25 a 34).
 * 3. Se modelo visual ler "000.832.082" mas a chave contiver "000083208", a chave vence e o número final será "000.083.208".
 * 4. O formatador jamais move ou reorganiza dígitos.
 * 5. Busca resiliente de chave de acesso via findAccessKeyInPayload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractNFeNumberFromAccessKey,
  formatNFeNumber,
  findAccessKeyInPayload,
  reconcileNFeNumber,
} from "../../../../supabase/functions/_shared/danfe-gemini-v2";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";

describe("DANFE — Conciliação Determinística do Número da NF-e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Funções Puras de Extração, Busca e Formatação", () => {
    it("A: formatNFeNumber formata corretamente sem reorganizar dígitos", () => {
      expect(formatNFeNumber("83208")).toBe("000.083.208");
      expect(formatNFeNumber("000083208")).toBe("000.083.208");
      expect(formatNFeNumber("000.083.208")).toBe("000.083.208");
      expect(formatNFeNumber(83208)).toBe("000.083.208");
      expect(formatNFeNumber("13790902")).toBe("013.790.902");
      expect(formatNFeNumber(null)).toBeNull();
      expect(formatNFeNumber(undefined)).toBeNull();
    });

    it("B: extractNFeNumberFromAccessKey extrai nNF de chave oficial de 44 dígitos", () => {
      // Chave Brasnorte: UF=51, AAMM=2608, CNPJ=31908617000133, mod=55, serie=001, nNF=000083208, tpEmis=1, cNF=12345678, cDV=9
      const chave = "51260831908617000133550010000832081123456789";
      expect(chave).toHaveLength(44);

      const info = extractNFeNumberFromAccessKey(chave);
      expect(info).not.toBeNull();
      expect(info?.nNF).toBe("000083208");
      expect(info?.nNFFormatado).toBe("000.083.208");
      expect(info?.serie).toBe("001");
      expect(info?.modelo).toBe("55");
      expect(info?.CNPJ).toBe("31908617000133");
    });

    it("C: chave com espaços e pontuação é normalizada e extraída com perfeição", () => {
      const chaveFormatada = "51 26 08 31.908.617/0001-33 55 001 000083208 1 12345678 9";
      const info = extractNFeNumberFromAccessKey(chaveFormatada);
      expect(info).not.toBeNull();
      expect(info?.nNF).toBe("000083208");
      expect(info?.nNFFormatado).toBe("000.083.208");
    });

    it("D: findAccessKeyInPayload localiza chave em múltiplos campos ou via regex", () => {
      // 1. Campo direto
      expect(findAccessKeyInPayload({ chave_acesso: "51260831908617000133550010000832081123456789" }))
        .toBe("51260831908617000133550010000832081123456789");

      // 2. Campo aninhado com espaços
      expect(findAccessKeyInPayload({ cabecalho: { chave: "5126 0831 9086 1700 0133 5500 1000 0832 0811 2345 6789" } }))
        .toBe("51260831908617000133550010000832081123456789");

      // 3. No texto bruto serializado
      expect(findAccessKeyInPayload({}, "Texto da DANFE com CHAVE DE ACESSO: 5126 0831 9086 1700 0133 5500 1000 0832 0811 2345 6789 emitida com sucesso"))
        .toBe("51260831908617000133550010000832081123456789");

      // 4. Sem chave válida
      expect(findAccessKeyInPayload({ cabecalho: { chave: "12345" } })).toBeNull();
    });

    it("E: chave inválida ou com menos de 44 dígitos retorna null sem inventar", () => {
      expect(extractNFeNumberFromAccessKey("12345")).toBeNull();
      expect(extractNFeNumberFromAccessKey("5126083190861700013355001000083208112345678")).toBeNull(); // 43 dígitos
      expect(extractNFeNumberFromAccessKey(null)).toBeNull();
      expect(extractNFeNumberFromAccessKey("")).toBeNull();
    });

    it("F: reconcileNFeNumber — modelo correto + chave correta -> mantém número com match=true", () => {
      const chave = "51260831908617000133550010000832081123456789";
      const res = reconcileNFeNumber("000.083.208", "1", chave, "test-corr", "wallet");

      expect(res.numero_nf).toBe("000083208");
      expect(res.numero_nf_formatado).toBe("000.083.208");
      expect(res.serie_nf).toBe("1");
      expect(res.source_selected).toBe("visual");
      expect(res.match).toBe(true);
    });

    it("G: reconcileNFeNumber — modelo visual ERRADO (000.832.082) + chave válida (000083208) -> chave VENCE", () => {
      const chave = "51260831908617000133550010000832081123456789";
      const res = reconcileNFeNumber("000.832.082", "1", chave, "test-corr", "wallet");

      expect(res.numero_nf).toBe("000083208");
      expect(res.numero_nf_formatado).toBe("000.083.208");
      expect(res.source_selected).toBe("access_key");
      expect(res.match).toBe(false);
    });

    it("H: reconcileNFeNumber — sem chave de acesso + número visual válido -> usa visual", () => {
      const res = reconcileNFeNumber("83208", "1", null, "test-corr", "wallet");

      expect(res.numero_nf).toBe("000083208");
      expect(res.numero_nf_formatado).toBe("000.083.208");
      expect(res.source_selected).toBe("visual");
      expect(res.match).toBe(false);
    });
  });

  describe("Pipeline Completo — Regressão Brasnorte com Conciliação de Número de NF", () => {
    it("DANFE Brasnorte: modelo visual leu 000.832.082, mas a chave de acesso (com espaços) corrige para 000.083.208 mantendo 11 itens e R$ 1.105,25", async () => {
      // Chave real com espaços como costuma vir na DANFE impressa
      const chaveBrasnorteReal = "5126 0831 9086 1700 0133 5500 1000 0832 0811 2345 6789";

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        const prompt = body.contents?.[0]?.parts?.[0]?.text || body.messages?.[0]?.content || "";

        // 1. Orientação
        if (prompt.includes("orientacao_leitura")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 0 }) }] } }],
            }),
          });
        }

        // 2. Cabeçalho com o erro visual que ocorreu no OCR real ("000.832.082") e a chave com espaços
        if (prompt.includes("quadro CÁLCULO DO IMPOSTO")) {
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
                          cabecalho: {
                            fornecedor: "Brasnorte Distribuidora de Bebidas Ltda",
                            cnpj_fornecedor: "31.908.617/0001-33",
                            numero_nf: "000.832.082", // Erro visual do OCR!
                            serie_nf: "1",
                            data_emissao: "2026-08-20",
                            chave_acesso: chaveBrasnorteReal,
                          },
                          valores_totais: {
                            valor_produtos: 1105.25,
                            valor_total_nf: 1105.25,
                          },
                          regiao_tabela_produtos: {
                            top: 0.28,
                            bottom: 0.88,
                          },
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          });
        }

        // 3. Tabela com os 11 itens reais da Brasnorte
        if (prompt.includes("DADOS DO PRODUTO")) {
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
                          itens: [
                            { codigo: "101", descricao: "CERVEJA HEINEKEN 330ML", quantidade: 24, valor_unitario: 5.50, valor_total: 132.00, cfop: "5102" },
                            { codigo: "102", descricao: "CERVEJA STELLA ARTOIS 330ML", quantidade: 24, valor_unitario: 5.00, valor_total: 120.00, cfop: "5102" },
                            { codigo: "103", descricao: "CERVEJA CORONA 330ML", quantidade: 24, valor_unitario: 6.00, valor_total: 144.00, cfop: "5102" },
                            { codigo: "104", descricao: "REFRIGERANTE COCA COLA 2L", quantidade: 12, valor_unitario: 9.00, valor_total: 108.00, cfop: "5102" },
                            { codigo: "105", descricao: "REFRIGERANTE GUARANA 2L", quantidade: 12, valor_unitario: 7.50, valor_total: 90.00, cfop: "5102" },
                            { codigo: "106", descricao: "AGUA MINERAL SEM GAS 500ML", quantidade: 48, valor_unitario: 1.50, valor_total: 72.00, cfop: "5102" },
                            { codigo: "107", descricao: "AGUA MINERAL COM GAS 500ML", quantidade: 24, valor_unitario: 2.00, valor_total: 48.00, cfop: "5102" },
                            { codigo: "108", descricao: "SUCO DE UVA INTEGRAL 1L", quantidade: 6, valor_unitario: 15.00, valor_total: 90.00, cfop: "5102" },
                            { codigo: "109", descricao: "ENERGETICO RED BULL 250ML", quantidade: 24, valor_unitario: 8.50, valor_total: 204.00, cfop: "5102" },
                            { codigo: "110", descricao: "GELO EM CUBO 5KG", quantidade: 5, valor_unitario: 11.00, valor_total: 55.00, cfop: "5102" },
                            { codigo: "111", descricao: "TONICA SCHWEPPES 350ML", quantidade: 12, valor_unitario: 3.52, valor_total: 42.25, cfop: "5102" },
                          ],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          });
        }

        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await processDanfeDocument({
        base64: "base64_brasnorte_img",
        mimeType: "image/jpeg",
        geminiApiKey: "gemini-key",
        workspaceId: "ws-brasnorte",
        fetchImpl: mockFetch as any,
      });

      expect(result.success).toBe(true);
      // O número de NF CANÔNICO final foi corrigido deterministicamente pela chave de acesso
      expect(result.cabecalho?.numero_nf).toBe("000.083.208");
      expect(result.cabecalho?.fornecedor).toBe("Brasnorte Distribuidora de Bebidas Ltda");
      expect(result.cabecalho?.cnpj_fornecedor).toBe("31.908.617/0001-33");
      expect(result.cabecalho?.serie_nf).toBe("1");
      expect(result.cabecalho?.data_emissao).toBe("2026-08-20");

      // Produtos e Totais 100% preservados
      expect(result.itens).toHaveLength(11);
      expect(result.validacao.somaItens).toBe(1105.25);
      expect(result.validacao.valido).toBe(true);
      expect(result.valores_totais?.valor_produtos).toBe(1105.25);
      expect(result.mensagemFormatada).toContain("000.083.208");
      expect(result.mensagemFormatada).not.toContain("000.832.082");
      expect(result.mensagemFormatada).toContain("11. **TONICA SCHWEPPES 350ML**");
      expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
    });
  });
});
