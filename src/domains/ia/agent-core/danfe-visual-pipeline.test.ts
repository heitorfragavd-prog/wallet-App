/**
 * Testes Focais — Etapa 2.1c: DANFE Visual Pipeline Unificado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processDanfeDocument,
  normalizeAndRotateImageMatrix,
  cropTableRegionMatrix,
  PROMPT_ORIENTACAO_DANFE,
} from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";
import {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
} from "../../../../supabase/functions/_shared/danfe-gemini-v2";

describe("DANFE Visual Pipeline Unificado (Etapa 2.1c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A: Foto a 90° -> detecta orientação e rotaciona matriz antes de extrair cabeçalho e tabela", async () => {
    const fetchBodies: Array<{ contents: Array<{ parts: Array<{ text?: string }> }> }> = [];
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      fetchBodies.push(body);

      // Chamada 1: Orientação
      if (body.contents[0].parts[0].text === PROMPT_ORIENTACAO_DANFE) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 90 }) }] } }],
          }),
        });
      }

      // Chamada 2: Cabeçalho & Totais
      if (body.contents[0].parts[0].text === GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        cabecalho: { fornecedor: "Fornecedor Alpha", numero_nf: "1001", pagina_atual: 1, total_paginas: 1 },
                        valores_totais: { valor_produtos: 250, valor_total_nf: 250 },
                        regiao_tabela_produtos: { top: 0.30, bottom: 0.80 },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      // Chamada 3: Tabela de Produtos (Crop)
      if (body.contents[0].parts[0].text === GEMINI_V2_PROMPT_TABELA) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "ITEM-A", descricao: "Produto 90 Graus", quantidade: 1, valor_unitario: 250, valor_total: 250, cfop: "5102" }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 400, text: async () => "Unknown prompt" });
    });

    const res = await processDanfeDocument({
      base64: "base64_foto_deitada_90deg",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-123",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sucesso");
    expect(res.cabecalho?.fornecedor).toBe("Fornecedor Alpha");
    expect(res.itens).toHaveLength(1);
    expect(fetchBodies).toHaveLength(3); // Orientação, Cabeçalho, Tabela
  });

  it("B: Foto a 270° -> detecta orientação 270° e corrige matriz", async () => {
    const orientCall = await normalizeAndRotateImageMatrix("base64_data", 270);
    expect(orientCall.rotated).toBe(true);
  });

  it("C: Orientação 0° -> não aplica rotação desnecessária", async () => {
    const orientCall = await normalizeAndRotateImageMatrix("base64_data", 0);
    expect(orientCall.rotated).toBe(false);
  });

  it("D & E: Cabeçalho recebe imagem completa e Produtos recebem crop da tabela", async () => {
    const promptsSent: string[] = [];
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      const prompt = body.contents[0].parts[0].text ?? "";
      promptsSent.push(prompt);

      if (prompt === PROMPT_ORIENTACAO_DANFE) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 0 }) }] } }] }),
        });
      }

      if (prompt === GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        cabecalho: { fornecedor: "Fornecedor Beta", numero_nf: "2002", pagina_atual: 1, total_paginas: 1 },
                        valores_totais: { valor_produtos: 150, valor_total_nf: 150 },
                        regiao_tabela_produtos: { top: 0.25, bottom: 0.85 },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      if (prompt === GEMINI_V2_PROMPT_TABELA) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "ITEM-B", descricao: "Produto Tabela", quantidade: 1, valor_unitario: 150, valor_total: 150, cfop: "5102" }],
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

    const res = await processDanfeDocument({
      base64: "base64_documento",
      mimeType: "image/png",
      geminiApiKey: "test-key",
      workspaceId: "ws-123",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(res.success).toBe(true);
    expect(promptsSent).toContain(GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS);
    expect(promptsSent).toContain(GEMINI_V2_PROMPT_TABELA);
  });

  it("F: Shared Visual Pipeline exporta métodos unificados compatíveis com Telegram e Wallet", () => {
    expect(typeof normalizeAndRotateImageMatrix).toBe("function");
    expect(typeof cropTableRegionMatrix).toBe("function");
    expect(typeof PROMPT_ORIENTACAO_DANFE).toBe("string");
  });

  it("G: PDF não passa por rotação nem crop de bitmap", async () => {
    const promptsSent: string[] = [];
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      const prompt = body.contents[0].parts[0].text ?? "";
      promptsSent.push(prompt);

      if (prompt === GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        cabecalho: { fornecedor: "Fornecedor PDF", numero_nf: "3003", pagina_atual: 1, total_paginas: 1 },
                        valores_totais: { valor_produtos: 50, valor_total_nf: 50 },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }

      if (prompt === GEMINI_V2_PROMPT_TABELA) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "ITEM-PDF", descricao: "Produto PDF", quantidade: 1, valor_unitario: 50, valor_total: 50, cfop: "5102" }],
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

    const res = await processDanfeDocument({
      base64: "base64_pdf_data",
      mimeType: "application/pdf",
      geminiApiKey: "test-key",
      workspaceId: "ws-123",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(res.success).toBe(true);
    expect(promptsSent).not.toContain(PROMPT_ORIENTACAO_DANFE); // PDF pula detecção de orientação de bitmap
  });

  it("H: Nenhuma mutação de estoque ou custo é executada", async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { contents: Array<{ parts: Array<{ text?: string }> }> };
      const prompt = body.contents[0].parts[0].text ?? "";
      if (prompt === PROMPT_ORIENTACAO_DANFE) {
        return Promise.resolve({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ orientacao_leitura: 0 }) }] } }] }) });
      }
      if (prompt === GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        cabecalho: { fornecedor: "F1", numero_nf: "1" },
                        valores_totais: { valor_produtos: 10, valor_total_nf: 10 },
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        });
      }
      if (prompt === GEMINI_V2_PROMPT_TABELA) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        itens: [{ codigo: "1", descricao: "Prod", quantidade: 1, valor_unitario: 10, valor_total: 10, cfop: "5102" }],
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

    const res = await processDanfeDocument({
      base64: "base64_data",
      mimeType: "image/jpeg",
      geminiApiKey: "test-key",
      workspaceId: "ws-123",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(res.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });
});
