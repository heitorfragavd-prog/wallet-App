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
import { SupabaseActionProposalRepository } from "../../../../supabase/functions/_shared/ai/action-repository";
import {
  SupabaseActionDatabaseMutator,
  createDefaultActionExecutorRegistry,
} from "../../../../supabase/functions/_shared/ai/action-executor-registry";
import { ActionAuditLogger } from "../../../../supabase/functions/_shared/ai/action-audit";

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

    it("atualizar_divida: valida proposta com risco MEDIUM e exige divida_id", () => {
      const proposal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "atualizar_divida",
        summary: "Atualizar dívida",
        payload: { divida_id: "div-123", status: "quitada", valor_pago: 500 },
      });
      expect(proposal.riskLevel).toBe("MEDIUM");
      expect(proposal.status).toBe("prepared");

      expect(() => {
        sanitizeActionPayload("atualizar_divida", { status: "quitada" }); // sem divida_id
      }).toThrowError(/WALLET_AI_ACTION_INVALID/);
    });

    it("atualizar_transacao: valida proposta com risco HIGH e exige transacao_id", () => {
      const proposal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "atualizar_transacao",
        summary: "Atualizar transação",
        payload: { transacao_id: "tx-123", valor: 350 },
      });
      expect(proposal.riskLevel).toBe("HIGH");

      expect(() => {
        sanitizeActionPayload("atualizar_transacao", { valor: 350 }); // sem transacao_id
      }).toThrowError(/WALLET_AI_ACTION_INVALID/);
    });

    it("atualizar_conta: valida proposta com risco HIGH e exige conta_id", () => {
      const proposal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "atualizar_conta",
        summary: "Atualizar saldo conta",
        payload: { conta_id: "acc-123", saldo: 1500 },
      });
      expect(proposal.riskLevel).toBe("HIGH");

      expect(() => {
        sanitizeActionPayload("atualizar_conta", { saldo: 1500 }); // sem conta_id
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

      const responseContent = JSON.parse(dispatched.content);
      expect(responseContent.requires_confirmation).toBe(true);
      expect(responseContent.status).toBe("prepared");
      expect(responseContent.message).toContain("Nenhuma alteração foi efetuada no banco");
    });
  });

  // ── 5. PERSISTÊNCIA CANÔNICA SUPABASE (ETAPA 9.4A) ─────────────────────────
  describe("Persistência Canônica do Action Gateway (SupabaseActionProposalRepository)", () => {
    it("persiste proposta completa com risk_level e conversation_id", async () => {
      let insertedRow: Record<string, unknown> | null = null;

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockImplementation((row) => {
            insertedRow = row;
            return Promise.resolve({ error: null });
          }),
        }),
      } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;

      const repository = new SupabaseActionProposalRepository(mockSupabase);

      const proposal = prepareActionProposal({
        workspaceId: validWorkspaceId,
        userId: validUserId,
        conversationId: "conv-1111-2222",
        actionType: "cadastrar_meta",
        summary: "Criar meta Reserva",
        payload: { nome: "Reserva de Emergência", valor_alvo: 15000 },
        correlationId,
      });

      await repository.saveProposal(proposal);

      expect(insertedRow).toBeTruthy();
      expect(insertedRow!["id"]).toBe(proposal.id);
      expect(insertedRow!["risk_level"]).toBe("LOW");
      expect(insertedRow!["conversation_id"]).toBe("conv-1111-2222");
      expect(insertedRow!["status"]).toBe("prepared");
      expect(insertedRow!["idempotency_hash"]).toBeTruthy();
    });

    it("confirmProposalAtomically: realiza transição atômica prepared -> confirmed", async () => {
      const storedRow = {
        id: "prop-atomic-1",
        workspace_id: validWorkspaceId,
        user_id: validUserId,
        conversation_id: "conv-123",
        action_type: "cadastrar_meta",
        action_version: "v1",
        risk_level: "LOW",
        summary: "Meta Teste",
        payload: { nome: "Meta A", valor_alvo: 5000 },
        previous_state: null,
        idempotency_hash: "hash-idem-1",
        status: "prepared" as const,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        confirmed_at: null,
        executed_at: null,
        created_at: new Date().toISOString(),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: storedRow, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { ...storedRow, status: "confirmed", confirmed_at: new Date().toISOString() },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;

      const repository = new SupabaseActionProposalRepository(mockSupabase);

      const result = await repository.confirmProposalAtomically("prop-atomic-1", context, "owner");
      expect(result.success).toBe(true);
      expect(result.proposal?.status).toBe("confirmed");
    });

    it("confirmProposalAtomically: bloqueia role 'viewer'", async () => {
      const mockSupabase = { from: vi.fn() } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;
      const repository = new SupabaseActionProposalRepository(mockSupabase);

      const result = await repository.confirmProposalAtomically("prop-1", context, "viewer");
      expect(result.success).toBe(false);
      expect(result.code).toBe("WALLET_AI_ACTION_FORBIDDEN");
    });

    it("confirmProposalAtomically: bloqueia aprovação HIGH para role 'member'", async () => {
      const highRow = {
        id: "prop-high-1",
        workspace_id: validWorkspaceId,
        user_id: validUserId,
        conversation_id: null,
        action_type: "criar_conta",
        action_version: "v1",
        risk_level: "HIGH",
        summary: "Criar Conta Inter",
        payload: { nome: "Inter", tipo: "conta_corrente" },
        previous_state: null,
        idempotency_hash: "hash-idem-high",
        status: "prepared" as const,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        confirmed_at: null,
        executed_at: null,
        created_at: new Date().toISOString(),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: highRow, error: null }),
            }),
          }),
        }),
      } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;

      const repository = new SupabaseActionProposalRepository(mockSupabase);

      const result = await repository.confirmProposalAtomically("prop-high-1", context, "member");
      expect(result.success).toBe(false);
      expect(result.code).toBe("WALLET_AI_ACTION_FORBIDDEN");
      expect(result.error).toContain("exigem permissão de proprietário ou administrador");
    });
  });

  // ── 6. ROLLOUT GRADUAL DE EXECUTORES (ETAPA 9.4A) ──────────────────────────
  describe("Rollout Gradual de Executores (ActionExecutorRegistry)", () => {
    it("PHASE 1 (LOW RISK): cadastrar_meta executa mutação na tabela metas", async () => {
      let insertedMeta: Record<string, unknown> | null = null;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "metas") {
            return {
              insert: vi.fn().mockImplementation((rows) => {
                insertedMeta = rows[0];
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: "meta-uuid-999" }, error: null }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;

      const mutator = new SupabaseActionDatabaseMutator(
        mockSupabase,
        createDefaultActionExecutorRegistry(),
      );

      const res = await mutator.executeMutation(
        "cadastrar_meta",
        { nome: "Viagem Fim de Ano", valor_alvo: 5000, valor_atual: 500 },
        context,
      );

      expect(res.success).toBe(true);
      expect(res.recordId).toBe("meta-uuid-999");
      expect(insertedMeta).toBeTruthy();
      expect(insertedMeta!["titulo"]).toBe("Viagem Fim de Ano");
      expect(insertedMeta!["valor_alvo"]).toBe(5000);
      expect(insertedMeta!["valor_atual"]).toBe(500);
      expect(insertedMeta!["user_id"]).toBe(validUserId);
    });

    it("PHASE 1 (LOW RISK): atualizar_meta executa mutação na tabela metas", async () => {
      let updatedFields: Record<string, unknown> | null = null;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "metas") {
            return {
              update: vi.fn().mockImplementation((fields) => {
                updatedFields = fields;
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { id: "meta-uuid-999" }, error: null }),
                      }),
                    }),
                  }),
                };
              }),
            };
          }
          return {};
        }),
      } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;

      const mutator = new SupabaseActionDatabaseMutator(
        mockSupabase,
        createDefaultActionExecutorRegistry(),
      );

      const res = await mutator.executeMutation(
        "atualizar_meta",
        { meta_id: "meta-uuid-999", valor_atual: 1200, status: "ativa" },
        context,
      );

      expect(res.success).toBe(true);
      expect(updatedFields!["valor_atual"]).toBe(1200);
      expect(updatedFields!["status"]).toBe("ativa");
    });

    it("PHASE 2 (MEDIUM RISK): cadastrar_transacao opera como Proposal-only (bloqueia mutação direta)", async () => {
      const mockSupabase = { from: vi.fn() } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;
      const mutator = new SupabaseActionDatabaseMutator(mockSupabase);

      await expect(
        mutator.executeMutation(
          "cadastrar_transacao",
          { descricao: "Gasolina", valor: 200, tipo: "despesa", data: "2026-09-04" },
          context,
        ),
      ).rejects.toThrowError(/Proposal-only/);
    });

    it("PHASE 3 (HIGH RISK): criar_conta opera como Proposal-only (bloqueia mutação direta)", async () => {
      const mockSupabase = { from: vi.fn() } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;
      const mutator = new SupabaseActionDatabaseMutator(mockSupabase);

      await expect(
        mutator.executeMutation(
          "criar_conta",
          { nome: "Nova Conta Nubank", tipo: "conta_corrente" },
          context,
        ),
      ).rejects.toThrowError(/Proposal-only/);
    });

    it("DELETE: deletar_transacao é bloqueada incondicionalmente no mutator", async () => {
      const mockSupabase = { from: vi.fn() } as unknown as import("https://esm.sh/@supabase/supabase-js@2.45.4").SupabaseClient;
      const mutator = new SupabaseActionDatabaseMutator(mockSupabase);

      await expect(
        mutator.executeMutation("deletar_transacao", { transacao_id: "tx-123" }, context),
      ).rejects.toThrowError(/bloqueada por política de segurança/);
    });
  });

  // ── 7. AUDITORIA DE EVENTOS (ETAPA 9.4A) ───────────────────────────────────
  describe("Auditoria de Eventos do Action Gateway (ActionAuditLogger)", () => {
    it("registra eventos de confirmação e execução sem vazar dados confidenciais", async () => {
      const recordedEvents: import("../../../../supabase/functions/_shared/ai/action-types").ActionAuditEvent[] = [];

      const auditLogger = new ActionAuditLogger([
        {
          recordEvent(event) {
            recordedEvents.push(event);
          },
        },
      ]);

      const proposal: ActionProposal = {
        id: "prop-audit-1",
        workspaceId: validWorkspaceId,
        userId: validUserId,
        actionType: "cadastrar_meta",
        actionVersion: "v1",
        riskLevel: "LOW",
        summary: "Meta Reserva",
        payload: { nome: "Reserva", valor_alvo: 10000 },
        idempotencyHash: "idem_audit_1",
        status: "prepared",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      const mockRepo: ActionRepository = {
        saveProposal: vi.fn(),
        getProposal: vi.fn().mockResolvedValue(proposal),
        updateStatus: vi.fn().mockImplementation((_id, status) => {
          proposal.status = status;
        }),
      };

      const mockMutator: ActionDatabaseMutator = {
        executeMutation: vi.fn().mockResolvedValue({ success: true, recordId: "meta-id-123" }),
      };

      await executeConfirmedProposal(
        "prop-audit-1",
        context,
        mockRepo,
        mockMutator,
        "owner",
        auditLogger,
      );

      expect(recordedEvents.length).toBe(2);
      expect(recordedEvents[0].eventName).toBe("proposal_confirmed");
      expect(recordedEvents[1].eventName).toBe("proposal_executed");
      expect(recordedEvents[0].workspaceId).toBe(validWorkspaceId);
      expect(recordedEvents[0].userId).toBe(validUserId);
      // Confirma que não contém o payload financeiro completo
      expect((recordedEvents[0] as unknown as Record<string, unknown>).payload).toBeUndefined();
    });
  });
});

