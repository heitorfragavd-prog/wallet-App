import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
  type SpecialistAgentId,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  fetchAndExecuteSpecialistTurn,
  getSaoPauloDateStrings,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — PR D: Homologação Integrada dos 5 Especialistas Reais (Gates 3, 4, 5 e 7)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

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

  const createMockAuthDeps = (role: "owner" | "admin" | "member" = "owner"): AuthorizationDependencies => ({
    getUser: vi.fn().mockResolvedValue({
      id: role === "owner" ? "user-owner" : `user-${role}`,
      email: `${role}@empresa.com`,
    }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-owner" }),
    verifyConversationOwnership: vi.fn().mockResolvedValue(true),
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const createMockRunner = (responseText = "Diagnóstico Executivo Coordenado"): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: responseText },
      usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
    }),
  });

  const createIntegratedRepo = (): FinancialQueryRepository => {
    const { yesterdayStr, todayStr, tomorrowStr } = getSaoPauloDateStrings();
    return {
      listRevenues: vi.fn().mockResolvedValue([
        {
          id: "rev-1",
          sourceType: "receita",
          sourceId: "rev-1",
          workspaceId: validWorkspaceId,
          userId: "user-owner-uuid",
          kind: "income",
          amount: 3500,
          occurredOn: yesterdayStr,
          deduplicationKey: "receita:rev-1",
          description: "Receita Cartão/Pix",
          status: "recebido",
        },
      ]),
      listExpenses: vi.fn().mockResolvedValue([
        {
          id: "exp-1",
          sourceType: "despesa",
          sourceId: "exp-1",
          workspaceId: validWorkspaceId,
          userId: "user-owner-uuid",
          kind: "expense",
          amount: 420,
          occurredOn: tomorrowStr,
          deduplicationKey: "despesa:exp-1",
          description: "Energia Elétrica CEMIG",
          status: "pendente",
        },
      ]),
      listTransactions: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([
        {
          accountId: "acc-1",
          name: "Conta Principal Itaú",
          type: "conta_corrente",
          amount: 18500.5,
        },
      ]),
      listDebts: vi.fn().mockResolvedValue([]),
      listSalesPDV: vi.fn().mockResolvedValue([
        {
          id: "pdv-1",
          sourceType: "transacao",
          sourceId: "pdv-1",
          workspaceId: validWorkspaceId,
          userId: "user-owner-uuid",
          kind: "income",
          amount: 4200,
          occurredOn: yesterdayStr,
          deduplicationKey: "transacao:pdv-1",
          description: "Venda Eyemobile #901",
          status: "confirmado",
        },
      ]),
      listFiscalNotes: vi.fn().mockResolvedValue([
        {
          id: "nf-1",
          workspaceId: validWorkspaceId,
          numeroNf: "001234",
          serieNf: "1",
          fornecedor: "Laticínios Minas Ltda",
          cnpjFornecedor: "12345678000199",
          valorTotal: 890,
          valorIcms: 100,
          valorProdutos: 790,
          dataEmissao: yesterdayStr,
          dataEntrada: yesterdayStr,
          chaveAcesso: "31261112345678000199550010000012341000000010",
          status: "processada",
          origem: "sefaz",
          createdAt: `${yesterdayStr}T10:00:00Z`,
        },
      ]),
      listSefazDocuments: vi.fn().mockResolvedValue([]),
      listDocumentSessions: vi.fn().mockResolvedValue([]),
      listSalesPdvDetails: vi.fn().mockResolvedValue([
        {
          id: "sale-901",
          workspaceId: validWorkspaceId,
          description: "Venda Eyemobile #901",
          amount: 85,
          date: yesterdayStr,
          paymentMethod: "Pix",
          createdAt: `${yesterdayStr}T12:15:00-03:00`,
          status: "confirmado",
          items: [
            { id: 1, productName: "Almoço Executivo", quantity: 2, price: 35, total: 70 },
            { id: 2, productName: "Suco Natural", quantity: 1, price: 15, total: 15 },
          ],
        },
      ]),
      listInventoryItems: vi.fn().mockResolvedValue([
        {
          id: "inv-1",
          workspaceId: validWorkspaceId,
          codigo: "BEB-01",
          descricao: "Leite Integral 1L",
          categoria: "Laticínios",
          precoVenda: 0,
          custoAtual: 5.5,
          estoqueAtual: 2,
          estoqueMinimo: 12,
          estoqueIdeal: 36,
          unidadeMedida: "UN",
          multiploCompra: 12,
          fornecedorPadrao: "Distribuidora Láctea",
          margemRealPercentual: 0,
          ativo: true,
        },
      ]),
      listRecipeCards: vi.fn().mockResolvedValue([]),
      listSuppliers: vi.fn().mockResolvedValue([]),
      listEmployees: vi.fn().mockResolvedValue([
        {
          id: "emp-1",
          workspaceId: validWorkspaceId,
          nome: "Ana Paula",
          cargo: "Atendente",
          status: "ativo",
          salarioBase: 1900,
          valeTransporte: 200,
          valeRefeicao: 300,
          telefone: "31999991111",
          createdAt: `${todayStr}T10:00:00Z`,
        },
      ]),
      listEmployeeSchedules: vi.fn().mockResolvedValue([
        {
          id: "sch-1",
          colaboradorId: "emp-1",
          data: tomorrowStr,
          turno: "Manhã (08h-16h)",
          valorDiaria: 140,
          status: "confirmada",
          observacao: "Abertura de salão",
          createdAt: `${todayStr}T10:00:00Z`,
        },
      ]),
      listEmployeePayments: vi.fn().mockResolvedValue([
        {
          id: "pay-1",
          acertoId: "acerto-900",
          colaboradorId: "emp-1",
          valor: 560,
          status: "pago",
          origem: "Acerto Semanal",
          paidAt: `${yesterdayStr}T17:00:00Z`,
          createdAt: `${yesterdayStr}T12:00:00Z`,
        },
      ]),
    };
  };

  describe("1. Funcionamento Determinístico dos 5 Especialistas em Sequência (Proprietário)", () => {
    it("deve responder ponta-a-ponta pelos 5 especialistas integrados via HTTP 200 OK", async () => {
      const repo = createIntegratedRepo();
      const authDeps = createMockAuthDeps("owner");
      const runner = createMockRunner();

      const cases: Array<{
        specialist: SpecialistAgentId;
        prompt: string;
        expectedSubstring: string;
      }> = [
        {
          specialist: "financeiro",
          prompt: "Qual é o meu saldo atual?",
          expectedSubstring: "R$ 18500.50",
        },
        {
          specialist: "fiscal",
          prompt: "Quantas notas fiscais recebemos neste mês?",
          expectedSubstring: "Laticínios Minas Ltda",
        },
        {
          specialist: "vendas_pdv",
          prompt: "Quais foram os 5 produtos mais vendidos ontem?",
          expectedSubstring: "Almoço Executivo",
        },
        {
          specialist: "estoque",
          prompt: "Quais produtos estão acabando?",
          expectedSubstring: "Leite Integral 1L",
        },
        {
          specialist: "rh",
          prompt: "Quem está escalado para amanhã?",
          expectedSubstring: "Ana Paula",
        },
      ];

      for (const testCase of cases) {
        const req = new Request("http://localhost/wallet-ai-orchestrator", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer token-owner",
          },
          body: JSON.stringify({
            workspace_id: validWorkspaceId,
            messages: [{ role: "user", content: testCase.prompt }],
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
        expect(json.specialist).toBe(testCase.specialist);
        expect(json.model).toBe("deterministic");
        expect(json.text).toContain(testCase.expectedSubstring);
      }
    });
  });

  describe("2. Matriz Completa de RBAC, Sigilo e Proteção Server-Side (Gate 3)", () => {
    it("deve aplicar estritamente o controle de acesso por papel em todos os 7 especialistas", () => {
      // Colaborador comum (member) pode consultar apenas operacionais e vendas_pdv (sem financeiro/custo) ou estoque (sem custo)
      expect(authorizeSpecialistAccess("operacoes", "member").authorized).toBe(true);
      expect(authorizeSpecialistAccess("vendas_pdv", "member").authorized).toBe(true);
      expect(authorizeSpecialistAccess("estoque", "member").authorized).toBe(true);

      // Bloqueados para colaborador comum (member)
      expect(authorizeSpecialistAccess("financeiro", "member").authorized).toBe(false);
      expect(authorizeSpecialistAccess("fiscal", "member").authorized).toBe(false);
      expect(authorizeSpecialistAccess("rh", "member").authorized).toBe(false);
      expect(authorizeSpecialistAccess("inteligencia_competitiva", "member").authorized).toBe(false);

      // Administrador (admin) acessa departamentos operacionais/gerenciais, mas Inteligencia Competitiva é exclusiva do owner
      expect(authorizeSpecialistAccess("financeiro", "admin").authorized).toBe(true);
      expect(authorizeSpecialistAccess("fiscal", "admin").authorized).toBe(true);
      expect(authorizeSpecialistAccess("rh", "admin").authorized).toBe(true);
      expect(authorizeSpecialistAccess("inteligencia_competitiva", "admin").authorized).toBe(false);

      // Proprietário (owner) acessa todos os 7 especialistas
      const allIds: SpecialistAgentId[] = [
        "financeiro",
        "fiscal",
        "vendas_pdv",
        "estoque",
        "rh",
        "inteligencia_competitiva",
        "operacoes",
      ];
      allIds.forEach((id) => {
        expect(authorizeSpecialistAccess(id, "owner").authorized).toBe(true);
      });
    });

    it("deve impedir member de consultar estoque com maior custo ou financeiro e proteger dados de custo", async () => {
      const repo = createIntegratedRepo();

      // Member consultando estoque físico -> OK sem custo unitário
      const estoqueFisico = await fetchAndExecuteSpecialistTurn(
        "Quais produtos estão acabando?",
        memberContext,
        repo
      );
      expect(estoqueFisico.handled).toBe(true);
      expect(estoqueFisico.answer).toContain("Leite Integral 1L");

      // Member consultando maior custo em estoque -> bloqueado pela proteção de sigilo de custo
      const estoqueCusto = await fetchAndExecuteSpecialistTurn(
        "Quais produtos têm maior custo?",
        memberContext,
        repo
      );
      expect(estoqueCusto.handled).toBe(true);
      expect(estoqueCusto.answer).toContain("Acesso Restrito");

      // Member consultando RH via HTTP -> 403 Forbidden
      const reqRh = new Request("http://localhost/wallet-ai-orchestrator", {
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

      const resRh = await handleOrchestratorHttpRequest(reqRh, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => repo,
        runnerFactory: () => createMockRunner(),
      });
      expect(resRh.status).toBe(403);
    });
  });

  describe("3. Coordenação pelo Wallet CEO e Caráter Consultivo Estrito (Gate 5)", () => {
    it("deve ativar coordenação multidepartamental do Wallet CEO em consultas complexas", () => {
      const plan = routeUserQueryToSpecialists(
        "Estou faturando mais no PDV, mas meu lucro diminuiu neste mês. Por quê?"
      );
      expect(plan.coordinatingCeo).toBe(true);
      expect(plan.contributingSpecialists).toContain("vendas_pdv");
      expect(plan.contributingSpecialists).toContain("estoque");
      expect(plan.contributingSpecialists).toContain("financeiro");
      expect(plan.complexityLevel).toBe(3);
    });

    it("deve garantir que todos os 7 especialistas mantêm canMutateState: false", () => {
      Object.values(SPECIALIST_AGENTS_REGISTRY).forEach((spec) => {
        expect(spec.canMutateState).toBe(false);
        expect(spec.allowedTools.every((t) => !t.startsWith("criar_") && !t.startsWith("deletar_"))).toBe(true);
      });
    });

    it("deve permitir fallback elegante para LLM quando consulta não for determinística (owner)", async () => {
      const repo = createIntegratedRepo();
      const res = await fetchAndExecuteSpecialistTurn(
        "Quero um diagnóstico completo entre vendas, CMV e despesas.",
        ownerContext,
        repo
      );
      expect(res.routingPlan.coordinatingCeo).toBe(true);
      expect(res.handled).toBe(false); // Passa para o orquestrador LLM coordenado
    });
  });
});
