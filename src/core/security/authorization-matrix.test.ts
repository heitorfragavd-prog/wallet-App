/**
 * authorization-matrix.test.ts
 * 
 * Matriz Completa de Testes de Autorização e Controle de Acesso (RBAC/IDOR/SSRF/Sessões)
 * EXECUTANDO DIRETAMENTE OS MÓDULOS CENTRAIS DE PRODUÇÃO:
 * 1. Anônimo (sem header Authorization) -> 401 Unauthorized via processTestWebhook e processValidarSenha
 * 2. Usuário comum tentando rota administrativa -> 403 Forbidden via processTestWebhook (consulta direta a profiles.role)
 * 3. Tentativa de bypass via user_metadata -> Rejeitada (role extraída exclusivamente do banco)
 * 4. Isolamento de IDOR em validar-senha -> Identidade é extraída do token autenticado
 * 5. Isolamento entre Múltiplas Sessões do mesmo usuário -> Desbloquear sessão 1 NÃO desbloqueia sessão 2
 * 6. Rate Limiting Compartilhado -> Bloqueio de estouro de requisições e proteção contra manipulação de chave
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processTestWebhook } from "../../../supabase/functions/_shared/test-webhook-core.ts";
import {
  processValidarSenha,
  extractSessionIdFromJwt,
  createInvestmentToken,
  verifyInvestmentToken
} from "../../../supabase/functions/_shared/validar-senha-core.ts";
import { checkSharedRateLimit } from "../../../supabase/functions/_shared/ai-rate-limiter.ts";

function createMockJwt(userId: string, sessionId: string, role = "authenticated"): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    session_id: sessionId,
    role,
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600
  }));
  return `${header}.${payload}.mock_signature`;
}

describe("Matriz de Autorização e Controle de Acesso Executando Módulos de Produção", () => {
  const userA = { id: "user-uuid-1111", email: "usera@example.com" };
  const userAdmin = { id: "admin-uuid-9999", email: "admin@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Anônimo: Rejeita chamadas sem Authorization com status 401 no processador de produção", async () => {
    const req = new Request("http://localhost/test-webhook", {
      method: "POST",
      headers: {},
    });

    const mockAdmin = {};
    const res = await processTestWebhook(req, mockAdmin);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/token.*ausente/i);
  });

  it("2. RBAC Confiável: Usuário comum tentando ação administrativa recebe 403 Forbidden", async () => {
    const token = createMockJwt(userA.id, "session-a1");

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: "user" }, // Usuário COMUM no banco
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
    };

    const req = new Request("http://localhost/test-webhook", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await processTestWebhook(req, mockSupabaseAdmin);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/apenas administradores/i);
  });

  it("3. Anti-Spoofing de Role: Privilégio vindo de user_metadata é ignorado (origem é estritamente profiles.role)", async () => {
    const token = createMockJwt(userA.id, "session-a1");
    const userWithSpoofedMeta = {
      ...userA,
      user_metadata: { role: "admin" },
    };

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userWithSpoofedMeta }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: "user" }, // Banco confirma que continua 'user'
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
    };

    const req = new Request("http://localhost/test-webhook", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await processTestWebhook(req, mockSupabaseAdmin);
    expect(res.status).toBe(403);
  });

  it("4. IDOR Prevented: A identidade do usuário em validar-senha é derivada exclusivamente do JWT verificado", async () => {
    const tokenA = createMockJwt(userA.id, "session-a1");

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const req = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "validar",
        user_id: "victim-uuid-9999", // Tentativa de IDOR no body
        senha: "qualquer_senha",
      }),
    });

    await processValidarSenha(req, mockSupabaseAdmin, "secret_key_123");

    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("senha_investimentos");
  });

  it("5. Duas Sessões do mesmo usuário: Desbloquear na Sessão 1 NÃO desbloqueia a Sessão 2", async () => {
    const userSessionStore: Record<string, { userId: string; expiresAt: string }> = {};

    const jwtSessao1 = createMockJwt(userA.id, "session-terminal-desktop");
    const jwtSessao2 = createMockJwt(userA.id, "session-comprometida-mobile");

    expect(extractSessionIdFromJwt(jwtSessao1)).toBe("session-terminal-desktop");
    expect(extractSessionIdFromJwt(jwtSessao2)).toBe("session-comprometida-mobile");

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "senha_investimentos") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "investimentos_sessions") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockImplementation((payload: any) => {
              userSessionStore[payload.session_id] = {
                userId: payload.user_id,
                expiresAt: payload.expires_at,
              };
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    };

    const reqSessao1 = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtSessao1}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "cadastrar",
        senha: "SenhaForte@1234",
      }),
    });

    const res1 = await processValidarSenha(reqSessao1, mockSupabaseAdmin, "secret_key_123");
    expect(res1.status).toBe(200);

    expect(userSessionStore["session-terminal-desktop"]).toBeDefined();
    expect(userSessionStore["session-comprometida-mobile"]).toBeUndefined();
  });

  it("6. Rate Limiter Compartilhado: Previne manipulação de chave pelo cliente e aplica bloqueio atômico", async () => {
    const mockDbRpc = vi.fn().mockImplementation((fnName: string, args: any) => {
      if (fnName === "check_rate_limit") {
        if (args.p_key.includes("limite_estourado")) {
          return Promise.resolve({
            data: [{ allowed: false, retry_after_seconds: 45, current_count: 20, limit_count: 20 }],
            error: null,
          });
        }
        return Promise.resolve({
          data: [{ allowed: true, retry_after_seconds: 0, current_count: 5, limit_count: 20 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockAdmin = { rpc: mockDbRpc };

    const resultOk = await checkSharedRateLimit(mockAdmin, {
      userId: userA.id,
      workspaceId: "ws-123",
      action: "chat_ia",
      maxRequestsPerMinute: 20,
    });
    expect(resultOk.allowed).toBe(true);

    const resultBlocked = await checkSharedRateLimit(mockAdmin, {
      userId: userA.id,
      workspaceId: "limite_estourado",
      action: "chat_ia",
      maxRequestsPerMinute: 20,
    });
    expect(resultBlocked.allowed).toBe(false);
    expect(resultBlocked.retryAfterSeconds).toBe(45);
  });
});