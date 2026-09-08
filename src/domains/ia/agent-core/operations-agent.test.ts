/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OperationsAgent,
  createSupabaseOperationsRepository,
  type OperationsRepository,
} from "../../../../supabase/functions/_shared/ai/operations-agent.ts";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth.ts";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types.ts";
import {
  prepareActionProposal,
  ActionGatewayError,
  type ActionRepository,
} from "../../../../supabase/functions/_shared/ai/action-gateway.ts";
import { ActionExecutorRegistry } from "../../../../supabase/functions/_shared/ai/action-executor-registry.ts";
import {
  handleTelegramTextMessage,
  handleTelegramCallback,
  type TelegramAdapterDependencies,
  type TelegramApiClient,
} from "../../../../supabase/functions/_shared/ai/telegram-channel-adapter.ts";
import { createQueryToolCatalog } from "../../../../supabase/functions/_shared/ai/query-tools.ts";
import { runOrchestratorTurn, type LlmRunner } from "../../../../supabase/functions/_shared/ai/orchestrator-core.ts";

describe("Operations Agent — Suíte Canônica (Etapa 9.5B)", () => {
  const TEST_WORKSPACE = "ws-op-222";
  const TEST_USER = "user-op-222";
  const TEST_TG_USER_ID = 888777666;
  const TEST_TG_CHAT_ID = 888777666;

  const mockContext: AiExecutionContext = {
    userId: TEST_USER,
    workspaceId: TEST_WORKSPACE,
    userRole: "admin",
    channel: "web",
    correlationId: "corr_op_test_123",
  };

  let mockRepo: OperationsRepository;
  let auditLogs: any[];

  beforeEach(() => {
    auditLogs = [];
    mockRepo = {
      listOperationalSales: vi.fn(async (_context, _date) => [
        {
          id: "tx-s1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 200.0,
          type: "receita",
          paymentMethod: "dinheiro",
          description: "Venda Dinheiro",
          source: "local",
        },
        {
          id: "tx-s2",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 150.0,
          type: "receita",
          paymentMethod: "pix",
          description: "Venda Pix",
          source: "local",
        },
        {
          id: "tx-s3",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 80.0,
          type: "receita",
          paymentMethod: "debito",
          description: "Venda Débito",
          source: "local",
        },
      ]),
      listOperationalWithdrawals: vi.fn(async (_context, _date) => [
        {
          id: "tx-w1",
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          amount: 50.0,
          type: "despesa",
          paymentMethod: "dinheiro",
          description: "Sangria Caixa",
          source: "local",
        },
      ]),
      findEyemobileProduct: vi.fn(async (_context, criteria) => {
        if (criteria.produtoId === "prod-eye-1" || criteria.nome === "Cerveja IPA") {
          return {
            id: "prod-uuid-1",
            workspaceId: TEST_WORKSPACE,
            produtoId: "prod-eye-1",
            codigoBarras: "7891234567890",
            nome: "Cerveja IPA",
            custoAtual: 12.5,
            estoqueAtual: 45,
          };
        }
        return null;
      }),
      getEyemobileConfig: vi.fn(async () => ({ hasConfig: true, storeId: "store-1" })),
    };
  });

  const makeAgent = () =>
    new OperationsAgent({
      repository: mockRepo,
      auditSink: {
        logEvent: vi.fn(async (event) => {
          auditLogs.push(event);
        }),
      },
    });

  // ─── 1. FECHAMENTO DE CAIXA DETERMINÍSTICO (READ) ───────────────────────────
  describe("1. Fechamento de Caixa Determinístico (validarFechamentoCaixa)", () => {
    it("valida fechamento correto (status = exato)", async () => {
      const agent = makeAgent();

      // Esperado:
      // Dinheiro: 200 - 50 = 150
      // Pix: 150
      // Débito: 80
      // Total = 380
      const res = await agent.validarFechamentoCaixa(
        {
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          reportedByMethod: {
            dinheiro: 150.0,
            pix: 150.0,
            debito: 80.0,
          },
        },
        mockContext,
      );

      expect(res.status).toBe("exato");
      expect(res.expectedTotal).toBe(380.0);
      expect(res.reportedTotal).toBe(380.0);
      expect(res.difference).toBe(0.0);
      expect(res.summaryMessage).toContain("EXATO");
      expect(auditLogs.some((l) => l.eventName === "closing_validation_completed")).toBe(true);
    });

    it("detecta furo de caixa e registra evento de divergência", async () => {
      const agent = makeAgent();

      // Operador informa apenas 100 em dinheiro (esperado 150 -> furo de 50)
      const res = await agent.validarFechamentoCaixa(
        {
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          reportedByMethod: {
            dinheiro: 100.0,
            pix: 150.0,
            debito: 80.0,
          },
        },
        mockContext,
      );

      expect(res.status).toBe("furo");
      expect(res.difference).toBe(-50.0);
      expect(res.differencesByMethod.dinheiro.difference).toBe(-50.0);
      expect(res.differencesByMethod.dinheiro.status).toBe("furo");
      expect(auditLogs.some((l) => l.eventName === "closing_divergence_detected")).toBe(true);
    });

    it("detecta sobra de caixa", async () => {
      const agent = makeAgent();

      // Operador informa 200 em dinheiro (esperado 150 -> sobra de 50)
      const res = await agent.validarFechamentoCaixa(
        {
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          reportedByMethod: {
            dinheiro: 200.0,
            pix: 150.0,
            debito: 80.0,
          },
        },
        mockContext,
      );

      expect(res.status).toBe("sobra");
      expect(res.difference).toBe(50.0);
      expect(res.differencesByMethod.dinheiro.status).toBe("sobra");
    });

    it("rejeita entrada com data inválida com erro padronizado", async () => {
      const agent = makeAgent();

      await expect(
        agent.validarFechamentoCaixa(
          {
            workspaceId: TEST_WORKSPACE,
            userId: TEST_USER,
            date: "data-invalida",
          },
          mockContext,
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_INVALID_INPUT");
    });

    it("rejeita workspace divergente do contexto (Fail-Closed cross-workspace)", async () => {
      const agent = makeAgent();

      await expect(
        agent.validarFechamentoCaixa(
          {
            workspaceId: "ws-alien-999",
            userId: TEST_USER,
            date: "2026-09-04",
          },
          mockContext,
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_WORKSPACE_MISMATCH");
    });
  });

  // ─── 2. CONSULTA DE VENDAS OPERACIONAIS EYEMOBILE (READ) ────────────────────
  describe("2. Consulta Operacional Eyemobile (consultarVendasOperacionais)", () => {
    it("retorna vendas operacionais consolidadas no workspace correto", async () => {
      const agent = makeAgent();

      const res = await agent.consultarVendasOperacionais(
        {
          workspaceId: TEST_WORKSPACE,
          startDate: "2026-09-04",
        },
        mockContext,
      );

      expect(res.workspaceId).toBe(TEST_WORKSPACE);
      expect(res.totalSales).toBe(430.0); // 200 + 150 + 80
      expect(res.transactionsCount).toBe(3);
      expect(res.salesByMethod.dinheiro).toBe(200.0);
      expect(res.salesByMethod.pix).toBe(150.0);
      expect(res.salesByMethod.debito).toBe(80.0);
      expect(auditLogs.some((l) => l.eventName === "eyemobile_read_completed")).toBe(true);
    });
  });

  // ─── 3. PROPOSTA DE ATUALIZAÇÃO DE CUSTO (WRITE) ────────────────────────────
  describe("3. Proposta de Alteração de Custo Eyemobile (Action Proposal)", () => {
    it("gera proposta MEDIUM proposal_only via Action Gateway sem mutação física direta", async () => {
      const agent = makeAgent();

      const proposal = await agent.proporAtualizacaoCustoEyemobile(
        {
          produtoNome: "Cerveja IPA",
          novoCusto: 14.8,
          quantidadeEstoque: 50,
          motivo: "Reajuste NF distribuidor",
        },
        mockContext,
      );

      expect(proposal.actionType).toBe("atualizar_custo_produto_eyemobile");
      expect(proposal.riskLevel).toBe("MEDIUM");
      expect(proposal.status).toBe("prepared");
      expect(proposal.payload.novo_custo).toBe(14.8);
      expect(proposal.payload.custo_anterior).toBe(12.5);
      expect(proposal.payload.produto_uuid).toBe("prod-uuid-1");
      expect(proposal.summary).toContain("Cerveja IPA");
      expect(auditLogs.some((l) => l.eventName === "operations_proposal_created")).toBe(true);
    });

    it("rejeita produto inexistente com WALLET_AI_OPERATIONS_DATA_UNAVAILABLE", async () => {
      const agent = makeAgent();

      await expect(
        agent.proporAtualizacaoCustoEyemobile(
          {
            produtoNome: "Produto Fantasma Que Não Existe",
            novoCusto: 20.0,
          },
          mockContext,
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_DATA_UNAVAILABLE");
    });

    it("rejeita novo custo inválido ou negativo", async () => {
      const agent = makeAgent();

      await expect(
        agent.proporAtualizacaoCustoEyemobile(
          {
            produtoNome: "Cerveja IPA",
            novoCusto: -5.0,
          },
          mockContext,
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_INVALID_INPUT");
    });

    it("RBAC: usuário viewer é bloqueado de gerar proposta de alteração de custo", async () => {
      const agent = makeAgent();
      const viewerContext: AiExecutionContext = {
        ...mockContext,
        userRole: "viewer",
      };

      await expect(
        agent.proporAtualizacaoCustoEyemobile(
          {
            produtoNome: "Cerveja IPA",
            novoCusto: 15.0,
          },
          viewerContext,
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_FORBIDDEN");
    });
  });

  // ─── 4. INTEGRAÇÃO TELEGRAM COM OPERATIONS AGENT ────────────────────────────
  describe("4. Integração Telegram com Operations Agent", () => {
    let savedProposals: Map<string, ActionProposal>;
    let mockProposalRepo: ActionRepository;
    let mockApiClient: TelegramApiClient;

    beforeEach(() => {
      savedProposals = new Map<string, ActionProposal>();
      mockProposalRepo = {
        saveProposal: vi.fn(async (p: ActionProposal) => {
          savedProposals.set(p.id, { ...p });
        }),
        getProposal: vi.fn(async (id: string) => savedProposals.get(id) || null),
        updateStatus: vi.fn(async (id: string, s: any) => {
          const p = savedProposals.get(id);
          if (p) {
            p.status = s;
            savedProposals.set(id, p);
          }
        }),
        confirmProposalAtomically: vi.fn(async (id: string) => {
          const p = savedProposals.get(id);
          if (!p) return { success: false, code: "WALLET_AI_ACTION_INVALID", error: "Not found" };
          p.status = "confirmed";
          p.confirmedAt = new Date().toISOString();
          savedProposals.set(id, p);
          return { success: true, proposal: p };
        }),
        cancelProposalAtomically: vi.fn(async (id: string) => {
          const p = savedProposals.get(id);
          if (!p) return false;
          p.status = "cancelled";
          savedProposals.set(id, p);
          return true;
        }),
      };

      mockApiClient = {
        sendMessage: vi.fn(async () => ({ ok: true, message_id: 991 })),
        editMessageText: vi.fn(async () => ({ ok: true })),
        editMessageReplyMarkup: vi.fn(async () => ({ ok: true })),
        answerCallbackQuery: vi.fn(async () => ({ ok: true })),
        downloadFileAsBase64: vi.fn(async () => null),
        transcribeAudio: vi.fn(async () => null),
      };
    });

    it("Telegram: pergunta de fechamento executa tool READ determinística sem gerar proposal", async () => {
      const agent = makeAgent();

      // Runner simula chamada a validar_fechamento_caixa e resposta final
      let step = 0;
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn(async () => {
          step++;
          if (step === 1) {
            return {
              message: {
                role: "assistant" as const,
                content: null,
                tool_calls: [
                  {
                    id: "call_close_1",
                    type: "function" as const,
                    function: {
                      name: "validar_fechamento_caixa",
                      arguments: JSON.stringify({
                        data: "2026-09-04",
                        valor_relatado: 380.0,
                      }),
                    },
                  },
                ],
              },
            };
          }
          return {
            message: {
              role: "assistant" as const,
              content: "O fechamento do dia 04/09/2026 está exato! Total esperado de R$ 380,00 bateu com o relatado.",
            },
          };
        }),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => null }) }) }) },
        telegramBotToken: "mock-bot-token",
        telegramApi: mockApiClient,
        runnerFactory: () => mockRunner,
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
        operationsAgent: agent,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER,
        workspaceId: TEST_WORKSPACE,
        userRole: "admin",
      };

      const res = await handleTelegramTextMessage(
        { text: "Confere o fechamento do caixa de hoje", identity, chatId: TEST_TG_CHAT_ID },
        deps,
      );

      expect(res.text).toContain("fechamento do dia 04/09/2026 está exato");
      expect(res.inlineKeyboard).toBeUndefined();
      expect(res.actionProposals).toBeUndefined();
    });

    it("Telegram: pedido de alteração de custo gera Action Proposal com botões inline", async () => {
      let step = 0;
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn(async () => {
          step++;
          if (step === 1) {
            return {
              message: {
                role: "assistant" as const,
                content: null,
                tool_calls: [
                  {
                    id: "call_cost_1",
                    type: "function" as const,
                    function: {
                      name: "atualizar_custo_produto_eyemobile",
                      arguments: JSON.stringify({
                        produto_nome: "Cerveja IPA",
                        novo_custo: 15.5,
                      }),
                    },
                  },
                ],
              },
            };
          }
          return {
            message: {
              role: "assistant" as const,
              content: "Preparei a proposta para atualizar o custo do produto Cerveja IPA.",
            },
          };
        }),
      };

      const qb: any = {
        select: () => qb,
        eq: () => qb,
        maybeSingle: async () => ({
          data: {
            user_id: TEST_USER,
            workspace_id: TEST_WORKSPACE,
            access_level: "admin",
            is_active: true,
            nome_exibicao: "Operador Teste",
          },
          error: null,
        }),
      };

      const deps: TelegramAdapterDependencies = {
        supabase: { from: () => qb },
        telegramBotToken: "mock-bot-token",
        telegramApi: mockApiClient,
        runnerFactory: () => mockRunner,
        repoFactory: () => ({} as any),
        proposalRepo: mockProposalRepo,
      };

      const identity = {
        authorized: true,
        userId: TEST_USER,
        workspaceId: TEST_WORKSPACE,
        userRole: "admin",
      };

      const res = await handleTelegramTextMessage(
        { text: "Altere o custo da Cerveja IPA para R$ 15,50", identity, chatId: TEST_TG_CHAT_ID },
        deps,
      );

      expect(res.inlineKeyboard).toBeDefined();
      expect(res.inlineKeyboard![0][0].text).toContain("Confirmar");
      expect(res.actionProposals).toBeDefined();
      expect(res.actionProposals![0].actionType).toBe("atualizar_custo_produto_eyemobile");
      expect(res.actionProposals![0].riskLevel).toBe("MEDIUM");

      // Confirmação via Telegram: modo proposal_only com 0 executores físicos
      const propId = res.actionProposals![0].id;
      const cbResult = await handleTelegramCallback(
        {
          callbackData: `confirm_prop:${propId}`,
          callbackQueryId: "cq_cost_conf",
          telegramUserId: TEST_TG_USER_ID,
        },
        deps,
      );

      expect(cbResult.answerText).toBe("Proposta confirmada. Nenhuma alteração financeira foi executada automaticamente.");
      expect(savedProposals.get(propId)?.status).toBe("confirmed");
      expect(savedProposals.get(propId)?.executedAt).toBeNull();
    });
  });

  // ─── 5. INTEGRAÇÃO WEB / IA-V2 COM OPERATIONS AGENT ─────────────────────────
  describe("5. Integração Web / Orchestrator (/ia-v2)", () => {
    it("executa turno analítico de fechamento de caixa via Orchestrator", async () => {
      const agent = makeAgent();

      const mockQueryRepo = {
        listRevenues: vi.fn(async () => []),
        listExpenses: vi.fn(async () => []),
        listTransactions: vi.fn(async () => []),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
      };

      const catalog = createQueryToolCatalog(mockQueryRepo as any, {
        extended: true,
        operationsAgent: agent,
      });

      let step = 0;
      const mockRunner: LlmRunner = {
        generateCompletion: vi.fn(async () => {
          step++;
          if (step === 1) {
            return {
              message: {
                role: "assistant" as const,
                content: null,
                tool_calls: [
                  {
                    id: "call_web_close",
                    type: "function" as const,
                    function: {
                      name: "validar_fechamento_caixa",
                      arguments: JSON.stringify({
                        data: "2026-09-04",
                        valor_relatado: 380.0,
                      }),
                    },
                  },
                ],
              },
            };
          }
          return {
            message: {
              role: "assistant" as const,
              content: "Fechamento validado com sucesso na Web.",
            },
          };
        }),
      };

      const turn = await runOrchestratorTurn(
        [{ role: "user", content: "Valide o caixa de hoje relatando 380 reais" }],
        mockContext,
        catalog,
        mockRunner,
      );

      expect(turn.toolCallsExecuted).toHaveLength(1);
      expect(turn.toolCallsExecuted[0].tool).toBe("validar_fechamento_caixa");
      expect((turn.toolCallsExecuted[0].output as any).data.status).toBe("exato");
      expect(turn.actionProposals).toHaveLength(0);
    });

    it("createSupabaseOperationsRepository constrói queries e mapeia dados corretamente", async () => {
      const qb: any = {
        select: () => qb,
        eq: () => qb,
        gte: () => qb,
        lte: () => qb,
        ilike: () => qb,
        limit: () => qb,
        maybeSingle: async () => ({
          data: {
            id: "prod-1",
            workspace_id: TEST_WORKSPACE,
            produto_id: "eye-1",
            nome: "Cerveja Pilsen",
            custo: 5.5,
            estoque: 100,
          },
        }),
      };

      const mockSb = {
        from: vi.fn(() => qb),
      };

      const repo = createSupabaseOperationsRepository(mockSb as any);
      expect(repo).toBeDefined();

      const prod = await repo.findEyemobileProduct(mockContext, { nome: "Pilsen" });
      expect(prod).toBeDefined();
      expect(prod?.nome).toBe("Cerveja Pilsen");
      expect(prod?.custoAtual).toBe(5.5);
    });
  });

  // ─── 6. HARDENING DE SEGURANÇA, SANITIZER E ZERO EXECUÇÃO FÍSICA (9.5B.1) ───
  describe("6. Hardening de Segurança, Sanitizer e Zero Execução Física (Checkpoint 9.5B.1)", () => {
    it("Payload Sanitizer: purga injeção maliciosa de workspace_id, user_id, risk_level e SQL", () => {
      const maliciousPayload = {
        produto_id: "eye-prod-10",
        novo_custo: 25.5,
        motivo: "Reajuste padrão",
        // Campos maliciosos injetados
        workspace_id: "injected-ws-999",
        user_id: "injected-user-666",
        risk_level: "LOW",
        status: "executed",
        table: "users",
        sql: "DROP TABLE transacoes;",
      };

      const proposal = prepareActionProposal({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        actionType: "atualizar_custo_produto_eyemobile",
        summary: "Teste de Injeção",
        payload: maliciousPayload,
      });

      // Metadados autoritativos controlados pelo gateway
      expect(proposal.workspaceId).toBe(TEST_WORKSPACE);
      expect(proposal.userId).toBe(TEST_USER);
      expect(proposal.riskLevel).toBe("MEDIUM");
      expect(proposal.status).toBe("prepared");

      // Payload sanitizado remove chaves não permitidas
      const p = proposal.payload as Record<string, unknown>;
      expect(p.produto_id).toBe("eye-prod-10");
      expect(p.novo_custo).toBe(25.5);
      expect(p.motivo).toBe("Reajuste padrão");
      expect(p.workspace_id).toBeUndefined();
      expect(p.user_id).toBeUndefined();
      expect(p.risk_level).toBeUndefined();
      expect(p.status).toBeUndefined();
      expect(p.table).toBeUndefined();
      expect(p.sql).toBeUndefined();
    });

    it("Payload Sanitizer: rejeita novo_custo negativo ou não numérico via Action Gateway", () => {
      expect(() =>
        prepareActionProposal({
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          actionType: "atualizar_custo_produto_eyemobile",
          summary: "Custo negativo",
          payload: { novo_custo: -15.0 },
        }),
      ).toThrow(ActionGatewayError);

      expect(() =>
        prepareActionProposal({
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          actionType: "atualizar_custo_produto_eyemobile",
          summary: "Custo string inválida",
          payload: { novo_custo: "invalido" },
        }),
      ).toThrow(ActionGatewayError);
    });

    it("Zero Execução Física: 13º Action Type não possui executor registrado e confirmação é proposal_only", async () => {
      const registry = new ActionExecutorRegistry();
      expect(registry.has("atualizar_custo_produto_eyemobile")).toBe(false);

      const savedProposals = new Map<string, ActionProposal>();
      const mockProposalRepo: ActionRepository = {
        saveProposal: vi.fn(async (p: ActionProposal) => {
          savedProposals.set(p.id, { ...p });
        }),
        getProposal: vi.fn(async (id: string) => savedProposals.get(id) || null),
        updateStatus: vi.fn(async (id: string, s: any) => {
          const p = savedProposals.get(id);
          if (p) {
            p.status = s;
            savedProposals.set(id, p);
          }
        }),
        confirmProposalAtomically: vi.fn(async (id: string) => {
          const p = savedProposals.get(id);
          if (!p) return { success: false, code: "WALLET_AI_ACTION_INVALID", error: "Not found" };
          p.status = "confirmed";
          p.confirmedAt = new Date().toISOString();
          savedProposals.set(id, p);
          return { success: true, proposal: p };
        }),
        cancelProposalAtomically: vi.fn(async () => true),
      };

      const proposal = prepareActionProposal({
        workspaceId: TEST_WORKSPACE,
        userId: TEST_USER,
        actionType: "atualizar_custo_produto_eyemobile",
        summary: "Atualizar custo IPA",
        payload: { novo_custo: 18.0, produto_id: "eye-ipa" },
      });

      await mockProposalRepo.saveProposal(proposal);

      const confirmResult = await mockProposalRepo.confirmProposalAtomically!(proposal.id, mockContext);
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.proposal?.status).toBe("confirmed");
      expect(confirmResult.proposal?.executedAt).toBeNull();
    });

    it("validar_fechamento_caixa é 100% READ PURO: nenhuma mutação (insert/update/delete/rpc) é invocada", async () => {
      const insertSpy = vi.fn();
      const updateSpy = vi.fn();
      const deleteSpy = vi.fn();
      const rpcSpy = vi.fn();

      const mockSb = {
        from: vi.fn(() => {
          let currentTipo = "";
          const qb: any = {
            select: () => qb,
            eq: (col: string, val: any) => {
              if (col === "tipo") currentTipo = val;
              return qb;
            },
            gte: () => qb,
            lte: () => qb,
            insert: insertSpy,
            update: updateSpy,
            delete: deleteSpy,
            then: (resolve: any) => {
              if (currentTipo === "despesa") {
                return resolve({ data: [], error: null });
              }
              return resolve({
                data: [
                  {
                    id: "tx-read-1",
                    workspace_id: TEST_WORKSPACE,
                    user_id: TEST_USER,
                    valor: 100.0,
                    tipo: "receita",
                    data: "2026-09-04",
                    metodo_pagamento: "dinheiro",
                    descricao: "Venda 100",
                    observacoes: null,
                  },
                ],
                error: null,
              });
            },
          };
          return qb;
        }),
        rpc: rpcSpy,
      };

      const agent = new OperationsAgent({
        repository: createSupabaseOperationsRepository(mockSb as any),
      });

      const res = await agent.validarFechamentoCaixa(
        {
          workspaceId: TEST_WORKSPACE,
          userId: TEST_USER,
          date: "2026-09-04",
          reportedTotal: 100.0,
        },
        mockContext,
      );

      expect(res.status).toBe("exato");
      expect(insertSpy).toHaveBeenCalledTimes(0);
      expect(updateSpy).toHaveBeenCalledTimes(0);
      expect(deleteSpy).toHaveBeenCalledTimes(0);
      expect(rpcSpy).toHaveBeenCalledTimes(0);
    });

    it("Cross-workspace isolation: produto de outro workspace não pode gerar proposta no workspace autenticado", async () => {
      const foreignProductRepo: OperationsRepository = {
        async listOperationalSales() {
          return [];
        },
        async listOperationalWithdrawals() {
          return [];
        },
        async findEyemobileProduct(context, criteria) {
          // Só retorna produto se workspace_id for ws-alien-999
          if (context.workspaceId === "ws-alien-999" && criteria.nome === "Cerveja Alien") {
            return {
              id: "prod-alien-1",
              workspaceId: "ws-alien-999",
              produtoId: "eye-alien",
              nome: "Cerveja Alien",
              custoAtual: 10.0,
            };
          }
          return null; // No workspace TEST_WORKSPACE, produto não existe
        },
      };

      const agent = new OperationsAgent({
        repository: foreignProductRepo,
      });

      // Usuário no workspace TEST_WORKSPACE tenta atualizar custo do produto do ws-alien-999
      await expect(
        agent.proporAtualizacaoCustoEyemobile(
          {
            produtoNome: "Cerveja Alien",
            novoCusto: 12.0,
          },
          mockContext, // workspaceId: TEST_WORKSPACE
        ),
      ).rejects.toThrow("WALLET_AI_OPERATIONS_DATA_UNAVAILABLE");
    });
  });
});
