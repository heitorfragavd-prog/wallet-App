/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleTelegramDocument,
  handleTelegramTextMessage,
  clearTelegramAdapterState,
  formatProposalMessage,
  type TelegramApiClient,
  type TelegramAdapterDependencies,
} from "../../../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import {
  validateLinhaDigitavel,
} from "../../../../supabase/functions/_shared/ai/boleto-validator.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
} from "../../../../supabase/functions/_shared/ai/document-pipeline.ts";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types.ts";
import type { ActionRepository } from "../../../../supabase/functions/_shared/ai/action-gateway.ts";

describe("PR #103 — Validação e Testes Obrigatórios dos Bloqueadores e Reconciliação", () => {
  const TEST_WORKSPACE_ID = "ws-blockers-test-01";
  const TEST_USER_ID = "user-blockers-test-01";
  const TEST_CHAT_ID = 99887766;

  // Linha bancária válida (Santander - 47 dígitos, fator 9876 -> vencimento derivado, valor 350.00)
  const LINHA_VALIDA_COM_VENCIMENTO = "03399.00102 00000.123455 00000.000000 1 98760000035000";

  // Linha de arrecadação válida (48 dígitos, sem fator de vencimento)
  const LINHA_ARRECADACAO_SEM_VENCIMENTO = "846700000017435000240208240123456784901234567898";

  // Linha bancária real de 46 dígitos (SPAL Coca-Cola - 9 dígitos no valor nominal em vez de 10)
  const LINHA_46_DIGITOS_SPAL = "23793.38128 60074.883447 38006.333206 1 9878000190533";

  let savedProposals: Map<string, ActionProposal>;
  let mockProposalRepo: ActionRepository;
  let mockApiClient: TelegramApiClient;
  let mockSupabase: any;

  const validIdentity = {
    authorized: true,
    userId: TEST_USER_ID,
    workspaceId: TEST_WORKSPACE_ID,
    userRole: "owner" as const,
  };

  beforeEach(() => {
    clearTelegramAdapterState();
    savedProposals = new Map<string, ActionProposal>();

    mockProposalRepo = {
      saveProposal: vi.fn(async (prop: ActionProposal) => {
        savedProposals.set(prop.id, { ...prop });
      }),
      getProposal: vi.fn(async (id: string) => savedProposals.get(id) || null),
      updateStatus: vi.fn(async (id: string, status: any) => {
        const p = savedProposals.get(id);
        if (p) p.status = status;
      }),
      confirmProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (!p || p.status !== "prepared") return { success: false };
        p.status = "confirmed";
        return { success: true, proposal: p };
      }),
      executeProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (p) p.status = "executed";
      }),
      cancelProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (!p) return false;
        p.status = "cancelled";
        return true;
      }),
    };

    mockApiClient = {
      sendMessage: vi.fn(async () => ({ ok: true })),
      editMessageText: vi.fn(async () => ({ ok: true })),
      editMessageReplyMarkup: vi.fn(async () => ({ ok: true })),
      answerCallbackQuery: vi.fn(async () => ({ ok: true })),
      downloadFileAsBase64: vi.fn(async () => ({
        base64: "dGVzdGUtYmFzZTY0",
        mimeType: "image/jpeg",
      })),
    };

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    };
  });

  // 1. Linha válida com vencimento disponível
  it("Teste 1 — Linha válida com vencimento derivado via fator FEBRABAN: preserva vencimento e solicita beneficiário", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
    };

    // Turno 1: envia a linha
    const res1 = await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res1.text).toContain("Linha Digitável Validada");
    expect(res1.text).toContain("Santander");
    expect(res1.text).toContain("Vencimento:");
    expect(res1.text).toContain("nome do Beneficiário");
    expect(savedProposals.size).toBe(0); // Não gerou proposta pronta ainda

    // Turno 2: informa o beneficiário
    const res2 = await handleTelegramTextMessage(
      { text: "Companhia Fornecedora XYZ", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res2.text).toContain("Boleto identificado");
    expect(res2.text).toContain("Companhia Fornecedora XYZ");
    expect(res2.inlineKeyboard).toBeDefined();
    expect(res2.actionProposals?.length).toBe(1);
    expect(savedProposals.size).toBe(1);

    const saved = Array.from(savedProposals.values())[0];
    expect(saved.payload.beneficiario).toBe("Companhia Fornecedora XYZ");
    expect(saved.payload.banco).toContain("Santander");
    expect(saved.payload.data_vencimento).toBeDefined();
    expect(saved.payload.data_vencimento).not.toBe(new Date().toISOString().split("T")[0]); // Não inventou hoje
  });

  // 2. Linha válida sem vencimento
  it("Teste 2 — Linha válida sem vencimento: não inventa data atual, solicita DD/MM/AAAA e normaliza calendário", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
    };

    // Turno 1: Linha de arrecadação (sem fator)
    const res1 = await handleTelegramTextMessage(
      { text: LINHA_ARRECADACAO_SEM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res1.text).toContain("Linha Digitável Validada");
    expect(res1.text).toContain("nome do Beneficiário");
    expect(savedProposals.size).toBe(0);

    // Turno 2: Informa beneficiário
    const res2 = await handleTelegramTextMessage(
      { text: "Companhia de Água e Saneamento", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res2.text).toContain("data de vencimento");
    expect(res2.text).toContain("DD/MM/AAAA");
    expect(savedProposals.size).toBe(0);

    // Turno 3: Usuário tenta data impossível (31/02/2026) -> fail-closed
    const res3 = await handleTelegramTextMessage(
      { text: "31/02/2026", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res3.text).toContain("Data de Vencimento Inválida");
    expect(savedProposals.size).toBe(0);

    // Turno 4: Usuário informa data válida (30/10/2026) -> normaliza para 2026-10-30 e finaliza
    const res4 = await handleTelegramTextMessage(
      { text: "30/10/2026", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(res4.text).toContain("Boleto identificado");
    expect(res4.text).toContain("2026-10-30");
    expect(savedProposals.size).toBe(1);

    const saved = Array.from(savedProposals.values())[0];
    expect(saved.payload.data_vencimento).toBe("2026-10-30");
    expect(saved.payload.beneficiario).toBe("Companhia de Água e Saneamento");
  });

  // 3. Beneficiário conhecido (reaproveitado de foto anterior)
  it("Teste 3 — Beneficiário conhecido: reaproveita beneficiário da foto anterior do mesmo boleto sem sobrescrever com banco", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
      documentPipelineRunner: vi.fn(async () => ({
        success: true,
        documentType: "BOLETO" as const,
        status: "requer_revisao" as const,
        data: {
          beneficiario: "SPAL Indústria Brasileira de Bebidas S/A",
          banco: "Banco Bradesco S.A.",
          valor: 350.00,
          linha_digitavel: "23793.38128 60074.883447 38006.333206 1 000000000000", // Linha com erro
        },
        validation: {
          isValid: false,
          errors: ["Dígito verificador do Bloco 1 inválido"],
          warnings: [],
        },
      } as any)),
    };

    // 1. Envia a foto do boleto
    await handleTelegramDocument(
      {
        fileId: "photo-spal-123",
        identity: validIdentity,
        chatId: TEST_CHAT_ID,
      },
      deps,
    );

    // 2. Em seguida, no mesmo chat, envia a linha digitável válida corrigida
    const result = await handleTelegramTextMessage(
      {
        text: LINHA_VALIDA_COM_VENCIMENTO,
        identity: validIdentity,
        chatId: TEST_CHAT_ID,
      },
      deps,
    );

    // Como o beneficiário já era conhecido da foto do mesmo boleto (mesmo valor R$ 350), gera proposta imediatamente
    expect(result.text).toContain("Boleto identificado");
    expect(result.text).toContain("SPAL Indústria Brasileira de Bebidas S/A");
    expect(result.actionProposals?.length).toBe(1);
    expect(savedProposals.size).toBe(1);

    const saved = Array.from(savedProposals.values())[0];
    expect(saved.payload.beneficiario).toBe("SPAL Indústria Brasileira de Bebidas S/A");
    expect(saved.payload.banco).toContain("Santander");
  });

  // 4. Beneficiário desconhecido
  it("Teste 4 — Beneficiário desconhecido: solicita ao usuário e rejeita nomes genéricos ou o próprio banco", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
    };

    // Turno 1: Linha enviada sem contexto de foto
    await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    // Turno 2: Usuário digita "Santander" (nome do banco) -> rejeitado
    const resBanco = await handleTelegramTextMessage(
      { text: "Santander", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );
    expect(resBanco.text).toContain("Beneficiário Inválido");
    expect(savedProposals.size).toBe(0);

    // Turno 3: Usuário digita "Boleto" (termo genérico) -> rejeitado
    const resGenerico = await handleTelegramTextMessage(
      { text: "Boleto", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );
    expect(resGenerico.text).toContain("Beneficiário Inválido");
    expect(savedProposals.size).toBe(0);

    // Turno 4: Usuário digita o fornecedor real
    const resReal = await handleTelegramTextMessage(
      { text: "Papelaria Central Ltda", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );
    expect(resReal.text).toContain("Boleto identificado");
    expect(resReal.text).toContain("Papelaria Central Ltda");
    expect(savedProposals.size).toBe(1);
  });

  // 5. Banco diferente do beneficiário
  it("Teste 5 — Banco diferente do beneficiário: preserva ambos em campos separados no payload", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
    };

    await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    await handleTelegramTextMessage(
      { text: "Distribuidora de Alimentos ABC", identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    const saved = Array.from(savedProposals.values())[0];
    expect(saved.payload.banco).toContain("Santander");
    expect(saved.payload.beneficiario).toBe("Distribuidora de Alimentos ABC");
    expect(saved.payload.banco).not.toBe(saved.payload.beneficiario);
  });

  // 6. Falha na consulta de duplicidade
  it("Teste 6 — Falha na consulta de duplicidade: bloqueia por fail-closed e informa instabilidade temporária", async () => {
    const mockFindDuplicateError = vi.fn(async () => {
      throw new Error("Conexão com PostgreSQL expirou (504 Gateway Timeout)");
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicateError,
    };

    const result = await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(result.text).toContain("Serviço Temporariamente Indisponível");
    expect(result.text).toContain("fail-closed");
    expect(result.inlineKeyboard).toBeUndefined();
    expect(savedProposals.size).toBe(0);
  });

  // 7. Duplicidade existente
  it("Teste 7 — Duplicidade existente: bloqueia cadastro e impede geração de proposta duplicada", async () => {
    const mockFindDuplicateTrue = vi.fn(async () => ({
      isDuplicate: true,
      existingRecordId: "divida-existente-uuid-999",
      type: "divida",
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicateTrue,
    };

    const result = await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(result.text).toContain("Boleto Duplicado Detectado!");
    expect(result.text).toContain("nenhuma proposta em duplicidade foi gerada");
    expect(result.inlineKeyboard).toBeUndefined();
    expect(savedProposals.size).toBe(0);
  });

  // 8. Consulta de duplicidade bem-sucedida
  it("Teste 8 — Consulta de duplicidade bem-sucedida e sem duplicidade: permite continuidade normal", async () => {
    const mockFindDuplicateSuccess = vi.fn(async () => ({ isDuplicate: false }));
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicateSuccess,
    };

    const result = await handleTelegramTextMessage(
      { text: LINHA_VALIDA_COM_VENCIMENTO, identity: validIdentity, chatId: TEST_CHAT_ID },
      deps,
    );

    expect(mockFindDuplicateSuccess).toHaveBeenCalled();
    expect(result.text).toContain("Linha Digitável Validada");
  });

  // 9. Recuperação de linha com 46 dígitos
  it("Teste 9 — Recuperação de linha de 46 dígitos: zero-padding determinístico no Campo 5 valida Módulo 10 e Módulo 11", () => {
    const raw46 = "3419109008209818056075988426000751618000047010"; // Linha real SPAL com 46 dígitos (valor 470,10 com 9 dígitos)
    expect(raw46.length).toBe(46);

    const valResult = validateLinhaDigitavel(raw46);
    expect(valResult.valido).toBe(true);
    expect(valResult.linhaLimpa.length).toBe(47);
    expect(valResult.evidence?.reconciliacao_zero_padding).toBe(true);
    expect(valResult.evidence?.linha_matematicamente_valida).toBe(true);
    expect(valResult.valorDerivado).toBe(470.10); // R$ 470,10
    expect(valResult.bancoNome).toContain("Itaú");
  });

  // 10. Regressão do OCR de boletos
  it("Teste 10 — Regressão do OCR de boletos: processamento completo via documentPipeline com classificação e FEBRABAN", async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  categoria: "BOLETO",
                  beneficiario: "Companhia Elétrica de Minas Gerais",
                  cnpj_cpf_beneficiario: "17.155.730/0001-64",
                  banco: "Banco Santander (Brasil) S.A.",
                  valor: 350.00,
                  data_vencimento: "2026-11-15",
                  linha_digitavel: LINHA_VALIDA_COM_VENCIMENTO,
                }),
              },
            },
          ],
        }),
      };
    });

    const pipelineRes = await processDocumentPipeline({
      workspaceId: validIdentity.workspaceId,
      userId: validIdentity.userId,
      base64: "dGVzdGUtYm9sZXRvLXNhbnRhbmRlcg==",
      mimeType: "image/jpeg",
      openaiApiKey: "sk-mock-key",
      documentTypeHint: "BOLETO",
      fetchFn: mockFetch as any,
    });

    expect(pipelineRes.documentType).toBe("BOLETO");
    expect(pipelineRes.status).toBe("sucesso");
    expect(pipelineRes.actionProposal).toBeDefined();
    expect(pipelineRes.actionProposal?.payload.beneficiario).toBe("Companhia Elétrica de Minas Gerais");
    expect(pipelineRes.actionProposal?.payload.valor).toBe(350.00);
    expect(pipelineRes.actionProposal?.payload.data_vencimento).toBe("2049-06-12");
  });

  // 11. Regressão de notas fiscais DANFE
  it("Teste 11 — Regressão de notas fiscais DANFE: documento DANFE é extraído com chave de acesso e totais sem colisão com boletos", async () => {
    const mockFetchDanfe = vi.fn().mockImplementation((_url, init) => {
      let prompt = "";
      if (init?.body) {
        try {
          const body = JSON.parse(init.body);
          if (body.contents) {
            prompt = body.contents[0]?.parts?.[0]?.text || "";
          } else if (body.messages) {
            prompt = typeof body.messages[0]?.content === "string"
              ? body.messages[0].content
              : JSON.stringify(body.messages[0]?.content || "");
          }
        } catch {
          prompt = "";
        }
      }

      // Resposta para Cabeçalho e Totais
      if (prompt.includes("quadro CÁLCULO DO IMPOSTO") || prompt.includes("cabecalho") || prompt.includes("CABECALHO")) {
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
                          fornecedor: "Brasnorte Distribuidora de Auto Pecas",
                          cnpj_fornecedor: "17.155.730/0001-64",
                          numero_nf: "123456",
                          serie_nf: "1",
                          data_emissao: "2026-10-25",
                          chave_acesso: "31261017155730000164550010001234561001234567",
                        },
                        valores_totais: {
                          valor_produtos: 500.00,
                          valor_total_nf: 500.00,
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

      // Resposta para Tabela de Itens
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      {
                        descricao: "Filtro de Óleo Lubrificante",
                        codigo: "FILT-01",
                        ncm: "84212300",
                        quantidade: 10,
                        valor_unitario: 50.00,
                        valor_total: 500.00,
                      },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      });
    });

    const danfeRes = await processDocumentPipeline({
      workspaceId: validIdentity.workspaceId,
      userId: validIdentity.userId,
      base64: "dGVzdGUtZGFuZmUtYnJhc25vcnRl",
      mimeType: "application/pdf",
      geminiApiKey: "AIzaSyFakeKey123",
      documentTypeHint: "DANFE",
      fetchFn: mockFetchDanfe as any,
    });

    expect(danfeRes.documentType).toBe("DANFE");
    expect(danfeRes.status).toBe("sucesso");
    expect(danfeRes.actionProposal).toBeDefined();
    expect(danfeRes.actionProposal?.actionType).toBe("cadastrar_despesa_nf");
    expect(danfeRes.actionProposal?.payload.fornecedor).toBe("Brasnorte Distribuidora de Auto Pecas");
    expect(danfeRes.actionProposal?.payload.chave_acesso).toBe("31261017155730000164550010001234561001234567");
  });

  it("Teste 12 — Caso Real Xodó Foods: 47 dígitos, Itaú, R$ 658,14, vencimento 30/10/2026 gera proposta diretamente", async () => {
    // Linha Itaú matematicamente válida com fator 1615 e valor 658.14 (0000065814)
    const linhaXodo47 = "34191234546789012345767890123457116150000065814";
    const xodoBeneficiario = "XODO FOODS E DISTRIBUICAO LTDA";

    const mockFetchBoleto = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  banco: "Itaú Unibanco (341)",
                  beneficiario: xodoBeneficiario,
                  cnpj_cpf_beneficiario: "52.315.807/0001-17",
                  pagador: "Restaurante Central",
                  cnpj_cpf_pagador: "12.345.678/0001-90",
                  data_vencimento: "30/10/2026",
                  data_emissao: "23/10/2026",
                  valor: 658.14,
                  linha_digitavel: linhaXodo47,
                  codigo_barras: "34191161500000658141234567890123456789012345",
                  nosso_numero: "12345678",
                  numero_documento: "DOC-9988",
                }),
              },
            },
          ],
        }),
      });
    });

    const docRes = await processDocumentPipeline({
      workspaceId: validIdentity.workspaceId,
      userId: validIdentity.userId,
      base64: "ZmFrZS1ib2xldG8teG9kby1mb29kcw==",
      mimeType: "image/jpeg",
      openaiApiKey: "sk-proj-fakeOpenAiKey123456789",
      documentTypeHint: "BOLETO",
      fetchFn: mockFetchBoleto as any,
      findDuplicateFn: async () => ({ isDuplicate: false }),
    });

    // 1. Não aplica desnecessariamente recuperação de 46 (linha tem 47 dígitos)
    expect(docRes.documentType).toBe("BOLETO");
    expect(docRes.status).toBe("sucesso");
    expect(docRes.isDuplicate).toBe(false);
    expect(docRes.validation?.febrabanValidation?.evidence?.reconciliacao_zero_padding).toBeFalsy();

    // 2. Normalização de data brasileira para ISO YYYY-MM-DD
    expect(docRes.actionProposal).toBeDefined();
    expect(docRes.actionProposal?.payload.data_vencimento).toBe("2026-10-30");

    // 3. Diferença entre emissão (23/10/2026) e vencimento (30/10/2026)
    expect(docRes.actionProposal?.payload.data_vencimento).not.toBe("2026-10-23");

    // 4. Integridade do valor nominal
    expect(docRes.actionProposal?.payload.valor).toBe(658.14);
    expect(docRes.actionProposal?.payload.valor_total).toBe(658.14);

    // 5. Beneficiário diferente do banco
    expect(docRes.actionProposal?.payload.beneficiario).toBe(xodoBeneficiario);
    expect(docRes.actionProposal?.payload.banco).toContain("Itaú");
    expect(docRes.actionProposal?.payload.beneficiario).not.toBe(docRes.actionProposal?.payload.banco);

    // 6. Proposta pronta com status prepared
    expect(docRes.actionProposal?.status).toBe("prepared");
    expect(docRes.actionProposal?.actionType).toBe("cadastrar_divida_boleto");

    // 7. Resposta formatada no Telegram Adapter apresenta botões inline diretamente
    const formattedMsg = formatProposalMessage(docRes.actionProposal!);
    expect(formattedMsg.buttons.length).toBeGreaterThan(0);
    expect(formattedMsg.buttons[0][0].text).toContain("Cadastrar boleto");
    expect(formattedMsg.buttons[0][1].text).toContain("Cancelar");
  });

  it("Teste 13 — Retomada de Diálogo Multi-turn em Instância Diferente: persistência em telegram_conversas garante recuperação de rascunho após cold boot", async () => {
    // Tabela simulada do Supabase em memória compartilhada
    let dbConversa: any = null;

    const mockSupabaseInstance = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "telegram_conversas") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(async () => ({
              data: dbConversa ? { ...dbConversa } : null,
              error: null,
            })),
            upsert: vi.fn().mockImplementation(async (record: any) => {
              dbConversa = { ...record };
              return { data: dbConversa, error: null };
            }),
            update: vi.fn().mockImplementation((updates: any) => {
              if (dbConversa) {
                dbConversa = { ...dbConversa, ...updates };
              }
              return {
                eq: vi.fn().mockResolvedValue({ data: dbConversa, error: null }),
              };
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    // Linha matematicamente válida com fator 0000 (sem data de vencimento) e valor R$ 658,14
    const linhaSemVenc = "34191234546789012345767890123457500000000065814";
    const sessionChatId = 99887766;

    const createDeps = () => ({
      supabase: mockSupabaseInstance,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: async () => ({ isDuplicate: false }),
    });

    // --- INSTÂNCIA A: Processa a linha digitável e persiste o rascunho no banco ---
    const depsInstanceA = createDeps();

    const resA = await handleTelegramTextMessage(
      { text: linhaSemVenc, identity: validIdentity, chatId: sessionChatId },
      depsInstanceA
    );

    // Instância A solicita o beneficiário
    expect(resA.text).toContain("Linha Digitável Validada!");
    expect(resA.text).toContain("nome do Beneficiário");
    expect(dbConversa).toBeDefined();
    expect(dbConversa.estado).toBe("aguardando_beneficiario_manual");
    expect(dbConversa.dados_documento.type).toBe("pending_manual_boleto_draft");

    // SIMULAÇÃO DO AMBIENTE SERVERLESS / EDGE RUNTIME:
    // A instância A morre. O isolate é destruído e a memória local é completamente zerada.
    clearTelegramAdapterState();

    // --- INSTÂNCIA B: Nova instância atende a resposta do usuário fornecendo o Beneficiário ---
    const depsInstanceB = createDeps();

    const resB1 = await handleTelegramTextMessage(
      { text: "XODO FOODS E DISTRIBUICAO LTDA", identity: validIdentity, chatId: sessionChatId },
      depsInstanceB
    );

    // Instância B recuperou o rascunho de telegram_conversas, registrou o beneficiário e agora pede a data de vencimento
    expect(resB1.text).toContain("Beneficiário registrado:</b> XODO FOODS E DISTRIBUICAO LTDA");
    expect(resB1.text).toContain("data de vencimento");
    expect(dbConversa.estado).toBe("aguardando_vencimento_manual");

    // SIMULAÇÃO DE OUTRO COLD BOOT: Instância B morre, isolate reinicia
    clearTelegramAdapterState();

    // --- INSTÂNCIA C: Atende a resposta da data de vencimento ---
    const depsInstanceC = createDeps();

    const resC = await handleTelegramTextMessage(
      { text: "30/10/2026", identity: validIdentity, chatId: sessionChatId },
      depsInstanceC
    );

    // Instância C finaliza com sucesso a proposta canônica!
    expect(resC.text).toContain("Boleto identificado");
    expect(resC.text).toContain("2026-10-30");
    expect(resC.text).toContain("XODO FOODS E DISTRIBUICAO LTDA");
    expect(resC.inlineKeyboard).toBeDefined();

    const saved = Array.from(savedProposals.values())[0];
    expect(saved).toBeDefined();
    expect(saved.payload.beneficiario).toBe("XODO FOODS E DISTRIBUICAO LTDA");
    expect(saved.payload.data_vencimento).toBe("2026-10-30");
    expect(saved.payload.valor).toBe(658.14);

    // Estado da conversa em telegram_conversas foi resetado para livre
    expect(dbConversa.estado).toBe("livre");
    expect(dbConversa.dados_documento).toBeNull();
  });
});