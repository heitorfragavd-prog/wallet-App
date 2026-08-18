import { describe, expect, it, vi } from "vitest";
import { handleOrchestratorHttpRequest } from "../../../../supabase/functions/wallet-ai-orchestrator/handler";
import type { AuthorizationDependencies } from "../../../../supabase/functions/_shared/ai/auth";
import type { FinancialQueryRepository } from "../../../../supabase/functions/_shared/ai/query-tools";
import type { LlmRunner } from "../../../../supabase/functions/_shared/ai/orchestrator-core";

describe("Orchestrator HTTP Handler", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

  const mockAuthDeps: AuthorizationDependencies = {
    getUser: vi.fn().mockResolvedValue({ id: "user-123", email: "user@test.com" }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, owner_id: "user-123" }),
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

  it("deve responder OPTIONS para CORS preflight", async () => {
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
  });

  it("deve rejeitar requisição sem Bearer token com status 401", async () => {
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
  });

  it("deve rejeitar quando workspace não pertence ao usuário com status 403", async () => {
    const crossTenantDeps: AuthorizationDependencies = {
      getUser: vi.fn().mockResolvedValue({ id: "attacker-id", email: "hacker@test.com" }),
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
        messages: [{ role: "user", content: "Me dê o extrato" }],
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
  });

  it("deve processar mensagem válida e registrar evento de auditoria sanitizado", async () => {
    const mockRunner: LlmRunner = {
      generateCompletion: vi.fn().mockResolvedValue({
        message: {
          role: "assistant",
          content: "Seu saldo consolidado em contas é de R$ 10.500,00.",
        },
        usage: { promptTokens: 80, completionTokens: 25, totalTokens: 105 },
      }),
    };

    const req = new Request("https://edge.test/wallet-ai-orchestrator", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: validWorkspaceId,
        messages: [{ role: "user", content: "Qual meu saldo?" }],
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
    expect(body.message.content).toContain("R$ 10.500,00");
    expect(body.usage.totalTokens).toBe(105);
    expect(mockAuditLogger.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        workspaceId: validWorkspaceId,
        status: "success",
      }),
    );
  });
});
