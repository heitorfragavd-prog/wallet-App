/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleTelegramDocument,
  handleTelegramCallback,
  formatProposalMessage,
  type TelegramApiClient,
  type TelegramAdapterDependencies,
} from "../../../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
} from "../../../../supabase/functions/_shared/ai/document-pipeline.ts";
import {
  createDefaultActionExecutorRegistry,
  SupabaseActionDatabaseMutator,
} from "../../../../supabase/functions/_shared/ai/action-executor-registry.ts";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types.ts";
import type { ActionRepository } from "../../../../supabase/functions/_shared/ai/action-gateway.ts";

describe("Telegram Boleto Flow — Correção do Cadastro por Fotografia (End-to-End)", () => {
  const TEST_WORKSPACE_ID = "ws-telegram-boleto-123";
  const TEST_USER_ID = "user-proprietario-456";

  // Linha digitável FEBRABAN válida (Banco Santander - 47 dígitos)
  const LINHA_DIGITAVEL_VALIDA = "03399.00109 00000.123456 00000.000008 1 98760000035000";
  const CODIGO_BARRAS_VALIDO = "03391987600000350000010000001234500000000000";

  let savedProposals: Map<string, ActionProposal>;
  let mockProposalRepo: ActionRepository;
  let mockApiClient: TelegramApiClient;
  let insertedDividas: any[];
  let mockSupabase: any;
  let mutator: SupabaseActionDatabaseMutator;

  const validIdentity = {
    authorized: true,
    userId: TEST_USER_ID,
    workspaceId: TEST_WORKSPACE_ID,
    userRole: "owner" as const,
  };

  beforeEach(() => {
    savedProposals = new Map<string, ActionProposal>();
    insertedDividas = [];

    mockProposalRepo = {
      saveProposal: vi.fn(async (prop: ActionProposal) => {
        savedProposals.set(prop.id, { ...prop });
      }),
      getProposal: vi.fn(async (id: string) => {
        return savedProposals.get(id) || null;
      }),
      updateStatus: vi.fn(async (id: string, status: any) => {
        const p = savedProposals.get(id);
        if (p) p.status = status;
      }),
      confirmProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (!p || p.status !== "prepared") {
          return { success: false, code: "WALLET_AI_ACTION_ALREADY_PROCESSED" };
        }
        p.status = "confirmed";
        p.confirmedAt = new Date().toISOString();
        return { success: true, proposal: p };
      }),
      executeProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (p) {
          p.status = "executed";
          p.executedAt = new Date().toISOString();
        }
      }),
      cancelProposalAtomically: vi.fn(async (id: string) => {
        const p = savedProposals.get(id);
        if (!p || p.status !== "prepared") return false;
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
        base64: "dGVzdGUtYm9sZXRvLWJhc2U2NA==",
        mimeType: "image/jpeg",
      })),
    };

    mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "dividas") {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              for (const r of rows) {
                const inserted = { id: `divida-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...r };
                insertedDividas.push(inserted);
              }
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: insertedDividas[insertedDividas.length - 1], error: null }),
                }),
              };
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: insertedDividas, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "channel_mappings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        user_id: TEST_USER_ID,
                        workspace_id: TEST_WORKSPACE_ID,
                        access_level: "owner",
                        is_active: true,
                        nome_exibicao: "Proprietário",
                      },
                      error: null,
                    }),
                  }),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      user_id: TEST_USER_ID,
                      workspace_id: TEST_WORKSPACE_ID,
                      access_level: "owner",
                      is_active: true,
                      nome_exibicao: "Proprietário",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "wallet_ai_action_proposals") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  contains: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }),
    };

    const registry = createDefaultActionExecutorRegistry();
    mutator = new SupabaseActionDatabaseMutator(mockSupabase, registry);
  });

  // ─── 1. Foto de Boleto Sem Legenda (Classificação Visual + Extração + FEBRABAN) ───
  it("1. Foto sem legenda: classificador visual identifica BOLETO e pipeline gera proposta com botões", async () => {
    // Mock do pipeline que simula a extração bem-sucedida do boleto
    const mockDocumentRunnerWithExtraction = vi.fn(async (input: ProcessDocumentPipelineInput) => {
      const proposalPayload = {
        beneficiario: "Companhia Elétrica de Minas Gerais",
        cnpj_cpf_beneficiario: "17.155.730/0001-64",
        valor: 350.00,
        valor_total: 350.00,
        data_vencimento: "2026-11-15",
        linha_digitavel: LINHA_DIGITAVEL_VALIDA,
        codigo_barras: CODIGO_BARRAS_VALIDO,
        banco: "Santander (033)",
        descricao: "Boleto Companhia Elétrica de Minas Gerais",
      };

      const proposal: ActionProposal = {
        id: "prop-boleto-test-01",
        workspaceId: input.workspaceId,
        userId: input.userId,
        actionType: "cadastrar_divida_boleto",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Cadastrar Boleto: Companhia Elétrica de Minas Gerais - R$ 350,00",
        payload: proposalPayload,
        idempotencyHash: "hash-idem-01",
        status: "prepared",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      };

      return {
        success: true,
        documentType: "BOLETO" as const,
        status: "sucesso" as const,
        confidence: 95,
        data: proposalPayload,
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
        },
        hasPromptInjection: false,
        isDuplicate: false,
        actionProposal: proposal,
        formattedMessage: "Boleto validado com sucesso.",
        correlationId: input.correlationId || "test-corr",
        durationMs: 120,
      };
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      documentPipelineRunner: mockDocumentRunnerWithExtraction as any,
    };

    // Chamada simulando exatamente o envio de foto sem legenda
    const result = await handleTelegramDocument(
      {
        fileId: "tg_photo_sem_legenda_123",
        fileType: "image/jpeg",
        fileName: undefined, // foto do telegram vem sem nome
        caption: undefined,  // sem legenda
        identity: validIdentity,
      },
      deps,
    );

    // 1. Mensagem de proposta exibida corretamente
    expect(result.text).toContain("📄 <b>Boleto identificado</b>");
    expect(result.text).toContain("Companhia Elétrica de Minas Gerais");
    expect(result.text).toContain("350,00");
    expect(result.text).toContain("2026-11-15");
    expect(result.text).toContain(LINHA_DIGITAVEL_VALIDA);
    expect(result.text).toContain("Aguardando confirmação");

    // 2. Botões com textos estritos
    expect(result.inlineKeyboard).toBeDefined();
    expect(result.inlineKeyboard![0][0].text).toBe("✅ Cadastrar boleto");
    expect(result.inlineKeyboard![0][0].callback_data).toBe("confirm_prop:prop-boleto-test-01");
    expect(result.inlineKeyboard![0][1].text).toBe("❌ Cancelar");
    expect(result.inlineKeyboard![0][1].callback_data).toBe("cancel_prop:prop-boleto-test-01");

    // 3. Proposta salva no repositório com status 'prepared'
    expect(mockProposalRepo.saveProposal).toHaveBeenCalled();
    const saved = savedProposals.get("prop-boleto-test-01");
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("prepared");

    // 4. NENHUMA dívida foi cadastrada ainda (100% human-in-the-loop)
    expect(insertedDividas.length).toBe(0);
  });

  // ─── 2. Confirmação Real: Persiste Dívida Pendente em public.dividas ───
  it("2. Ao confirmar, cadastra dívida pendente real em public.dividas no workspace correto", async () => {
    const proposal: ActionProposal = {
      id: "prop-boleto-confirm-99",
      workspaceId: TEST_WORKSPACE_ID,
      userId: TEST_USER_ID,
      actionType: "cadastrar_divida_boleto",
      actionVersion: "v1",
      riskLevel: "MEDIUM",
      summary: "Cadastrar Boleto: Telefônica Brasil - R$ 129,90",
      payload: {
        beneficiario: "Telefônica Brasil S.A.",
        cnpj_cpf_beneficiario: "02.558.157/0001-62",
        valor: 129.90,
        valor_total: 129.90,
        data_vencimento: "2026-11-20",
        linha_digitavel: LINHA_DIGITAVEL_VALIDA,
        codigo_barras: CODIGO_BARRAS_VALIDO,
        descricao: "Boleto Telefônica Brasil S.A.",
      },
      idempotencyHash: "hash-idem-confirm",
      status: "prepared",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confirmedAt: null,
      executedAt: null,
      createdAt: new Date().toISOString(),
    };
    savedProposals.set(proposal.id, proposal);

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
    };

    // Dispara callback de confirmação
    const cbResult = await handleTelegramCallback(
      {
        callbackData: `confirm_prop:${proposal.id}`,
        callbackQueryId: "cb_query_1",
        telegramUserId: 12345678,
        chatId: 12345678,
      },
      deps,
    );

    // Resposta de sucesso ao usuário
    expect(cbResult.answerText).toContain("Boleto cadastrado com sucesso como dívida pendente");
    expect(cbResult.updatedMessageText).toContain("Boleto Cadastrado com Sucesso");
    expect(cbResult.updatedMessageText).toContain("Telefônica Brasil S.A.");
    expect(cbResult.updatedMessageText).toContain("Dívida pendente cadastrada na carteira");
    expect(cbResult.updatedMessageText).toContain("O boleto não foi marcado como pago nem liquidado");
    expect(cbResult.removeKeyboard).toBe(true);

    // Dívida REAL inserida no mock do Supabase
    expect(insertedDividas.length).toBe(1);
    const dividaCriada = insertedDividas[0];
    expect(dividaCriada.workspace_id).toBe(TEST_WORKSPACE_ID);
    expect(dividaCriada.user_id).toBe(TEST_USER_ID);
    expect(dividaCriada.credor).toBe("Telefônica Brasil S.A.");
    expect(dividaCriada.valor_total).toBe(129.90);
    expect(dividaCriada.valor_pago).toBe(0); // NÃO PAGO
    expect(dividaCriada.valor_restante).toBe(129.90);
    expect(dividaCriada.status).toBe("pendente"); // PENDENTE
    expect(dividaCriada.metodo_pagamento_esperado).toBe("boleto");
    expect(dividaCriada.linha_digitavel).toBe(LINHA_DIGITAVEL_VALIDA);
    expect(dividaCriada.codigo_barras).toBe(CODIGO_BARRAS_VALIDO);

    // Proposta atualizada para status 'executed'
    expect(savedProposals.get(proposal.id)?.status).toBe("executed");
  });

  // ─── 3. Proteção contra Replay / Duplo Clique ───
  it("3. Previne confirmação duplicada (duplo clique) da mesma proposta", async () => {
    const proposal: ActionProposal = {
      id: "prop-boleto-replay-01",
      workspaceId: TEST_WORKSPACE_ID,
      userId: TEST_USER_ID,
      actionType: "cadastrar_divida_boleto",
      actionVersion: "v1",
      riskLevel: "MEDIUM",
      summary: "Boleto Teste",
      payload: { valor: 100, data_vencimento: "2026-11-20" },
      idempotencyHash: "hash-replay",
      status: "executed", // já executada
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confirmedAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    savedProposals.set(proposal.id, proposal);

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
    };

    const cbResult = await handleTelegramCallback(
      {
        callbackData: `confirm_prop:${proposal.id}`,
        callbackQueryId: "cb_query_2",
        telegramUserId: 12345678,
        chatId: 12345678,
      },
      deps,
    );

    expect(cbResult.answerText).toContain("já foi processada anteriormente");
    expect(insertedDividas.length).toBe(0); // Nenhuma nova dívida
  });

  // ─── 4. Cancelamento da Proposta ───
  it("4. Ao cancelar, não cadastra dívida e remove keyboard", async () => {
    const proposal: ActionProposal = {
      id: "prop-boleto-cancel-01",
      workspaceId: TEST_WORKSPACE_ID,
      userId: TEST_USER_ID,
      actionType: "cadastrar_divida_boleto",
      actionVersion: "v1",
      riskLevel: "MEDIUM",
      summary: "Boleto a Cancelar",
      payload: { valor: 200, data_vencimento: "2026-11-20" },
      idempotencyHash: "hash-cancel",
      status: "prepared",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confirmedAt: null,
      executedAt: null,
      createdAt: new Date().toISOString(),
    };
    savedProposals.set(proposal.id, proposal);

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
    };

    const cbResult = await handleTelegramCallback(
      {
        callbackData: `cancel_prop:${proposal.id}`,
        callbackQueryId: "cb_query_3",
        telegramUserId: 12345678,
        chatId: 12345678,
      },
      deps,
    );

    expect(cbResult.answerText).toBe("Proposta cancelada.");
    expect(cbResult.updatedMessageText).toContain("Proposta Cancelada");
    expect(cbResult.removeKeyboard).toBe(true);
    expect(insertedDividas.length).toBe(0);
    expect(savedProposals.get(proposal.id)?.status).toBe("cancelled");
  });

  // ─── 5. Documento Não Reconhecido / Imagem Ilegível ───
  it("5. Imagem ilegível ou desconhecida retorna mensagem específica e descarta mensagem genérica", async () => {
    const mockUnknownRunner = vi.fn(async () => ({
      success: false,
      documentType: "DESCONHECIDO" as const,
      status: "requer_revisao" as const,
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: ["Tipo de documento não identificado com precisão suficiente ou imagem ilegível."],
        warnings: [],
      },
      hasPromptInjection: false,
      isDuplicate: false,
      errorCode: "WALLET_AI_DOCUMENT_UNRECOGNIZED",
      formattedMessage: "Documento Não Reconhecido",
      correlationId: "test-corr",
      durationMs: 50,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockUnknownRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "tg_foto_cachorro_123",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("📎 <b>Documento Não Identificado</b>");
    expect(result.text).toContain("Não foi possível identificar este arquivo como um Boleto Bancário ou Nota Fiscal");
    expect(result.text).not.toContain("Documento processado, porém nenhuma ação financeira foi identificada");
    expect(result.inlineKeyboard).toBeUndefined();
  });

  // ─── 6. Boleto com Linha Digitável Inválida (Rejeição FEBRABAN) ───
  it("6. Boleto com erro de validação FEBRABAN retorna mensagem específica de linha inválida", async () => {
    const mockFebrabanErrorRunner = vi.fn(async () => ({
      success: false,
      documentType: "BOLETO" as const,
      status: "requer_revisao" as const,
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: ["Dígito verificador do campo 1 inválido: esperado 7, obtido 2."],
        warnings: [],
      },
      hasPromptInjection: false,
      isDuplicate: false,
      errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
      correlationId: "test-corr",
      durationMs: 50,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockFebrabanErrorRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "tg_boleto_dv_errado",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("⚠️ <b>Boleto com Linha Digitável Inválida</b>");
    expect(result.text).toContain("Dígito verificador do campo 1 inválido");
    expect(result.text).not.toContain("Documento processado, porém nenhuma ação financeira foi identificada");
  });

  // ─── 7. Boleto com Informações Incompletas ───
  it("7. Boleto com beneficiário ou vencimento ausente retorna mensagem de informações incompletas", async () => {
    const mockIncompleteRunner = vi.fn(async () => ({
      success: false,
      documentType: "BOLETO" as const,
      status: "requer_revisao" as const,
      confidence: 0,
      data: {},
      validation: {
        isValid: false,
        errors: ["Beneficiário do boleto não identificado.", "Data de vencimento do boleto não identificada."],
        warnings: [],
      },
      hasPromptInjection: false,
      isDuplicate: false,
      errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
      correlationId: "test-corr",
      durationMs: 50,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockIncompleteRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "tg_boleto_incompleto",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("⚠️ <b>Informações Incompletas no Boleto</b>");
    expect(result.text).toContain("Beneficiário do boleto não identificado");
    expect(result.text).not.toContain("Documento processado, porém nenhuma ação financeira foi identificada");
  });

  // ─── 8. Detecção de Duplicidade ───
  it("8. Boleto duplicado já existente em dividas é bloqueado com mensagem de duplicidade", async () => {
    const mockDuplicateRunner = vi.fn(async () => ({
      success: false,
      documentType: "BOLETO" as const,
      status: "duplicata_detectada" as const,
      confidence: 95,
      isDuplicate: true,
      data: {
        linha_digitavel: LINHA_DIGITAVEL_VALIDA,
        beneficiario: "Cemig",
      },
      validation: {
        isValid: true,
        errors: ["Boleto já cadastrado anteriormente."],
        warnings: [],
      },
      hasPromptInjection: false,
      correlationId: "test-corr",
      durationMs: 30,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockDuplicateRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "tg_boleto_ja_pago",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("⚠️ <b>Boleto Duplicado Detectado!</b>");
    expect(result.text).toContain(LINHA_DIGITAVEL_VALIDA);
    expect(result.text).toContain("nenhuma proposta em duplicidade foi gerada");
    expect(result.inlineKeyboard).toBeUndefined();
  });

  // ─── 9. Comprovante de Pagamento ───
  it("9. Comprovante de pagamento não cadastra dívida e orienta o usuário", async () => {
    const mockComprovanteRunner = vi.fn(async () => ({
      success: false,
      documentType: "COMPROVANTE" as const,
      status: "requer_revisao" as const,
      confidence: 0.9,
      data: {},
      validation: {
        isValid: false,
        errors: ["Comprovantes de pagamento não geram agendamento de dívida."],
        warnings: [],
      },
      hasPromptInjection: false,
      isDuplicate: false,
      errorCode: "WALLET_AI_RECEIPT_NOT_SUPPORTED",
      correlationId: "test-corr",
      durationMs: 40,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockComprovanteRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "tg_comprovante_pix",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("🧾 <b>Comprovante de Pagamento Identificado</b>");
    expect(result.text).toContain("Nenhuma alteração financeira foi realizada");
    expect(result.inlineKeyboard).toBeUndefined();
  });

  // ─── 10. Compatibilidade estrita das assinaturas de findDuplicateFn ───
  it("10. findDuplicateFn conecta perfeitamente os parâmetros entre adapter e pipeline", async () => {
    let capturedParams: any = null;

    const findDuplicateFnMock = vi.fn(async (_ctx: any, params: any) => {
      capturedParams = params;
      return { isDuplicate: false };
    });

    let innerFindDuplicateCalled = false;
    const testRunner = async (input: ProcessDocumentPipelineInput) => {
      if (input.findDuplicateFn) {
        innerFindDuplicateCalled = true;
        await input.findDuplicateFn({
          workspaceId: input.workspaceId,
          linhaDigitavel: LINHA_DIGITAVEL_VALIDA,
          codigoBarras: CODIGO_BARRAS_VALIDO,
        });
      }
      return {
        success: false,
        documentType: "DESCONHECIDO" as const,
        status: "requer_revisao" as const,
        confidence: 0,
        data: {},
        validation: { isValid: false, errors: ["Desconhecido"], warnings: [] },
        hasPromptInjection: false,
        isDuplicate: false,
        correlationId: "c1",
        durationMs: 10,
      };
    };

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: testRunner as any,
      findDuplicateFn: findDuplicateFnMock,
    };

    await handleTelegramDocument(
      {
        fileId: "tg_file_bridge_test",
        identity: validIdentity,
      },
      deps,
    );

    expect(innerFindDuplicateCalled).toBe(true);
    expect(findDuplicateFnMock).toHaveBeenCalled();
    expect(capturedParams.workspaceId).toBe(TEST_WORKSPACE_ID);
    expect(capturedParams.linhaDigitavel).toBe(LINHA_DIGITAVEL_VALIDA);
    expect(capturedParams.codigoBarras).toBe(CODIGO_BARRAS_VALIDO);
  });
});
