/**
 * Testes de Resiliência de Infraestrutura — DANFE Failover contra 429 / Timeout / 5xx
 * 
 * Cenários:
 * A. Gemini primário OK -> fallback não chamado
 * B. Gemini 429 -> fallback OpenAI chamado
 * C. Gemini timeout -> fallback OpenAI chamado
 * D. Gemini 503 -> fallback OpenAI chamado
 * E. Divergência fiscal -> fallback NÃO chamado (mantém fail-closed)
 * F. Ambos falham -> fail-closed seguro com correlação
 * G. Estoque nunca alterado
 * H. Mesmo resultado fiscal independente do provider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";

describe("DANFE Failover & Resiliência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A: Gemini primário OK -> fallback não é chamado", async () => {
    const fetchCalls: string[] = [];

    const mockFetch = vi.fn().mockImplementation((url: string, init: any) => {
      fetchCalls.push(url);
      const body = JSON.parse(init.body);
      const prompt = body.contents?.[0]?.parts?.[0]?.text || body.messages?.[0]?.content || "";

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
                        cabecalho: { fornecedor: "Fornecedor Primário", numero_nf: "100" },
                        valores_totais: { valor_produtos: 100, valor_total_nf: 100 },
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
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "1", descricao: "Produto Gemini", quantidade: 1, valor_unitario: 100, valor_total: 100, cfop: "5102" }],
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
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Gemini");
    expect(fetchCalls.every((u) => u.includes("googleapis.com"))).toBe(true);
    expect(fetchCalls.some((u) => u.includes("openai.com"))).toBe(false);
  });

  it("B: Gemini 429 (Rate Limit) -> aciona fallback OpenAI e processa com sucesso", async () => {
    const fetchCalls: string[] = [];

    const mockFetch = vi.fn().mockImplementation((url: string, init: any) => {
      fetchCalls.push(url);

      // Gemini falha com 429 Rate Limit
      if (url.includes("googleapis.com")) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => "RESOURCE_EXHAUSTED",
        });
      }

      // Fallback OpenAI responde com sucesso
      if (url.includes("openai.com")) {
        const body = JSON.parse(init.body);
        const sys = body.messages[0].content;

        if (sys.includes("quadro CÁLCULO DO IMPOSTO")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor via Fallback OpenAI", numero_nf: "200" },
                      valores_totais: { valor_produtos: 250, valor_total_nf: 250 },
                    }),
                  },
                },
              ],
            }),
          });
        }

        if (sys.includes("DADOS DO PRODUTO")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      itens: [{ codigo: "2", descricao: "Produto OpenAI Fallback", quantidade: 5, valor_unitario: 50, valor_total: 250, cfop: "5102" }],
                    }),
                  },
                },
              ],
            }),
          });
        }
      }

      return Promise.resolve({ ok: false, status: 500 });
    });

    const result = await processDanfeDocument({
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto OpenAI Fallback");
    expect(result.validacao.valido).toBe(true);
    expect(fetchCalls.some((u) => u.includes("openai.com"))).toBe(true);
  });

  it("C: Gemini Timeout -> aciona fallback OpenAI", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init: any) => {
      if (url.includes("googleapis.com")) {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "AbortError";
        return Promise.reject(error);
      }

      if (url.includes("openai.com")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    cabecalho: { fornecedor: "Fornecedor Timeout Recovered", numero_nf: "300" },
                    valores_totais: { valor_produtos: 50, valor_total_nf: 50 },
                    itens: [{ codigo: "3", descricao: "Produto Recovered", quantidade: 1, valor_unitario: 50, valor_total: 50, cfop: "5102" }],
                  }),
                },
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false });
    });

    const result = await processDanfeDocument({
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Recovered");
  });

  it("D: Gemini 503 Server Error -> aciona fallback OpenAI", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("googleapis.com")) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        });
      }

      if (url.includes("openai.com")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    cabecalho: { fornecedor: "Fornecedor 503 Recovered", numero_nf: "400" },
                    valores_totais: { valor_produtos: 75, valor_total_nf: 75 },
                    itens: [{ codigo: "4", descricao: "Produto 503", quantidade: 1, valor_unitario: 75, valor_total: 75, cfop: "5102" }],
                  }),
                },
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false });
    });

    const result = await processDanfeDocument({
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto 503");
  });

  it("E: Divergência fiscal matemática -> NÃO aciona fallback de provider e mantém fail-closed", async () => {
    let openAiCalled = false;

    const mockFetch = vi.fn().mockImplementation((url: string, init: any) => {
      if (url.includes("openai.com")) {
        openAiCalled = true;
      }

      // Gemini responde perfeitamente, mas com divergência na NF
      const body = JSON.parse(init.body);
      const prompt = body.contents?.[0]?.parts?.[0]?.text || "";

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
                        cabecalho: { fornecedor: "Fornecedor Divergente", numero_nf: "500" },
                        valores_totais: { valor_produtos: 999.00, valor_total_nf: 999.00 }, // R$ 999
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
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "5", descricao: "Produto Barato", quantidade: 1, valor_unitario: 10, valor_total: 10, cfop: "5102" }], // R$ 10 != R$ 999
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
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.validacao.valido).toBe(false);
    expect(result.status).toBe("requer_revisao");
    expect(openAiCalled).toBe(false); // Fallback NÃO deve ser acionado por erro de negócio
  });

  it("F: Ambos provedores falham -> fail-closed seguro sem mutação", async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        text: async () => "Both Providers Down",
      });
    });

    const result = await processDanfeDocument({
      base64: "base64_img",
      mimeType: "image/jpeg",
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as any,
    });

    expect(result.itens).toHaveLength(0);
    expect(result.validacao.valido).toBe(false);
    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });
});
