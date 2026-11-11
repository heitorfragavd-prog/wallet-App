import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
  type SpecialistAgentId,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  buildFinancialSpecialistDeterministicResponse,
  fetchAndExecuteFinancialSpecialist,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmMessage, LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Sete Agentes Especializados do Wallet CEO 3.0", () => {
  describe("Gate 2 & 3: Contratos e Registro dos Sete Especialistas", () => {
    const expectedSpecialists: SpecialistAgentId[] = [
      "financeiro",
      "fiscal",
      "vendas_pdv",
      "estoque",
      "rh",
      "inteligencia_competitiva",
      "operacoes",
    ];

    it("1. Deve registrar exatamente os 7 especialistas oficiais com todos os metadados contratuais", () => {
      const registeredKeys = Object.keys(SPECIALIST_AGENTS_REGISTRY);
      expect(registeredKeys).toHaveLength(7);
      expectedSpecialists.forEach((id) => {
        const spec = SPECIALIST_AGENTS_REGISTRY[id];
        expect(spec).toBeDefined();
        expect(spec.id).toBe(id);
        expect(spec.name).toBeTruthy();
        expect(spec.department).toBeTruthy();
        expect(spec.description).toBeTruthy();
        expect(spec.capabilities.length).toBeGreaterThan(0);
        expect(spec.allowedTools.length).toBeGreaterThan(0);
        expect(["owner", "admin", "member"]).toContain(spec.requiredRole);
        expect(spec.defaultModel).toBeTruthy();
      });
    });

    it("2. Nenhum especialista consultivo pode realizar mutações de estado sem proposta (canMutateState === false)", () => {
      expectedSpecialists.forEach((id) => {
        const spec = SPECIALIST_AGENTS_REGISTRY[id];
        expect(spec.canMutateState).toBe(false);
      });
    });

    it("3. Agente Financeiro deve ter permissão mínima de admin e cobrir ferramentas canônicas", () => {
      const fin = SPECIALIST_AGENTS_REGISTRY.financeiro;
      expect(fin.requiredRole).toBe("admin");
      expect(fin.allowedTools).toContain("buscar_receitas");
      expect(fin.allowedTools).toContain("buscar_despesas");
      expect(fin.allowedTools).toContain("consultar_saldos");
      expect(fin.allowedTools).toContain("consultar_dividas");
      expect(fin.allowedTools).toContain("consultar_fluxo_caixa");
      expect(fin.deterministicFirst).toBe(true);
    });

    it("4. Agente de Inteligência Competitiva deve ser restrito ao proprietário (owner)", () => {
      const intel = SPECIALIST_AGENTS_REGISTRY.inteligencia_competitiva;
      expect(intel.requiredRole).toBe("owner");
      expect(intel.maxComplexity).toBe(3);
    });
  });

  describe("Gate 4 & 5: Autorização, Roteamento e Coordenação pelo Wallet CEO", () => {
    it("5. Deve impedir que um colaborador (member) acione o Agente Financeiro ou Inteligência Competitiva", () => {
      const finAuth = authorizeSpecialistAccess("financeiro", "member");
      expect(finAuth.authorized).toBe(false);
      expect(finAuth.reason).toContain("Acesso negado");

      const intelAuth = authorizeSpecialistAccess("inteligencia_competitiva", "member");
      expect(intelAuth.authorized).toBe(false);

      const opAuth = authorizeSpecialistAccess("operacoes", "member");
      expect(opAuth.authorized).toBe(true);
    });

    it("6. Deve autorizar admin e owner para o Agente Financeiro", () => {
      expect(authorizeSpecialistAccess("financeiro", "admin").authorized).toBe(true);
      expect(authorizeSpecialistAccess("financeiro", "owner").authorized).toBe(true);
    });

    it("7. Roteamento Inteligente: Deve direcionar perguntas específicas ao especialista correto", () => {
      // Fiscal
      const fiscalRoute = routeUserQueryToSpecialists("Preciso verificar a nota fiscal e DANFE de compras");
      expect(fiscalRoute.primarySpecialist).toBe("fiscal");
      expect(fiscalRoute.coordinatingCeo).toBe(false);

      // Vendas & PDV
      const vendasRoute = routeUserQueryToSpecialists("Qual foi o meu ticket médio no almoço de ontem?");
      expect(vendasRoute.primarySpecialist).toBe("vendas_pdv");

      // Estoque
      const estoqueRoute = routeUserQueryToSpecialists("Quais insumos estão abaixo do estoque mínimo?");
      expect(estoqueRoute.primarySpecialist).toBe("estoque");

      // RH
      const rhRoute = routeUserQueryToSpecialists("Como está a escala de equipe para o sábado?");
      expect(rhRoute.primarySpecialist).toBe("rh");

      // Inteligência Competitiva
      const intelRoute = routeUserQueryToSpecialists("Qual a média de mercado para precificação de hambúrguer?");
      expect(intelRoute.primarySpecialist).toBe("inteligencia_competitiva");

      // Operações
      const opRoute = routeUserQueryToSpecialists("Houve alguma sangria ou cancelamento de pedido no caixa hoje?");
      expect(opRoute.primarySpecialist).toBe("operacoes");
    });

    it("8. Coordenação Multi-Especialista pelo Wallet CEO para diagnóstico de margem e faturamento", () => {
      const plan = routeUserQueryToSpecialists("Por que estou faturando mais, mas meu lucro diminuiu?");
      expect(plan.coordinatingCeo).toBe(true);
      expect(plan.primarySpecialist).toBe("financeiro");
      expect(plan.contributingSpecialists).toEqual(
        expect.arrayContaining(["vendas_pdv", "estoque", "financeiro"])
      );
      expect(plan.complexityLevel).toBe(3);
    });
  });

  describe("Gate 6: Respostas Determinísticas do Agente Financeiro & Regra Estrita de Valores", () => {
    const mockFinancialData = {
      faturamentoOntem: 2450.5,
      pedidosOntem: 42,
      faturamentoMes: 68500.0,
      despesasMes: 41200.0,
      resultadoOperacionalMes: 27300.0,
      saldoTotal: 18450.25,
      contasVencer7Dias: [
        { descricao: "Fornecedor Carnes Prime", valor: 3200.0, vencimento: "2026-11-14" },
        { descricao: "Energia Elétrica", valor: 1450.0, vencimento: "2026-11-16" },
      ],
      contasVencidas: [
        { descricao: "Distribuidora Bebidas", valor: 850.0, vencimento: "2026-11-08" },
      ],
    };

    it("9. Deve responder instantaneamente 'Quanto faturei ontem?' com dados reais sem alucinação", () => {
      const res = buildFinancialSpecialistDeterministicResponse("Quanto faturei ontem?", mockFinancialData);
      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("financeiro");
      expect(res.answer).toContain("R$ 2450.50");
      expect(res.answer).toContain("42");
      expect(res.answer).toContain("R$ 58.35"); // Ticket médio 2450.5 / 42
    });

    it("10. Deve listar contas a vencer e alertar sobre contas vencidas", () => {
      const res = buildFinancialSpecialistDeterministicResponse("Quais contas vencem nesta semana?", mockFinancialData);
      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("financeiro");
      expect(res.answer).toContain("Fornecedor Carnes Prime");
      expect(res.answer).toContain("R$ 3200.00");
      expect(res.answer).toContain("1 Conta(s) Vencida(s)");
      expect(res.answer).toContain("Distribuidora Bebidas");
    });

    it("11. Deve responder sobre posição de saldo e fluxo de caixa de forma estruturada", () => {
      const res = buildFinancialSpecialistDeterministicResponse("Qual meu saldo atual?", mockFinancialData);
      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("financeiro");
      expect(res.answer).toContain("R$ 18450.25");
      expect(res.answer).toContain("R$ 68500.00");
      expect(res.answer).toContain("R$ 41200.00");
      expect(res.answer).toContain("R$ 27300.00");
    });

    it("12. Regra Estrita: Se saldo for 0, exibe 'R$ 0.00'; se for nulo/ausente, exibe 'Saldo não disponível' (nunca mascarar com || 0)", () => {
      // Caso 1: Saldo exatamente Zero
      const zeroBalanceRes = buildFinancialSpecialistDeterministicResponse("Qual meu saldo atual?", {
        saldoTotal: 0,
        faturamentoMes: 0,
        despesasMes: 0,
        resultadoOperacionalMes: 0,
      });
      expect(zeroBalanceRes.answer).toContain("R$ 0.00");
      expect(zeroBalanceRes.answer).not.toContain("Saldo não disponível");

      // Caso 2: Saldo Nulo / Indisponível
      const nullBalanceRes = buildFinancialSpecialistDeterministicResponse("Qual meu saldo atual?", {
        saldoTotal: null,
      });
      expect(nullBalanceRes.answer).toContain("Saldo não disponível");
      expect(nullBalanceRes.answer).not.toContain("R$ 0.00");
    });
  });

  describe("Gate 1: Integração com Repositório Financeiro Real (fetchAndExecuteFinancialSpecialist)", () => {
    const mockContext: AiExecutionContext = {
      userId: "user-123",
      workspaceId: "ws-test",
      role: "owner",
      isOwner: true,
    };

    const mockRepo: FinancialQueryRepository = {
      listSalesPDV: vi.fn().mockResolvedValue([
        { id: "sale-1", amount: 120.0, description: "Venda Eyemobile #1", occurredOn: "2026-11-10" },
        { id: "sale-2", amount: 80.0, description: "Venda Eyemobile #2", occurredOn: "2026-11-10" },
        { id: "sale-3", amount: 50.0, description: "Venda Eyemobile Cancelada", occurredOn: "2026-11-10" }, // Cancelada!
      ]),
      listRevenues: vi.fn().mockResolvedValue([
        { id: "rev-1", amount: 5000.0, description: "Receita Pix", occurredOn: "2026-11-01" },
      ]),
      listExpenses: vi.fn().mockResolvedValue([
        { id: "exp-1", amount: 2000.0, description: "Aluguel Pago", occurredOn: "2026-11-05" },
      ]),
      listBalances: vi.fn().mockResolvedValue([
        { accountId: "acc-1", name: "Itaú Corrente", amount: 15400.0, type: "checking" },
        { accountId: "acc-2", name: "Caixa Físico", amount: 600.0, type: "cash" },
      ]),
      listDebts: vi.fn().mockResolvedValue([
        {
          id: "debt-1",
          description: "Fornecedor Carnes",
          originalAmount: 1500.0,
          paidAmount: 500.0,
          dueOn: "2026-11-12",
          status: "pendente",
        },
        {
          id: "debt-2",
          description: "Conta Vencida Energia",
          originalAmount: 400.0,
          paidAmount: 0.0,
          dueOn: "2026-11-05",
          status: "pendente",
        },
        {
          id: "debt-3",
          description: "Conta Já Liquidada",
          originalAmount: 800.0,
          paidAmount: 800.0,
          dueOn: "2026-11-08",
          status: "paga",
        },
      ]),
    };

    it("13. Deve consultar listSalesPDV e desconsiderar vendas canceladas para apurar faturamento de ontem", async () => {
      const fixedDate = new Date("2026-11-11T12:00:00Z");
      const res = await fetchAndExecuteFinancialSpecialist("Quanto faturei ontem?", mockContext, mockRepo, fixedDate);

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("financeiro");
      // Venda 1 (120) + Venda 2 (80) = 200. Venda 3 (50 cancelada) deve ser ignorada!
      expect(res.answer).toContain("R$ 200.00");
      expect(res.answer).toContain("2"); // 2 pedidos válidos
      expect(res.answer).toContain("R$ 100.00"); // Ticket médio 200 / 2
    });

    it("14. Deve consultar listDebts e apresentar apenas contas pendentes (ignorando liquidadas)", async () => {
      const fixedDate = new Date("2026-11-11T12:00:00Z");
      const res = await fetchAndExecuteFinancialSpecialist("Quais contas vencem nesta semana?", mockContext, mockRepo, fixedDate);

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Fornecedor Carnes");
      expect(res.answer).toContain("R$ 1000.00"); // 1500 - 500 restante
      expect(res.answer).toContain("Conta Vencida Energia");
      expect(res.answer).not.toContain("Conta Já Liquidada"); // Não deve apresentar liquidada como pendente
    });

    it("15. Deve consolidar saldo bancário e caixa físico em tempo real", async () => {
      const fixedDate = new Date("2026-11-11T12:00:00Z");
      const res = await fetchAndExecuteFinancialSpecialist("Qual meu saldo atual?", mockContext, mockRepo, fixedDate);

      expect(res.handled).toBe(true);
      // 15400 + 600 = 16000.00
      expect(res.answer).toContain("R$ 16000.00");
      expect(res.answer).toContain("R$ 5000.00"); // Faturamento mês
      expect(res.answer).toContain("R$ 2000.00"); // Despesas mês
      expect(res.answer).toContain("R$ 3000.00"); // Resultado operacional
    });
  });

  describe("Gate 0 & 10: Fluxo E2E no Wallet AI Orchestrator (handleOrchestratorHttpRequest)", () => {
    const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

    const createMockAuthDeps = (role: "owner" | "admin" | "member"): AuthorizationDependencies => ({
      getUser: vi.fn().mockResolvedValue({
        id: role === "owner" ? "user-owner" : `user-${role}`,
        email: `${role}@empresa.com`,
      }),
      findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-owner" }),
      verifyConversationOwnership: vi.fn().mockResolvedValue(true),
      getUserRole: vi.fn().mockResolvedValue(role),
    });

    const createMockRepo = (): FinancialQueryRepository => ({
      listSalesPDV: vi.fn().mockResolvedValue([
        { id: "sale-1", amount: 1500.0, description: "Venda PDV", occurredOn: "2026-11-10" },
      ]),
      listRevenues: vi.fn().mockResolvedValue([]),
      listExpenses: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([{ accountId: "a1", name: "Banco", amount: 5000, type: "c" }]),
      listDebts: vi.fn().mockResolvedValue([]),
    });

    const createMockRunner = (messagesCapture: LlmMessage[]): LlmRunner => ({
      generateCompletion: vi.fn().mockImplementation(async (msgs: LlmMessage[]) => {
        messagesCapture.push(...msgs);
        return {
          message: {
            role: "assistant",
            content: "Diagnóstico executivo multidepartamental concluído pelo Wallet CEO.",
          },
          toolCalls: [],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };
      }),
    });

    it("16. Membro comum (member) tentando acionar o Agente Financeiro deve receber 403 Forbidden com mensagem clara", async () => {
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quanto faturei ontem?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => createMockRepo(),
        runnerFactory: () => createMockRunner([]),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { success: boolean; message: string; code: string };
      expect(data.success).toBe(false);
      expect(data.code).toBe("WALLET_AI_FORBIDDEN");
      expect(data.message).toContain("Agente Financeiro");
      expect(data.message).toContain("exige permissão de admin");
    });

    it("17. Membro comum (member) tentando acionar o Agente de RH deve receber 403 Forbidden", async () => {
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Como está a escala de equipe para o fim de semana?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => createMockRepo(),
        runnerFactory: () => createMockRunner([]),
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as { success: boolean; message: string; code: string };
      expect(data.success).toBe(false);
      expect(data.code).toBe("WALLET_AI_FORBIDDEN");
      expect(data.message).toContain("Agente de Pessoal e RH");
    });

    it("18. Proprietário (owner) perguntando 'Quanto faturei ontem?' deve receber resposta determinística instantânea com 0 custo de IA", async () => {
      const runnerCapture: LlmMessage[] = [];
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quanto faturei ontem?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => createMockRepo(),
        runnerFactory: () => createMockRunner(runnerCapture),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        success: boolean;
        specialist: string;
        model: string;
        estimatedCostUsd: number;
        text: string;
      };
      expect(data.success).toBe(true);
      expect(data.specialist).toBe("financeiro");
      expect(data.model).toBe("deterministic");
      expect(data.estimatedCostUsd).toBe(0);
      expect(data.text).toContain("Agente Financeiro — Faturamento de Ontem");
      expect(runnerCapture).toHaveLength(0); // Zero gasto de tokens de LLM!
    });

    it("19. Coordenação multiespecialista executiva: pergunta de diagnóstico aciona o Wallet CEO coordenando Vendas, Estoque e Financeiro", async () => {
      const runnerCapture: LlmMessage[] = [];
      const req = new Request("https://edge.test/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          agent_type: "ceo",
          messages: [{ role: "user", content: "Por que estou faturando mais, mas meu lucro diminuiu?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => createMockRepo(),
        runnerFactory: () => createMockRunner(runnerCapture),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        success: boolean;
        specialist: string;
        coordinating_ceo: boolean;
      };
      expect(data.success).toBe(true);
      expect(data.specialist).toBe("financeiro");
      expect(data.coordinating_ceo).toBe(true);
      // Deve ter injetado no system prompt a instrução de coordenação executiva multidepartamental
      expect(runnerCapture[0]?.content).toContain("COORDENAÇÃO EXECUTIVA WALLET CEO: MULTIDEPARTAMENTAL");
    });
  });
});
