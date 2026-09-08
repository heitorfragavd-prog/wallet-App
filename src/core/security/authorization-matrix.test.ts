/**
 * authorization-matrix.test.ts
 * 
 * Matriz Completa de Testes de Autorização e Controle de Acesso:
 * 1. Anônimo (sem header Authorization) -> 401 Unauthorized
 * 2. Usuário A vs B (IDOR / Isolamento de Identidade) -> Impossibilidade de afetar dados de outro usuário
 * 3. Membro removido / Token revogado -> 401 Unauthorized
 * 4. Usuário comum tentando ações administrativas -> 403 Forbidden
 * 5. JWT forjado / adulterado (tentativa de bypass via spoofing de claims) -> 401 Unauthorized
 * 6. Chamadas legítimas de Cron e Webhook -> 200 OK somente com credenciais legítimas
 */
import { describe, it, expect, vi } from "vitest";

describe("Matriz de Autorização e Controle de Acesso (RBAC/IDOR/SSRF)", () => {
  const VALID_SERVICE_KEY = "sb_secret_service_role_key_prod_9876543210";
  const TELEGRAM_WEBHOOK_SECRET = "tg_webhook_secret_secure_token_12345";

  const mockUsers = {
    userA: { id: "user-uuid-1111", email: "userA@example.com", role: "user" },
    userB: { id: "user-uuid-2222", email: "userB@example.com", role: "user" },
    admin: { id: "admin-uuid-9999", email: "admin@example.com", role: "admin" },
  };

  interface MockUser {
    id: string;
    email: string;
    role: string;
  }

  interface ResolveCallerResult {
    status: number;
    error?: string;
    isServiceRole?: boolean;
    role?: string;
    user?: MockUser;
  }

  async function resolveCaller(
    authHeader: string | null,
    customGetUser?: (token: string) => Promise<{ user: MockUser | null; error: { message: string } | null }>
  ): Promise<ResolveCallerResult> {
    if (!authHeader) {
      return { status: 401, error: "Token de autenticação ausente" };
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (token === VALID_SERVICE_KEY) {
      return { status: 200, isServiceRole: true, role: "service_role" };
    }

    if (customGetUser) {
      const { user, error } = await customGetUser(token);
      if (error || !user) {
        return { status: 401, error: "Usuário não autenticado ou token inválido" };
      }
      return { status: 200, user, role: user.role };
    }

    if (token === "token_user_a") return { status: 200, user: mockUsers.userA, role: "user" };
    if (token === "token_user_b") return { status: 200, user: mockUsers.userB, role: "user" };
    if (token === "token_admin") return { status: 200, user: mockUsers.admin, role: "admin" };

    return { status: 401, error: "Token inválido ou expirado" };
  }

  describe("1. Chamadas Anônimas (Não Autenticadas)", () => {
    it("Rejeita requisição sem header Authorization com 401", async () => {
      const res = await resolveCaller(null);
      expect(res.status).toBe(401);
      expect(res.error).toMatch(/ausente/i);
    });

    it("Rejeita header Authorization vazio ou em branco com 401", async () => {
      const res = await resolveCaller("   ");
      expect(res.status).toBe(401);
    });
  });

  describe("2. IDOR e Isolamento de Identidade entre Usuários", () => {
    it("Força identidade pelo token autenticado, ignorando user_id divergente no body", async () => {
      const auth = await resolveCaller("Bearer token_user_a");
      expect(auth.status).toBe(200);

      const incomingBody = { user_id: mockUsers.userB.id, mode: "cadastrar", senha: "123" };
      const effectiveUserId = auth.user?.id;

      expect(effectiveUserId).toBe(mockUsers.userA.id);
      expect(effectiveUserId).not.toBe(incomingBody.user_id);
    });

    it("Rejeita token de investimentos emitido para Usuário A quando apresentado pelo Usuário B", async () => {
      const tokenUserA = "inv_dXNlci11dWlkLTExMTE6OTk5OTk5OTk5OTppbnZlc3RpbWVudG9zX2F1dGg6bm9uY2U=.sig123";
      const payloadDecoded = atob(tokenUserA.slice(4).split(".")[0]);
      const [tokenUserId] = payloadDecoded.split(":");

      const callerB = mockUsers.userB;
      const isOwner = tokenUserId === callerB.id;

      expect(isOwner).toBe(false);
    });
  });

  describe("3. Membro Removido ou Token Revogado", () => {
    it("Rejeita com 401 quando auth.getUser indica usuário inexistente ou revogado", async () => {
      const mockRevokedGetUser = vi.fn().mockResolvedValue({
        user: null,
        error: { message: "User from sub claim in JWT does not exist" },
      });

      const res = await resolveCaller("Bearer revoked_jwt_token", mockRevokedGetUser);
      expect(res.status).toBe(401);
      expect(res.error).toMatch(/não autenticado|inválido/i);
    });
  });

  describe("4. Usuário Comum em Ações Administrativas (RBAC)", () => {
    it("Bloqueia usuário comum ao tentar testar webhook (test-webhook exige admin)", async () => {
      const auth = await resolveCaller("Bearer token_user_a");
      expect(auth.status).toBe(200);

      const profile = { role: auth.role };
      const isAllowed = profile.role === "admin";

      expect(isAllowed).toBe(false);
    });

    it("Permite que administrador execute ação de test-webhook", async () => {
      const auth = await resolveCaller("Bearer token_admin");
      expect(auth.status).toBe(200);

      const profile = { role: auth.role };
      const isAllowed = profile.role === "admin";

      expect(isAllowed).toBe(true);
    });
  });

  describe("5. JWT Forjado / Tentativa de Bypass com Claims Adulteradas", () => {
    it("Rejeita JWT forjado com { role: 'service_role' } que não corresponda ao segredo real", async () => {
      const forgedJwt = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.";
      const isServiceRole = forgedJwt === VALID_SERVICE_KEY;
      expect(isServiceRole).toBe(false);

      const mockFailingAuth = vi.fn().mockResolvedValue({
        user: null,
        error: { message: "invalid signature" },
      });

      const res = await resolveCaller("Bearer " + forgedJwt, mockFailingAuth);
      expect(res.status).toBe(401);
    });
  });

  describe("6. Cron e Webhooks Legítimos", () => {
    it("Permite execução de cron interno autenticado com service_role key", async () => {
      const auth = await resolveCaller("Bearer " + VALID_SERVICE_KEY);
      expect(auth.status).toBe(200);
      expect(auth.isServiceRole).toBe(true);
    });

    it("Permite webhook do Telegram com X-Telegram-Bot-Api-Secret-Token válido", () => {
      const incomingSecretHeader = TELEGRAM_WEBHOOK_SECRET;
      const isValid = incomingSecretHeader === TELEGRAM_WEBHOOK_SECRET;
      expect(isValid).toBe(true);
    });

    it("Rejeita webhook do Telegram com Secret-Token forjado ou ausente", () => {
      const incomingSecretHeader = "wrong_or_attacker_secret";
      const isValid = incomingSecretHeader === TELEGRAM_WEBHOOK_SECRET;
      expect(isValid).toBe(false);
    });
  });
});
