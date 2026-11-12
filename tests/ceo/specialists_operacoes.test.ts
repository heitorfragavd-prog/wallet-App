import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  fetchAndExecuteOperationsSpecialist,
  fetchAndExecuteSpecialistTurn,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { createFinancialRepository } from "../../supabase/functions/_shared/ai/financial-repository";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Entrega D — PR C: Agente 7 — Operações e Processos (Gate 2)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const fixedNow = new Date("2026-11-11T15:00:00Z");

  const ownerContext: AiExecutionContext = {
    userId: "user-owner-uuid",
    workspaceId: validWorkspaceId,
    role: "owner",
    isOwner: true,
  };

  const memberContext: AiExecutionContext = {
    userId: "user-member-uuid",
    workspaceId: validWorkspaceId,
    role: "member",
    isOwner: false,
  };

  const createMockAuthDeps = (role: "owner" | "admin" | "member" = "member"): AuthorizationDependencies => ({
    getUser: vi.fn().mockResolvedValue({
      id: role === "owner" ? "user-owner-uuid" : "user-member-uuid",
      email: `${role}@empresa.com`,
    }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-owner-uuid" }),
    verifyConversationOwnership: vi.fn().mockResolvedValue(true),
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const createMockRunner = (): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "Bom dia! Como posso ajudar nas rotinas de hoje?" },
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  });

  function createPopulatedRepo(overrides: Partial<FinancialQueryRepository> = {}): FinancialQueryRepository {
    return {
      listRevenues: vi.fn().mockResolvedValue([]),
      listExpenses: vi.fn().mockResolvedValue([
        {
          id: "exp-sangria-1",
          sourceType: "despesa",
          sourceId: "exp-sangria-1",
          workspaceId: validWorkspaceId,
          userId: "user-owner-uuid",
          kind: "expense",
          amount: 120.0,
          occurredOn: "2026-11-11",
          deduplicationKey: "despesa:exp-sangria-1",
          description: "Sangria Caixa 1 — Depósito cofre",
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([]),
      listDebts: vi.fn().mockResolvedValue([]),
      listSalesPDV: vi.fn().mockResolvedValue([]),
      listSalesPdvDetails: vi.fn().mockResolvedValue([
        {
          id: "sale-ok",
          workspaceId: validWorkspaceId,
          description: "Pedido #201",
          amount: 85.0,
          date: "2026-11-11",
          paymentMethod: "pix",
          items: [],
          createdAt: "2026-11-11T10:00:00Z",
          status: "concluida",
        },
        {
          id: "sale-canc",
          workspaceId: validWorkspaceId,
          description: "Pedido #202 (Erro digitação)",
          amount: 42.5,
          date: "2026-11-11",
          paymentMethod: "dinheiro",
          items: [],
          createdAt: "2026-11-11T11:30:00Z",
          status: "cancelada",
        },
      ]),
      listEmployees: vi.fn().mockResolvedValue([
        {
          id: "emp-1",
          workspaceId: validWorkspaceId,
          nome: "Carlos Silva",
          cargo: "Operador de Caixa",
          tipo: "clt",
          status: "ativo",
          salarioBruto: 2100,
          valeTransporte: 200,
          valeRefeicao: 300,
          diaPagamento: 5,
          valorDiaria: 160,
          dataAdmissao: "2026-01-10",
        },
        {
          id: "emp-2",
          workspaceId: validWorkspaceId,
          nome: "Mariana Souza",
          cargo: "Atendente",
          tipo: "clt",
          status: "ativo",
          salarioBruto: 1950,
          valeTransporte: 200,
          valeRefeicao: 300,
          diaPagamento: 5,
          valorDiaria: 150,
          dataAdmissao: "2026-02-01",
        },
      ]),
      listEmployeeSchedules: vi.fn().mockResolvedValue([
        {
          id: "esc-1",
          workspaceId: validWorkspaceId,
          colaboradorId: "emp-1",
          data: "2026-11-11",
          turno: "Manhã (06:00-14:00)",
          valorDiaria: 160,
          valorTotal: 160,
          status: "agendado",
          observacao: "Abertura de caixa",
        },
        {
          id: "esc-cancel",
          workspaceId: validWorkspaceId,
          colaboradorId: "emp-2",
          data: "2026-11-11",
          turno: "Tarde",
          valorDiaria: 150,
          valorTotal: 150,
          status: "cancelada",
          observacao: "Folga ajustada",
        },
      ]),
      listCashClosings: vi.fn().mockResolvedValue([
        {
          id: "fc-1",
          workspaceId: validWorkspaceId,
          dataFechamento: "10/11/2026",
          status: "divergencia",
          sobra: 15.0,
          totalInformado: { dinheiro: 215, pix: 400, debito: 300 },
          eyemobileTotal: { dinheiro: 200, pix: 400, debito: 300 },
          envelopeTotal: { dinheiro: 215, pix: 400, debito: 300 },
          observacao: "Envelope com troco extra",
          createdAt: "2026-11-10T22:00:00Z",
        },
      ]),
      listOperationalReminders: vi.fn().mockResolvedValue([
        {
          id: "lem-1",
          userId: "user-owner-uuid",
          workspaceId: null,
          sourceTable: "lembretes",
          titulo: "Conferir temperatura da câmara fria",
          descricao: "Checklist abertura",
          data: "2026-11-11",
          hora: "08:00",
          tipo: "operacional",
          status: "pendente",
          local: null,
          createdAt: "2026-11-11T06:00:00Z",
        },
        {
          id: "comp-1",
          userId: "user-owner-uuid",
          workspaceId: validWorkspaceId,
          sourceTable: "compromissos",
          titulo: "Reunião rápida de passagem de turno",
          descricao: null,
          data: "2026-11-10",
          hora: "14:00",
          tipo: "compromisso",
          status: "agendado",
          local: "Loja",
          createdAt: "2026-11-09T10:00:00Z",
        },
      ]),
      ...overrides,
    };
  }

  describe("1. Contrato, Roteamento Seguro e Fallback de Saudações", () => {
    it("exige requiredRole: member e canMutateState: false", () => {
      const cfg = SPECIALIST_AGENTS_REGISTRY.operacoes;
      expect(cfg.requiredRole).toBe("member");
      expect(cfg.canMutateState).toBe(false);
      expect(authorizeSpecialistAccess("operacoes", "member").authorized).toBe(true);
    });

    it("roteia consultas operacionais determinísticas para operacoes e mantém saudação trivial em LLM fallback", () => {
      const opPrompts = [
        "Como foi o fechamento de caixa de ontem?",
        "Houve diferença ou furo no caixa?",
        "Quem está de turno hoje?",
        "Houve cancelamentos ou sangrias relevantes?",
        "Quais rotinas ou pendências operacionais temos hoje?",
      ];

      opPrompts.forEach((p) => {
        const plan = routeUserQueryToSpecialists(p);
        expect(plan.primarySpecialist).toBe("operacoes");
        expect(plan.isDeterministicPossible).toBe(true);
      });

      const greetingPlan = routeUserQueryToSpecialists("Bom dia!");
      expect(greetingPlan.primarySpecialist).toBe("operacoes");
      expect(greetingPlan.isDeterministicPossible).toBe(false);
    });
  });

  describe("2. Consultas Reais de Operações e Postura Neutra", () => {
    it("audita fechamento de caixa com detalhamento por meio de pagamento e sobra registrada", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteSpecialistTurn(
        "Como foi o fechamento de caixa de ontem?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("operacoes");
      expect(res.answer).toContain("Conferência de Fechamento de Caixa");
      expect(res.answer).toContain("Total Informado / Envelope:* R$ 915.00");
      expect(res.answer).toContain("Total Sistema (PDV Eyemobile):* R$ 900.00");
      expect(res.answer).toContain("dinheiro: Informado R$ 215.00 vs Sistema R$ 200.00");
      expect(res.answer).toContain("canMutateState: false");
    });

    it("reporta cancelamentos e sangrias de forma objetiva e sem linguagem acusatória", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteOperationsSpecialist(
        "Houve cancelamentos ou sangrias relevantes?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Vendas/Pedidos Cancelados no Período:* 1 (Valor cancelado: R$ 42.50)");
      expect(res.answer).toContain("Registros de Sangria / Retirada de Numerário:* 1 (Total: R$ 120.00)");
      expect(res.answer).not.toMatch(/fraude|roubo|desvio|culpa/i);
    });

    it("separa rotinas/lembretes e compromissos entre atrasados e programados para hoje", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteOperationsSpecialist(
        "Quais rotinas ou pendências operacionais temos hoje?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Em Atraso (1)");
      expect(res.answer).toContain("Reunião rápida de passagem de turno");
      expect(res.answer).toContain("Programadas para Hoje (1)");
      expect(res.answer).toContain("Conferir temperatura da câmara fria");
    });
  });

  describe("3. Segurança (Member vs Owner), Escopo de Repositório e HTTP E2E", () => {
    it("lista quem está de turno para colaborador (member) sem vazar salários ou diárias", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteOperationsSpecialist(
        "Quem está de turno hoje?",
        memberContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("*Carlos Silva* (Operador de Caixa)");
      expect(res.answer).toContain("Manhã (06:00-14:00)");
      expect(res.answer).not.toContain("Mariana Souza"); // escala cancelada filtrada
      expect(res.answer).not.toContain("160.00"); // sigilo de diária/remuneração
      expect(res.answer).toContain("sigilo para perfis operacionais");
    });

    it("repositório real analisa datas DD/MM/YYYY em fechamentos_caixa e isola lembretes/compromissos", async () => {
      const repo = createFinancialRepository(async ({ table }) => {
        if (table === "fechamentos_caixa") {
          return [
            {
              id: "fc-br",
              workspace_id: validWorkspaceId,
              data_fechamento: "10/11/2026",
              status: "conferido",
              sobra: 0,
              total: { pix: 100 },
              eyemobile_total: { pix: 100 },
              envelope_total: { pix: 100 },
              observacao: null,
              created_at: "2026-11-10T23:00:00Z",
            },
          ];
        }
        if (table === "lembretes") {
          return [
            {
              id: "lem-db",
              user_id: "user-owner-uuid",
              titulo: "Limpar máquina café",
              descricao: null,
              data: "2026-11-11",
              hora: "07:30",
              tipo: "checklist",
              status: "pendente",
              created_at: "2026-11-11T07:00:00Z",
            },
          ];
        }
        return [];
      });

      const closings = await repo.listCashClosings!(ownerContext, { start: "2026-11-09", end: "2026-11-11" });
      const reminders = await repo.listOperationalReminders!(ownerContext, { start: "2026-11-09", end: "2026-11-12" });
      expect(closings).toHaveLength(1);
      expect(closings[0].dataFechamento).toBe("10/11/2026");
      expect(reminders).toHaveLength(1);
      expect(reminders[0].titulo).toBe("Limpar máquina café");
    });

    it("integração HTTP permite consulta operacional por colaborador (200 OK) com sigilo financeiro", async () => {
      const repo = createPopulatedRepo();
      const runner = createMockRunner();

      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quem está de turno hoje?" }],
        }),
      });

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => repo,
        runner,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.specialist).toBe("operacoes");
      expect(json.text).toContain("Equipe Escalada no Turno de Hoje");
      expect(json.text).not.toContain("160.00");
      expect(runner.generateCompletion).not.toHaveBeenCalled();
    });
  });
});
