/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleTelegramDocument,
  handleTelegramCallback,
  handleTelegramTextMessage,
  formatProposalMessage,
  sanitizeUserFacingErrorMessage,
  type TelegramApiClient,
  type TelegramAdapterDependencies,
} from "../../../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import {
  processDocumentPipeline,
  type ProcessDocumentPipelineInput,
} from "../../../../supabase/functions/_shared/ai/document-pipeline.ts";
import {
  classifyDocumentVisually,
} from "../../../../supabase/functions/_shared/ai/visual-classifier.ts";
import {
  validateLinhaDigitavel,
} from "../../../../supabase/functions/_shared/ai/boleto-validator.ts";
import {
  processBoletoDocument,
} from "../../../../supabase/functions/_shared/ai/boleto-service.ts";
import {
  createDefaultActionExecutorRegistry,
  SupabaseActionDatabaseMutator,
} from "../../../../supabase/functions/_shared/ai/action-executor-registry.ts";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types.ts";
import type { ActionRepository } from "../../../../supabase/functions/_shared/ai/action-gateway.ts";

describe("Telegram Boleto Flow — Correção do Cadastro por Fotografia (End-to-End)", () => {
  const TEST_WORKSPACE_ID = "ws-telegram-boleto-123";
  const TEST_USER_ID = "user-proprietario-456";

  // Linha digitável FEBRABAN válida (Banco Santander - 47 dígitos matematicamente consistentes)
  const LINHA_DIGITAVEL_VALIDA = "03399.00102 00000.123455 00000.000000 1 98760000035000";
  const CODIGO_BARRAS_VALIDO = "03391987600000350009001000000123450000000000";

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

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 6: TESTES NORMATIVOS REALÍSTICAS (A - G) SEM RESPOSTAS PRONTAS
// ─────────────────────────────────────────────────────────────────────────────
describe("Reconhecimento Visual Real de Boletos (Testes Normativos A - G)", () => {
  const TEST_WORKSPACE_ID = "ws-telegram-boleto-visual-test";
  const TEST_USER_ID = "user-proprietario-visual-test";
  const LINHA_DIGITAVEL_VALIDA = "03399.00102 00000.123455 00000.000000 1 98760000035000";
  const CODIGO_BARRAS_VALIDO = "03391987600000350009001000000123450000000000";

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
      getProposal: vi.fn(async (id: string) => savedProposals.get(id) || null),
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
                const inserted = { id: `divida-${Date.now()}-${Math.random()}`, ...r };
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
          const mappingReturn = {
            data: {
              user_id: TEST_USER_ID,
              workspace_id: TEST_WORKSPACE_ID,
              access_level: "owner",
              is_active: true,
              nome_exibicao: "Proprietário",
            },
            error: null,
          };
          const chain: any = {};
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue(mappingReturn);
          chain.single = vi.fn().mockResolvedValue(mappingReturn);
          return { select: vi.fn().mockReturnValue(chain) };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }),
    };

    const registry = createDefaultActionExecutorRegistry();
    mutator = new SupabaseActionDatabaseMutator(mockSupabase, registry);
  });

  // Teste A: Imagem sem legenda passando pelo pipeline real com mock apenas na camada HTTP (fetchFn)
  it("Teste A — Imagem sem legenda: classificador visual real é acionado e identifica BOLETO", async () => {
    let visualClassifiedCalled = false;
    let extractionCalled = false;

    const mockFetch = vi.fn(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("api.openai.com/v1/chat/completions")) {
        const body = JSON.parse(opts.body);
        if (body.model === "gpt-4o-mini") {
          visualClassifiedCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      documentType: "BOLETO",
                      confidence: 95,
                      reasoning: "Código de barras e linha digitável claramente identificados.",
                      evidence: {
                        hasBarcodeOrLinhaDigitavel: true,
                        detectedKeywords: ["Boleto", "Vencimento"],
                      },
                    }),
                  },
                },
              ],
            }),
          } as Response;
        }
        if (body.model === "gpt-4o") {
          extractionCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      banco: "Santander (033)",
                      beneficiario: "Companhia de Energia Elétrica S.A.",
                      cnpj_cpf_beneficiario: "12.345.678/0001-90",
                      data_vencimento: "2026-11-20",
                      valor: 350.00,
                      linha_digitavel: LINHA_DIGITAVEL_VALIDA,
                      codigo_barras: CODIGO_BARRAS_VALIDO,
                    }),
                  },
                },
              ],
            }),
          } as Response;
        }
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      openaiApiKey: "sk-test-real-key",
      fetchFn: mockFetch as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_celular_12345",
        fileType: "image/jpeg",
        fileName: undefined,
        caption: undefined,
        identity: validIdentity,
      },
      deps,
    );

    expect(visualClassifiedCalled).toBe(true);
    expect(extractionCalled).toBe(true);
    expect(result.pipelineResult?.documentType).toBe("BOLETO");
    expect(result.text).toContain("Boleto identificado");
    expect(result.text).toContain("Companhia de Energia Elétrica S.A.");
    expect(result.text).toContain("350,00");
    expect(result.inlineKeyboard).toBeDefined();
    expect(result.inlineKeyboard![0][0].text).toBe("✅ Cadastrar boleto");
  });

  // Teste B: Função existente
  it("Teste B — Função existente: comprova que classifyDocumentVisually está implementada, importada e executável", async () => {
    expect(typeof classifyDocumentVisually).toBe("function");

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: "BOLETO",
                confidence: 90,
                reasoning: "Linha digitável presente",
                evidence: { hasBarcodeOrLinhaDigitavel: true },
              }),
            },
          },
        ],
      }),
    }));

    const classification = await classifyDocumentVisually({
      base64: "dGVzdGUtYmFzZTY0",
      mimeType: "image/jpeg",
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    });

    expect(classification.documentType).toBe("BOLETO");
    expect(classification.confidence).toBe(90);
    expect(classification.technicalError).toBeUndefined();
    expect(classification.providerUsed).toBe("openai");
  });

  // Teste C: Provedor indisponível
  it("Teste C — Provedor indisponível: erros 401, 403, 429 e timeout geram falha temporária sem mascaramento como ilegível", async () => {
    const errorScenarios = [
      { status: 401, errorName: "AUTH_FAILED" },
      { status: 403, errorName: "AUTH_FAILED" },
      { status: 429, errorName: "RATE_LIMITED" },
      { status: 504, errorName: "TIMEOUT", throwTimeout: true },
    ];

    for (const scenario of errorScenarios) {
      const mockFetch = vi.fn(async () => {
        if (scenario.throwTimeout) {
          const err = new Error("Request timed out");
          err.name = "AbortError";
          throw err;
        }
        return {
          ok: false,
          status: scenario.status,
          json: async () => ({ error: { message: "Simulated error" } }),
        } as Response;
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator,
        openaiApiKey: "sk-test-failing-key",
        fetchFn: mockFetch as any,
      };

      const result = await handleTelegramDocument(
        {
          fileId: `photo_err_${scenario.status}`,
          fileType: "image/jpeg",
          identity: validIdentity,
        },
        deps,
      );

      expect(result.pipelineResult?.status).toBe("erro");
      expect(result.pipelineResult?.errorCode).toContain("WALLET_AI_VISION_");
      expect(result.text).toContain("Falha Temporária no Processamento Visual");
      expect(result.text).not.toContain("Documento Não Identificado");
      expect(result.text).not.toContain("Não foi possível identificar este arquivo como um Boleto Bancário ou Nota Fiscal");
    }
  });

  // Teste D: Documento desconhecido
  it("Teste D — Documento desconhecido: foto de objeto/animal retorna DESCONHECIDO sem gerar proposta nem dívida", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                documentType: "DESCONHECIDO",
                confidence: 5,
                reasoning: "Fotografia de uma xícara de café sobre uma mesa de escritório.",
                evidence: {
                  hasBarcodeOrLinhaDigitavel: false,
                  hasDanfeAccessKey: false,
                  hasReceiptProof: false,
                  detectedKeywords: [],
                },
              }),
            },
          },
        ],
      }),
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_xicara_cafe",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.pipelineResult?.documentType).toBe("DESCONHECIDO");
    expect(result.text).toContain("Documento Não Identificado");
    expect(result.inlineKeyboard).toBeUndefined();
    expect(savedProposals.size).toBe(0);
    expect(insertedDividas.length).toBe(0);
  });

  // Teste E: Boleto reconhecido
  it("Teste E — Boleto reconhecido: executa cadeia completa Imagem -> Classificação -> Extração -> FEBRABAN -> Proposta", async () => {
    const mockFetch = vi.fn(async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.model === "gpt-4o-mini") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: "BOLETO",
                    confidence: 98,
                    reasoning: "Boleto bancário Itaú com código de barras evidente",
                    evidence: { hasBarcodeOrLinhaDigitavel: true },
                  }),
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  banco: "Itaú Unibanco (341)",
                  beneficiario: "Telecomunicações Brasileiras S.A.",
                  cnpj_cpf_beneficiario: "00.000.000/0001-91",
                  data_vencimento: "2026-11-25",
                  valor: 350.00,
                  linha_digitavel: LINHA_DIGITAVEL_VALIDA,
                  codigo_barras: CODIGO_BARRAS_VALIDO,
                }),
              },
            },
          ],
        }),
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
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_boleto_itau",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.pipelineResult?.documentType).toBe("BOLETO");
    expect(result.pipelineResult?.actionProposal).toBeDefined();
    expect(result.pipelineResult?.actionProposal?.status).toBe("prepared");
    expect(result.pipelineResult?.actionProposal?.payload.beneficiario).toBe("Telecomunicações Brasileiras S.A.");
    expect(result.pipelineResult?.actionProposal?.payload.valor).toBe(350.00);
    expect(insertedDividas.length).toBe(0);
  });

  // Teste F: Confirmação
  it("Teste F — Confirmação: botões inline gerados e persistência de dívida ocorre estritamente após confirmação", async () => {
    const mockFetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.model === "gpt-4o-mini") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: "BOLETO",
                    confidence: 95,
                    reasoning: "Boleto válido",
                    evidence: { hasBarcodeOrLinhaDigitavel: true },
                  }),
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  beneficiario: "Fornecedor Teste",
                  data_vencimento: "2026-12-10",
                  valor: 350.00,
                  linha_digitavel: LINHA_DIGITAVEL_VALIDA,
                  codigo_barras: CODIGO_BARRAS_VALIDO,
                }),
              },
            },
          ],
        }),
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
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    };

    const docResult = await handleTelegramDocument(
      {
        fileId: "photo_fornecedor",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(docResult.inlineKeyboard).toBeDefined();
    expect(docResult.inlineKeyboard![0][0].text).toBe("✅ Cadastrar boleto");
    expect(docResult.inlineKeyboard![0][1].text).toBe("❌ Cancelar");

    const proposalId = docResult.pipelineResult?.actionProposal?.id;
    expect(proposalId).toBeDefined();
    expect(insertedDividas.length).toBe(0);

    const cbResult = await handleTelegramCallback(
      {
        callbackData: `confirm_prop:${proposalId}`,
        callbackQueryId: "cb_q_test_f",
        telegramUserId: 99999,
        chatId: 99999,
      },
      deps,
    );

    expect(cbResult.answerText).toContain("Boleto cadastrado com sucesso como dívida pendente");
    expect(insertedDividas.length).toBe(1);
    expect(insertedDividas[0].status).toBe("pendente");
    expect(insertedDividas[0].valor_pago).toBe(0);
    expect(insertedDividas[0].valor_total).toBe(350.00);
  });

  // Teste G: Duplicidade
  it("Teste G — Duplicidade: mesma linha digitável já registrada impede nova proposta e nova dívida", async () => {
    insertedDividas.push({
      id: "divida-existente-1",
      workspace_id: TEST_WORKSPACE_ID,
      linha_digitavel: LINHA_DIGITAVEL_VALIDA,
      status: "pendente",
    });

    const findDuplicateFnMock = vi.fn(async (_ctx: any, params: any) => {
      if (params.linhaDigitavel === LINHA_DIGITAVEL_VALIDA) {
        return { isDuplicate: true, existingRecordId: "divida-existente-1", type: "divida" };
      }
      return { isDuplicate: false };
    });

    const mockFetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.model === "gpt-4o-mini") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ documentType: "BOLETO", confidence: 95, evidence: { hasBarcodeOrLinhaDigitavel: true } }) } }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ beneficiario: "Cemig", valor: 250, linha_digitavel: LINHA_DIGITAVEL_VALIDA, codigo_barras: CODIGO_BARRAS_VALIDO, data_vencimento: "2026-11-30" }) } }],
        }),
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
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
      findDuplicateFn: findDuplicateFnMock,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_boleto_duplicado",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("Boleto Duplicado Detectado!");
    expect(result.text).toContain("já foi registrado anteriormente");
    expect(result.inlineKeyboard).toBeUndefined();
    expect(insertedDividas.length).toBe(1);
  });

  it("Teste H — Desambiguação Boleto vs Comprovante: boleto com 'Recibo do Pagador' é reclassificado para BOLETO", async () => {
    let openAiCalls = 0;
    // Simula a resposta da IA que confundiu o campo 'Recibo do Pagador' com comprovante de pagamento
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("getFile")) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { file_path: "photos/recibo_pagador.jpg" } }),
        };
      }
      if (url.includes("photos/recibo_pagador.jpg")) {
        return {
          ok: true,
          blob: async () => new Blob(["fake-image-bytes"], { type: "image/jpeg" }),
        };
      }
      if (url.includes("api.openai.com/v1/chat/completions")) {
        openAiCalls++;
        // Primeira chamada OpenAI: Classificação visual (IA confunde 'Recibo do Pagador' mas detecta código de barras)
        if (openAiCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      documentType: "COMPROVANTE",
                      confidence: 85,
                      reasoning: "Documento apresenta a frase Recibo do Pagador no cabeçalho.",
                      evidence: {
                        hasBarcodeOrLinhaDigitavel: true,
                        hasDanfeAccessKey: false,
                        hasReceiptProof: false,
                        detectedKeywords: ["Recibo do Pagador", "Banco Santander", "Vencimento", "Valor do Documento"],
                      },
                    }),
                  },
                },
              ],
            }),
          };
        } else {
          // Segunda chamada OpenAI: Extração dos dados do boleto
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      tipo: "BOLETO",
                      codigoBarras: CODIGO_BARRAS_VALIDO,
                      linhaDigitavel: LINHA_DIGITAVEL_VALIDA,
                      valor: 350.0,
                      vencimento: "2026-11-20",
                      beneficiario: "Fornecedor Auto Peças Ltda",
                      cnpjBeneficiario: "12.345.678/0001-90",
                    }),
                  },
                },
              ],
            }),
          };
        }
      }
      return { ok: false, status: 404 };
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_recibo_pagador_boleto",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    // Deve ser desambiguado para BOLETO e apresentar proposta interativa com botões
    expect(result.text).toContain("Boleto identificado");
    expect(result.text).not.toContain("Comprovante de Pagamento Identificado");
    expect(result.inlineKeyboard).toBeDefined();
    expect(savedProposals.size).toBe(1);
  });

  it("Teste I — Comprovante genuíno de pagamento / PIX permanece como COMPROVANTE informativo", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("getFile")) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { file_path: "photos/comprovante_pix.jpg" } }),
        };
      }
      if (url.includes("photos/comprovante_pix.jpg")) {
        return {
          ok: true,
          blob: async () => new Blob(["fake-image-bytes"], { type: "image/jpeg" }),
        };
      }
      if (url.includes("api.openai.com/v1/chat/completions")) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: "COMPROVANTE",
                    confidence: 95,
                    reasoning: "Comprovante de transferência PIX realizada com autenticação mecânica bancária.",
                    evidence: {
                      hasBarcodeOrLinhaDigitavel: false,
                      hasDanfeAccessKey: false,
                      hasReceiptProof: true,
                      detectedKeywords: ["Comprovante de Transferência PIX", "Transação realizada", "Autenticação"],
                    },
                  }),
                },
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      openaiApiKey: "sk-test-key",
      fetchFn: mockFetch as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_comprovante_pix",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("Comprovante de Pagamento Identificado");
    expect(result.text).toContain("Identificamos que este documento é um comprovante de pagamento");
    expect(result.inlineKeyboard).toBeUndefined();
    expect(savedProposals.size).toBe(0);
    expect(insertedDividas.length).toBe(0);
  });
});



// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 7: CENÁRIOS CRÍTICOS DE RECUPERAÇÃO DO PIPELINE DE BOLETOS
// ─────────────────────────────────────────────────────────────────────────────
describe("Recuperação do Pipeline de Boletos — Cenários Críticos e Reconciliação Determinística", () => {
  const TEST_WORKSPACE_ID = "ws-recovery-test";
  const TEST_USER_ID = "user-recovery-test";

  // Linha real do teste do proprietário com 46 dígitos (falta 1 zero de padding no valor)
  const LINHA_46_DIGITOS_REAL = "34191.09008 20981.805607 59884.260007 5 1618000047010";
  const LINHA_VALIDA_SANTANDER = "03399.00102 00000.123455 00000.000000 1 98760000035000";

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
      getProposal: vi.fn(async (id: string) => savedProposals.get(id) || null),
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
        base64: "dGVzdGUtYm9sZXRvLXJlYWwtYmFzZTY0",
        mimeType: "image/jpeg",
      })),
    };

    mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "dividas") {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedDividas.push(...rows);
              return { error: null };
            }),
          };
        }
        return {
          insert: vi.fn().mockReturnValue({ error: null }),
        };
      }),
    };

    mutator = new SupabaseActionDatabaseMutator(mockSupabase);
  });

  // 1. Reconciliação Determinística FEBRABAN da Linha Real com 46 Dígitos
  it("Cenário 1 — Reconciliação determinística de 46 dígitos (zero-padding no Campo 5) valida Módulo 10 e Módulo 11", () => {
    const res = validateLinhaDigitavel(LINHA_46_DIGITOS_REAL);
    expect(res.valido).toBe(true);
    expect(res.linhaLimpa).toBe("34191090082098180560759884260007516180000047010");
    expect(res.linhaLimpa.length).toBe(47);
    expect(res.valorDerivado).toBe(470.10);
    expect(res.dataVencimentoDerivada).toBe("2026-11-02");
    expect(res.bancoCodigo).toBe("341");
    expect(res.bancoNome).toBe("Itaú Unibanco");
    expect(res.evidence?.reconciliacao_zero_padding).toBe(true);
    expect(res.evidence?.dv_geral_valid).toBe(true);
  });

  // 2. Fluxo Completo Telegram com Linha de 46 dígitos gera Action Proposal e requer confirmação
  it("Cenário 2 — Boleto com linha de 46 dígitos no Telegram passa na reconciliação determinística e gera proposta interativa", async () => {
    const mockFetch = vi.fn(async (_url: any, opts: any) => {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      if (body.model === "gpt-4o-mini") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    documentType: "BOLETO",
                    confidence: 95,
                    reasoning: "Boleto bancário identificado com código de barras e ficha de compensação.",
                    evidence: { hasBarcodeOrLinhaDigitavel: true },
                  }),
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  banco: "Banco Itaú (341)",
                  beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A",
                  cnpj_cpf_beneficiario: "61.451.102/0001-44",
                  valor: 470.10,
                  data_vencimento: "2026-11-02",
                  linha_digitavel: LINHA_46_DIGITOS_REAL,
                }),
              },
            },
          ],
        }),
      };
    });

    const runner = async (input: ProcessDocumentPipelineInput) => {
      return processDocumentPipeline({
        ...input,
        fetchFn: mockFetch as any,
      });
    };

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      mutator,
      openaiApiKey: "sk-test-key",
      documentPipelineRunner: runner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_boleto_spal_46dig",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    expect(result.text).toContain("Boleto identificado");
    expect(result.text).toContain("SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A");
    expect(result.text).toContain("470,10");
    expect(result.text).toContain("2026-11-02");
    expect(result.inlineKeyboard).toBeDefined();
    expect(result.inlineKeyboard![0][0].text).toContain("Cadastrar boleto");
    expect(result.inlineKeyboard![0][1].text).toContain("Cancelar");

    // Proposta gerada mas NENHUMA dívida inserida no banco ainda
    expect(savedProposals.size).toBe(1);
    expect(insertedDividas.length).toBe(0);
  });

  // 3. Fallback de Recuperação Focalizada (recoverBoletoLineWithFailover) em OCR com falha inicial
  it("Cenário 3 — Falha de OCR na primeira extração aciona recuperação focalizada e produz linha válida", async () => {
    let attemptCount = 0;
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("chat/completions")) {
        attemptCount++;
        if (attemptCount === 1) {
          // Primeira tentativa (visão geral): extrai linha incompleta
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      banco: "Santander",
                      beneficiario: "Fornecedor Alpha",
                      valor: 350.00,
                      data_vencimento: "2026-12-10",
                      linha_digitavel: "03399.00102 00000.123", // Incompleta (20 dígitos)
                    }),
                  },
                },
              ],
            }),
          };
        } else {
          // Segunda tentativa (recuperação focalizada com FOCUSED_BOLETO_LINE_PROMPT): extrai campos íntegros
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      campo1: "0339900102",
                      campo2: "00000123455",
                      campo3: "00000000000",
                      dv_geral: "1",
                      campo5: "98760000035000",
                      linha_digitavel: LINHA_VALIDA_SANTANDER,
                    }),
                  },
                },
              ],
            }),
          };
        }
      }
      return { ok: false, status: 404 };
    });

    const out = await processBoletoDocument({
      base64: "dGVzdGU=",
      mimeType: "image/jpeg",
      geminiApiKey: "",
      openaiApiKey: "sk-test",
      workspaceId: TEST_WORKSPACE_ID,
      fetchImpl: mockFetch as any,
    });

    expect(attemptCount).toBeGreaterThanOrEqual(2);
    expect(out.validacao.valido).toBe(true);
    expect(out.dados.linha_digitavel).toBe("03399001020000012345500000000000198760000035000");
    expect(out.validacao.valorFinal).toBe(350.00);
  });

  // 4. Bloqueio Seguro quando a linha é definitivamente inválida (sem inventar dados)
  it("Cenário 4 — Linha definitivamente ilegível/inválida bloqueia proposta, mas exibe dados parciais legíveis", async () => {
    const mockFebrabanInvalidoRunner = vi.fn(async () => ({
      success: false,
      documentType: "BOLETO" as const,
      status: "requer_revisao" as const,
      confidence: 90,
      data: {
        banco: "Bradesco",
        beneficiario: "Fornecedor Beta",
        valor: 1200.50,
        data_vencimento: "2026-11-15",
        linha_digitavel: "23790.00000 00000.000000 00000.000000 9 99990000120050",
      },
      validation: {
        isValid: false,
        errors: ["Dígito verificador geral da linha inválido (esperado 3, recebido 9)"],
        warnings: [],
      },
      hasPromptInjection: false,
      isDuplicate: false,
      errorCode: "WALLET_AI_DOCUMENT_VALIDATION_FAILED",
      correlationId: "test-corr-bloqueio",
      durationMs: 50,
    }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      documentPipelineRunner: mockFebrabanInvalidoRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_boleto_invalido",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    // Contém cabeçalho específico de erro
    expect(result.text).toContain("⚠️ <b>Boleto com Linha Digitável Inválida</b>");
    expect(result.text).toContain("Dígito verificador geral da linha inválido");
    // Apresenta dados parciais para revisão do usuário
    expect(result.text).toContain("Fornecedor Beta");
    expect(result.text).toContain("Bradesco");
    expect(result.text).toContain("1.200,50");
    // Orienta envio por texto
    expect(result.text).toContain("digite a linha digitável por mensagem de texto");
    // Nenhuma proposta nem dívida criada
    expect(result.inlineKeyboard).toBeUndefined();
    expect(savedProposals.size).toBe(0);
    expect(insertedDividas.length).toBe(0);
  });

  // 5. Correção Manual: Usuário digita a Linha Digitável via texto no Telegram
  it("Cenário 5 — Usuário envia linha digitável via mensagem de texto no Telegram: valida FEBRABAN e gera proposta de cadastro", async () => {
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
    };

    const result = await handleTelegramTextMessage(
      {
        text: LINHA_VALIDA_SANTANDER,
        identity: validIdentity,
        chatId: 1139976533,
      },
      deps,
    );

    expect(result.text).toContain("Boleto identificado");
    expect(result.text).toContain("Santander");
    expect(result.text).toContain("350,00");
    expect(result.inlineKeyboard).toBeDefined();
    expect(result.inlineKeyboard![0][0].text).toContain("Cadastrar boleto");
    expect(result.actionProposals).toBeDefined();
    expect(result.actionProposals!.length).toBe(1);
    expect(savedProposals.size).toBe(1);
  });

  // 6. Correção Manual: Usuário digita linha com DVs inválidos -> rejeição matemática imediata sem chamada ao LLM
  it("Cenário 6 — Linha digitável digitada no texto com DVs violados é rejeitada imediatamente com detalhamento FEBRABAN", async () => {
    const LINHA_DV_ERRADO = "03399.00102 00000.123455 00000.000000 8 98760000035000"; // DV geral errado (8 em vez de 1)

    const runnerFactoryMock = vi.fn();
    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: runnerFactoryMock,
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
    };

    const result = await handleTelegramTextMessage(
      {
        text: LINHA_DV_ERRADO,
        identity: validIdentity,
        chatId: 1139976533,
      },
      deps,
    );

    expect(result.text).toContain("⚠️ <b>Linha Digitável Inválida</b>");
    expect(result.text).toContain("Dígito verificador geral da linha inválido");
    expect(runnerFactoryMock).not.toHaveBeenCalled(); // Não gasta tokens de LLM
    expect(savedProposals.size).toBe(0);
  });

  // 7. Correção Manual: Linha digitável digitada que já existe no banco é bloqueada por duplicidade
  it("Cenário 7 — Linha digitável digitada no texto que já existe no banco é bloqueada com aviso de duplicidade", async () => {
    const mockFindDuplicate = vi.fn(async () => ({ isDuplicate: true }));

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      findDuplicateFn: mockFindDuplicate,
    };

    const result = await handleTelegramTextMessage(
      {
        text: LINHA_VALIDA_SANTANDER,
        identity: validIdentity,
        chatId: 1139976533,
      },
      deps,
    );

    expect(result.text).toContain("⚠️ <b>Boleto Duplicado Detectado!</b>");
    expect(result.text).toContain("nenhuma proposta em duplicidade foi gerada");
    expect(savedProposals.size).toBe(0);
  });

  // 8. Normalização da Data de Vencimento 30/10/2026 -> 2026-10-30 no pipeline sem erro WALLET_AI_ACTION_INVALID
  it("Cenário 8 — Boleto com data de vencimento no formato brasileiro DD/MM/YYYY (30/10/2026) é normalizado para YYYY-MM-DD sem erro interno", async () => {
    const rawPhotoBase64 = "dGVzdGUtYm9sZXRvLTMwLTEwLTIwMjY=";
    const mockApiClient = {
      getFile: vi.fn(async () => ({ file_path: "photos/boleto_30_10.jpg" })),
      downloadFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
      downloadFileAsBase64: vi.fn(async () => ({ base64: rawPhotoBase64, mimeType: "image/jpeg" })),
      sendMessage: vi.fn(async () => ({ message_id: 8881 })),
      answerCallbackQuery: vi.fn(async () => true),
      editMessageText: vi.fn(async () => true),
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                banco: "Companhia de Água e Saneamento",
                beneficiario: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS",
                cnpj_cpf_beneficiario: "61.450.911/0001-97",
                data_vencimento: "30/10/2026", // Data brasileira que antes causava WALLET_AI_ACTION_INVALID
                valor: 143.50,
                linha_digitavel: "846700000017435000240208240123456784901234567898",
              }),
            },
          },
        ],
      }),
    }));

    const mockDocumentRunner = vi.fn(async (input: ProcessDocumentPipelineInput) => {
      return await processDocumentPipeline({
        ...input,
        openaiApiKey: "sk-test-key",
        documentTypeHint: "BOLETO",
        fetchFn: mockFetch as any,
      });
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      openaiApiKey: "sk-test-key",
      documentPipelineRunner: mockDocumentRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_30_10",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    // Deve gerar a proposta interativa normalmente, sem cair em erro técnico
    expect(result.text).toContain("📄 <b>Boleto identificado</b>");
    expect(result.text).toContain("SPAL INDUSTRIA BRASILEIRA DE BEBIDAS");
    expect(result.text).toContain("143,50");
    expect(result.text).toContain("2026-10-30");
    expect(result.text).not.toContain("WALLET_AI_ACTION_INVALID");
    expect(result.inlineKeyboard).toBeDefined();

    // Proposta gerada deve ter data normalizada no padrão ISO
    expect(result.pipelineResult?.actionProposal).toBeDefined();
    expect((result.pipelineResult?.actionProposal?.payload as any)?.data_vencimento).toBe("2026-10-30");
    const savedProp = Array.from(savedProposals.values())[0];
    expect((savedProp?.payload as any)?.data_vencimento).toBe("2026-10-30");
  });

  // 9. Data impossível no calendário (31/02/2026) exige revisão fail-closed
  it("Cenário 9 — Boleto com data de vencimento impossível no calendário (31/02/2026) exige revisão fail-closed sem vazar código técnico", async () => {
    const rawPhotoBase64 = "dGVzdGUtYm9sZXRvLWZlYjMx";
    const mockApiClient = {
      getFile: vi.fn(async () => ({ file_path: "photos/boleto_feb31.jpg" })),
      downloadFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
      downloadFileAsBase64: vi.fn(async () => ({ base64: rawPhotoBase64, mimeType: "image/jpeg" })),
      sendMessage: vi.fn(async () => ({ message_id: 8882 })),
      answerCallbackQuery: vi.fn(async () => true),
      editMessageText: vi.fn(async () => true),
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                banco: "Companhia de Água e Saneamento",
                beneficiario: "SABESP",
                data_vencimento: "31/02/2026", // Data impossível
                valor: 143.50,
                linha_digitavel: "846700000017435000240208240123456784901234567898", // Linha de arrecadação válida (sem fator FEBRABAN)
              }),
            },
          },
        ],
      }),
    }));

    const mockDocumentRunner = vi.fn(async (input: ProcessDocumentPipelineInput) => {
      return await processDocumentPipeline({
        ...input,
        openaiApiKey: "sk-test-key",
        documentTypeHint: "BOLETO",
        fetchFn: mockFetch as any,
      });
    });

    const deps: TelegramAdapterDependencies = {
      supabase: mockSupabase,
      telegramBotToken: "mock-token",
      telegramApi: mockApiClient,
      runnerFactory: () => ({} as any),
      repoFactory: () => ({} as any),
      proposalRepo: mockProposalRepo,
      openaiApiKey: "sk-test-key",
      documentPipelineRunner: mockDocumentRunner as any,
    };

    const result = await handleTelegramDocument(
      {
        fileId: "photo_feb31",
        fileType: "image/jpeg",
        identity: validIdentity,
      },
      deps,
    );

    // Não deve vazar código de erro técnico nem crashar
    expect(result.text).not.toContain("WALLET_AI_");
    expect(result.text).toContain("Informações Incompletas no Boleto");
    expect(result.text).toContain("inválida no calendário");
    expect(result.inlineKeyboard).toBeUndefined(); // Fail-closed: nenhuma proposta de cadastro gerada
  });

  // 10. Sanitização de mensagens de erro internas no Telegram
  it("Cenário 10 — sanitizeUserFacingErrorMessage remove prefixos técnicos e traduz erros para linguagem amigável", () => {
    const rawErr1 = "[WALLET_AI_ACTION_INVALID] Data inválida para o campo data_vencimento. Esperado formato YYYY-MM-DD: 30/10/2026";
    const cleanErr1 = sanitizeUserFacingErrorMessage(rawErr1);
    expect(cleanErr1).toBe("A data de vencimento do boleto é inválida no calendário ou não pôde ser confirmada.");
    expect(cleanErr1).not.toContain("WALLET_AI");

    const rawErr2 = "[WALLET_AI_ACTION_INVALID] Valor do boleto deve ser maior que zero";
    const cleanErr2 = sanitizeUserFacingErrorMessage(rawErr2);
    expect(cleanErr2).toBe("O valor identificado para o boleto é inválido ou igual a zero.");

    const rawErr3 = "Error: Falha inesperada";
    const cleanErr3 = sanitizeUserFacingErrorMessage(rawErr3);
    expect(cleanErr3).toBe("Falha inesperada");
  });

  // 11. Boleto sem data de vencimento não substitui pela data atual
  it("Cenário 11 — Boleto sem data de vencimento não assume data atual por suposição e exige revisão", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                banco: "Companhia de Água e Saneamento",
                beneficiario: "Fornecedor XYZ",
                data_vencimento: null, // Sem vencimento
                valor: 143.50,
                linha_digitavel: "846700000017435000240208240123456784901234567898", // Linha de arrecadação válida (sem fator)
              }),
            },
          },
        ],
      }),
    }));

    const res = await processDocumentPipeline({
      workspaceId: validIdentity.workspaceId,
      userId: validIdentity.userId,
      base64: "dGVzdGU=",
      mimeType: "image/jpeg",
      openaiApiKey: "sk-test-key",
      documentTypeHint: "BOLETO",
      fetchFn: mockFetch as any,
    });

    expect(res.status).toBe("requer_revisao");
    expect(res.validation.errors).toContain("Data de vencimento do boleto não identificada.");
    expect(res.actionProposal).toBeUndefined(); // Nenhuma proposta criada com data de hoje fictícia
  });
});
