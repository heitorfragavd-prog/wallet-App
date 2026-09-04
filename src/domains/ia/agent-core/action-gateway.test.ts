import { describe, expect, it, vi } from "vitest";
import {
  prepareActionProposal,
  validateActionForExecution,
  type ActionRepository,
} from "../../../../supabase/functions/_shared/ai/action-gateway";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

describe("Action Gateway", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validUserId = "user-123";

  it("deve preparar proposta de ação com hash de idempotência e expiração", () => {
    const proposal = prepareActionProposal({
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_despesa",
      summary: "Criar despesa de R$ 150,00 para Internet",
      payload: { amount: 150, description: "Internet", category: "Serviços" },
      ttlMinutes: 15,
    });

    expect(proposal.status).toBe("prepared");
    expect(proposal.idempotencyHash).toBeTruthy();
    expect(proposal.workspaceId).toBe(validWorkspaceId);
    expect(proposal.userId).toBe(validUserId);
    expect(new Date(proposal.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("deve gerar o mesmo hash de idempotência para o mesmo payload", () => {
    const p1 = prepareActionProposal({
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_receita",
      summary: "Receita de R$ 500,00",
      payload: { amount: 500, description: "Venda" },
    });

    const p2 = prepareActionProposal({
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_receita",
      summary: "Receita de R$ 500,00",
      payload: { amount: 500, description: "Venda" },
    });

    expect(p1.idempotencyHash).toBe(p2.idempotencyHash);
  });

  it("deve validar com sucesso proposta válida e não expirada", () => {
    const proposal: ActionProposal = {
      id: "action-1",
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_despesa",
      actionVersion: "v1",
      summary: "Despesa",
      payload: { amount: 100 },
      idempotencyHash: "hash-123",
      status: "prepared",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    const result = validateActionForExecution(proposal, validUserId, validWorkspaceId);
    expect(result.valid).toBe(true);
  });

  it("deve rejeitar execução se a proposta pertencer a outro usuário ou workspace", () => {
    const proposal: ActionProposal = {
      id: "action-1",
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_despesa",
      actionVersion: "v1",
      summary: "Despesa",
      payload: { amount: 100 },
      idempotencyHash: "hash-123",
      status: "prepared",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    const result = validateActionForExecution(proposal, "attacker-user", validWorkspaceId);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("action_forbidden_cross_tenant");
  });

  it("deve rejeitar execução se a proposta já estiver expirada", () => {
    const expiredProposal: ActionProposal = {
      id: "action-expired",
      workspaceId: validWorkspaceId,
      userId: validUserId,
      actionType: "criar_despesa",
      actionVersion: "v1",
      summary: "Despesa",
      payload: { amount: 100 },
      idempotencyHash: "hash-123",
      status: "prepared",
      expiresAt: new Date(Date.now() - 60000).toISOString(), // expirou há 1 min
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    };

    const result = validateActionForExecution(expiredProposal, validUserId, validWorkspaceId);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("action_proposal_expired");
  });
});
