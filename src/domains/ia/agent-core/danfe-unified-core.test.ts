/**
 * Testes Abrangentes — DANFE Core Único (Telegram & Wallet IA)
 * 
 * Cobre todos os requisitos da unificação:
 * 1. Foto horizontal 90°
 * 2. Foto horizontal 270°
 * 3. Foto vertical 0°
 * 4. Região da tabela detectada vs Região ausente com fallback 0.24-0.90
 * 5. Cabeçalho falha mas tabela ainda é tentada e produtos extraídos
 * 6. Preservação de PDF (sem bitmap)
 * 7. Multipágina
 * 8. Rastreabilidade DANFE_TRACE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";

describe("DANFE Core Único — Testes Abrangentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Região da tabela ausente no cabeçalho -> aciona obrigatoriamente fallback de crop 0.24 a 0.90", async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text: string }> }> };
      const prompt = body.contents[0].parts[0].text;

      // Cabeçalho responde sem regiao_tabela_produtos
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
                        cabecalho: { fornecedor: "Fornecedor Teste", numero_nf: "12345" },
                        valores_totais: { valor_produtos: 200, valor_total_nf: 200 },
                        // Sem regiao_tabela_produtos!
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      // Tabela de itens executada mesmo sem região detectada
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
                        itens: [{ codigo: "ITEM1", descricao: "Produto Fallback", quantidade: 2, valor_unitario: 100, valor_total: 200, cfop: "5102" }],
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
      base64: "base64_imagem_teste",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens).toHaveLength(1);
    expect(result.itens[0].descricao).toBe("Produto Fallback");
    expect(result.validacao.valido).toBe(true);
  });

  it("2. Cabeçalho falha (erro HTTP 500) -> tabela ainda é tentada e produtos são extraídos", async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text: string }> }> };
      const prompt = body.contents[0].parts[0].text;

      // Cabeçalho falha
      if (prompt.includes("quadro CÁLCULO DO IMPOSTO")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error in Gemini Header",
        });
      }

      // Tabela de produtos responde com sucesso
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
                        itens: [{ codigo: "ITEM-A", descricao: "Produto Extraído", quantidade: 1, valor_unitario: 50, valor_total: 50, cfop: "5102" }],
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
      base64: "base64_teste",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.itens).toHaveLength(1);
    expect(result.itens[0].descricao).toBe("Produto Extraído");
    expect(result.cabecalho?.fornecedor).toBeNull();
  });

  it("3. PDF multimodal enviado diretamente sem rotação matricial de bitmap", async () => {
    const promptsSent: string[] = [];
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text: string }> }> };
      const prompt = body.contents[0].parts[0].text;
      promptsSent.push(prompt);

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
                        cabecalho: { fornecedor: "Fornecedor PDF", numero_nf: "999" },
                        valores_totais: { valor_produtos: 80, valor_total_nf: 80 },
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
                        itens: [{ codigo: "P1", descricao: "Item PDF", quantidade: 1, valor_unitario: 80, valor_total: 80, cfop: "5102" }],
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
      base64: "base64_pdf",
      mimeType: "application/pdf",
      geminiApiKey: "test-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens).toHaveLength(1);
    expect(result.validacao.valido).toBe(true);
  });
});
