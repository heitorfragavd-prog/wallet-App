import { describe, expect, it, vi } from "vitest";
import {
  executeConfirmedProposal,
  prepareActionProposal,
  sanitizeActionPayload,
  validateActionForExecution,
  type ActionDatabaseMutator,
  type ActionRepository,
} from "../../../../supabase/functions/_shared/ai/action-gateway";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import { dispatchOpenAiToolCall } from "../../../../supabase/functions/_shared/ai/tool-dispatcher";
import type { QueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools";

describe("Action Gateway — Human-in-the-Loop & Security Suite", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validUserId = "user-123";
  const correlationId = "corr-test-123";

  const context: AiExecutionContext = {
    userId: validUserId,
    workspaceId: validWorkspaceId,
    accessToken: "jwt-token-123",
    correlationId,
  };

  // ── 1. PROPOSAL & SANITIZAÇÃO ──────────────────────────────────────────────
  describe("Criação de Propostas e Sanitização", () => {
    it("cria proposta válida com risco MEDIUM para cadastrar_transacao", () => {
      const proposal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        summary: "Cadastrar despesa de R$ 150,00",
        payload: {
          descricao: "Internet Fibra",
          valor: 150.0,
          tipo: "despesa",
          data: "2026-09-03",
          categoria_nome: "Serviços",
        },
        ttlMinutes: 30,
        correlationId,
      });

      expect(proposal.status).toBe("prepared");
      expect(proposal.riskLevel).toBe("MEDIUM");
      expect(proposal.idempotencyHash).toBeTruthy();
      expect(proposal.workspaceId).toBe(validWorkspaceId);
      expect(proposal.userId).toBe(validUserId);
      expect(proposal.correlationId).toBe(correlationId);
      expect(new Date(proposal.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("atribui risco LOW para cadastrar_meta e HIGH para criar_conta", () => {
      const pGoal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_meta",
        summary: "Meta Reserva de Emergência",
        payload: { nome: "Reserva", valor_alvo: 10000 },
      });
      expect(pGoal.riskLevel).toBe("LOW");

      const pAccount = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "criar_conta",
        summary: "Nova Conta Inter",
        payload: { nome: "Banco Inter", tipo: "conta_corrente" },
      });
      expect(pAccount.riskLevel).toBe("HIGH");
    });

    it("sanitiza e descarta campos maliciosos ou extras (tentativa de injeção de user_id/workspace_id)", () => {
      const sanitized = sanitizeActionPayload("cadastrar_transacao", {
        descricao: "Almoço",
        valor: 45.5,
        tipo: "despesa",
        data: "2026-09-03",
        // Campos injetados pelo atacante/modelo
        workspace_id: "malicious-workspace-999",
        user_id: "attacker-user-666",
        status: "executed",
        isAdmin: true,
      });

      expect(sanitized.descricao).toBe("Almoço");
      expect(sanitized.valor).toBe(45.5);
      // Confirma que campos fora da whitelist foram estritamente removidos
      expect((sanitized as Record<string, unknown>).workspace_id).toBeUndefined();
      expect((sanitized as Record<string, unknown>).user_id).toBeUndefined();
      expect((sanitized as Record<string, unknown>).status).toBeUndefined();
      expect((sanitized as Record<string, unknown>).isAdmin).toBeUndefined();
    });

    it("rejeita proposta se campo obrigatório estiver ausente", () => {
      expect(() => {
        sanitizeActionPayload("cadastrar_transacao", {
          descricao: "Sem valor nem data",
        });
      }).toThrowError(/WALLET_AI_ACTION_INVALID/);
    });

    it("rejeita proposta com data em formato inválido", () => {
      expect(() => {
        sanitizeActionPayload("cadastrar_transacao", {
          descricao: "Teste",
          valor: 100,
          tipo: "despesa",
          data: "03/09/2026", // formato incorreto (deve ser YYYY-MM-DD)
        });
      }).toThrowError(/WALLET_AI_ACTION_INVALID/);
    });
  });

  // ── 2. VALIDAÇÃO SERVER-SIDE (APPROVAL) ───────────────────────────────────
  describe("Revalidação Server-Side e Isolamento", () => {
    it("deve rejeitar execução se a proposta pertencer a outro usuário ou outro workspace", () => {
      const proposal: ActionProposal = {
        id: "act-cross",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Transação",
        payload: { descricao: "Teste", valor: 10, tipo: "despesa", data: "2026-09-03" },
        idempotencyHash: "idem_123",
        status: "prepared",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const crossUserResult = validateActionForExecution(proposal, "attacker-user", validWorkspaceId);
      expect(crossUserResult.valid).toBe(false);
      expect(crossUserResult.code).toBe("WALLET_AI_ACTION_FORBIDDEN");

      const crossWorkspaceResult = validateActionForExecution(proposal, validUserId, "other-workspace-999");
      expect(crossWorkspaceResult.valid).toBe(false);
      expect(crossWorkspaceResult.code).toBe("WALLET_AI_ACTION_FORBIDDEN");
    });

    it("deve rejeitar execução de proposta já expirada", () => {
      const expiredProposal: ActionProposal = {
        id: "act-expired",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Transação",
        payload: { descricao: "Teste", valor: 10, tipo: "despesa", data: "2026-09-03" },
        idempotencyHash: "idem_123",
        status: "prepared",
        expiresAt: new Date(Date.now() - 60000).toISOString(), // expirou
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      };

      const result = validateActionForExecution(expiredProposal, validUserId, validWorkspaceId);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("WALLET_AI_ACTION_EXPIRED");
    });

    it("RBAC: bloqueia execução para papéis 'viewer' ou 'leitor'", () => {
      const proposal: ActionProposal = {
        id: "act-rbac",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Transação",
        payload: { descricao: "Teste", valor: 10, tipo: "despesa", data: "2026-09-03" },
        idempotencyHash: "idem_123",
        status: "prepared",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const result = validateActionForExecution(proposal, validUserId, validWorkspaceId, "viewer");
      expect(result.valid).toBe(false);
      expect(result.code).toBe("WALLET_AI_ACTION_FORBIDDEN");
    });
  });

  // ── 3. EXECUÇÃO ATÔMICA & REPLAY PROTECTION ────────────────────────────────
  describe("Execução Atômica e Proteção contra Replay", () => {
    it("executa proposta válida com sucesso e marca status como 'executed'", async () => {
      let storedProposal: ActionProposal = {
        id: "act-exec-1",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Transação",
        payload: { descricao: "Gasolina", valor: 250, tipo: "despesa", data: "2026-09-03" },
        idempotencyHash: "idem_abc",
        status: "prepared",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const mockRepo: ActionRepository = {
        saveProposal: vi.fn(),
        getProposal: vi.fn().mockImplementation(async () => storedProposal),
        updateStatus: vi.fn().mockImplementation(async (_id, status) => {
          storedProposal = { ...storedProposal, status };
        }),
      };

      const mockMutator: ActionDatabaseMutator = {
        executeMutation: vi.fn().mockResolvedValue({ success: true, recordId: "tx-recorded-999" }),
      };

      const result = await executeConfirmedProposal(
        "act-exec-1",
        context,
        mockRepo,
        mockMutator,
      );

      expect(result.success).toBe(true);
      expect(result.executedRecordId).toBe("tx-recorded-999");
      expect(result.proposal.status).toBe("executed");
      expect(mockMutator.executeMutation).toHaveBeenCalledWith(
        "cadastrar_transacao",
        expect.objectContaining({ descricao: "Gasolina", valor: 250 }),
        context,
      );
    });

    it("REPLAY PROTECTION: segunda tentativa de confirmação rejeita proposta já executada", async () => {
      const alreadyExecutedProposal: ActionProposal = {
        id: "act-already-done",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_transacao",
        actionVersion: "v1",
        riskLevel: "MEDIUM",
        summary: "Transação",
        payload: { descricao: "Gasolina", valor: 250, tipo: "despesa", data: "2026-09-03" },
        idempotencyHash: "idem_abc",
        status: "executed", // já executada
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const mockRepo: ActionRepository = {
        saveProposal: vi.fn(),
        getProposal: vi.fn().mockResolvedValue(alreadyExecutedProposal),
        updateStatus: vi.fn(),
      };

      const mockMutator: ActionDatabaseMutator = {
        executeMutation: vi.fn(),
      };

      await expect(
        executeConfirmedProposal("act-already-done", context, mockRepo, mockMutator),
      ).rejects.toThrowError(/WALLET_AI_ACTION_ALREADY_PROCESSED/);

      expect(mockMutator.executeMutation).not.toHaveBeenCalled();
    });

    it("HIGH RISK: deleção de transação é bloqueada por política de segurança", async () => {
      const deleteProposal: ActionProposal = {
        id: "act-del",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "deletar_transacao",
        actionVersion: "v1",
        riskLevel: "HIGH",
        summary: "Deletar",
        payload: { transacao_id: "tx-1" },
        idempotencyHash: "idem_del",
        status: "prepared",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const mockRepo: ActionRepository = {
        saveProposal: vi.fn(),
        getProposal: vi.fn().mockResolvedValue(deleteProposal),
        updateStatus: vi.fn(),
      };

      const mockMutator: ActionDatabaseMutator = {
        executeMutation: vi.fn(),
      };

      await expect(
        executeConfirmedProposal("act-del", context, mockRepo, mockMutator),
      ).rejects.toThrowError(/WALLET_AI_ACTION_FORBIDDEN/);

      expect(mockMutator.executeMutation).not.toHaveBeenCalled();
    });
  });

  // ── 4. PROMPT INJECTION & DISPATCHER ───────────────────────────────────────
  describe("Tentativas de Burlar Confirmação (Prompt Injection)", () => {
    it("quando o LLM chama tool WRITE, ela produz APENAS uma Action Proposal e NUNCA executa mutação", async () => {
      const mockCatalog: QueryToolCatalog = {};

      const toolCall = {
        id: "call-inj-1",
        type: "function" as const,
        function: {
          name: "cadastrar_transacao",
          arguments: JSON.stringify({
            descricao: "Compra Secreta",
            valor: 1000,
            tipo: "despesa",
            data: "2026-09-03",
            // Tentativa de pular confirmação
            skip_confirmation: true,
            force_execution: true,
            status: "executed",
          }),
        },
      };

      const dispatched = await dispatchOpenAiToolCall(toolCall, context, mockCatalog);

      expect(dispatched.actionProposal).toBeDefined();
      expect(dispatched.actionProposal?.status).toBe("prepared");
      expect(dispatched.actionProposal?.riskLevel).toBe("MEDIUM");

      const responseContent = JSON.parse(dispatched.message.content);
      expect(responseContent.requires_confirmation).toBe(true);
      expect(responseContent.status).toBe("prepared");
      expect(responseContent.message).toContain("Nenhuma alteração foi efetuada no banco");
    });
  });
});
