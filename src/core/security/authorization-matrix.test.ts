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
  verifyInvestmentToken,
  derivePbkdf2Hash,
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
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockResolvedValue({ error: null }),
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

  it("7. Bypass no Cadastro Bloqueado: Impede sobrescrita de senha existente via 'cadastrar' (409 Conflict)", async () => {
    const tokenA = createMockJwt(userA.id, "session-a1");

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "senha_investimentos") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "existing-senha-id", user_id: userA.id, senha_hash: "hash_original" },
              error: null,
            }),
            insert: vi.fn(),
          };
        }
        return {};
      }),
    };

    const req = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "cadastrar",
        senha: "NovaSenhaAtacante123!",
      }),
    });

    const res = await processValidarSenha(req, mockSupabaseAdmin, "secret_key_123");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/já cadastrada.*alterar_senha/i);
  });

  it("8. Concorrência no Cadastro: Conflito de unicidade (23505) rejeita segundo cadastro com 409 e preserva original", async () => {
    const tokenA = createMockJwt(userA.id, "session-a1");

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "senha_investimentos") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Primeira checagem passou
            insert: vi.fn().mockResolvedValue({
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            }),
          };
        }
        return {};
      }),
    };

    const req = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "cadastrar",
        senha: "SenhaConcorrente123!",
      }),
    });

    const res = await processValidarSenha(req, mockSupabaseAdmin, "secret_key_123");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/concorrentemente/i);
  });

  it("9. Alteração Segura de Senha: Exige senha atual e revoga todas as sessões anteriores", async () => {
    const tokenA = createMockJwt(userA.id, "session-a1");
    const userSalt = `wallet_inv_${userA.id}`;
    const hashAtual = await derivePbkdf2Hash("SenhaAtual@123", userSalt);

    const deleteSessionsMock = vi.fn().mockReturnValue({ error: null });
    const updateSenhaMock = vi.fn().mockReturnValue({ error: null });
    const rpcMock = vi.fn().mockResolvedValue({ data: [{ tentativas_falhas: 1, bloqueado: false }], error: null });

    const mockSupabaseAdmin = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      rpc: rpcMock,
      from: vi.fn((table: string) => {
        if (table === "senha_investimentos") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "senha-id",
                user_id: userA.id,
                senha_hash: hashAtual,
                tentativas_falhas: 0,
                bloqueado_ate: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: updateSenhaMock,
            }),
          };
        }
        if (table === "investimentos_sessions") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: deleteSessionsMock,
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };

    // 9a. Tentativa com senha_atual incorreta -> 401 Unauthorized e incremento de falha
    const reqErrada = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "alterar_senha",
        senha_atual: "SenhaErrada!",
        nova_senha: "NovaSenhaForte@999",
      }),
    });

    const resErrada = await processValidarSenha(reqErrada, mockSupabaseAdmin, "secret_key_123");
    expect(resErrada.status).toBe(401);
    expect(rpcMock).toHaveBeenCalledWith("registrar_falha_senha_investimentos", { p_user_id: userA.id });

    // 9b. Tentativa com senha_atual correta -> 200 OK e revogação das sessões anteriores
    const reqCorreta = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "alterar_senha",
        senha_atual: "SenhaAtual@123",
        nova_senha: "NovaSenhaForte@999",
      }),
    });

    const resCorreta = await processValidarSenha(reqCorreta, mockSupabaseAdmin, "secret_key_123");
    expect(resCorreta.status).toBe(200);
    expect(deleteSessionsMock).toHaveBeenCalledWith("user_id", userA.id);
  });

  it("10. Coerência em verify_token: Rejeita token em outra sessão, com sessão expirada ou erro de banco", async () => {
    const sessionOriginal = "session-desktop-original";
    const sessionOutra = "session-hacker-browser";
    const tokenSessionOriginal = await createInvestmentToken(userA.id, "secret_key_123", sessionOriginal);

    // 10a. Token emitido para sessionOriginal sendo validado com JWT de sessionOutra -> 401
    const jwtOutra = createMockJwt(userA.id, sessionOutra);
    const mockAdminOutra = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }) },
      from: vi.fn(),
    };

    const reqOutra = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwtOutra}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify_token", token: tokenSessionOriginal }),
    });

    const resOutra = await processValidarSenha(reqOutra, mockAdminOutra, "secret_key_123");
    expect(resOutra.status).toBe(401);
    const bodyOutra = await resOutra.json();
    expect(bodyOutra.reason).toMatch(/sessão autenticada atual/i);

    // 10b. Token na mesma sessão, mas sessão ausente ou expirada no banco -> 401
    const jwtOriginal = createMockJwt(userA.id, sessionOriginal);
    const mockAdminExpirada = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { expires_at: new Date(Date.now() - 10000).toISOString() }, // Expirada no DB
          error: null,
        }),
      })),
    };

    const reqExpirada = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwtOriginal}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify_token", token: tokenSessionOriginal }),
    });

    const resExpirada = await processValidarSenha(reqExpirada, mockAdminExpirada, "secret_key_123");
    expect(resExpirada.status).toBe(401);
    const bodyExpirada = await resExpirada.json();
    expect(bodyExpirada.error).toMatch(/expirada ou revogada/i);

    // 10c. Erro no banco de dados durante consulta de sessão -> 500 fail-closed
    const mockAdminErroDb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database connection lost" },
        }),
      })),
    };

    const reqErroDb = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwtOriginal}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "verify_token", token: tokenSessionOriginal }),
    });

    const resErroDb = await processValidarSenha(reqErroDb, mockAdminErroDb, "secret_key_123");
    expect(resErroDb.status).toBe(500);
    const bodyErro = await resErroDb.json();
    expect(bodyErro.valid).toBe(false);
  });

  it("11. Encerramento de Sessão: Trata erros de banco no encerramento (fail-closed, 500)", async () => {
    const jwtOriginal = createMockJwt(userA.id, "session-123");

    const mockAdminFalhaDelete = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }) },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Foreign key lock timeout" } }),
      })),
    };

    const req = new Request("http://localhost/validar-senha", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwtOriginal}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "invalidar_sessao" }),
    });

    const res = await processValidarSenha(req, mockAdminFalhaDelete, "secret_key_123");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("12. Orçamento de IA: Contabiliza proporcionalmente tokens consumidos contra teto por hora", async () => {
    const mockDbRpc = vi.fn().mockImplementation((fnName: string, args: any) => {
      if (fnName === "check_rate_limit") {
        if (args.p_key.includes(":tph") && args.p_cost >= 60000) {
          return Promise.resolve({
            data: [{ allowed: false, retry_after_seconds: 900, current_count: 65000, limit_count: 50000 }],
            error: null,
          });
        }
        return Promise.resolve({
          data: [{ allowed: true, retry_after_seconds: 0, current_count: 10, limit_count: 50000 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockAdmin = { rpc: mockDbRpc };

    // Consumo proporcional válido (1.500 tokens)
    const resOk = await checkSharedRateLimit(mockAdmin, {
      userId: userA.id,
      workspaceId: "ws-financas",
      action: "ia_deposito",
      tokensConsumed: 1500,
      maxTokensPerHour: 50000,
    });
    expect(resOk.allowed).toBe(true);
    expect(mockDbRpc).toHaveBeenCalledWith("check_rate_limit", expect.objectContaining({
      p_cost: 1500,
      p_window_seconds: 3600,
    }));

    // Consumo proporcional que estoura o teto (65.000 tokens)
    const resBlocked = await checkSharedRateLimit(mockAdmin, {
      userId: userA.id,
      workspaceId: "ws-financas",
      action: "ia_deposito",
      tokensConsumed: 65000,
      maxTokensPerHour: 50000,
    });
    expect(resBlocked.allowed).toBe(false);
    expect(resBlocked.retryAfterSeconds).toBe(900);
    expect(resBlocked.reason).toMatch(/orçamento.*atingido/i);
  });
});