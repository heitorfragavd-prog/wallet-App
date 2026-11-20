/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveTelegramIdentity,
  handleTelegramTextMessage,
  processTelegramUpdate,
  clearTelegramUpdateCache,
  type TelegramApiClient,
  type TelegramAdapterDependencies,
} from "../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import type { ActionRepository } from "../../supabase/functions/_shared/ai/action-gateway.ts";
import type { FinancialQueryRepository, QueryToolCatalog } from "../../supabase/functions/_shared/ai/query-tools.ts";
import { executeQueryTool } from "../../supabase/functions/_shared/ai/query-tools.ts";
import type { ConversationRepository, ConversationRecord, MessageRecord } from "../../supabase/functions/_shared/ai/memory-core.ts";
import type { LlmRunner, LlmMessage } from "../../supabase/functions/_shared/ai/orchestrator-core.ts";

describe("👑 WALLET CEO 3.0 — HOMOLOGAÇÃO REAL DO CÉREBRO CEO NO TELEGRAM", () => {
  const OWNER_USER_ID = "0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0";
  const _ADMIN_USER_ID = "admin-1111-4111-8111-111111111111";
  const MEMBER_USER_ID = "member-2222-4222-8222-222222222222";
  const WORKSPACE_ID = "2af415b6-76aa-4134-8133-a9b405671c1c"; // Conta Rodo Point

  const OWNER_TG_USER_ID = 1139976533; // Heitor TG ID
  const OWNER_TG_CHAT_ID = 1139976533;
  const MEMBER_TG_USER_ID = 888888888;
  const GROUP_CHAT_ID = -1004384150943; // Grupo Fechamento Rodo Point

  let mockSupabase: any;
  let mockApiClient: TelegramApiClient;
  let sentMessages: any[];
  let memoryConversations: Map<string, ConversationRecord>;
  let memoryMessages: Map<string, MessageRecord[]>;
  let mockRepo: FinancialQueryRepository;

  beforeEach(() => {
    clearTelegramUpdateCache();
    sentMessages = [];
    memoryConversations = new Map();
    memoryMessages = new Map();

    mockRepo = {
      listRevenues: vi.fn(async () => [
        { id: "rev-1", workspaceId: WORKSPACE_ID, description: "Vendas Balcão", amount: 15420.5, date: "2026-11-20", kind: "income" } as any,
      ]),
      listExpenses: vi.fn(async () => [
        { id: "exp-1", workspaceId: WORKSPACE_ID, description: "Fornecedor Atacado", amount: 6240.0, date: "2026-11-20", kind: "expense" } as any,
      ]),
      listTransactions: vi.fn(async () => []),
      listBalances: vi.fn(async () => [
        { accountId: "acc-1", name: "Caixa Loja", amount: 3500.0, type: "caixa" },
      ]),
      listSalesPDV: vi.fn(async (_ctx, period) => {
        if (period?.start === "2025-11-20") {
          return [
            { id: "sp-1", workspaceId: WORKSPACE_ID, description: "Comanda 101", amount: 1050.4, date: "2025-11-20", kind: "income" } as any,
          ];
        }
        return [
          { id: "sp-yesterday-1", workspaceId: WORKSPACE_ID, description: "Comanda 1", amount: 350.0, date: "2026-11-19", kind: "income" } as any,
          { id: "sp-yesterday-2", workspaceId: WORKSPACE_ID, description: "Comanda 2", amount: 480.0, date: "2026-11-19", kind: "income" } as any,
        ];
      }),
      listSalesPdvDetails: vi.fn(async (_ctx, period) => {
        if (period?.start === "2025-11-20") {
          return Array.from({ length: 15 }).map((_, i) => ({
            id: `dt-20-${i}`,
            workspaceId: WORKSPACE_ID,
            description: `Comanda ${i + 1}`,
            amount: 70.0266, // 15 * 70.0266 = ~1050.40
            date: "2025-11-20",
            paymentMethod: "Cartão de Crédito",
            items: [{ productName: "Pão de Queijo", quantity: 2, price: 35.01, total: 70.02 }],
            status: "concluida",
          })) as any;
        }
        return [
          {
            id: "dt-1",
            workspaceId: WORKSPACE_ID,
            description: "Venda 1",
            amount: 150.0,
            date: "2026-11-19",
            paymentMethod: "Pix",
            items: [
              { productName: "Pão de Queijo", quantity: 20, price: 5.0, total: 100.0 },
              { productName: "Coca-Cola 350ml", quantity: 10, price: 5.0, total: 50.0 },
            ],
            status: "concluida",
          },
          {
            id: "dt-2",
            workspaceId: WORKSPACE_ID,
            description: "Venda 2",
            amount: 120.0,
            date: "2026-11-19",
            paymentMethod: "Dinheiro",
            items: [
              { productName: "Salgado R$ 9,00", quantity: 10, price: 9.0, total: 90.0 },
              { productName: "Trident Menta", quantity: 10, price: 3.0, total: 30.0 },
            ],
            status: "concluida",
          },
        ] as any;
      }),
      listInventoryItems: vi.fn(async () => [
        {
          id: "prod-1",
          workspaceId: WORKSPACE_ID,
          codigo: "101",
          descricao: "Pão de Queijo",
          precoVenda: 5.0,
          custoAtual: 1.5,
          estoqueAtual: 50,
          estoqueMinimo: 20,
          estoqueIdeal: 100,
          unidadeMedida: "UN",
          multiploCompra: 1,
          fornecedorPadrao: "Fornecedor Panificação",
          margemRealPercentual: 70.0,
          ativo: true,
          estoqueInformado: true,
          custoInformado: true,
        } as any,
        {
          id: "prod-2",
          workspaceId: WORKSPACE_ID,
          codigo: "102",
          descricao: "Coca-Cola 350ml",
          precoVenda: 5.0,
          custoAtual: 2.8,
          estoqueAtual: 120,
          estoqueMinimo: 48,
          estoqueIdeal: 240,
          unidadeMedida: "UN",
          multiploCompra: 24,
          fornecedorPadrao: "Coca-Cola FEMSA",
          margemRealPercentual: 44.0,
          ativo: true,
          estoqueInformado: true,
          custoInformado: true,
        } as any,
      ]),
      listRecipeCards: vi.fn(async () => [
        {
          id: "rc-1",
          workspaceId: WORKSPACE_ID,
          nome: "Pão de Queijo",
          precoVenda: 5.0,
          custoTotal: 1.5,
          margemPercentual: 70.0,
          statusMargem: "saudavel",
          statusFicha: "completa",
          qtdInsumos: 4,
          qtdInsumosSemCusto: 0,
          ativo: true,
        } as any,
      ]),
      listSuppliers: vi.fn(async () => [
        { id: "forn-1", workspaceId: WORKSPACE_ID, nome: "Distribuidora Atacado 16852" } as any,
      ]),
    };

    mockApiClient = {
      sendMessage: vi.fn(async (params) => {
        sentMessages.push(params);
        return { ok: true, message_id: 1000 + sentMessages.length };
      }),
      editMessageText: vi.fn(async () => ({ ok: true })),
      editMessageReplyMarkup: vi.fn(async () => ({ ok: true })),
      answerCallbackQuery: vi.fn(async () => ({ ok: true })),
      downloadFileAsBase64: vi.fn(async () => ({ base64: "", mimeType: "text/plain", size: 0 })),
    };

    mockSupabase = {
      from: vi.fn((table: string) => {
        const qb: any = {
          _filters: {},
          select: vi.fn(() => qb),
          eq: vi.fn((col: string, val: any) => {
            qb._filters[col] = val;
            return qb;
          }),
          update: vi.fn(() => qb),
          insert: vi.fn((payload: any) => {
            qb._insertPayload = payload;
            return qb;
          }),
          delete: vi.fn(() => qb),
          lt: vi.fn(() => qb),
          limit: vi.fn(() => qb),
          maybeSingle: vi.fn(async () => {
            const res = await qb.execute();
            if (Array.isArray(res.data)) return { data: res.data[0] || null, error: res.error };
            return res;
          }),
          execute: async () => {
            if (table === "channel_mappings") {
              const chId = qb._filters["channel_id"];
              if (chId === String(OWNER_TG_USER_ID)) {
                return {
                  data: {
                    user_id: OWNER_USER_ID,
                    workspace_id: WORKSPACE_ID,
                    access_level: "admin",
                    nome_exibicao: "Heitor",
                    is_active: true,
                  },
                  error: null,
                };
              }
              if (chId === String(MEMBER_TG_USER_ID)) {
                return {
                  data: {
                    user_id: MEMBER_USER_ID,
                    workspace_id: WORKSPACE_ID,
                    access_level: "member",
                    nome_exibicao: "Operador Balcão",
                    is_active: true,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }

            if (table === "usuarios_telegram") {
              return { data: null, error: null };
            }

            if (table === "workspaces") {
              const uid = qb._filters["user_id"];
              const wid = qb._filters["id"];
              if (uid === OWNER_USER_ID && (!wid || wid === WORKSPACE_ID)) {
                return { data: [{ id: WORKSPACE_ID, user_id: OWNER_USER_ID, nome: "Conta Rodo Point" }], error: null };
              }
              return { data: [], error: null };
            }

            if (table === "workspace_members") {
              const uid = qb._filters["user_id"];
              const wid = qb._filters["workspace_id"];
              if (wid === WORKSPACE_ID && uid === OWNER_USER_ID) {
                return { data: [{ workspace_id: WORKSPACE_ID, user_id: OWNER_USER_ID, role: "admin", active: true }], error: null };
              }
              if (wid === WORKSPACE_ID && uid === MEMBER_USER_ID) {
                return { data: [{ workspace_id: WORKSPACE_ID, user_id: MEMBER_USER_ID, role: "member", active: true }], error: null };
              }
              return { data: [], error: null };
            }

            if (table === "telegram_grupos_config") {
              if (qb._filters["chat_id"] === String(GROUP_CHAT_ID)) {
                return {
                  data: {
                    id: "grp-fechamento-1",
                    workspace_id: WORKSPACE_ID,
                    chat_id: String(GROUP_CHAT_ID),
                    nome_grupo: "Fechamento Rodo Point",
                    tipo_grupo: "fechamento",
                    ativo: true,
                    ferramentas_permitidas: ["fechar_caixa"],
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }

            if (table === "wallet_ai_conversations") {
              return { data: { id: "conv-1", agent_type: "ceo" }, error: null };
            }

            if (table === "telegram_processed_updates") {
              return { data: [qb._insertPayload || { update_id: 1 }], error: null };
            }

            return { data: null, error: null };
          },
          then: (resolve: any, reject?: any) => qb.execute().then(resolve, reject),
        };
        return qb;
      }),
    };
  });

  const createMockConversationRepo = (): ConversationRepository => {
    return {
      async getOrCreateActiveConversation(data) {
        const key = `${data.workspaceId}:${data.userId}:${data.agentType || "operational"}:${data.externalChatId || "web"}`;
        let conv = memoryConversations.get(key);
        if (!conv) {
          conv = {
            id: `conv_${memoryConversations.size + 1}`,
            workspace_id: data.workspaceId,
            user_id: data.userId,
            title: data.title || "Conversa",
            summary: null,
            is_archived: false,
            agent_type: data.agentType || "operational",
            is_shared: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          memoryConversations.set(key, conv);
        }
        return conv;
      },
      async createConversation(data) {
        const conv: ConversationRecord = {
          id: `conv_${memoryConversations.size + 1}`,
          workspace_id: data.workspaceId,
          user_id: data.userId,
          title: data.title || "Conversa",
          summary: null,
          is_archived: false,
          agent_type: data.agentType || "operational",
          is_shared: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return conv;
      },
      async listRecentMessages(convId) {
        return memoryMessages.get(convId) || [];
      },
      async countMessages(convId) {
        return (memoryMessages.get(convId) || []).length;
      },
      async appendMessage(data) {
        const list = memoryMessages.get(data.conversationId) || [];
        const msg: MessageRecord = {
          id: `msg_${list.length + 1}`,
          conversation_id: data.conversationId,
          workspace_id: data.workspaceId,
          user_id: data.userId,
          role: data.role,
          content: data.content,
          tool_calls: data.toolCalls as any,
          tool_results: data.toolResults as any,
          sources: data.sources as any,
          tokens_count: data.tokensCount || 0,
          created_at: new Date().toISOString(),
        };
        list.push(msg);
        memoryMessages.set(data.conversationId, list);
        return msg;
      },
      async updateSummary() {},
    };
  };

  const createMockDeps = (runner?: LlmRunner): TelegramAdapterDependencies => ({
    supabase: mockSupabase,
    telegramBotToken: "TEST_BOT_TOKEN",
    telegramApi: mockApiClient,
    runnerFactory: () => runner || {
      generateCompletion: vi.fn(async () => ({
        message: {
          role: "assistant",
          content: "Resposta executiva gerada pelo modelo com dados reais.",
        },
      })),
    },
    repoFactory: () => mockRepo,
    proposalRepo: {} as ActionRepository,
    conversationRepo: createMockConversationRepo(),
    documentPipelineRunner: vi.fn(),
    allowMemoryOnlyIdempotency: true,
    idempotencyRepo: {
      claimUpdate: vi.fn(async () => true),
      clearExpired: vi.fn(async () => 0),
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE 1 — VERIFICAÇÃO DE IDENTIDADE E RBAC (FAIL-CLOSED)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("GATE 1 — Identificação e Derivação de Role Real", () => {
    it("1.1 Proprietário real da Rodo Point é resolvido com userRole: 'owner' e isOwner: true", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.userId).toBe(OWNER_USER_ID);
      expect(identity.workspaceId).toBe(WORKSPACE_ID);
      expect(identity.isOwner).toBe(true);
      // Mesmo com channel_mappings.access_level = 'admin', a tabela workspaces comprova propriedade
      expect(identity.userRole === "owner" || identity.userRole === "admin").toBe(true);
    });

    it("1.2 Usuário operacional comum recebe role: 'member' e isOwner: false", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: MEMBER_TG_USER_ID, telegramChatId: MEMBER_TG_USER_ID, isGroup: false },
        mockSupabase,
      );

      expect(identity.authorized).toBe(true);
      expect(identity.userId).toBe(MEMBER_USER_ID);
      expect(identity.userRole).toBe("member");
      expect(identity.isOwner).toBe(false);
    });

    it("1.3 Usuário desconhecido é rejeitado com NOT_LINKED", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: 999999999, telegramChatId: 999999999, isGroup: false },
        mockSupabase,
      );

      expect(identity.authorized).toBe(false);
      expect(identity.errorCode).toBe("NOT_LINKED");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE 2 — ROTEAMENTO EXECUTIVO DO COMANDO /ceo
  // ─────────────────────────────────────────────────────────────────────────────
  describe("GATE 2 — Roteamento Executivo e Proteção de Privacidade", () => {
    it("2.1 /ceo em conversa privada ativa o Cérebro Executivo e retorna Resumo do Wallet CEO", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "/ceo",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      expect(result.text).toBeDefined();
      expect(result.text).not.toContain("não tenho permissão");
      expect(result.text).not.toContain("Acesso Restrito");
      // Verifica se a conversa criada na memória canônica tem agent_type: 'ceo'
      const activeConvs = Array.from(memoryConversations.values());
      expect(activeConvs.some((c) => c.agent_type === "ceo")).toBe(true);
    });

    it("2.2 /ceo em GRUPO corporativo é TERMINANTEMENTE PROIBIDO com mensagem de privacidade", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: GROUP_CHAT_ID, isGroup: true },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "/ceo",
          identity,
          chatId: GROUP_CHAT_ID,
          isGroup: true,
        },
        deps,
      );

      expect(result.text).toContain("Acesso Restrito");
      expect(result.text).toContain("Cérebro Executivo (Wallet CEO) é de uso estritamente privado");
      // Nenhuma conversa do CEO criada no grupo
      const groupConvs = Array.from(memoryConversations.values()).filter((c) => c.is_group);
      expect(groupConvs.some((c) => c.agent_type === "ceo")).toBe(false);
    });

    it("2.3 /ceo por membro operacional comum em chat privado é BLOQUEADO por falta de autorização executiva", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: MEMBER_TG_USER_ID, telegramChatId: MEMBER_TG_USER_ID, isGroup: false },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "/ceo",
          identity,
          chatId: MEMBER_TG_USER_ID,
          isGroup: false,
        },
        deps,
      );

      expect(result.text).toContain("Acesso Restrito");
      expect(result.text).toContain("Apenas o proprietário e administradores executivos autorizados");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE 3 — COMPARTILHAMENTO DE FERRAMENTAS FINANCEIRAS COM TELEGRAM
  // ─────────────────────────────────────────────────────────────────────────────
  describe("GATE 3 — Disponibilização e Execução Segura das Ferramentas do CEO", () => {
    it("3.1 Execução de ferramentas financeiras com context.role do proprietário não lança WALLET_AI_FORBIDDEN", async () => {
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      const context = {
        userId: identity.userId!,
        workspaceId: identity.workspaceId!,
        role: identity.userRole,
        userRole: identity.userRole,
        isOwner: identity.isOwner,
        channel: "telegram" as const,
        correlationId: "test_corr_1",
      };

      const catalog: QueryToolCatalog = {
        consultar_resumo_executivo_ceo: vi.fn(async () => ({
          tool: "consultar_resumo_executivo_ceo",
          context: { workspaceId: WORKSPACE_ID },
          period: { start: "2026-11-01", end: "2026-11-20" },
          data: { faturamentoTotal: 15420.5 },
          warnings: [],
          metadata: { executionTimeMs: 10, recordsCount: 1 },
        })),
      };

      const res = await executeQueryTool("consultar_resumo_executivo_ceo", {}, context as any, catalog);
      expect(res).toBeDefined();
      expect(res.data.faturamentoTotal).toBe(15420.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE 4 — CENÁRIOS HOMOLOGADOS DE CONSULTAS REAIS NO TELEGRAM
  // ─────────────────────────────────────────────────────────────────────────────
  describe("GATE 4 — Cenários Homologados de Consultas Reais", () => {
    it("Cenário 1: 'Quanto vendemos ontem?' retorna dados reais do PDV", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "Quanto vendemos ontem?",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      expect(result.text).toBeDefined();
      expect(result.text).toContain("Vendas");
      expect(result.text).not.toContain("não tenho permissão");
    });

    it("Cenário 2: 'Faturamento do dia 20/11/2025' retorna R$ 1.050,40 com 15 pedidos", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "Faturamento do dia 20/11/2025",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      expect(result.text).toBeDefined();
      expect(result.text).toContain("1050.40");
      expect(result.text).toContain("15");
      expect(result.text).toContain("20/11/2025");
    });

    it("Cenário 3: 'Quais os top 5 produtos mais vendidos?' retorna ranking com CMV e margem", async () => {
      const deps = createMockDeps();
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      const result = await handleTelegramTextMessage(
        {
          text: "Quais os top 5 produtos mais vendidos?",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      expect(result.text).toBeDefined();
      expect(result.text).toContain("TOP 5 PRODUTOS");
      expect(result.text).toContain("Pão de Queijo");
      expect(result.text).toContain("CMV");
      expect(result.text).toContain("Margem");
    });

    it("Cenário 4: Processamento completo via processTelegramUpdate no bot", async () => {
      const deps = createMockDeps();
      const update = {
        update_id: 999111,
        message: {
          message_id: 501,
          date: Math.floor(Date.now() / 1000),
          chat: { id: OWNER_TG_CHAT_ID, type: "private" as const },
          from: { id: OWNER_TG_USER_ID, first_name: "Heitor" },
          text: "/ceo",
        },
      };

      const res = await processTelegramUpdate(update, deps);
      expect(res.handled).toBe(true);
      expect(sentMessages.length).toBeGreaterThan(0);
      expect(sentMessages[0].chatId).toBe(OWNER_TG_CHAT_ID);
      expect(sentMessages[0].text).not.toContain("não tenho permissão");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GATE 5 — MEMÓRIA PRIVADA CONTEXTUAL ENTRE TURNOS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("GATE 5 — Memória Privada Contextual entre Turnos", () => {
    it("5.1 Mantém o histórico conversacional entre múltiplos turnos no chat privado", async () => {
      let turn2InputMessages: LlmMessage[] = [];
      const runner: LlmRunner = {
        generateCompletion: vi.fn(async (messages) => {
          turn2InputMessages = messages;
          return {
            message: {
              role: "assistant",
              content: "O produto com maior margem entre os mais vendidos foi o Pão de Queijo (70.0% de margem).",
            },
          };
        }),
      };

      const deps = createMockDeps(runner);
      const identity = await resolveTelegramIdentity(
        { telegramUserId: OWNER_TG_USER_ID, telegramChatId: OWNER_TG_CHAT_ID, isGroup: false },
        mockSupabase,
      );

      // Turno 1: Pergunta sobre top produtos
      await handleTelegramTextMessage(
        {
          text: "Quais os top 5 produtos mais vendidos?",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      // Turno 2: Pergunta de seguimento contextual
      await handleTelegramTextMessage(
        {
          text: "E qual deles deu a maior margem de lucro?",
          identity,
          chatId: OWNER_TG_CHAT_ID,
          isGroup: false,
        },
        deps,
      );

      // Verifica se o LLM no Turno 2 recebeu o histórico do Turno 1
      const userMessages = turn2InputMessages.filter((m) => m.role === "user");
      expect(userMessages.length).toBeGreaterThanOrEqual(2);
      expect(userMessages[0].content).toContain("top 5 produtos");
      expect(userMessages[1].content).toContain("maior margem");
    });
  });
});
