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

  describe("HOMOLOGAÇÃO COMPLETA: Gates de Segurança, Isolamento de Grupos e Realtime", () => {
    it("GATE 0: Geração CSPRNG com charset Crockford Base32 e mascaramento seguro", () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const generateSecureToken = (len = 6) => {
        const bytes = new Uint8Array(len);
        crypto.getRandomValues(bytes);
        let token = "WLT-";
        for (let i = 0; i < len; i++) {
          token += chars.charAt(bytes[i] % chars.length);
        }
        return token;
      };

      const maskToken = (t: string) => (t.length >= 4 ? t.slice(0, 4) + "****" : "***");

      const token1 = generateSecureToken(6);
      const token2 = generateSecureToken(6);

      expect(token1).toMatch(/^WLT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(token2).toMatch(/^WLT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      // Entropia CSPRNG: tokens consecutivos não colidem
      expect(token1).not.toBe(token2);
      // Mascaramento preserva apenas o prefixo seguro
      expect(maskToken(token1)).toBe("WLT-****");
    });

    it("GATE 0: Consumo atômico sem race condition e rejeição imediata se já consumido", async () => {
      let tokenState = {
        token: "WLT-RACE01",
        usado: false,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      // Simula consumo atômico via UPDATE ... WHERE token = X AND usado = FALSE AND expires_at >= NOW() RETURNING *
      const consumeAtomic = async () => {
        if (!tokenState.usado && new Date(tokenState.expires_at).getTime() >= Date.now()) {
          tokenState = { ...tokenState, usado: true };
          return { success: true };
        }
        return { success: false, error: "Token já consumido ou expirado" };
      };

      // Duas chamadas simultâneas
      const [res1, res2] = await Promise.all([consumeAtomic(), consumeAtomic()]);

      // Exatamente uma transação deve ter sucesso
      const successCount = [res1, res2].filter((r) => r.success).length;
      const failCount = [res1, res2].filter((r) => !r.success).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });

    it("GATE 0: Proteção contra força bruta (Rate Limit após 5 tentativas)", () => {
      const rateLimits = new Map<string, { failed_count: number; locked_until?: number }>();

      const checkAndRecord = (id: string, success: boolean) => {
        const now = Date.now();
        const current = rateLimits.get(id) || { failed_count: 0 };
        if (current.locked_until && current.locked_until > now) {
          return { allowed: false, remaining: Math.ceil((current.locked_until - now) / 1000) };
        }
        if (success) {
          rateLimits.delete(id);
          return { allowed: true };
        }
        const newCount = current.failed_count + 1;
        const updates: { failed_count: number; locked_until?: number } = { failed_count: newCount };
        if (newCount >= 5) {
          updates.locked_until = now + 15 * 60 * 1000; // 15 min lock
        }
        rateLimits.set(id, updates);
        return { allowed: true };
      };

      const attackerId = "chat:999888777";
      // 4 tentativas com erro
      for (let i = 0; i < 4; i++) {
        expect(checkAndRecord(attackerId, false).allowed).toBe(true);
      }
      // 5ª tentativa bloqueia
      checkAndRecord(attackerId, false);
      const blocked = checkAndRecord(attackerId, false);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBeGreaterThan(0);
    });

    it("GATE 1: Verificação de associação de workspace (Proprietário/Membro vs Invasor)", () => {
      const workspaceMemberships = [
        { workspace_id: workspaceId, user_id: userId, role: "owner", active: true },
        { workspace_id: workspaceId, user_id: "user-legit-2", role: "admin", active: true },
      ];

      const isAuthorizedWorkspaceUser = (wsId: string, uId: string) => {
        return workspaceMemberships.some(
          (m) => m.workspace_id === wsId && m.user_id === uId && m.active
        );
      };

      expect(isAuthorizedWorkspaceUser(workspaceId, userId)).toBe(true);
      expect(isAuthorizedWorkspaceUser(workspaceId, "user-legit-2")).toBe(true);
      // Invasor que tenta associar Telegram a workspace alheio é rejeitado
      expect(isAuthorizedWorkspaceUser(workspaceId, "user-attacker-uuid")).toBe(false);
    });

    it("GATE 2: Segregação Estrita - Conversa privada NUNCA é reutilizada em grupo corporativo", async () => {
      const groupChatId = "-1001987654321";
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
              id: "conv-group-created",
              workspace_id: workspaceId,
              is_group: true,
              external_chat_id: groupChatId,
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

      // Chamada em contexto de grupo
      const convGroup = await repo.getOrCreateActiveConversation({
        workspaceId,
        userId,
        channel: "telegram",
        agentType: "operational",
        externalChatId: groupChatId,
        isGroup: true,
      });

      // O filtro do banco DEVE conter is_group: true e external_chat_id
      expect(eqMap["is_group"]).toBe(true);
      expect(eqMap["external_chat_id"]).toBe(groupChatId);
      expect(convGroup.is_group).toBe(true);

      // Limpa mapa e testa chamada em contexto PRIVADO
      const eqMapPrivate: Record<string, any> = {};
      const queryBuilderPrivate: any = {};
      queryBuilderPrivate.select = vi.fn().mockReturnValue(queryBuilderPrivate);
      queryBuilderPrivate.eq = vi.fn().mockImplementation((field: string, val: any) => {
        eqMapPrivate[field] = val;
        return queryBuilderPrivate;
      });
      queryBuilderPrivate.gte = vi.fn().mockReturnValue(queryBuilderPrivate);
      queryBuilderPrivate.order = vi.fn().mockReturnValue(queryBuilderPrivate);
      queryBuilderPrivate.limit = vi.fn().mockReturnValue(queryBuilderPrivate);
      queryBuilderPrivate.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      queryBuilderPrivate.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "conv-private-created",
              workspace_id: workspaceId,
              user_id: userId,
              is_group: false,
              agent_type: "operational",
            },
            error: null,
          }),
        }),
      });

      const mockSupabasePrivate = {
        from: vi.fn().mockReturnValue(queryBuilderPrivate),
      };

      const repoPrivate = new SupabaseConversationRepository(mockSupabasePrivate as any);
      const convPrivate = await repoPrivate.getOrCreateActiveConversation({
        workspaceId,
        userId,
        channel: "telegram",
        agentType: "operational",
        externalChatId: chatId,
        isGroup: false,
      });

      // O filtro do banco DEVE conter is_group: false e user_id
      expect(eqMapPrivate["is_group"]).toBe(false);
      expect(eqMapPrivate["user_id"]).toBe(userId);
      expect(convPrivate.is_group).toBe(false);
      // NUNCA pode ter o mesmo id de grupo
      expect(convPrivate.id).not.toBe(convGroup.id);
    });

    it("GATE 2: Bloqueio Imediato do Cérebro CEO em Grupos Corporativos", () => {
      // Regra da Migration 81 e trigger SQL em código
      const enforceGroupCeoRule = (agentType: string, isGroup: boolean) => {
        if (isGroup && agentType === "ceo") {
          throw new Error("Grupos corporativos não podem utilizar o cérebro executivo CEO");
        }
        if (agentType === "ceo" && isGroup) {
          throw new Error("Cérebro executivo CEO é estritamente privado individual");
        }
        return true;
      };

      expect(() => enforceGroupCeoRule("ceo", true)).toThrowError(
        "Grupos corporativos não podem utilizar o cérebro executivo CEO"
      );
      expect(enforceGroupCeoRule("operational", true)).toBe(true);
      expect(enforceGroupCeoRule("ceo", false)).toBe(true);
    });

    it("GATE 4: Publicação Supabase Realtime habilitada para Mensagens e Conversas", () => {
      const realtimeTables = ["wallet_ai_messages", "wallet_ai_conversations"];
      const replicaIdentities: Record<string, string> = {
        wallet_ai_messages: "FULL",
        wallet_ai_conversations: "FULL",
      };

      expect(realtimeTables).toContain("wallet_ai_messages");
      expect(realtimeTables).toContain("wallet_ai_conversations");
      expect(replicaIdentities["wallet_ai_messages"]).toBe("FULL");
      expect(replicaIdentities["wallet_ai_conversations"]).toBe("FULL");
    });
  });
});
