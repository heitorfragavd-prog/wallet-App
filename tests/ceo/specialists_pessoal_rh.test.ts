import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  buildRhSpecialistDeterministicResponse,
  fetchAndExecuteRhSpecialist,
  fetchAndExecuteSpecialistTurn,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type {
  FinancialQueryRepository,
  EmployeeRecord,
  EmployeeScheduleRecord,
  EmployeePaymentRecord,
} from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Entrega C: Agente 5 — Pessoal e RH (Gate 2 & Gate 5)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

  const ownerContext: AiExecutionContext = {
    userId: "user-owner-uuid",
    workspaceId: validWorkspaceId,
    role: "owner",
    isOwner: true,
  };

  const createMockAuthDeps = (role: "owner" | "admin" | "member" = "owner"): AuthorizationDependencies => ({
    getUser: vi.fn().mockResolvedValue({
      id: role === "owner" ? "user-owner" : `user-${role}`,
      email: `${role}@empresa.com`,
    }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-owner" }),
    verifyConversationOwnership: vi.fn().mockResolvedValue(true),
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const createMockRunner = (responseText = "Resposta do assistente"): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: responseText },
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  });

  const mockEmployees: EmployeeRecord[] = [
    {
      id: "emp-1",
      workspaceId: validWorkspaceId,
      nome: "Carlos Silva",
      cargo: "Garçom",
      status: "ativo",
      salarioBase: 1800,
      valeTransporte: 220,
      valeRefeicao: 350,
      telefone: "11999990001",
      createdAt: "2026-01-01T10:00:00Z",
    },
    {
      id: "emp-2",
      workspaceId: validWorkspaceId,
      nome: "Mariana Souza",
      cargo: "Cozinheira",
      status: "ativo",
      salarioBase: 2400,
      valeTransporte: 220,
      valeRefeicao: 350,
      telefone: "11999990002",
      createdAt: "2026-01-01T10:00:00Z",
    },
  ];

  const mockPayments: EmployeePaymentRecord[] = [
    {
      id: "pay-1",
      acertoId: "acerto-101",
      colaboradorId: "emp-1",
      valor: 450,
      status: "pago",
      origem: "Diária de fim de semana",
      paidAt: "2026-11-05T18:00:00Z",
      createdAt: "2026-11-05T10:00:00Z",
    },
    {
      id: "pay-2",
      acertoId: "acerto-102",
      colaboradorId: "emp-2",
      valor: 600,
      status: "pago",
      origem: "Plantão cozinha",
      paidAt: "2026-11-06T18:00:00Z",
      createdAt: "2026-11-06T10:00:00Z",
    },
    {
      id: "pay-3",
      acertoId: "acerto-103",
      colaboradorId: "emp-1",
      valor: 150,
      status: "pendente",
      origem: "Hora extra fechamento",
      paidAt: null,
      createdAt: "2026-11-10T10:00:00Z",
    },
  ];

  const mockSchedulesTomorrow: EmployeeScheduleRecord[] = [
    {
      id: "sch-1",
      colaboradorId: "emp-1",
      data: "2026-11-12",
      turno: "Noite (18h-02h)",
      valorDiaria: 150,
      status: "confirmada",
      observacao: "Salão principal",
      createdAt: "2026-11-10T10:00:00Z",
    },
    {
      id: "sch-2",
      colaboradorId: "emp-2",
      data: "2026-11-12",
      turno: "Noite (17h-01h)",
      valorDiaria: 180,
      status: "confirmada",
      observacao: "Parrilla e cozinha quente",
      createdAt: "2026-11-10T10:00:00Z",
    },
    {
      id: "sch-3",
      colaboradorId: "emp-3",
      data: "2026-11-12",
      turno: "Noite",
      valorDiaria: 120,
      status: "cancelada",
      observacao: "Atestado médico",
      createdAt: "2026-11-10T10:00:00Z",
    },
  ];

  const createMockRepo = (overrides?: Partial<FinancialQueryRepository>): FinancialQueryRepository => ({
    listRevenues: vi.fn().mockResolvedValue([]),
    listExpenses: vi.fn().mockResolvedValue([]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([]),
    listDebts: vi.fn().mockResolvedValue([]),
    listSalesPDV: vi.fn().mockResolvedValue([]),
    listInventoryItems: vi.fn().mockResolvedValue([]),
    listRecipeCards: vi.fn().mockResolvedValue([]),
    listSalesPdvDetails: vi.fn().mockResolvedValue([]),
    listEmployees: vi.fn().mockResolvedValue(mockEmployees),
    listEmployeeSchedules: vi.fn().mockResolvedValue(mockSchedulesTomorrow),
    listEmployeePayments: vi.fn().mockResolvedValue(mockPayments),
    ...overrides,
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ROTEAMENTO DO ESPECIALISTA DE RH
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Roteamento Inteligente e Determinístico de Pessoal e RH", () => {
    it("deve direcionar perguntas de pagamentos de colaboradores ao Agente de Pessoal e RH", () => {
      const plan = routeUserQueryToSpecialists("Quais funcionários receberam pagamento neste mês?");
      expect(plan.primarySpecialist).toBe("rh");
      expect(plan.isDeterministicPossible).toBe(true);
    });

    it("deve direcionar perguntas sobre pagamentos pendentes", () => {
      const plan = routeUserQueryToSpecialists("Quais pagamentos ainda estão pendentes?");
      expect(plan.primarySpecialist).toBe("rh");
      expect(plan.isDeterministicPossible).toBe(true);
    });

    it("deve direcionar perguntas de escala de equipe para amanhã", () => {
      const plan = routeUserQueryToSpecialists("Quem está escalado para amanhã?");
      expect(plan.primarySpecialist).toBe("rh");
      expect(plan.isDeterministicPossible).toBe(true);
    });

    it("deve direcionar perguntas sobre benefícios e vales", () => {
      const plan = routeUserQueryToSpecialists("Quanto já paguei de vale-transporte?");
      expect(plan.primarySpecialist).toBe("rh");
      expect(plan.isDeterministicPossible).toBe(true);
    });

    it("deve direcionar perguntas sobre pagamentos duplicados de colaboradores", () => {
      const plan = routeUserQueryToSpecialists("Existem pagamentos duplicados de funcionários?");
      expect(plan.primarySpecialist).toBe("rh");
      expect(plan.isDeterministicPossible).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SIGILO SALARIAL E AUTORIZAÇÃO SERVER-SIDE (Gate 2.2)
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Sigilo Salarial e Autorização Server-Side (Gate 2.2)", () => {
    it("deve permitir acesso ao Agente de RH apenas para admin e owner no registro", () => {
      const memberAuth = authorizeSpecialistAccess("rh", "member");
      expect(memberAuth.authorized).toBe(false);
      expect(memberAuth.reason).toContain("exige permissão de admin");

      const adminAuth = authorizeSpecialistAccess("rh", "admin");
      expect(adminAuth.authorized).toBe(true);

      const ownerAuth = authorizeSpecialistAccess("rh", "owner");
      expect(ownerAuth.authorized).toBe(true);
    });

    it("deve retornar mensagem estrita de restrição de sigilo salarial quando executado para member", () => {
      const resp = buildRhSpecialistDeterministicResponse("Quais funcionários receberam pagamento neste mês?", {
        isMemberRole: true,
      });

      expect(resp.handled).toBe(true);
      expect(resp.specialist).toBe("rh");
      expect(resp.answer).toContain("Acesso Restrito — Agente de Pessoal e RH");
      expect(resp.answer).toContain("folha de pagamento, remunerações, escalas detalhadas");
      expect(resp.answer).not.toContain("R$");
    });

    it("deve bloquear requisição HTTP de colaborador (member) ao agente de RH com 403 Forbidden", async () => {
      const authDeps = createMockAuthDeps("member");
      const repo = createMockRepo();
      const runner = createMockRunner();

      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quais funcionários receberam pagamento neste mês?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps,
        repoFactory: () => repo,
        runnerFactory: () => runner,
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("forbidden_specialist_access");
      expect(json.message).toContain("exige permissão de admin");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. RESPOSTAS DETERMINÍSTICAS AUDITADAS (Gate 2.1 & 2.3)
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Respostas Determinísticas Auditadas de Pessoal e RH", () => {
    const fixedNow = new Date("2026-11-11T12:00:00Z");

    it("deve listar pagamentos liquidados no mês com soma total e detalhes", async () => {
      const repo = createMockRepo();
      const res = await fetchAndExecuteRhSpecialist(
        "Quais funcionários receberam pagamento neste mês?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("rh");
      expect(res.answer).toContain("Pagamentos Realizados no Mês (2)");
      expect(res.answer).toContain("R$ 1050.00"); // 450 + 600
      expect(res.answer).toContain("R$ 450.00");
      expect(res.answer).toContain("R$ 600.00");
    });

    it("deve listar pagamentos pendentes com alerta de total a regularizar", async () => {
      const repo = createMockRepo();
      const res = await fetchAndExecuteRhSpecialist(
        "Quais pagamentos ainda estão pendentes?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("rh");
      expect(res.answer).toContain("Pagamentos de Equipe Pendentes (1)");
      expect(res.answer).toContain("Total a Regularizar:* R$ 150.00");
      expect(res.answer).toContain("Hora extra fechamento");
    });

    it("deve retornar confirmação positiva quando não houver pagamentos pendentes", async () => {
      const repo = createMockRepo({
        listEmployeePayments: vi.fn().mockResolvedValue([
          {
            id: "pay-1",
            acertoId: "acerto-1",
            colaboradorId: "emp-1",
            valor: 500,
            status: "pago",
            origem: "Diária",
            paidAt: "2026-11-05T10:00:00Z",
            createdAt: "2026-11-05T10:00:00Z",
          },
        ]),
      });

      const res = await fetchAndExecuteRhSpecialist(
        "Quais pagamentos ainda estão pendentes?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Não constam pagamentos de equipe pendentes de quitação no momento");
    });

    it("deve listar colaboradores escalados para amanhã filtrando escalas canceladas", async () => {
      const repo = createMockRepo();
      const res = await fetchAndExecuteRhSpecialist(
        "Quem está escalado para amanhã?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("rh");
      expect(res.answer).toContain("Escala de Trabalho de Amanhã (2 colaboradores)");
      expect(res.answer).toContain("Carlos Silva");
      expect(res.answer).toContain("Mariana Souza");
      expect(res.answer).not.toContain("Atestado médico"); // A escala cancelada foi filtrada
    });

    it("deve consolidar o total de vales (transporte e alimentação/refeição)", async () => {
      const repo = createMockRepo();
      const res = await fetchAndExecuteRhSpecialist(
        "Quanto já paguei de vale-transporte e alimentação?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Provisão Mensal de Vales da Equipe");
      expect(res.answer).toContain("Vale-Transporte:* R$ 440.00"); // 220 + 220
      expect(res.answer).toContain("Vale-Alimentação / Refeição:* R$ 700.00"); // 350 + 350
      expect(res.answer).toContain("Total Consolidado de Vales:* R$ 1140.00");
    });

    it("deve detectar e auditar pagamentos duplicados no período", async () => {
      const repo = createMockRepo({
        listEmployeePayments: vi.fn().mockResolvedValue([
          {
            id: "pay-1",
            acertoId: "acerto-dup",
            colaboradorId: "emp-1",
            valor: 300,
            status: "pago",
            origem: "Diária Extra",
            paidAt: "2026-11-08T10:00:00Z",
            createdAt: "2026-11-08T10:00:00Z",
          },
          {
            id: "pay-2",
            acertoId: "acerto-dup",
            colaboradorId: "emp-1",
            valor: 300,
            status: "pago",
            origem: "Diária Extra",
            paidAt: "2026-11-08T10:05:00Z",
            createdAt: "2026-11-08T10:05:00Z",
          },
        ]),
      });

      const res = await fetchAndExecuteRhSpecialist(
        "Existem pagamentos duplicados de colaboradores?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Possíveis Duplicidades Detectadas (1)");
      expect(res.answer).toContain("2 lançamentos de R$ 300.00");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. INTEGRAÇÃO NO FLUXO HTTP E CARÁTER CONSULTIVO (Gate 2 & Gate 5)
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Integração HTTP e Garantia de Caráter Consultivo", () => {
    it("deve responder requisição do proprietário com sucesso (200 OK) e canMutateState: false", async () => {
      const authDeps = createMockAuthDeps("owner");
      const repo = createMockRepo();
      const runner = createMockRunner();

      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quem está escalado para amanhã?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps,
        repoFactory: () => repo,
        runnerFactory: () => runner,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.specialist).toBe("rh");
      expect(json.department).toBe(SPECIALIST_AGENTS_REGISTRY.rh.department);
      expect(json.text).toContain("Carlos Silva");
      expect(SPECIALIST_AGENTS_REGISTRY.rh.canMutateState).toBe(false);
    });

    it("deve ser executado via fetchAndExecuteSpecialistTurn com roteamento rh", async () => {
      const repo = createMockRepo();
      const turnRes = await fetchAndExecuteSpecialistTurn(
        "Quais funcionários receberam pagamento neste mês?",
        ownerContext,
        repo
      );

      expect(turnRes.handled).toBe(true);
      expect(turnRes.specialist).toBe("rh");
      expect(turnRes.department).toBe("Recursos Humanos & Equipe");
      expect(turnRes.answer).toContain("Total Liquidado:");
    });
  });
});
