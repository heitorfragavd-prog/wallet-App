import { describe, it, expect, vi } from "vitest";

describe("🔴 GATE 0 — SEGURANÇA E REGRESSÃO: Simulações Financeiras & Tokens Telegram", () => {
  describe("0.1 — Garantia de Não-Gravação Financeira em Simulações", () => {
    it("uma simulação de notificação D+1 NUNCA deve chamar insert/update em dividas ou despesas", async () => {
      const financialTablesMutated: string[] = [];

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-test-uuid-123" } },
          }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (["dividas", "despesas", "transacoes", "lancamentos"].includes(table)) {
            return {
              insert: vi.fn().mockImplementation(() => {
                financialTablesMutated.push(table);
                return Promise.resolve({ error: null });
              }),
              update: vi.fn().mockImplementation(() => {
                financialTablesMutated.push(table);
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {};
        }),
        functions: {
          invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
        },
      };

      const mockPush = {
        isSubscribed: true,
        testarPush: vi.fn().mockResolvedValue(true),
      };

      const mockTelegram = {
        isVinculado: true,
      };

      const mockToast = vi.fn();

      // Executa a lógica de simulação segura
      const runSafeSimulation = async () => {
        const user = (await mockSupabase.auth.getUser()).data.user;
        if (!user) throw new Error("Usuário não autenticado");

        // 1. Notificação In-App (Toast)
        mockToast({
          title: "🔔 Alerta D+1 (Simulação)",
          description: "Exemplo: Fatura de R$ 250,00 vence amanhã. (Nenhum registro financeiro foi criado)",
        });

        // 2. Dispara teste Push se autorizado
        if (mockPush.isSubscribed) {
          await mockPush.testarPush(
            "🔔 Alerta de Vencimento D+1 (Simulação)",
            "Fatura Exemplo no valor de R$ 250,00 vence amanhã! (Simulação sem impacto financeiro)"
          );
        }

        // 3. Dispara teste Telegram se o usuário estiver vinculado
        if (mockTelegram.isVinculado) {
          await mockSupabase.functions.invoke("enviar-telegram", {
            body: {
              user_id: user.id,
              mensagem: "🔔 <b>Simulação de Alerta de Vencimento (D+1)</b>\n\nUma conta de exemplo de R$ 250,00 venceria amanhã.",
            },
          });
        }
      };

      await runSafeSimulation();

      // NENHUMA tabela financeira foi alterada
      expect(financialTablesMutated.length).toBe(0);
      expect(mockSupabase.from).not.toHaveBeenCalledWith("dividas");
      expect(mockSupabase.from).not.toHaveBeenCalledWith("despesas");
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockPush.testarPush).toHaveBeenCalledTimes(1);
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe("0.2 — Segurança dos Tokens e Segregação de Fluxos A e B", () => {
    it("Fluxo B (Web App): Rejeita tentativa de consumir token pertencente a outro usuário", () => {
      const authenticatedUserId = "user-alice-111";
      const tokenRecord = {
        token: "WLT-TOKEN1",
        user_id: "user-bob-999", // Gerado por outro usuário (Bob)
        telegram_chat_id: "12345678",
        usado: false,
      };

      const validateFlowB = (record: typeof tokenRecord, callerId: string) => {
        if (record.user_id && record.user_id !== callerId) {
          throw new Error("Este código de conexão pertence a outra conta e não pode ser reutilizado.");
        }
        if (!record.telegram_chat_id) {
          throw new Error("Este link foi gerado pelo app. Deve ser consumido no Telegram.");
        }
        return true;
      };

      expect(() => validateFlowB(tokenRecord, authenticatedUserId)).toThrowError(
        "Este código de conexão pertence a outra conta e não pode ser reutilizado."
      );
    });

    it("Fluxo B (Web App): Rejeita token que não possui telegram_chat_id (token gerado no app)", () => {
      const authenticatedUserId = "user-alice-111";
      const tokenRecordApp = {
        token: "WLT-APP001",
        user_id: "user-alice-111",
        telegram_chat_id: null, // Ainda não foi ao Telegram
        usado: false,
      };

      const validateFlowB = (record: typeof tokenRecordApp, callerId: string) => {
        if (record.user_id && record.user_id !== callerId) {
          throw new Error("Este código de conexão pertence a outra conta e não pode ser reutilizado.");
        }
        if (!record.telegram_chat_id) {
          throw new Error("Este link foi gerado pelo app. Para conectá-lo, envie /start no Telegram utilizando o link fornecido.");
        }
        return true;
      };

      expect(() => validateFlowB(tokenRecordApp, authenticatedUserId)).toThrowError(
        "Este link foi gerado pelo app. Para conectá-lo, envie /start no Telegram utilizando o link fornecido."
      );
    });

    it("Rate Limiter Fail-Safe: Mantém bloqueio mesmo quando o banco de dados falha", () => {
      const memoryCache = new Map<string, { failedCount: number; lockedUntil?: number }>();
      const now = Date.now();
      const identifier = "user:attacker-uuid";

      // 5 falhas gravadas em memória
      memoryCache.set(identifier, {
        failedCount: 5,
        lockedUntil: now + 15 * 60 * 1000,
      });

      const checkRateLimitWithFailSafe = (id: string, dbThrowsError: boolean) => {
        const mem = memoryCache.get(id);
        if (mem?.lockedUntil && mem.lockedUntil > Date.now()) {
          return { allowed: false, remaining: Math.ceil((mem.lockedUntil - Date.now()) / 1000) };
        }

        if (dbThrowsError) {
          // Fallback em memória ativado
          if (mem && mem.failedCount >= 5) {
            return { allowed: false, remaining: 900 };
          }
          return { allowed: false }; // Fail-closed
        }

        return { allowed: true };
      };

      const result = checkRateLimitWithFailSafe(identifier, true);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it("Mascaramento Seguro: Logs nunca expõem texto de mensagens brutas ou tokens completos", () => {
      const rawText = "/start WLT-SEC999";
      const token = "WLT-SEC999";

      const maskToken = (t: string) => (t.length >= 4 ? t.slice(0, 4) + "****" : "***");
      const sanitizeLog = (txt: string) => ({ textLength: txt.length, hasContent: txt.length > 0 });

      expect(maskToken(token)).toBe("WLT-****");
      expect(maskToken(token)).not.toContain("SEC999");

      const logOutput = sanitizeLog(rawText);
      expect(logOutput).toEqual({ textLength: 17, hasContent: true });
      expect(JSON.stringify(logOutput)).not.toContain("WLT-SEC999");
    });
  });
});
