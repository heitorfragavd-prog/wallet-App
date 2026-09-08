/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveTelegramIdentity,
  handleTelegramTextMessage,
  handleTelegramCallback,
  handleTelegramDocument,
  processTelegramUpdate,
  formatProposalMessage,
  escapeTelegramHtml,
  markdownToTelegramHtml,
  clearTelegramUpdateCache,
  type TelegramApiClient,
  type TelegramAdapterDependencies,
  type TelegramUpdate,
} from "../../../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types.ts";
import type { ActionRepository } from "../../../../supabase/functions/_shared/ai/action-gateway.ts";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth.ts";

describe("Telegram Channel Adapter — Suite Canônica da Wallet IA (Etapa 9.5A)", () => {
  const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
  const TEST_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
  const TEST_TG_USER_ID = 987654321;
  const TEST_TG_CHAT_ID = 987654321;
  const TEST_GROUP_CHAT_ID = -100123456789;

  let mockSupabase: any;
  let mockProposalRepo: ActionRepository;
  let savedProposals: Map<string, ActionProposal>;
  let mockApiClient: TelegramApiClient;
  let sentMessages: any[];
  let editedMessages: any[];
  let answeredCallbacks: any[];
  let processedUpdatesInDb: Set<string>;

  beforeEach(() => {
    clearTelegramUpdateCache();
    processedUpdatesInDb = new Set<string>();
    savedProposals = new Map<string, ActionProposal>();
    sentMessages = [];
    editedMessages = [];
    answeredCallbacks = [];

    mockProposalRepo = {
      saveProposal: vi.fn(async (prop: ActionProposal) => {
        savedProposals.set(prop.id, { ...prop });
      }),
      getProposal: vi.fn(async (id: string) => {
        return savedProposals.get(id) || null;
      }),
      updateStatus: vi.fn(async (id: string, status: any) => {
        const p = savedProposals.get(id);
        if (p) {
          p.status = status;
          savedProposals.set(id, p);
        }
      }),
      confirmProposalAtomically: vi.fn(async (id: string, context: AiExecutionContext, role?: string) => {
        const p = savedProposals.get(id);
        if (!p) return { success: false, code: "WALLET_AI_ACTION_INVALID", error: "Não encontrada" };
        if (p.workspaceId !== context.workspaceId) {
          return { success: false, code: "WALLET_AI_ACTION_FORBIDDEN", error: "Cross-workspace forbidden" };
        }
        if (role === "viewer") {
          return { success: false, code: "WALLET_AI_ACTION_FORBIDDEN", error: "Viewer não pode aprovar" };
        }
        if (role !== "owner" && role !== "admin" && p.userId !== context.userId) {
          return { success: false, code: "WALLET_AI_ACTION_FORBIDDEN", error: "Apenas dono ou criador pode aprovar" };
        }
        if (p.status !== "prepared") {
          return { success: false, code: "WALLET_AI_ACTION_ALREADY_PROCESSED", error: "Já processada" };
        }
        if (new Date(p.expiresAt).getTime() < Date.now()) {
          p.status = "expired";
          return { success: false, code: "WALLET_AI_ACTION_EXPIRED", error: "Expirada" };
        }
        p.status = "confirmed";
        p.confirmedAt = new Date().toISOString();
        savedProposals.set(id, p);
        return { success: true, proposal: p };
      }),
      cancelProposalAtomically: vi.fn(async (id: string, context: AiExecutionContext) => {
        const p = savedProposals.get(id);
        if (!p || p.workspaceId !== context.workspaceId || p.status !== "prepared") return false;
        p.status = "cancelled";
        savedProposals.set(id, p);
        return true;
      }),
    };

    mockApiClient = {
      sendMessage: vi.fn(async (params) => {
        sentMessages.push(params);
        return { ok: true, message_id: 1001 };
      }),
      editMessageText: vi.fn(async (params) => {
        editedMessages.push(params);
        return { ok: true };
      }),
      editMessageReplyMarkup: vi.fn(async (params) => {
        editedMessages.push(params);
        return { ok: true };
      }),
      answerCallbackQuery: vi.fn(async (params) => {
        answeredCallbacks.push(params);
        return { ok: true };
      }),
      downloadFileAsBase64: vi.fn(async (_fileId) => {
        return {
          base64: Buffer.from("mock-pdf-content").toString("base64"),
          mimeType: "application/pdf",
          size: 1024,
        };
      }),
      transcribeAudio: vi.fn(async (_fileId) => {
        return "Qual é o saldo atual da empresa?";
      }),
    };

    mockSupabase = {
      from: vi.fn((table: string) => {
        const queryBuilder: any = {
          _filters: {},
          select: vi.fn(() => queryBuilder),
          eq: vi.fn((col: string, val: any) => {
            queryBuilder._filters[col] = val;
            return queryBuilder;
          }),
          insert: vi.fn((payload: any) => {
            queryBuilder._insertPayload = payload;
            return queryBuilder;
          }),
          delete: vi.fn(() => queryBuilder),
          lt: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          then: (resolve: any, reject?: any) => {
            return queryBuilder.execute().then(resolve, reject);
          },
          maybeSingle: vi.fn(async () => {
            const res = await queryBuilder.execute();
            if (Array.isArray(res.data)) {
              return { data: res.data[0] || null, error: res.error };
            }
            return res;
          }),
          execute: async () => {
            if (table === "telegram_processed_updates") {
              if (queryBuilder._insertPayload) {
                const key = `${queryBuilder._insertPayload.bot_id || "default"}:${queryBuilder._insertPayload.update_id}`;
                if (processedUpdatesInDb.has(key)) {
                  return {
                    data: null,
                    error: {
                      code: "23505",
                      message: 'duplicate key value violates unique constraint "pk_telegram_processed_updates"',
                    },
                  };
                }
                processedUpdatesInDb.add(key);
                return {
                  data: { update_id: queryBuilder._insertPayload.update_id },
                  error: null,
                };
              }
              return { data: [], error: null };
            }

            if (table === "channel_mappings") {
              if (
                queryBuilder._filters["channel_type"] === "telegram" &&
                queryBuilder._filters["channel_id"] === String(TEST_TG_USER_ID) &&
                queryBuilder._filters["is_active"] === true
              ) {
                return {
                  data: {
                    user_id: TEST_USER_ID,
                    workspace_id: TEST_WORKSPACE_ID,
                    access_level: "admin",
                    is_active: true,
                    nome_exibicao: "Heitor Admin",
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }

            if (table === "usuarios_telegram") {
              if (queryBuilder._filters["telegram_chat_id"] === String(TEST_TG_USER_ID) && queryBuilder._filters["ativo"] === true) {
                return {
                  data: {
                    user_id: TEST_USER_ID,
                    telegram_username: "heitor_user",
                    ativo: true,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }

            if (table === "telegram_grupos_config") {
              if (queryBuilder._filters["chat_id"] === String(TEST_GROUP_CHAT_ID)) {
                return {
                  data: {
                    workspace_id: TEST_WORKSPACE_ID,
                    chat_id: String(TEST_GROUP_CHAT_ID),
                    nome_grupo: "Financeiro Grupo",
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }

            if (table === "workspace_members") {
              if (
                queryBuilder._filters["workspace_id"] === TEST_WORKSPACE_ID &&
                queryBuilder._filters["user_id"] === TEST_USER_ID &&
                queryBuilder._filters["status"] === "active"
              ) {
                return { data: [{ role: "admin", status: "active", workspace_id: TEST_WORKSPACE_ID }], error: null };
              }
              return { data: [], error: null };
            }

            if (table === "workspaces") {
              if (queryBuilder._filters["user_id"] === TEST_USER_ID) {
                return { data: [{ id: TEST_WORKSPACE_ID }], error: null };
              }
              return { data: [], error: null };
            }

            return { data: null, error: null };
          },
        };
        return queryBuilder;
      }),
    };
  });

  // ─── 1. IDENTIFICAÇÃO E RBAC (FAIL-CLOSED) ──────────────────────────────────
  describe("1. Identificação e Resolução de Identidade / RBAC (Fail-Closed)", () => {
    it("deve resolver com sucesso usuário autenticado em channel_mappings (chat privado)", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: TEST_TG_USER_ID, telegramChatId: TEST_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.userId).toBe(TEST_USER_ID);
      expect(identity.workspaceId).toBe(TEST_WORKSPACE_ID);
      expect(identity.userRole).toBe("admin");
      expect(identity.userName).toBe("Heitor Admin");
    });

    it("deve resolver com sucesso via usuarios_telegram se channel_mappings não existir", async () => {
      // Faz channel_mappings falhar
      const supabaseWithLegacy = {
        from: vi.fn((table: string) => {
          if (table === "channel_mappings") {
            return {
              select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
            };
          }
          return mockSupabase.from(table);
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: TEST_TG_USER_ID, telegramChatId: TEST_TG_CHAT_ID, isGroup: false },
        supabaseWithLegacy,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.userId).toBe(TEST_USER_ID);
      expect(identity.userName).toBe("heitor_user");
    });

    it("FAIL-CLOSED: usuário não cadastrado é rejeitado com NOT_LINKED e ZERO fallback", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: 999999999, telegramChatId: 999999999, isGroup: false },
        mockSupabase,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("NOT_LINKED");
      expect(identity.error).toContain("não está vinculada à Wallet");
      expect(identity.userId).toBeUndefined();
    });

    it("FAIL-CLOSED: grupo não cadastrado em telegram_grupos_config é rejeitado", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: TEST_TG_USER_ID, telegramChatId: -100999999999, isGroup: true },
        mockSupabase,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("GROUP_NOT_CONFIGURED");
      expect(identity.error).toContain("não está configurado");
    });

    it("FAIL-CLOSED: usuário tenta interagir em grupo cujo workspace ele NÃO faz parte", async () => {
      const hackerUserId = "hacker-user-uuid";
      const customSupabase = {
        from: vi.fn((table: string) => {
          if (table === "channel_mappings") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: { user_id: hackerUserId, is_active: true },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "telegram_grupos_config") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { workspace_id: TEST_WORKSPACE_ID, chat_id: String(TEST_GROUP_CHAT_ID) },
                  }),
                }),
              }),
            };
          }
          if (table === "workspace_members" || table === "workspaces") {
            const builder: any = {
              select: () => builder,
              eq: () => builder,
              maybeSingle: async () => ({ data: null }),
            };
            return builder;
          }
          return mockSupabase.from(table);
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: 777777777, telegramChatId: TEST_GROUP_CHAT_ID, isGroup: true },
        customSupabase,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("FORBIDDEN");
      expect(identity.error).toContain("não possui permissão de acesso ao workspace");
    });
  });

  // ─── 2. FORMATAÇÃO E LIMITES TELEGRAM ───────────────────────────────────────
  describe("2. Formatação, Markdown e Limites do Telegram", () => {
    it("converte markdown básico para HTML compatível do Telegram", () => {
      const md = "Olá **mundo**! Seu saldo é *positivo* e o código é `1234`.";
      const html = markdownToTelegramHtml(md);

      expect(html).toContain("<b>mundo</b>");
      expect(html).toContain("<i>positivo</i>");
      expect(html).toContain("<code>1234</code>");
    });

    it("escapa tags HTML perigosas para evitar injeção de tags Telegram", () => {
      const raw = "<script>alert('xss')</script> & <div>test</div>";
      const escaped = escapeTelegramHtml(raw);

      expect(escaped).not.toContain("<script>");
      expect(escaped).toContain("&lt;script&gt;");
      expect(escaped).toContain("&amp;");
    });

    it("formata proposal para Telegram com limites estritos de callback_data (< 64 bytes)", () => {
      const proposal: ActionProposal = {
        id: "a3f56b10-6c9f-4311-8854-3e9a4f492a51",
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_despesa",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa de Almoço",
        payload: {
          valor: 85.5,
          data: "2026-09-04",
          descricao: "Almoço corporativo",
          categoria: "Alimentação",
        },
        idempotencyHash: "idem_1234",
        status: "prepared",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      };

      const formatted = formatProposalMessage(proposal);

      expect(formatted.text).toContain("📋 <b>Proposta de Ação: cadastrar_despesa</b>");
      expect(formatted.text).toContain("R$ 85,50");
      expect(formatted.text).toContain("Nível de Risco:</b> LOW");
      expect(formatted.buttons[0]).toHaveLength(2);

      const confirmBtn = formatted.buttons[0][0];
      const cancelBtn = formatted.buttons[0][1];

      expect(confirmBtn.text).toContain("Confirmar");
      expect(confirmBtn.callback_data).toBe(`confirm_prop:${proposal.id}`);
      expect(confirmBtn.callback_data.length).toBeLessThan(64);

      expect(cancelBtn.text).toContain("Cancelar");
      expect(cancelBtn.callback_data).toBe(`cancel_prop:${proposal.id}`);
      expect(cancelBtn.callback_data.length).toBeLessThan(64);
    });
  });

  // ─── 3. ROTEAMENTO ORCHESTRATOR (READ vs WRITE) ─────────────────────────────
  describe("3. Roteamento de Mensagens via Orchestrator (READ vs WRITE)", () => {
    it("consulta de leitura (READ) retorna texto explicativo sem Action Proposals e sem botões", async () => {
      const mockRunner = {
        generateCompletion: vi.fn(async () => ({
          message: {
            role: "assistant" as const,
            content: "Seu saldo consolidado em 04/09/2026 é de R$ 15.420,00.",
          },
        })),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => mockRunner as any,
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        userRole: "admin",
      };

      const result = await handleTelegramTextMessage(
        { text: "Qual meu saldo disponível?", identity, chatId: TEST_TG_CHAT_ID },
        deps,
      );

      expect(result.text).toContain("Seu saldo consolidado em 04/09/2026 é de R$ 15.420,00.");
      expect(result.inlineKeyboard).toBeUndefined();
      expect(result.actionProposals).toBeUndefined();
    });

    it("solicitação de escrita (WRITE) gera Action Proposal com botões inline de confirmação", async () => {
      // Simula o runner chamando tool de proposta de escrita e depois finalizando
      let callCount = 0;
      const mockRunner = {
        generateCompletion: vi.fn(async () => {
          callCount++;
          if (callCount === 1) {
            return {
              message: {
                role: "assistant" as const,
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function" as const,
                    function: {
                      name: "cadastrar_transacao",
                      arguments: JSON.stringify({
                        tipo: "despesa",
                        valor: 120.0,
                        descricao: "Papelaria",
                        data: "2026-09-04",
                      }),
                    },
                  },
                ],
              },
            };
          }
          return {
            message: {
              role: "assistant" as const,
              content: "Preparei a proposta de cadastro de despesa.",
            },
          };
        }),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => mockRunner as any,
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        userRole: "admin",
      };

      const result = await handleTelegramTextMessage(
        { text: "Cadastre uma despesa de 120 reais com papelaria", identity, chatId: TEST_TG_CHAT_ID },
        deps,
      );

      expect(result.inlineKeyboard).toBeDefined();
      expect(result.inlineKeyboard![0]).toHaveLength(2);
      expect(result.inlineKeyboard![0][0].text).toBe("✅ Confirmar");
      expect(result.inlineKeyboard![0][1].text).toBe("❌ Cancelar");
      expect(result.actionProposals).toBeDefined();
      expect(result.actionProposals!.length).toBeGreaterThan(0);
      expect(mockProposalRepo.saveProposal).toHaveBeenCalled();
    });
  });

  // ─── 4. TRATAMENTO DE CALLBACKS (CONFIRMAÇÃO / CANCELAMENTO) ────────────────
  describe("4. Tratamento de Callbacks de Confirmação e Cancelamento", () => {
    it("confirma proposta válida, atualiza status e remove botões da mensagem", async () => {
      const propId = "prop-confirm-123";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Almoço R$ 45",
        payload: { valor: 45 },
        idempotencyHash: "idem_45",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator: {
          executeMutation: vi.fn(async () => ({ success: true, recordId: "rec_123" })),
        },
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_1",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("confirmada com sucesso");
      expect(cbResult.removeKeyboard).toBe(true);
      expect(cbResult.updatedMessageText).toContain("Ação Confirmada e Executada");
      expect(["confirmed", "executed"]).toContain(savedProposals.get(propId)?.status);
    });

    it("prevenção de replay / duplo clique: segundo clique na mesma proposta é bloqueado", async () => {
      const propId = "prop-replay-123";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Almoço R$ 45",
        payload: { valor: 45 },
        idempotencyHash: "idem_45",
        status: "confirmed", // já confirmada
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: new Date().toISOString(),
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_2",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("já foi processada anteriormente");
      expect(cbResult.removeKeyboard).toBe(true);
      expect(cbResult.updatedMessageText).toContain("duplo clique prevenido");
    });

    it("cancela proposta válida e remove botões da mensagem sem mutação", async () => {
      const propId = "prop-cancel-123";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Almoço R$ 45",
        payload: { valor: 45 },
        idempotencyHash: "idem_45",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `cancel_prop:${propId}`,
          callbackQueryId: "cq_3",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("Proposta cancelada");
      expect(cbResult.removeKeyboard).toBe(true);
      expect(cbResult.updatedMessageText).toContain("Proposta Cancelada");
      expect(savedProposals.get(propId)?.status).toBe("cancelled");
    });

    it("proposta expirada é bloqueada e informa usuário", async () => {
      const propId = "prop-expired-123";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Almoço R$ 45",
        payload: { valor: 45 },
        idempotencyHash: "idem_45",
        status: "prepared",
        expiresAt: new Date(Date.now() - 5000).toISOString(), // expirada
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_4",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("expirou");
      expect(cbResult.removeKeyboard).toBe(true);
    });

    it("suporta aliases legados confirmar_proposta e cancelar_proposta", async () => {
      const propId = "prop-alias-123";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Almoço R$ 45",
        payload: { valor: 45 },
        idempotencyHash: "idem_45",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator: {
          executeMutation: vi.fn(async () => ({ success: true })),
        },
      };

      const cbConfirm = await handleTelegramCallback(
        {
          callbackData: `confirmar_proposta:${propId}`,
          callbackQueryId: "cq_alias_1",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );
      expect(cbConfirm.answerText).toContain("confirmada com sucesso");
    });
  });

  // ─── 5. PIPELINE DOCUMENTAL VIA TELEGRAM ────────────────────────────────────
  describe("5. Pipeline Documental DANFE / Boletos via Telegram (Fail-Closed)", () => {
    it("documento duplicado é rejeitado sem proposta de ação e sem botões", async () => {
      const mockDocumentRunner = vi.fn(async () => ({
        tipo: "danfe" as const,
        status: "duplicata_detectada" as const,
        isDuplicate: true,
        warnings: ["duplicata_detectada_chave_acesso"],
        confidence: 0.99,
        extractedData: {
          chave_acesso: "35260812345678000199550010000001231000001234",
        },
      }));

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        documentPipelineRunner: mockDocumentRunner as any,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        userRole: "admin",
      };

      const result = await handleTelegramDocument(
        {
          fileId: "tg_file_dup_123",
          fileType: "application/pdf",
          identity,
        },
        deps,
      );

      expect(result.text).toContain("Documento Duplicado Detectado");
      expect(result.text).toContain("nenhuma proposta em duplicidade foi gerada");
      expect(result.inlineKeyboard).toBeUndefined();
      expect(mockProposalRepo.saveProposal).not.toHaveBeenCalled();
    });

    it("documento válido gera Action Proposal com botões inline de confirmação", async () => {
      const mockDocProposal: ActionProposal = {
        id: "prop-doc-uuid-99",
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Registrar DANFE Posto Ipiranga R$ 350,00",
        payload: {
          valor: 350.0,
          descricao: "Posto Ipiranga",
          data: "2026-09-04",
        },
        idempotencyHash: "idem_doc_350",
        status: "prepared",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      };

      const mockDocumentRunner = vi.fn(async () => ({
        tipo: "danfe" as const,
        status: "processado" as const,
        isDuplicate: false,
        warnings: [],
        confidence: 0.98,
        actionProposal: mockDocProposal,
        extractedData: {
          razao_social_emitente: "Posto Ipiranga",
          valor_total: 350.0,
        },
      }));

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        documentPipelineRunner: mockDocumentRunner as any,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER_ID,
        workspaceId: TEST_WORKSPACE_ID,
        userRole: "admin",
      };

      const result = await handleTelegramDocument(
        {
          fileId: "tg_file_valid_99",
          fileType: "application/pdf",
          identity,
        },
        deps,
      );

      expect(result.inlineKeyboard).toBeDefined();
      expect(result.inlineKeyboard![0][0].callback_data).toBe("confirm_prop:prop-doc-uuid-99");
      expect(result.inlineKeyboard![0][1].callback_data).toBe("cancel_prop:prop-doc-uuid-99");
      expect(mockProposalRepo.saveProposal).toHaveBeenCalledWith(mockDocProposal);
    });
  });

  // ─── 6. DISPATCHER GERAL DE ATUALIZAÇÕES ────────────────────────────────────
  describe("6. Dispatcher Geral de Atualizações (processTelegramUpdate)", () => {
    it("processa callback query e edita mensagem removendo botões", async () => {
      const propId = "prop-dispatch-1";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa R$ 10",
        payload: { valor: 10 },
        idempotencyHash: "idem_10",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator: { executeMutation: vi.fn(async () => ({ success: true })) },
      };

      const update: TelegramUpdate = {
        update_id: 101,
        callback_query: {
          id: "cq_disp_1",
          from: { id: TEST_TG_USER_ID, first_name: "Heitor" },
          data: `confirm_prop:${propId}`,
          message: {
            message_id: 501,
            chat: { id: TEST_TG_CHAT_ID, type: "private" },
            date: Date.now(),
          },
        },
      };

      const result = await processTelegramUpdate(update, deps);

      expect(result.handled).toBe(true);
      expect(mockApiClient.answerCallbackQuery).toHaveBeenCalledWith(
        expect.objectContaining({ callbackQueryId: "cq_disp_1" }),
      );
      expect(mockApiClient.editMessageReplyMarkup).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: TEST_TG_CHAT_ID,
          messageId: 501,
          inlineKeyboard: [],
        }),
      );
    });

    it("ignora comandos administrativos para permitir fluxo legado (/start)", async () => {
      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const update: TelegramUpdate = {
        update_id: 102,
        message: {
          message_id: 502,
          from: { id: TEST_TG_USER_ID, first_name: "Heitor" },
          chat: { id: TEST_TG_CHAT_ID, type: "private" },
          date: Date.now(),
          text: "/start",
        },
      };

      const result = await processTelegramUpdate(update, deps);
      expect(result.handled).toBe(false);
    });
  });

  // ─── 7. CHECKPOINT 9.5A.1 — HARDENING DO TELEGRAM ──────────────────────────
  describe("7. Checkpoint 9.5A.1 — Hardening do Telegram (Fail-Closed, Replay, Multi-Workspace, Risk)", () => {
    // 1. sem mutator -> nenhuma execução
    it("1. sem mutator -> nenhuma execução (proposal transiciona para confirmed, não executed)", async () => {
      const propId = "prop-no-mutator-chk";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Café R$ 10",
        payload: { valor: 10 },
        idempotencyHash: "idem_cafe_10",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        // mutator ausente
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_no_mut",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toBe("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(cbResult.updatedMessageText).toContain("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(cbResult.updatedMessageText).not.toContain("Ação Confirmada e Executada");
      expect(savedProposals.get(propId)?.status).toBe("confirmed");
      expect(savedProposals.get(propId)?.executedAt).toBeNull();
    });

    // 2. proposal-only -> status confirmed, não executed
    it("2. proposal-only -> status confirmed, não executed", async () => {
      const propId = "prop-proposal-only-chk";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Transporte R$ 25",
        payload: { valor: 25 },
        idempotencyHash: "idem_trans_25",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator: {
          executeMutation: vi.fn(async () => {
            throw new Error("Proposal-only: executores financeiros automáticos inativos");
          }),
        },
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_prop_only",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toBe("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(cbResult.updatedMessageText).toContain("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(cbResult.updatedMessageText).not.toContain("Ação Confirmada e Executada");
      expect(savedProposals.get(propId)?.status).toBe("confirmed");
      expect(savedProposals.get(propId)?.executedAt).toBeNull();
    });

    // 3. mensagem não diz "executada" sem execução
    it("3. mensagem não diz 'executada' sem execução", async () => {
      const propId = "prop-msg-no-exec";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "criar_meta",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Criar meta Reserva",
        payload: { nome: "Reserva" },
        idempotencyHash: "idem_meta_1",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_msg_no_exec",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toBe("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(cbResult.updatedMessageText).not.toContain("Ação Confirmada e Executada");
      expect(cbResult.updatedMessageText).not.toContain("executada com sucesso");
      expect(cbResult.updatedMessageText).toContain("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
    });

    // 4. delete bloqueado
    it("4. delete bloqueado: deletar_transacao é barrado no Telegram", async () => {
      const propId = "prop-del-chk";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "deletar_transacao",
        actionVersion: "v1",
        riskLevel: "HIGH",
        summary: "Deletar transação tx-99",
        payload: { transacao_id: "tx-99" },
        idempotencyHash: "idem_del_99",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const mockMutator = { executeMutation: vi.fn() };
      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        mutator: mockMutator,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_del_chk",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("bloqueada por política de segurança");
      expect(cbResult.updatedMessageText).toContain("Ação Bloqueada");
      expect(cbResult.removeKeyboard).toBe(true);
      expect(mockMutator.executeMutation).not.toHaveBeenCalled();
      expect(savedProposals.get(propId)?.status).toBe("prepared");
    });

    // 5. CRITICAL inexistente
    it("5. CRITICAL inexistente no modelo de risco e formatação", () => {
      const proposal: ActionProposal = {
        id: "prop-risk-chk",
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "HIGH",
        summary: "Transação de Risco",
        payload: { valor: 50000 },
        idempotencyHash: "idem_risk_chk",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      };

      const formatted = formatProposalMessage(proposal);
      expect(formatted.text).toContain("HIGH");
      expect(formatted.text).not.toContain("CRITICAL");
    });

    // 6. 1 workspace resolve
    it("6. 1 workspace resolve: auto-resolve quando usuário tem exatamente 1 workspace", async () => {
      const singleWsSupabase = {
        from: vi.fn((table: string) => {
          const qb: any = {
            select: () => qb,
            eq: () => qb,
            maybeSingle: async () => {
              if (table === "channel_mappings") {
                return {
                  data: {
                    user_id: "user-single-ws",
                    workspace_id: null,
                    channel_config: {},
                    is_active: true,
                    nome_exibicao: "Single WS User",
                  },
                };
              }
              return { data: null };
            },
            execute: async () => {
              if (table === "workspaces") {
                return { data: [{ id: "ws-single-111" }], error: null };
              }
              if (table === "workspace_members") {
                return { data: [], error: null };
              }
              return { data: [], error: null };
            },
            then: (resolve: any, reject?: any) => {
              return qb.execute().then(resolve, reject);
            },
          };
          return qb;
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: 123456, telegramChatId: 123456, isGroup: false },
        singleWsSupabase as any,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.workspaceId).toBe("ws-single-111");
    });

    // 7. múltiplos workspaces não escolhe primeiro
    it("7. múltiplos workspaces não escolhe primeiro: retorna NEED_WORKSPACE_SELECTION sem workspace explícito", async () => {
      const multiWsSupabase = {
        from: vi.fn((table: string) => {
          const qb: any = {
            select: () => qb,
            eq: () => qb,
            maybeSingle: async () => {
              if (table === "channel_mappings") {
                return {
                  data: {
                    user_id: "user-multi-ws",
                    workspace_id: null,
                    channel_config: {},
                    is_active: true,
                    nome_exibicao: "Multi WS User",
                  },
                };
              }
              return { data: null };
            },
            execute: async () => {
              if (table === "workspaces") {
                return { data: [{ id: "ws-alpha" }, { id: "ws-beta" }], error: null };
              }
              if (table === "workspace_members") {
                return { data: [], error: null };
              }
              return { data: [], error: null };
            },
            then: (resolve: any, reject?: any) => {
              return qb.execute().then(resolve, reject);
            },
          };
          return qb;
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: 123456, telegramChatId: 123456, isGroup: false },
        multiWsSupabase as any,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("NEED_WORKSPACE_SELECTION");
      expect(identity.error).toContain("múltiplos workspaces");
      expect(identity.workspaceId).toBeUndefined();
    });

    // 8. workspace explícito mapping funciona
    it("8. workspace explícito mapping funciona: respeita selected_workspace_id com múltiplos workspaces", async () => {
      const explicitWsSupabase = {
        from: vi.fn((table: string) => {
          const qb: any = {
            select: () => qb,
            eq: () => qb,
            maybeSingle: async () => {
              if (table === "channel_mappings") {
                return {
                  data: {
                    user_id: "user-multi-ws",
                    workspace_id: null,
                    channel_config: { selected_workspace_id: "ws-beta" },
                    is_active: true,
                    nome_exibicao: "Multi WS User",
                  },
                };
              }
              return { data: null };
            },
            execute: async () => {
              if (table === "workspaces") {
                return { data: [{ id: "ws-alpha" }, { id: "ws-beta" }], error: null };
              }
              if (table === "workspace_members") {
                return { data: [{ workspace_id: "ws-beta", role: "member", status: "active" }], error: null };
              }
              return { data: [], error: null };
            },
            then: (resolve: any, reject?: any) => {
              return qb.execute().then(resolve, reject);
            },
          };
          return qb;
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: 123456, telegramChatId: 123456, isGroup: false },
        explicitWsSupabase as any,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.workspaceId).toBe("ws-beta");
    });

    // 9. grupo valida chat + user
    it("9. grupo valida chat + user: rejeita se grupo existe mas usuário não pertence ao workspace", async () => {
      const groupSupabase = {
        from: vi.fn((table: string) => {
          const qb: any = {
            select: () => qb,
            eq: () => qb,
            maybeSingle: async () => {
              if (table === "channel_mappings") {
                return {
                  data: {
                    user_id: "user-outsider",
                    is_active: true,
                    nome_exibicao: "User Outsider",
                  },
                };
              }
              if (table === "telegram_grupos_config") {
                return {
                  data: {
                    workspace_id: "ws-group-only",
                    chat_id: "-100777",
                  },
                };
              }
              return { data: null };
            },
            execute: async () => ({ data: [], error: null }),
          };
          return qb;
        }),
      };

      const identity = await resolveTelegramIdentity(
        { telegramUserId: 777, telegramChatId: -100777, isGroup: true },
        groupSupabase as any,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("FORBIDDEN");
      expect(identity.error).toContain("não possui permissão de acesso ao workspace deste grupo");
    });

    // 10. callback grupo mantém contexto
    it("10. callback grupo mantém contexto: propaga isGroup: true e chatId para autorização", async () => {
      const propId = "prop-group-chk-1";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: "ws-group-only",
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Grupo R$ 150",
        payload: { valor: 150 },
        idempotencyHash: "idem_grp_chk",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const outsiderSupabase = {
        from: vi.fn((table: string) => {
          const qb: any = {
            select: () => qb,
            eq: () => qb,
            maybeSingle: async () => {
              if (table === "channel_mappings") {
                return { data: { user_id: TEST_USER_ID, is_active: true } };
              }
              if (table === "telegram_grupos_config") {
                return { data: { workspace_id: "ws-group-only", chat_id: String(TEST_GROUP_CHAT_ID) } };
              }
              return { data: null };
            },
            execute: async () => ({ data: [], error: null }),
          };
          return qb;
        }),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: outsiderSupabase as any,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_grp_chk",
          telegramUserId: TEST_TG_USER_ID,
          chatId: TEST_GROUP_CHAT_ID,
          isGroup: true,
        },
        deps,
      );

      expect(cbResult.answerText).toContain("Acesso negado");
      expect(savedProposals.get(propId)?.status).toBe("prepared");
    });

    // 11. mesmo update_id não duplica proposal
    it("11. mesmo update_id não duplica proposal: replay de update_id é ignorado", async () => {
      clearTelegramUpdateCache();

      const mockRunner = {
        generateCompletion: vi.fn(async () => ({
          message: { role: "assistant" as const, content: "Resposta única" },
        })),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => mockRunner as any,
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const update: TelegramUpdate = {
        update_id: 888999,
        message: {
          message_id: 882,
          from: { id: TEST_TG_USER_ID, first_name: "Heitor" },
          chat: { id: TEST_TG_CHAT_ID, type: "private" },
          date: Date.now(),
          text: "Qual é o saldo?",
        },
      };

      const first = await processTelegramUpdate(update, deps);
      expect(first.handled).toBe(true);
      expect(mockRunner.generateCompletion).toHaveBeenCalledTimes(1);

      const second = await processTelegramUpdate(update, deps);
      expect(second.handled).toBe(true);
      expect(mockRunner.generateCompletion).toHaveBeenCalledTimes(1);
    });

    // 12. callback repetido não duplica
    it("12. callback repetido não duplica: duplo clique é tratado como idempotente", async () => {
      const propId = "prop-double-chk";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa R$ 50",
        payload: { valor: 50 },
        idempotencyHash: "idem_dchk_50",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const first = await handleTelegramCallback(
        { callbackData: `cancel_prop:${propId}`, callbackQueryId: "cq_dchk_1", telegramUserId: TEST_TG_USER_ID },
        deps,
      );
      expect(first.answerText).toContain("Proposta cancelada");
      expect(savedProposals.get(propId)?.status).toBe("cancelled");

      const second = await handleTelegramCallback(
        { callbackData: `cancel_prop:${propId}`, callbackQueryId: "cq_dchk_2", telegramUserId: TEST_TG_USER_ID },
        deps,
      );
      expect(second.answerText).toContain("Esta proposta já foi cancelada");
    });

    // 13. confirm após cancel falha
    it("13. confirm após cancel falha: bloqueia aprovação de proposta cancelada", async () => {
      const propId = "prop-c-after-c";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa R$ 80",
        payload: { valor: 80 },
        idempotencyHash: "idem_cac",
        status: "cancelled",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const res = await handleTelegramCallback(
        { callbackData: `confirm_prop:${propId}`, callbackQueryId: "cq_cac", telegramUserId: TEST_TG_USER_ID },
        deps,
      );

      expect(res.answerText).toContain("foi cancelada e não pode ser confirmada");
      expect(savedProposals.get(propId)?.status).toBe("cancelled");
    });

    // 14. cancel após confirm falha
    it("14. cancel após confirm falha: bloqueia cancelamento de proposta confirmada", async () => {
      const propId = "prop-c-after-conf";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: TEST_WORKSPACE_ID,
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa R$ 80",
        payload: { valor: 80 },
        idempotencyHash: "idem_conf_then_cancel",
        status: "confirmed",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: new Date().toISOString(),
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase,
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const res = await handleTelegramCallback(
        { callbackData: `cancel_prop:${propId}`, callbackQueryId: "cq_conf_c", telegramUserId: TEST_TG_USER_ID },
        deps,
      );

      expect(res.answerText).toContain("Não é possível cancelar uma proposta");
      expect(res.answerText).toContain("confirmed");
      expect(savedProposals.get(propId)?.status).toBe("confirmed");
    });

    // 15. outro workspace falha
    it("15. outro workspace falha: cross-workspace callback é barrado", async () => {
      const propId = "prop-cross-ws";
      savedProposals.set(propId, {
        id: propId,
        workspaceId: "workspace-stranger-999",
        userId: TEST_USER_ID,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Despesa Estranha R$ 80",
        payload: { valor: 80 },
        idempotencyHash: "idem_cross",
        status: "prepared",
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        confirmedAt: null,
        executedAt: null,
        createdAt: new Date().toISOString(),
      });

      const deps: TelegramAdapterDependencies = {
        supabase: mockSupabase, // Resolve para TEST_WORKSPACE_ID
        telegramBotToken: "mock-token",
        telegramApi: mockApiClient,
        runnerFactory: () => ({} as any),
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const res = await handleTelegramCallback(
        { callbackData: `confirm_prop:${propId}`, callbackQueryId: "cq_cross", telegramUserId: TEST_TG_USER_ID },
        deps,
      );

      expect(res.answerText).toContain("pertence a outro workspace");
      expect(savedProposals.get(propId)?.status).toBe("prepared");
    });
  });
});
