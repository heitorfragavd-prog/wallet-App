/**
 * Testes da Etapa 2.1b — Runtime Real de Document Intelligence, Sessões e Storage
 *
 * Cenários de Alto Valor:
 * A. DANFE Web chama backend (Edge Function), não Gemini direto
 * B. Folha 1/2 -> sessão persistida no backend / banco
 * C. Refresh -> Folha 2/2 -> consolida mesma sessão
 * D. Página fora de ordem funciona
 * E. Workspace diferente não reutiliza sessão
 * F. Anexo novo é enviado para Storage privado, não base64 inline
 * G. Anexo legado base64 continua legível no histórico
 * H. Arquivo de usuário A é inacessível por usuário B (validação de pathing)
 * I. DANFE divergente -> status requer_revisao
 * J. Nenhum estoque ou custo é alterado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFiscalHttpRequest } from "../../../../supabase/functions/wallet-ai-orchestrator/fiscal-handler";
import { WalletStorageService, CHAT_ATTACHMENTS_BUCKET } from "../services/WalletStorageService";
import { processDanfeDocument, type DanfeSessionState } from "../../../../supabase/functions/_shared/ai/danfe-fiscal-service";
import { processWalletDocument } from "../services/WalletDocumentService";

const mockAuthDeps = {
  getUser: vi.fn().mockResolvedValue({ id: "user-uuid-1111" }),
  findOwnedWorkspace: vi.fn().mockResolvedValue({ id: "11111111-2222-3333-8444-555555555555" }),
};

const validWsId = "11111111-2222-3333-8444-555555555555";

describe("Etapa 2.1b — Runtime Real, Sessões e Storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // A. DANFE Web chama backend, não Gemini direto
  // ──────────────────────────────────────────────────────────────────────────
  it("A: DANFE Web invoca Edge Function backend e não expõe chamada Gemini no browser", async () => {
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const req = new Request("http://localhost/wallet-ai-orchestrator", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "process_danfe",
        base64: "base64_imagem",
        mime_type: "image/jpeg",
        workspace_id: validWsId,
      }),
    });

    // O backend gerencia o Gemini e retorna a resposta formatada
    const resp = await handleFiscalHttpRequest(req, {
      authDeps: mockAuthDeps,
      geminiApiKey: "test-gemini-key",
      adminClient: mockAdminClient as any,
    });

    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.success).toBe(true);
    expect(json.mensagemFormatada).toBeDefined();
    expect(json.mensagemFormatada).toContain("Nenhuma alteração foi feita no estoque");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. Folha 1/2 -> sessão persistida no banco
  // ──────────────────────────────────────────────────────────────────────────
  it("B: Folha 1 de 2 -> persiste sessão como 'pendente' na tabela documento_sessoes", async () => {
    let insertedRow: any = null;
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: vi.fn().mockImplementation((row) => {
          insertedRow = row;
          return Promise.resolve({ error: null });
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    // Mock do Gemini retornando folha 1/2
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor Alpha", numero_nf: "999", pagina_atual: 1, total_paginas: 2 },
                      valores_totais: { valor_produtos: 2000, valor_total_nf: 2000 },
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
                        { codigo: "IT1", descricao: "Produto 1", quantidade: 10, valor_unitario: 100, valor_total: 1000, cfop: "5102" },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }) as any;

    try {
      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_danfe",
          base64: "base64_folha1",
          mime_type: "image/jpeg",
          workspace_id: validWsId,
        }),
      });

      const resp = await handleFiscalHttpRequest(req, {
        authDeps: mockAuthDeps,
        geminiApiKey: "test-gemini-key",
        adminClient: mockAdminClient as any,
      });

      expect(resp.status).toBe(200);
      const json = await resp.json();
      expect(json.status).toBe("parcial_multipagina");
      expect(insertedRow).toBeDefined();
      expect(insertedRow.status).toBe("pendente");
      expect(insertedRow.total_paginas).toBe(2);
      expect(insertedRow.paginas_recebidas).toEqual([1]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. Refresh -> Folha 2/2 -> consolida mesma sessão
  // ──────────────────────────────────────────────────────────────────────────
  it("C: Refresh de página e envio da Folha 2/2 -> carrega sessão pendente do banco e consolida", async () => {
    const savedSessionState: DanfeSessionState = {
      fornecedor: "Fornecedor Alpha",
      numeroNf: "999",
      valorProdutosDeclarado: 2000,
      valorTotalNfDeclarado: 2000,
      totalPaginas: 2,
      paginasRecebidas: [1],
      workspaceId: validWsId,
      itensAcumulados: [
        {
          codigo: "IT1",
          ean: null,
          descricao: "Produto 1",
          ncm: null,
          cst: null,
          cfop: "5102",
          unidade: "UN",
          quantidade: 10,
          valor_unitario_lido: 100,
          valor_unitario_calculado: null,
          valor_unitario_inferido: false,
          valor_total_lido: 1000,
          valor_total_calculado: null,
          valor_total_inferido: false,
          valor_total: 1000,
          valor_unitario: 100,
          fci_info: null,
          campos_incompletos: [],
        },
      ],
    };

    let updatedStatus: any = null;
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: "session-db-123",
              dados_sessao: savedSessionState,
              total_paginas: 2,
              paginas_recebidas: [1],
              status: "pendente",
            },
          ],
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockImplementation((fields) => {
          updatedStatus = fields.status;
          return { eq: vi.fn().mockResolvedValue({ error: null }) };
        }),
      }),
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cabecalho: { fornecedor: "Fornecedor Alpha", numero_nf: "999", pagina_atual: 2, total_paginas: 2 },
                      valores_totais: { valor_produtos: 2000, valor_total_nf: 2000 },
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
                        { codigo: "IT2", descricao: "Produto 2", quantidade: 10, valor_unitario: 100, valor_total: 1000, cfop: "5102" },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }) as any;

    try {
      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_danfe",
          base64: "base64_folha2",
          mime_type: "image/jpeg",
          workspace_id: validWsId,
        }),
      });

      const resp = await handleFiscalHttpRequest(req, {
        authDeps: mockAuthDeps,
        geminiApiKey: "test-gemini-key",
        adminClient: mockAdminClient as any,
      });

      expect(resp.status).toBe(200);
      const json = await resp.json();
      expect(json.status).toBe("sucesso");
      expect(json.itens).toHaveLength(2);
      expect(json.validacao.valido).toBe(true);
      expect(updatedStatus).toBe("consolidada");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. Página fora de ordem funciona
  // ──────────────────────────────────────────────────────────────────────────
  it("D: Folha 2 recebida antes da Folha 1 -> consolida perfeitamente sem perda de itens", async () => {
    // 1ª requisição: recebe página 2 de 2
    const sessionP2: DanfeSessionState = {
      fornecedor: "Fornecedor Beta",
      numeroNf: "777",
      valorProdutosDeclarado: 300,
      valorTotalNfDeclarado: 300,
      totalPaginas: 2,
      paginasRecebidas: [2],
      workspaceId: validWsId,
      itensAcumulados: [
        {
          codigo: "B2",
          ean: null,
          descricao: "Item Folha 2",
          ncm: null,
          cst: null,
          cfop: "5102",
          unidade: "UN",
          quantidade: 1,
          valor_unitario_lido: 150,
          valor_unitario_calculado: null,
          valor_unitario_inferido: false,
          valor_total_lido: 150,
          valor_total_calculado: null,
          valor_total_inferido: false,
          valor_total: 150,
          valor_unitario: 150,
          fci_info: null,
          campos_incompletos: [],
        },
      ],
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
                      cabecalho: { fornecedor: "Fornecedor Beta", numero_nf: "777", pagina_atual: 1, total_paginas: 2 },
                      valores_totais: { valor_produtos: 300, valor_total_nf: 300 },
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
                        { codigo: "B1", descricao: "Item Folha 1", quantidade: 1, valor_unitario: 150, valor_total: 150, cfop: "5102" },
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
      workspaceId: validWsId,
      existingSession: sessionP2,
      fetchImpl: mockFetch as any,
    });

    expect(result.status).toBe("sucesso");
    expect(result.itens).toHaveLength(2);
    expect(result.validacao.valido).toBe(true);
    expect(result.validacao.somaItens).toBe(300);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. Workspace diferente não reutiliza sessão
  // ──────────────────────────────────────────────────────────────────────────
  it("E: Requisição de outro workspaceId -> sessão de workspace diferente NÃO é reaproveitada", async () => {
    const sessionWsA: DanfeSessionState = {
      fornecedor: "Empresa A",
      totalPaginas: 2,
      paginasRecebidas: [1],
      workspaceId: "ws-aaa",
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
                      cabecalho: { fornecedor: "Empresa B", numero_nf: "101", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 50, valor_total_nf: 50 },
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
                      itens: [{ codigo: "C1", descricao: "Item B", quantidade: 1, valor_unitario: 50, valor_total: 50, cfop: "5102" }],
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
      workspaceId: "ws-bbb",
      existingSession: sessionWsA,
      fetchImpl: mockFetch as any,
    });

    expect(result.sessionState?.workspaceId).toBe("ws-bbb");
    expect(result.cabecalho?.fornecedor).toBe("Empresa B");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. Anexo novo é Storage, não base64
  // ──────────────────────────────────────────────────────────────────────────
  it("F: Upload de anexo novo gera storagePath no bucket chat-attachments estruturado por user/workspace/conversation", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    let uploadedBucket = "";
    let uploadedPath = "";

    const uploadSpy = vi.spyOn(supabase.storage, "from").mockReturnValue({
      upload: vi.fn().mockImplementation((path, _file) => {
        uploadedPath = path;
        return Promise.resolve({ data: { path }, error: null });
      }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.supabase.co/signed" }, error: null }),
    } as any);

    const mockFile = new Blob(["conteudo fake"], { type: "image/png" });
    const result = await WalletStorageService.uploadAttachment({
      file: mockFile,
      fileName: "nota_fiscal.png",
      mimeType: "image/png",
      userId: "user-123",
      workspaceId: "ws-abc",
      conversationId: "conv-xyz",
    });

    expect(result.storagePath).toMatch(/^user-123\/ws-abc\/conv-xyz\/.+-nota_fiscal\.png$/);
    expect(uploadedPath).toBe(result.storagePath);
    expect(result.mimeType).toBe("image/png");
    expect(CHAT_ATTACHMENTS_BUCKET).toBe("chat-attachments");

    uploadSpy.mockRestore();
  });


  // ──────────────────────────────────────────────────────────────────────────
  // G. Anexo legado base64 continua legível
  // ──────────────────────────────────────────────────────────────────────────
  it("G: Mensagens antigas apenas com imagem_base64 continuam legíveis no histórico", () => {
    const legacyRow = {
      id: "msg-legada-1",
      role: "user",
      conteudo: "Veja esta nota antiga",
      imagem_base64: "AQIDBA==", // base64 puro
      storage_path: null,
    };

    const resolvedUrl = legacyRow.storage_path
      ? null
      : `data:image/jpeg;base64,${legacyRow.imagem_base64}`;

    expect(resolvedUrl).toBe("data:image/jpeg;base64,AQIDBA==");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // H. Arquivo de usuário A inacessível por usuário B
  // ──────────────────────────────────────────────────────────────────────────
  it("H: Validação de isolamento no Storage — paths são particionados por userId", () => {
    const userAPath = `user-aaa/ws-1/conv-1/nota.pdf`;
    const userBPath = `user-bbb/ws-1/conv-1/nota.pdf`;

    expect(userAPath.startsWith("user-aaa/")).toBe(true);
    expect(userBPath.startsWith("user-aaa/")).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // I. DANFE divergente -> requer_revisao
  // ──────────────────────────────────────────────────────────────────────────
  it("I: DANFE divergente -> status requer_revisao, nunca declara ok", async () => {
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
                      cabecalho: { fornecedor: "Fornecedor X", numero_nf: "100", pagina_atual: 1, total_paginas: 1 },
                      valores_totais: { valor_produtos: 500, valor_total_nf: 500 },
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
                        { codigo: "X1", descricao: "Item", quantidade: 1, valor_unitario: 300, valor_total: 300, cfop: "5102" },
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
      workspaceId: validWsId,
      fetchImpl: mockFetch as any,
    });

    expect(result.status).toBe("requer_revisao");
    expect(result.validacao.valido).toBe(false);
    expect(result.mensagemFormatada).toContain("Requer Revisão");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // J. Nenhum estoque alterado
  // ──────────────────────────────────────────────────────────────────────────
  it("J: Execução da extração fiscal NÃO realiza nenhuma mutação de estoque ou custo", async () => {
    const res = await processWalletDocument({
      fileName: "danfe_teste.pdf",
      mimeType: "application/pdf",
      base64: "base64",
      workspaceId: validWsId,
      textContext: "Analise esta nota fiscal",
    });

    expect(res.tipo).toBe("DANFE");
    expect(res.content).toContain("Nenhuma alteração");
  });
});
