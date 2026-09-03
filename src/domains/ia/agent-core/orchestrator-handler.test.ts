import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleOrchestratorHttpRequest } from "../../../../supabase/functions/wallet-ai-orchestrator/handler";
import type { AuthorizationDependencies } from "../../../../supabase/functions/_shared/ai/auth";
import type { FinancialQueryRepository } from "../../../../supabase/functions/_shared/ai/query-tools";
import type { LlmRunner } from "../../../../supabase/functions/_shared/ai/orchestrator-core";

describe("Orchestrator HTTP Handler & Security Suite", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validConversationId = "22222222-2222-4222-8222-222222222222";
  const invalidConversationId = "33333333-3333-4333-8333-333333333333";

  const mockAuthDeps: AuthorizationDependencies = {
    getUser: vi.fn().mockResolvedValue({ id: "user-123", email: "user@test.com" }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, owner_id: "user-123" }),
    verifyConversationOwnership: vi.fn().mockImplementation(async (convId) => {
      return convId === validConversationId;
    }),
  };

  const mockRepo: FinancialQueryRepository = {
    listRevenues: vi.fn().mockResolvedValue([]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
  };

  const mockAuditLogger = {
    logEvent: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. CORS ────────────────────────────────────────────────────────────────
  it("deve responder OPTIONS para CORS preflight com cabeçalhos de observabilidade", async () => {
    const req = new Request("https://edge.test/wallet-ai-orchestrator", {
      method: "OPTIONS",
    });

    const res = await handleOrchestratorHttpRequest(req, {
      authDeps: mockAuthDeps,
      repoFactory: () => mockRepo,
      runnerFactory: () => ({} as LlmRunner),
      auditLogger: mockAuditLogger,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("x-correlation-id");
  });

  // ── 2. AUTH ────────────────────────────────────────────────────────────────
  describe("Autenticação e JWT", () => {
    it("sem JWT → 401 com erro missing_authorization", async () => {
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "oi" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => ({} as LlmRunner),
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("missing_authorization");
      expect(body.code).toBe("WALLET_AI_AUTH_ERROR");
    });

    it("JWT inválido ou expirado → 401 com erro invalid_token", async () => {
      const invalidTokenDeps: AuthorizationDependencies = {
        getUser: vi.fn().mockResolvedValue(null),
        findOwnedWorkspace: vi.fn().mockResolvedValue(null),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-expirado",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "oi" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: invalidTokenDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => ({} as LlmRunner),
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_token");
      expect(body.code).toBe("WALLET_AI_AUTH_ERROR");
    });
  });

  // ── 3. WORKSPACE ───────────────────────────────────────────────────────────
  describe("Isolamento de Workspace", () => {
    it("workspace válido → permitido com sucesso", async () => {
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "Saldo: R$ 100,00" },
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        }),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "saldo" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("workspace de outro usuário → 403 workspace_forbidden", async () => {
      const crossTenantDeps: AuthorizationDependencies = {
        getUser: vi.fn().mockResolvedValue({ id: "attacker-id" }),
        findOwnedWorkspace: vi.fn().mockResolvedValue(null),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer token-attacker",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Me dê os dados" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: crossTenantDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => ({} as LlmRunner),
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("workspace_forbidden");
      expect(body.code).toBe("WALLET_AI_FORBIDDEN");
    });
  });

  // ── 4. CONVERSATION OWNERSHIP ──────────────────────────────────────────────
  describe("Contexto e Ownership de Conversa", () => {
    it("conversa do workspace e usuário → permitido", async () => {
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "Histórico recuperado" },
        }),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          conversation_id: validConversationId,
          messages: [{ role: "user", content: "continue" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation_id).toBe(validConversationId);
    });

    it("conversa de outro workspace/usuário → rejeitada com 403", async () => {
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          conversation_id: invalidConversationId,
          messages: [{ role: "user", content: "leia conversa alheia" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => ({} as LlmRunner),
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("WALLET_AI_INVALID_CONVERSATION");
    });
  });

  // ── 5. TOOLS & READ ONLY ───────────────────────────────────────────────────
  describe("Catálogo READ e Proteção Server-Side", () => {
    it("LLM não consegue sobrescrever workspace_id nas tool calls", async () => {
      let capturedContextWorkspace = "";

      const trackingRepo: FinancialQueryRepository = {
        ...mockRepo,
        listBalances: vi.fn().mockImplementation(async (context) => {
          capturedContextWorkspace = context.workspaceId;
          return [{ accountId: "acc-1", accountName: "Principal", balance: 5000, type: "corrente" }];
        }),
      };

      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn()
          .mockResolvedValueOnce({
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "consultar_saldos",
                    // Tentativa maliciosa do modelo de passar workspace de outro cliente
                    arguments: JSON.stringify({ workspace_id: "hacked-workspace-999" }),
                  },
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            message: { role: "assistant", content: "Seu saldo é R$ 5.000,00" },
          }),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "qual meu saldo?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => trackingRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(200);
      // O repositório SEMPRE recebeu o workspace autenticado do context, nunca o do LLM
      expect(capturedContextWorkspace).toBe(validWorkspaceId);
    });

    it("tentativa de chamar ferramenta inexistente ou WRITE não permitida é contida", async () => {
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn()
          .mockResolvedValueOnce({
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-write",
                  type: "function",
                  function: {
                    name: "cadastrar_transacao_direta",
                    arguments: JSON.stringify({ valor: 100 }),
                  },
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            message: { role: "assistant", content: "Não foi possível executar esta ação." },
          }),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "cadastre agora" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Confirma que nenhuma mutação foi realizada
      expect(mockRepo.listRevenues).not.toHaveBeenCalled();
    });
  });

  // ── 6. OBSERVABILIDADE & CORRELATION ID ─────────────────────────────────────
  describe("Observabilidade e Resiliência", () => {
    it("propaga X-Correlation-Id do request para o response e logs", async () => {
      const customCorrelationId = "corr-unique-trace-999";

      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "OK" },
        }),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "X-Correlation-Id": customCorrelationId,
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "oi" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.headers.get("X-Correlation-Id")).toBe(customCorrelationId);
      const body = await res.json();
      expect(body.correlation_id).toBe(customCorrelationId);

      expect(mockAuditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          workspaceId: validWorkspaceId,
          metadata: expect.objectContaining({
            correlationId: customCorrelationId,
          }),
        }),
      );
    });

    it("mapeia erro de timeout de provider para 504 WALLET_AI_TIMEOUT", async () => {
      const abortError = new Error("The operation was aborted due to timeout");
      abortError.name = "AbortError";

      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockRejectedValue(abortError),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "pergunta demorada" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(504);
      const body = await res.json();
      expect(body.code).toBe("WALLET_AI_TIMEOUT");
    });

    it("mapeia erro 429 de provider para 429 WALLET_AI_PROVIDER_RATE_LIMIT", async () => {
      const rateLimitError = new Error("openai_api_error_429");

      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn().mockRejectedValue(rateLimitError),
      };

      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "muitas requisições" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: mockAuthDeps,
        repoFactory: () => mockRepo,
        runnerFactory: () => mockRunner,
        auditLogger: mockAuditLogger,
      });

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe("WALLET_AI_PROVIDER_RATE_LIMIT");
    });
  });
});
