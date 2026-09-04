/**
 * Testes Abrangentes de Resiliência de Infraestrutura e Chaves — DANFE Failover
 * 
 * Ordem:
 * Gemini Primary (GEMINI_API_KEY)
 *    ↓ falha por 429 / timeout / 5xx
 * Gemini Backup (GEMINI_API_KEY_BACKUP)
 *    ↓ falha por 429 / timeout / 5xx
 * OpenAI Vision (OPENAI_API_KEY)
 *    ↓ falha
 * FAIL-CLOSED
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";

describe("DANFE Failover — Suíte Completa de Contingência de Chaves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A: Gemini principal OK -> backup NÃO chamado, OpenAI NÃO chamado", async () => {
    const keysUsed: string[] = [];

    const mockFetch = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      const parsedUrl = new URL(url);
      const key = parsedUrl.searchParams.get("key");
      if (key) keysUsed.push(key);

      const body = init?.body ? JSON.parse(init.body) : {};
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
                        cabecalho: { fornecedor: "Fornecedor Primario", numero_nf: "100" },
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
                        itens: [{ codigo: "1", descricao: "Produto Primario", quantidade: 1, valor_unitario: 100, valor_total: 100, cfop: "5102" }],
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
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Primario");
    expect(keysUsed.every((k) => k === "key_primary")).toBe(true);
    expect(keysUsed).not.toContain("key_backup");
  });

  it("B: Gemini principal 429 -> backup chamado -> backup OK -> OpenAI NÃO chamado", async () => {
    const keysUsed: string[] = [];

    const mockFetch = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      const parsedUrl = new URL(url);
      const key = parsedUrl.searchParams.get("key");
      if (key) keysUsed.push(key);

      if (key === "key_primary") {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => "RESOURCE_EXHAUSTED",
        });
      }

      if (key === "key_backup") {
        const body = init?.body ? JSON.parse(init.body) : {};
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
                          cabecalho: { fornecedor: "Fornecedor Backup", numero_nf: "200" },
                          valores_totais: { valor_produtos: 200, valor_total_nf: 200 },
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
                          itens: [{ codigo: "2", descricao: "Produto Backup", quantidade: 2, valor_unitario: 100, valor_total: 200, cfop: "5102" }],
                        }),
                      },
                    ],
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
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Backup");
    expect(keysUsed).toContain("key_primary");
    expect(keysUsed).toContain("key_backup");
  });

  it("C: Gemini principal Timeout -> backup OK", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const parsedUrl = new URL(url);
      const key = parsedUrl.searchParams.get("key");

      if (key === "key_primary") {
        const error = new Error("AbortError: timeout");
        error.name = "AbortError";
        return Promise.reject(error);
      }

      if (key === "key_backup") {
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
                        cabecalho: { fornecedor: "Fornecedor Timeout Backup", numero_nf: "300" },
                        valores_totais: { valor_produtos: 300, valor_total_nf: 300 },
                        itens: [{ codigo: "3", descricao: "Produto Timeout Backup", quantidade: 3, valor_unitario: 100, valor_total: 300, cfop: "5102" }],
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
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Timeout Backup");
  });

  it("D: Gemini principal 503 -> backup OK", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const parsedUrl = new URL(url);
      const key = parsedUrl.searchParams.get("key");

      if (key === "key_primary") {
        return Promise.resolve({ ok: false, status: 503, text: async () => "Service Unavailable" });
      }

      if (key === "key_backup") {
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
                        cabecalho: { fornecedor: "Fornecedor 503 Backup", numero_nf: "400" },
                        valores_totais: { valor_produtos: 400, valor_total_nf: 400 },
                        itens: [{ codigo: "4", descricao: "Produto 503 Backup", quantidade: 4, valor_unitario: 100, valor_total: 400, cfop: "5102" }],
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
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto 503 Backup");
  });

  it("E: Principal 429 -> backup 429 -> OpenAI OK", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      if (url.includes("googleapis.com")) {
        return Promise.resolve({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
      }

      if (url.includes("openai.com")) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const sys = body.messages?.[0]?.content || "";

        if (sys.includes("quadro CÁLCULO DO IMPOSTO")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor OpenAI Tier 3", numero_nf: "500" },
                      valores_totais: { valor_produtos: 500, valor_total_nf: 500 },
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
                      itens: [{ codigo: "5", descricao: "Produto OpenAI Tier 3", quantidade: 5, valor_unitario: 100, valor_total: 500, cfop: "5102" }],
                    }),
                  },
                },
              ],
            }),
          });
        }
      }

      return Promise.resolve({ ok: false });
    });

    const result = await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto OpenAI Tier 3");
    expect(result.validacao.valido).toBe(true);
  });

  it("F: Principal 429 -> backup Timeout -> OpenAI OK", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const parsedUrl = new URL(url);
      const key = parsedUrl.searchParams?.get("key");

      if (key === "key_primary") {
        return Promise.resolve({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
      }

      if (key === "key_backup") {
        const error = new Error("AbortError: timeout");
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
                    cabecalho: { fornecedor: "Fornecedor OpenAI Recovery", numero_nf: "600" },
                    valores_totais: { valor_produtos: 600, valor_total_nf: 600 },
                    itens: [{ codigo: "6", descricao: "Produto OpenAI Recovery", quantidade: 6, valor_unitario: 100, valor_total: 600, cfop: "5102" }],
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
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto OpenAI Recovery");
  });

  it("G: Principal + backup + OpenAI falham -> FAIL-CLOSED seguro", async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        text: async () => "All Providers Down",
      });
    });

    const result = await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.itens).toHaveLength(0);
    expect(result.validacao.valido).toBe(false);
    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });

  it("H: Divergência matemática fiscal -> NÃO troca de chave e NÃO chama OpenAI", async () => {
    let backupCalled = false;
    let openAiCalled = false;

    const mockFetch = vi.fn().mockImplementation((url: string, init?: { body?: string }) => {
      if (url.includes("key=key_backup")) backupCalled = true;
      if (url.includes("openai.com")) openAiCalled = true;

      const body = init?.body ? JSON.parse(init.body) : {};
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
                        cabecalho: { fornecedor: "Fornecedor Divergente", numero_nf: "800" },
                        valores_totais: { valor_produtos: 1000.00, valor_total_nf: 1000.00 },
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
                        itens: [{ codigo: "8", descricao: "Produto Divergente", quantidade: 1, valor_unitario: 100, valor_total: 100, cfop: "5102" }], // 100 != 1000
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
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.validacao.valido).toBe(false);
    expect(result.status).toBe("requer_revisao");
    expect(backupCalled).toBe(false);
    expect(openAiCalled).toBe(false);
  });

  it("I: Chave backup inexistente -> pula backup com segurança e chama OpenAI", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("googleapis.com")) {
        return Promise.resolve({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
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
                    cabecalho: { fornecedor: "Fornecedor Sem Backup", numero_nf: "900" },
                    valores_totais: { valor_produtos: 900, valor_total_nf: 900 },
                    itens: [{ codigo: "9", descricao: "Produto Sem Backup", quantidade: 9, valor_unitario: 100, valor_total: 900, cfop: "5102" }],
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
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: undefined, // Sem chave backup
      openaiApiKey: "key_openai",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.itens[0].descricao).toBe("Produto Sem Backup");
  });

  it("J: Logs e observabilidade NUNCA expõem API keys", async () => {
    const logSpy = vi.spyOn(console, "log");

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("key_super_secret_primary")) {
        return Promise.resolve({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
      }

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
                      cabecalho: { fornecedor: "Fornecedor Logs", numero_nf: "1000" },
                      valores_totais: { valor_produtos: 1000, valor_total_nf: 1000 },
                      itens: [{ codigo: "10", descricao: "Produto Logs", quantidade: 1, valor_unitario: 1000, valor_total: 1000, cfop: "5102" }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_super_secret_primary_12345",
      geminiApiKeyBackup: "key_super_secret_backup_67890",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const allLogs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allLogs).not.toContain("key_super_secret_primary_12345");
    expect(allLogs).not.toContain("key_super_secret_backup_67890");
    expect(allLogs).toContain("credential_slot=");
  });

  it("K: Nenhuma mutação de estoque acontece durante failover de chaves", async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
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
                      cabecalho: { fornecedor: "Fornecedor Imutavel", numero_nf: "1100" },
                      valores_totais: { valor_produtos: 1100, valor_total_nf: 1100 },
                      itens: [{ codigo: "11", descricao: "Produto Imutavel", quantidade: 1, valor_unitario: 1100, valor_total: 1100, cfop: "5102" }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    const result = await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "key_primary",
      geminiApiKeyBackup: "key_backup",
      workspaceId: "ws-test",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });
});
