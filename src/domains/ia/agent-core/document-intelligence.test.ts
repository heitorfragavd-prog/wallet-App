/**
 * Testes da Etapa 2.1 — Document Intelligence na Wallet IA
 *
 * Cenários Obrigatórios:
 * A. Imagem DANFE -> DOCUMENT -> DANFE
 * B. PDF DANFE -> DOCUMENT -> DANFE
 * C. Arquivo desconhecido -> não executa ação / mensagem segura
 * D. Página 1 de 2 -> status parcial_multipagina, permanece pendente
 * E. Página 2 de 2 -> consolida mesma sessão multipágina e revalida
 * F. Workspace diferente -> não reutiliza sessão de outro workspace
 * G. DANFE inválida / divergente -> status requer_revisao, não altera estoque
 * H. Boleto / Comprovante -> identificado e marcado como GAP 2.2, sem execução
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyDocument } from "../types/document";
import { routeMessage } from "../services/WalletAIRouter";
import { processDanfeDocument, type DanfeSessionState } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";
import { processWalletDocument } from "../services/WalletDocumentService";

describe("Etapa 2.1 — Document Intelligence e DANFE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // A. Imagem DANFE -> DOCUMENT -> DANFE
  // ──────────────────────────────────────────────────────────────────────────
  it("A: Imagem de nota fiscal é classificada como DOCUMENT no Router e processada como DANFE", () => {
    const routeDecision = routeMessage({
      message: "Analise esta nota",
      attachments: [{ type: "image", mimeType: "image/jpeg" }],
    });

    expect(routeDecision.route).toBe("DOCUMENT");

    const classification = classifyDocument("nota_fiscal_001.jpg", "image/jpeg", "Analise esta nota");
    expect(classification.tipo).toBe("DANFE");
    expect(classification.confianca).toBeGreaterThanOrEqual(0.6);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. PDF DANFE -> DOCUMENT -> DANFE
  // ──────────────────────────────────────────────────────────────────────────
  it("B: PDF de DANFE é classificado como DOCUMENT no Router e processado como DANFE", () => {
    const routeDecision = routeMessage({
      message: "Segue a DANFE em anexo",
      attachments: [{ type: "pdf", mimeType: "application/pdf" }],
    });

    expect(routeDecision.route).toBe("DOCUMENT");

    const classification = classifyDocument("DANFE_12345.pdf", "application/pdf", "Segue a DANFE em anexo");
    expect(classification.tipo).toBe("DANFE");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. Arquivo desconhecido -> não executa ação
  // ──────────────────────────────────────────────────────────────────────────
  it("C: Arquivo desconhecido -> não dispara ações financeiras e retorna aviso seguro", async () => {
    const classification = classifyDocument("planilha_aleatoria.xyz", "application/octet-stream", "Aqui está o arquivo");
    expect(classification.tipo).toBe("DESCONHECIDO");

    const response = await processWalletDocument({
      fileName: "planilha_aleatoria.xyz",
      mimeType: "application/octet-stream",
      base64: "dGVzdGU=",
      workspaceId: "ws-test-1",
      textContext: "Aqui está o arquivo",
    });

    expect(response.tipo).toBe("DESCONHECIDO");
    expect(response.content).toContain("Não identifiquei este arquivo");
    expect(response.content).toContain("Nenhuma ação foi executada");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. Página 1 de 2 -> status parcial_multipagina, permanece pendente
  // ──────────────────────────────────────────────────────────────────────────
  it("D: Página 1 de 2 -> identifica como multipágina pendente e aguarda folha complementar", async () => {
    // Mock do Gemini retornando folha 1 de 2
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: {
                        fornecedor: "Distribuidora Ambev",
                        numero_nf: "100.200",
                        pagina_atual: 1,
                        total_paginas: 2,
                      },
                      valores_totais: {
                        valor_produtos: 5000.0,
                        valor_total_nf: 5000.0,
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      itens: [
                        {
                          codigo: "PROD1",
                          descricao: "Cerveja Corona 330ml",
                          quantidade: 100,
                          valor_unitario: 25.0,
                          valor_total: 2500.0,
                          unidade: "CX",
                          ncm: "22030000",
                          cfop: "5102",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await processDanfeDocument({
      base64: "base64_folha1",
      mimeType: "image/jpeg",
      geminiApiKey: "fake-key",
      workspaceId: "ws-test-1",
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("parcial_multipagina");
    expect(result.mensagemFormatada).toContain("Recebi a página 1 de 2");
    expect(result.mensagemFormatada).toContain("Estou aguardando a página 2");
    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
    expect(result.sessionState?.totalPaginas).toBe(2);
    expect(result.sessionState?.paginasRecebidas).toEqual([1]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. Página 2 de 2 -> consolida mesma sessão
  // ──────────────────────────────────────────────────────────────────────────
  it("E: Página 2 de 2 -> mescla itens da folha 1 e 2, valida soma matemática total", async () => {
    // Sessão prévia da página 1
    const previousSession: DanfeSessionState = {
      fornecedor: "Distribuidora Ambev",
      numeroNf: "100.200",
      valorProdutosDeclarado: 5000.0,
      valorTotalNfDeclarado: 5000.0,
      totalPaginas: 2,
      paginasRecebidas: [1],
      workspaceId: "ws-test-1",
      itensAcumulados: [
        {
          codigo: "PROD1",
          ean: null,
          descricao: "Cerveja Corona 330ml",
          ncm: "22030000",
          cst: null,
          cfop: "5102",
          unidade: "CX",
          quantidade: 100,
          valor_unitario_lido: 25.0,
          valor_unitario_calculado: null,
          valor_unitario_inferido: false,
          valor_total_lido: 2500.0,
          valor_total_calculado: null,
          valor_total_inferido: false,
          valor_total: 2500.0,
          valor_unitario: 25.0,
          fci_info: null,
          campos_incompletos: [],
        },
      ],
    };

    // Mock do Gemini para a página 2
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: {
                        fornecedor: "Distribuidora Ambev",
                        numero_nf: "100.200",
                        pagina_atual: 2,
                        total_paginas: 2,
                      },
                      valores_totais: {
                        valor_produtos: 5000.0,
                        valor_total_nf: 5000.0,
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      itens: [
                        {
                          codigo: "PROD2",
                          descricao: "Cerveja Stella Artois 330ml",
                          quantidade: 100,
                          valor_unitario: 25.0,
                          valor_total: 2500.0,
                          unidade: "CX",
                          ncm: "22030000",
                          cfop: "5102",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await processDanfeDocument({
      base64: "base64_folha2",
      mimeType: "image/jpeg",
      geminiApiKey: "fake-key",
      workspaceId: "ws-test-1",
      existingSession: previousSession,
      fetchImpl: mockFetch as any,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("sucesso");
    expect(result.itens).toHaveLength(2);
    expect(result.validacao.valido).toBe(true);
    expect(result.validacao.somaItens).toBe(5000.0);
    expect(result.mensagemFormatada).toContain("Valores conferidos");
    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");

  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. Workspace diferente -> não reutiliza sessão
  // ──────────────────────────────────────────────────────────────────────────
  it("F: Workspace diferente -> sessão multipágina de outro workspace NÃO é mesclada", async () => {
    const sessionOtherWorkspace: DanfeSessionState = {
      fornecedor: "Outro Fornecedor",
      numeroNf: "999",
      totalPaginas: 2,
      paginasRecebidas: [1],
      workspaceId: "ws-empresa-A",
      itensAcumulados: [],
    };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Novo Fornecedor", numero_nf: "111", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 100.0, valor_total_nf: 100.0 },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      itens: [
                        { codigo: "P1", descricao: "Item 1", quantidade: 1, valor_unitario: 100.0, valor_total: 100.0, cfop: "5102" },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await processDanfeDocument({
      base64: "base64",
      mimeType: "image/jpeg",
      geminiApiKey: "fake-key",
      workspaceId: "ws-empresa-B", // Diferente de ws-empresa-A
      existingSession: sessionOtherWorkspace,
      fetchImpl: mockFetch as any,
    });

    // Sessão do workspace B é criada do zero
    expect(result.sessionState?.workspaceId).toBe("ws-empresa-B");
    expect(result.cabecalho?.fornecedor).toBe("Novo Fornecedor");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // G. DANFE inválida -> requer revisão e não altera nada
  // ──────────────────────────────────────────────────────────────────────────
  it("G: DANFE com divergência matemática -> status requer_revisao, não altera estoque", async () => {
    // Declarado: R$ 1000 | Itens somam: R$ 800
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor X", numero_nf: "555", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 1000.0, valor_total_nf: 1000.0 },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      itens: [
                        { codigo: "ITEM1", descricao: "Produto Divergente", quantidade: 8, valor_unitario: 100.0, valor_total: 800.0, cfop: "5102" },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

    const result = await processDanfeDocument({
      base64: "base64",
      mimeType: "image/jpeg",
      geminiApiKey: "fake-key",
      workspaceId: "ws-test-1",
      fetchImpl: mockFetch as any,
    });

    expect(result.status).toBe("requer_revisao");
    expect(result.validacao.valido).toBe(false);
    expect(result.mensagemFormatada).toContain("Requer Revisão");
    expect(result.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // H. Boleto / Comprovante -> GAP 2.2 declarado, sem execução
  // ──────────────────────────────────────────────────────────────────────────
  it("H: Boleto e Comprovante identificados -> GAP Etapa 2.2 declarado explicitamente sem mutação", async () => {
    const boletoRes = await processWalletDocument({
      fileName: "boleto_itau_agosto.pdf",
      mimeType: "application/pdf",
      base64: "base64",
      workspaceId: "ws-test-1",
      textContext: "Pagar este boleto",
    });

    expect(boletoRes.tipo).toBe("BOLETO");
    expect(boletoRes.content).toContain("Boleto Bancário Identificado");
    expect(boletoRes.content).toContain("Etapa 2.2");
    expect(boletoRes.content).toContain("Nenhum pagamento ou lançamento foi realizado");

    const compRes = await processWalletDocument({
      fileName: "comprovante_pix_fornecedor.png",
      mimeType: "image/png",
      base64: "base64",
      workspaceId: "ws-test-1",
      textContext: "Comprovante do Pix",
    });

    expect(compRes.tipo).toBe("COMPROVANTE");
    expect(compRes.content).toContain("Comprovante de Pagamento Identificado");
    expect(compRes.content).toContain("Etapa 2.2");
    expect(compRes.content).toContain("Nenhuma alteração foi realizada nas suas contas");
  });
});
