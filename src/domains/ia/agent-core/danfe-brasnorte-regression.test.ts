/**
 * Teste de Regressão — DANFE Brasnorte Distribuidora de Bebidas Ltda
 * 
 * Protege contra:
 * 1. Falha de parsing de valores formatados em Real brasileiro ("1.105,25")
 * 2. Falha de resolução de aliases no cabeçalho (fornecedor/emitente, numero_nf/n_nf, etc.)
 * 3. Validação matemática determinística entre valorProdutosDeclaradoNF (1105.25) e soma dos 11 itens (1105.25)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";
import { parseFiscalNumber } from "../../../../supabase/functions/_shared/danfe-gemini-v2";

describe("DANFE Brasnorte — Teste de Regressão Cirúrgico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parseFiscalNumber trata corretamente todos os formatos monetários", () => {
    expect(parseFiscalNumber("1.105,25")).toBe(1105.25);
    expect(parseFiscalNumber("1105,25")).toBe(1105.25);
    expect(parseFiscalNumber("1105.25")).toBe(1105.25);
    expect(parseFiscalNumber(1105.25)).toBe(1105.25);
    expect(parseFiscalNumber("R$ 1.105,25")).toBe(1105.25);
  });

  it("Processa DANFE Brasnorte com 11 itens, totais em string brasileira e aliases", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      const prompt = body.contents[0].parts[0].text;

      // 1. Orientação
      if (prompt.includes("orientacao_leitura")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 0 }) }] } }],
          }),
        });
      }

      // 2. Cabeçalho e Totais (com aliases e string formatada "1.105,25")
      if (prompt.includes("quadro CÁLCULO DO IMPOSTO")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        cabecalho: {
                          fornecedor: "Brasnorte Distribuidora de Bebidas Ltda",
                          cnpj_fornecedor: "03.456.789/0001-90",
                          numero_nf: "000.083.208",
                          serie_nf: "1",
                          data_emissao: "2026-08-20",
                          chave_acesso: "51260831908617000133550010000832081123456789",

                          pagina_atual: 1,
                          total_paginas: 1,
                        },
                        valores_totais: {
                          valor_produtos: "1.105,25", // String em formato BR!
                          valor_total_nf: "1.105,25",
                          valor_icms: "0,00",
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

      // 3. Tabela de 11 Produtos
      if (prompt.includes("DADOS DO PRODUTO")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [
                          { codigo: "101", descricao: "CERVEJA HEINEKEN 330ML", quantidade: 24, valor_unitario: "5,50", valor_total: "132,00", cfop: "5102" },
                          { codigo: "102", descricao: "CERVEJA STELLA ARTOIS 330ML", quantidade: 24, valor_unitario: "5,00", valor_total: "120,00", cfop: "5102" },
                          { codigo: "103", descricao: "CERVEJA CORONA 330ML", quantidade: 24, valor_unitario: "6,00", valor_total: "144,00", cfop: "5102" },
                          { codigo: "104", descricao: "REFRIGERANTE COCA COLA 2L", quantidade: 12, valor_unitario: "9,00", valor_total: "108,00", cfop: "5102" },
                          { codigo: "105", descricao: "REFRIGERANTE GUARANA 2L", quantidade: 12, valor_unitario: "7,50", valor_total: "90,00", cfop: "5102" },
                          { codigo: "106", descricao: "AGUA MINERAL SEM GAS 500ML", quantidade: 48, valor_unitario: "1,50", valor_total: "72,00", cfop: "5102" },
                          { codigo: "107", descricao: "AGUA MINERAL COM GAS 500ML", quantidade: 24, valor_unitario: "2,00", valor_total: "48,00", cfop: "5102" },
                          { codigo: "108", descricao: "SUCO DE UVA INTEGRAL 1L", quantidade: 6, valor_unitario: "15,00", valor_total: "90,00", cfop: "5102" },
                          { codigo: "109", descricao: "ENERGETICO RED BULL 250ML", quantidade: 24, valor_unitario: "8,50", valor_total: "204,00", cfop: "5102" },
                          { codigo: "110", descricao: "GELO EM CUBO 5KG", quantidade: 5, valor_unitario: "11,00", valor_total: "55,00", cfop: "5102" },
                          { codigo: "111", descricao: "TONICA SCHWEPPES 350ML", quantidade: 12, valor_unitario: "3,52", valor_total: "42,25", cfop: "5102" },
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

      return Promise.resolve({ ok: false, status: 400 });
    });

    const result = await processDanfeDocument({
      base64: "base64_brasnorte_real",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-brasnorte-123",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    // 1. Verificações de Cabeçalho
    expect(result.success).toBe(true);
    expect(result.cabecalho?.fornecedor).toBe("Brasnorte Distribuidora de Bebidas Ltda");
    expect(result.cabecalho?.cnpj_fornecedor).toBe("03.456.789/0001-90");
    expect(result.cabecalho?.numero_nf).toBe("000.083.208");
    expect(result.cabecalho?.serie_nf).toBe("1");
    expect(result.cabecalho?.data_emissao).toBe("2026-08-20");

    // 2. Verificações de Totais e Produtos
    expect(result.valores_totais?.valor_produtos).toBe(1105.25);
    expect(result.valores_totais?.valor_total_nf).toBe(1105.25);
    expect(result.itens).toHaveLength(11);
    expect(result.validacao.somaItens).toBe(1105.25);
    expect(result.validacao.valido).toBe(true);
    expect(result.status).toBe("sucesso");

    // 3. Verificações na Mensagem Formatada (Paridade Visual com o Telegram)
    expect(result.mensagemFormatada).toContain("📄 **Nota Fiscal de Compra Identificada!**");
    expect(result.mensagemFormatada).toContain("🏢 **Fornecedor:** Brasnorte Distribuidora de Bebidas Ltda");
    expect(result.mensagemFormatada).toContain("📋 **NF:** 000.083.208 (Série 1)");
    expect(result.mensagemFormatada).toContain("📅 **Emissão:** 20/08/2026");
    expect(result.mensagemFormatada).toContain("💵 **Valor Total da Nota:** R$ 1.105,25");
    expect(result.mensagemFormatada).toContain("📄 **Valor dos Produtos na NF:** R$ 1.105,25");
    expect(result.mensagemFormatada).toContain("📦 **Itens:** 11 produtos");

    // Todos os 11 produtos devem estar listados sem truncamento
    expect(result.mensagemFormatada).toContain("1. **CERVEJA HEINEKEN 330ML**");
    expect(result.mensagemFormatada).toContain("11. **TONICA SCHWEPPES 350ML**");
    expect(result.mensagemFormatada).toContain("Custo Líquido:");
    expect(result.mensagemFormatada).not.toContain("... e mais");

    // Seção de conferência e segurança
    expect(result.mensagemFormatada).toContain("💰 **Soma dos produtos extraídos:** R$ 1.105,25");
    expect(result.mensagemFormatada).toContain("✅ **Valores conferidos**");
    expect(result.mensagemFormatada).toContain("🔒 *Nenhuma alteração foi feita no estoque.*");
  });


  it("Normaliza aliases quando os campos vêm com nomes alternativos ou fora de 'cabecalho'", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      const prompt = body.contents[0].parts[0].text;

      if (prompt.includes("orientacao_leitura")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 0 }) }] } }] }),
        });
      }

      if (prompt.includes("quadro CÁLCULO DO IMPOSTO")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        emitente: "Brasnorte Alternativo",
                        cnpj_emitente: "03.456.789/0001-90",
                        n_nf: "000.083.208",
                        serie: "1",
                        emissao: "2026-08-20",
                        totais: {
                          total_produtos: 500,
                          total_nota: 500,
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

      if (prompt.includes("DADOS DO PRODUTO")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "1", descricao: "Item A", quantidade: 1, valor_unitario: 500, valor_total: 500, cfop: "5102" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false });
    });

    const result = await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-1",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.cabecalho?.fornecedor).toBe("Brasnorte Alternativo");
    expect(result.cabecalho?.numero_nf).toBe("000.083.208");
    expect(result.valores_totais?.valor_produtos).toBe(500);
    expect(result.validacao.valido).toBe(true);
  });

  it("Brasnorte em 270° (foto deitada de celular): rotaciona fisicamente, recorta tabela e extrai 11 itens somando R$ 1.105,25", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      const prompt = body.contents[0].parts[0].text;

      // 1. Orientação detectada como 270°
      if (prompt.includes("orientacao_leitura")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 270 }) }] } }],
          }),
        });
      }

      // 2. Cabeçalho chamado APÓS rotação da matriz
      if (prompt.includes("quadro CÁLCULO DO IMPOSTO")) {
        return Promise.resolve({
          ok: true,
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
                          numero_nf: "000.083.208",
                          serie_nf: "1",
                          data_emissao: "2026-08-20",
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

      // 3. Tabela chamada sobre recorte da matriz rotacionada
      if (prompt.includes("DADOS DO PRODUTO")) {
        return Promise.resolve({
          ok: true,
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

      return Promise.resolve({ ok: false });
    });

    const result = await processDanfeDocument({
      base64: "base64_foto_deitada_270",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-brasnorte-270",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens).toHaveLength(11);
    expect(result.validacao.somaItens).toBe(1105.25);
    expect(result.validacao.valido).toBe(true);
    expect(result.status).toBe("sucesso");
    expect(result.mensagemFormatada).toContain("1. **CERVEJA HEINEKEN 330ML**");
    expect(result.mensagemFormatada).toContain("11. **TONICA SCHWEPPES 350ML**");
    expect(result.mensagemFormatada).toContain("💰 **Soma dos produtos extraídos:** R$ 1.105,25");
  });
});

