/**
 * Testes de Regressão — Extração DANFE, Sanitização e Contratos de Imagem
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processDanfeDocument } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";

describe("DANFE Extraction Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Sanitiza Base64 com prefixo dataURL e quebras de linha sem quebrar a chamada do Gemini", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Distribuidora Teste", numero_nf: "123", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 500, valor_total_nf: 500 },
                      itens: [
                        { codigo: "C1", descricao: "Produto Teste", quantidade: 5, valor_unitario: 100, valor_total: 500, cfop: "5102" },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    const dirtyBase64 = "data:image/jpeg;base64,\r\n  dGVzdGU=  \n\r";
    const result = await processDanfeDocument({
      base64: dirtyBase64,
      mimeType: "image/jpeg",
      geminiApiKey: "fake-key",
      workspaceId: "ws-1",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(capturedBody).toBeDefined();
    // Confirma que o base64 enviado ao Gemini não contém 'data:image' nem quebras de linha
    const inlineData = capturedBody.contents[0].parts[1].inline_data;
    expect(inlineData.data).toBe("dGVzdGU=");
    expect(inlineData.mime_type).toBe("image/jpeg");
  });

  it("Preserva MIME type application/pdf para documentos PDF", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor PDF", numero_nf: "456", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 100, valor_total_nf: 100 },
                      itens: [{ codigo: "P1", descricao: "Item PDF", quantidade: 1, valor_unitario: 100, valor_total: 100, cfop: "5102" }],
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
      base64: "dGVzdGU=",
      mimeType: "application/pdf",
      geminiApiKey: "fake-key",
      workspaceId: "ws-1",
      fetchImpl: mockFetch as any,
    });

    const inlineData = capturedBody.contents[0].parts[1].inline_data;
    expect(inlineData.mime_type).toBe("application/pdf");
  });
});
