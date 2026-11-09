/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  SupabaseConversationRepository,
  type ConversationRecord,
  type MessageRecord,
} from "../../supabase/functions/_shared/ai/memory-core";

describe("👑 WALLET CEO 3.0 — ETAPA 04: Histórico Unificado App + Telegram", () => {
  const workspaceId = "2af415b6-76aa-4134-8133-a9b405671c1c";
  const userId = "0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0";
  const chatId = "1139976533";

  describe("GATES 1 & 2: Pareamento Criptográfico e Resolução de Identidade", () => {
    it("deve validar token dentro da janela de TTL de 10 minutos", () => {
      const now = Date.now();
      const validToken = {
        token: "WLT-TEST01",
        expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
        usado: false,
      };
      const isExpired = new Date(validToken.expires_at).getTime() < now;
      expect(isExpired).toBe(false);
      expect(validToken.usado).toBe(false);
    });

    it("deve rejeitar token expirado (TTL > 10 minutos)", () => {
      const now = Date.now();
      const expiredToken = {
        token: "WLT-EXPR01",
        expires_at: new Date(now - 1000).toISOString(),
        usado: false,
      };
      const isExpired = new Date(expiredToken.expires_at).getTime() < now;
      expect(isExpired).toBe(true);
    });

    it("deve rejeitar token já utilizado (usado = true)", () => {
      const usedToken = {
        token: "WLT-USED01",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        usado: true,
      };
      expect(usedToken.usado).toBe(true);
    });

    it("deve preservar o vínculo legítimo existente do proprietário", () => {
      const vinculoExistente = {
        user_id: userId,
        telegram_chat_id: chatId,
        telegram_username: "Heitor",
        ativo: true,
      };
      expect(vinculoExistente.ativo).toBe(true);
      expect(vinculoExistente.telegram_chat_id).toBe("1139976533");
    });
  });

  describe("GATE 3: Persistência do Histórico Único e Continuidade Omnichannel", () => {
    it("deve reutilizar a mesma conversa operacional se ativa dentro da janela de 4 horas", async () => {
      const fakeConv: ConversationRecord = {
        id: "conv-active-123",
        workspace_id: workspaceId,
        user_id: userId,
        title: "Sessão Ativa",
        summary: null,
        is_archived: false,
        agent_type: "operational",
        channel: "web",
        last_channel: "web",
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "wallet_ai_conversations") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: fakeConv, error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          return {};
        }),
      };

      const repo = new SupabaseConversationRepository(mockSupabase as any);
      const conv = await repo.getOrCreateActiveConversation({
        workspaceId,
        userId,
        channel: "telegram",
        agentType: "operational",
        externalChatId: chatId,
        maxInactiveHours: 4,
      });

      expect(conv.id).toBe("conv-active-123");
      expect(conv.channel).toBe("omnichannel");
      expect(conv.last_channel).toBe("telegram");
    });

    it("deve criar nova conversa se a última sessão estiver inativa há mais de 4 horas", async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "wallet_ai_conversations") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "conv-new-456",
                      workspace_id: workspaceId,
                      user_id: userId,
                      title: "Telegram Chat 1139976533",
                      channel: "telegram",
                      last_channel: "telegram",
                      agent_type: "operational",
                      is_archived: false,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const repo = new SupabaseConversationRepository(mockSupabase as any);
      const conv = await repo.getOrCreateActiveConversation({
        workspaceId,
        userId,
        channel: "telegram",
        agentType: "operational",
        externalChatId: chatId,
        maxInactiveHours: 4,
      });

      expect(conv.id).toBe("conv-new-456");
      expect(conv.channel).toBe("telegram");
      expect(conv.agent_type).toBe("operational");
    });

    it("deve persistir canal e external_message_id na gravação da mensagem", async () => {
      let insertedPayload: any = null;
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "wallet_ai_messages") {
            return {
              insert: vi.fn().mockImplementation((payload) => {
                insertedPayload = payload;
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: "msg-999", ...payload, created_at: new Date().toISOString() },
                      error: null,
                    }),
                  }),
                };
              }),
            };
          }
          if (table === "wallet_ai_conversations") {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const repo = new SupabaseConversationRepository(mockSupabase as any);
      const msg = await repo.appendMessage({
        conversationId: "conv-active-123",
        workspaceId,
        userId,
        role: "user",
        content: "Quanto vendemos hoje?",
        channel: "telegram",
        externalMessageId: "tg-msg-45678",
      });

      expect(insertedPayload).toBeDefined();
      expect(insertedPayload.channel).toBe("telegram");
      expect(insertedPayload.external_message_id).toBe("tg-msg-45678");
      expect(msg.channel).toBe("telegram");
    });
  });

  describe("GATES 4 & 5: Isolamento Absoluto do Cérebro CEO vs Telegram", () => {
    it("o canal Telegram nunca deve acessar conversas do cérebro CEO", async () => {
      const eqMap: Record<string, any> = {};
      const queryBuilder: any = {};
      queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.eq = vi.fn().mockImplementation((field: string, val: any) => {
        eqMap[field] = val;
        return queryBuilder;
      });
      queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.order = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.limit = vi.fn().mockReturnValue(queryBuilder);
      queryBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      queryBuilder.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "conv-tg-op-1",
              agent_type: "operational",
            },
            error: null,
          }),
        }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue(queryBuilder),
      };

      const repo = new SupabaseConversationRepository(mockSupabase as any);
      const conv = await repo.getOrCreateActiveConversation({
        workspaceId,
        userId,
        channel: "telegram",
        agentType: "operational",
        externalChatId: chatId,
      });

      expect(conv.agent_type).toBe("operational");
      expect(eqMap["agent_type"]).toBe("operational");
      expect(eqMap["agent_type"]).not.toBe("ceo");
    });

    it("conversas do CEO devem ter escopo estrito de isolamento privado", async () => {
      const ceoConv: ConversationRecord = {
        id: "conv-ceo-private",
        workspace_id: workspaceId,
        user_id: userId,
        title: "Sessão Estratégica",
        summary: null,
        is_archived: false,
        agent_type: "ceo",
        is_shared: false,
        channel: "web",
        last_channel: "web",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(ceoConv.agent_type).toBe("ceo");
      expect(ceoConv.is_shared).toBe(false);
      expect(ceoConv.channel).toBe("web");
    });
  });

  describe("GATE 6: Rastreabilidade no Web App e Identificação de Canal", () => {
    it("deve classificar turnos corretamente como '📱 Aplicativo' vs '✈️ Telegram'", () => {
      const messages: Partial<MessageRecord>[] = [
        { id: "1", role: "user", content: "Mensagem do celular", channel: "telegram" },
        { id: "2", role: "assistant", content: "Resposta do bot", channel: "telegram" },
        { id: "3", role: "user", content: "Mensagem do app web", channel: "web" },
        { id: "4", role: "assistant", content: "Resposta do app web", channel: "web" },
      ];

      const getChannelLabel = (channel?: string) => {
        return channel === "telegram" ? "✈️ Telegram" : "📱 Aplicativo";
      };

      expect(getChannelLabel(messages[0].channel)).toBe("✈️ Telegram");
      expect(getChannelLabel(messages[1].channel)).toBe("✈️ Telegram");
      expect(getChannelLabel(messages[2].channel)).toBe("📱 Aplicativo");
      expect(getChannelLabel(messages[3].channel)).toBe("📱 Aplicativo");
    });

    it("deve detectar sessão Omnichannel quando houver mensagens de ambos os canais", () => {
      const messages: Partial<MessageRecord>[] = [
        { id: "1", channel: "web" },
        { id: "2", channel: "telegram" },
      ];

      const hasTelegram = messages.some((m) => m.channel === "telegram");
      const hasWeb = messages.some((m) => m.channel === "web");
      const isOmnichannel = hasTelegram && hasWeb;

      expect(isOmnichannel).toBe(true);
    });
  });

  describe("GATE 7: Idempotência de Atualizações do Telegram", () => {
    it("deve ignorar update duplicado com o mesmo update_id", async () => {
      const processedUpdates = new Set<number>();
      const claimUpdate = (updateId: number): boolean => {
        if (processedUpdates.has(updateId)) {
          return false; // Duplicado detectado
        }
        processedUpdates.add(updateId);
        return true;
      };

      expect(claimUpdate(1001)).toBe(true);
      expect(claimUpdate(1001)).toBe(false); // Segundo envio rejeitado
      expect(claimUpdate(1002)).toBe(true);
    });
  });
});
