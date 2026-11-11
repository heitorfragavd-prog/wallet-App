import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  fetchAndExecuteCompetitiveIntelligenceSpecialist,
  fetchAndExecuteSpecialistTurn,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { createFinancialRepository } from "../../supabase/functions/_shared/ai/financial-repository";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Entrega D — PR B: Agente 6 — Inteligência Competitiva (Gate 1)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const fixedNow = new Date("2026-11-11T15:00:00Z");

  const ownerContext: AiExecutionContext = {
    userId: "user-owner-uuid",
    workspaceId: validWorkspaceId,
    role: "owner",
    isOwner: true,
  };

  const createMockAuthDeps = (role: "owner" | "admin" | "member" = "owner"): AuthorizationDependencies => ({
    getUser: vi.fn().mockResolvedValue({
      id: role === "owner" ? "user-owner-uuid" : `user-${role}`,
      email: `${role}@empresa.com`,
    }),
    findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "user-owner-uuid" }),
    verifyConversationOwnership: vi.fn().mockResolvedValue(true),
    getUserRole: vi.fn().mockResolvedValue(role),
  });

  const createMockRunner = (): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "Síntese LLM fallback" },
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  });

  function createPopulatedRepo(overrides: Partial<FinancialQueryRepository> = {}): FinancialQueryRepository {
    return {
      listRevenues: vi.fn().mockResolvedValue([]),
      listExpenses: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([]),
      listDebts: vi.fn().mockResolvedValue([]),
      listSalesPDV: vi.fn().mockResolvedValue([]),
      listInventoryItems: vi.fn().mockResolvedValue([
        {
          id: "sku-1",
          workspaceId: validWorkspaceId,
          codigo: "ESP-1",
          descricao: "Café Expresso Especial",
          categoria: "Cafeteria",
          precoVenda: 10.0,
          custoAtual: 2.2,
          estoqueAtual: 120,
          estoqueMinimo: 20,
          estoqueIdeal: 100,
          unidadeMedida: "UN",
          multiploCompra: 10,
          fornecedorPadrao: "Torrefação Sul",
          margemRealPercentual: 78.0,
          ativo: true,
          estoqueInformado: true,
          custoInformado: true,
        },
        {
          id: "sku-2",
          workspaceId: validWorkspaceId,
          codigo: "SAL-1",
          descricao: "Salgado Assado Frango",
          categoria: "Lanches",
          precoVenda: 9.0,
          custoAtual: 7.2,
          estoqueAtual: 30,
          estoqueMinimo: 10,
          estoqueIdeal: 40,
          unidadeMedida: "UN",
          multiploCompra: 10,
          fornecedorPadrao: "Salgados Gerais",
          margemRealPercentual: 20.0,
          ativo: true,
          estoqueInformado: true,
          custoInformado: true,
        },
        {
          id: "sku-sem-custo",
          workspaceId: validWorkspaceId,
          codigo: "AGU-1",
          descricao: "Produto Sem Custo Cadastrado",
          categoria: "Diversos",
          precoVenda: 8.0,
          custoAtual: 0,
          estoqueAtual: 50,
          estoqueMinimo: 10,
          estoqueIdeal: 50,
          unidadeMedida: "UN",
          multiploCompra: 1,
          fornecedorPadrao: null,
          margemRealPercentual: 0,
          ativo: true,
          estoqueInformado: true,
          custoInformado: false,
        },
      ]),
      listRecipeCards: vi.fn().mockResolvedValue([]),
      listSalesPdvDetails: vi.fn().mockResolvedValue([
        {
          id: "sale-1",
          workspaceId: validWorkspaceId,
          description: "Pedido #1001",
          amount: 40.0,
          date: "2026-11-10",
          paymentMethod: "pix",
          items: [{ productName: "Café Expresso Especial", quantity: 2, unitPrice: 10, totalPrice: 20 }],
          createdAt: "2026-11-10T10:00:00Z",
          status: "concluida",
        },
        {
          id: "sale-2",
          workspaceId: validWorkspaceId,
          description: "Pedido #1002",
          amount: 20.0,
          date: "2026-11-11",
          paymentMethod: "credito",
          items: [{ productName: "Café Expresso Especial", quantity: 2, unitPrice: 10, totalPrice: 20 }],
          createdAt: "2026-11-11T10:00:00Z",
          status: "concluida",
        },
        {
          id: "sale-canceled",
          workspaceId: validWorkspaceId,
          description: "Pedido Cancelado",
          amount: 500.0,
          date: "2026-11-11",
          paymentMethod: "pix",
          items: [],
          createdAt: "2026-11-11T11:00:00Z",
          status: "cancelada",
        },
      ]),
      getDeliveryChannelsStatus: vi.fn().mockResolvedValue({
        canais: [
          {
            id: "direto",
            nome: "Direto / WhatsApp",
            status: "Ativo / Canal Próprio",
            comissaoContratual: "0% (Canal Próprio)",
            taxaPagamento: "Pix",
            recepcaoPedidos: "Ativa",
            corBadge: "emerald",
          },
        ],
      }),
      listGrowthOpportunities: vi.fn().mockResolvedValue([
        {
          id: "op-1",
          workspaceId: validWorkspaceId,
          department: "comercial",
          title: "Combo Café da Manhã Direto",
          problemDescription: "Ticket médio matinal concentrado em item unitário",
          hypothesis: "Combo bebida + pão de queijo aumenta ticket preservando margem",
          recommendedAction: "Destacar combo no balcão e canal Direto",
          estimatedFinancialImpact: 650,
          confidenceScore: 75,
          status: "identificada",
          evidenceData: null,
          limitationsNotes: "Estimativa interna aguardando teste de 7 dias",
          createdAt: "2026-11-10T12:00:00Z",
        },
      ]),
      listCommercialExperiments: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  describe("1. Contrato, Roteamento e Restrição Exclusiva Owner", () => {
    it("contrato exige requiredRole: owner e canMutateState: false", () => {
      const cfg = SPECIALIST_AGENTS_REGISTRY.inteligencia_competitiva;
      expect(cfg.requiredRole).toBe("owner");
      expect(cfg.canMutateState).toBe(false);
      expect(authorizeSpecialistAccess("inteligencia_competitiva", "owner").authorized).toBe(true);
      expect(authorizeSpecialistAccess("inteligencia_competitiva", "admin").authorized).toBe(false);
      expect(authorizeSpecialistAccess("inteligencia_competitiva", "member").authorized).toBe(false);
    });

    it("roteia as 6 consultas estratégicas/comerciais para inteligencia_competitiva", () => {
      const prompts = [
        "Quais oportunidades de crescimento temos no momento?",
        "Quais produtos têm melhor margem para destacar nas vendas?",
        "Vale a pena fazer promoção em algum item?",
        "Como aumentar vendas sem destruir margem?",
        "Qual experimento comercial podemos testar nesta semana?",
        "Como estamos comparados ao mercado / concorrentes?",
      ];

      prompts.forEach((p) => {
        const plan = routeUserQueryToSpecialists(p);
        expect(plan.primarySpecialist).toBe("inteligencia_competitiva");
        expect(plan.isDeterministicPossible).toBe(true);
      });
    });
  });

  describe("2. Execução das 6 Consultas sem Fabricação de Mercado", () => {
    it("responde oportunidades de crescimento reais preservando aviso consultivo", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteSpecialistTurn(
        "Quais oportunidades de crescimento temos no momento?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("inteligencia_competitiva");
      expect(res.answer).toContain("Combo Café da Manhã Direto");
      expect(res.answer).toContain("canMutateState: false");
    });

    it("ranqueia produtos com melhor margem omitindo itens sem custo cadastrado", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
        "Quais produtos têm melhor margem para destacar nas vendas?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Café Expresso Especial");
      expect(res.answer).toContain("78.0%");
      expect(res.answer).not.toContain("Produto Sem Custo Cadastrado*: Margem");
      expect(res.answer).toContain("1 SKU(s) ativo(s) foram omitidos do ranking por não terem custo unitário cadastrado");
    });

    it("avalia promoções protegendo itens de margem baixa", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
        "Vale a pena fazer promoção em algum item?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Café Expresso Especial");
      expect(res.answer).toContain("Itens Contraindicados para Promoção");
      expect(res.answer).toContain("Salgado Assado Frango (20.0%)");
      expect(res.answer).toContain("canMutateState: false");
    });

    it("estrutura experimento comercial completo com 8 campos e linha de base real sem incluir venda cancelada", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
        "Qual experimento comercial podemos testar nesta semana?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("1. Nome do Experimento:");
      expect(res.answer).toContain("3. Hipótese:");
      expect(res.answer).toContain("5. Linha de Base:");
      expect(res.answer).toContain("R$ 30.00"); // (40 + 20) / 2 = 30, excluiu R$ 500 cancelado
      expect(res.answer).toContain("7. Janela de Teste:");
      expect(res.answer).toContain("8. Critério de Decisão");
      expect(res.answer).toContain("canMutateState: false");
    });

    it("expõe claramente limitação de fontes externas ao comparar com mercado/concorrentes", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
        "Como estamos comparados ao mercado e concorrentes?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Limitação de Fonte Externa");
      expect(res.answer).toContain("Nenhuma média concorrencial foi inventada");
      expect(res.answer).toContain("Ticket Médio Interno Real:* R$ 30.00");
    });

    it("sugere crescimento sem destruir margem destacando canal próprio Direto", async () => {
      const repo = createPopulatedRepo();
      const res = await fetchAndExecuteCompetitiveIntelligenceSpecialist(
        "Como aumentar vendas sem destruir margem?",
        ownerContext,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Direto / WhatsApp");
      expect(res.answer).toContain("0% (Canal Próprio)");
      expect(res.answer).toContain("canMutateState: false");
    });
  });

  describe("3. Repositório Real e Segurança HTTP End-to-End", () => {
    it("carrega wallet_growth_opportunities e wallet_commercial_experiments com isolamento de workspace", async () => {
      const repo = createFinancialRepository(async ({ table }) => {
        if (table === "wallet_growth_opportunities") {
          return [
            {
              id: "g-1",
              workspace_id: validWorkspaceId,
              department: "comercial",
              title: "Oportunidade Real DB",
              problem_description: null,
              hypothesis: "Hipótese teste",
              recommended_action: "Destaque de vitrine",
              estimated_financial_impact: 420,
              confidence_score: 80,
              status: "identificada",
              evidence_data: null,
              limitations_notes: null,
              created_at: "2026-11-11T10:00:00Z",
            },
          ];
        }
        if (table === "wallet_commercial_experiments") {
          return [
            {
              id: "exp-1",
              workspace_id: validWorkspaceId,
              opportunity_id: "g-1",
              name: "Experimento Real DB",
              hypothesis: "Combo eleva ticket",
              department: "comercial",
              target_kpi: "ticket_medio",
              baseline_value: 28,
              current_value: 31,
              target_value: 32,
              start_date: "2026-11-10",
              end_date: "2026-11-17",
              responsible_person: "Heitor",
              measured_financial_impact: null,
              decision: null,
              decision_rationale: null,
              status: "em_andamento",
              created_at: "2026-11-10T10:00:00Z",
            },
          ];
        }
        return [];
      });

      const ops = await repo.listGrowthOpportunities!(ownerContext);
      const exps = await repo.listCommercialExperiments!(ownerContext);
      expect(ops).toHaveLength(1);
      expect(ops[0].title).toBe("Oportunidade Real DB");
      expect(exps).toHaveLength(1);
      expect(exps[0].name).toBe("Experimento Real DB");
    });

    it("bloqueia admin/sócia e member com 403 Forbidden no handler HTTP e permite apenas owner", async () => {
      const repo = createPopulatedRepo();
      const runner = createMockRunner();

      for (const role of ["admin", "member"] as const) {
        const req = new Request("http://localhost/wallet-ai-orchestrator", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer token-${role}`,
          },
          body: JSON.stringify({
            workspace_id: validWorkspaceId,
            messages: [{ role: "user", content: "Quais oportunidades de crescimento temos no momento?" }],
          }),
        });

        const res = await handleOrchestratorHttpRequest(req, {
          authDeps: createMockAuthDeps(role),
          repoFactory: () => repo,
          runner,
        });
        expect(res.status).toBe(403);
      }

      const ownerReq = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Qual experimento comercial podemos testar nesta semana?" }],
        }),
      });

      const ownerRes = await handleOrchestratorHttpRequest(ownerReq, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => repo,
        runner,
      });
      expect(ownerRes.status).toBe(200);
      const json = await ownerRes.json();
      expect(json.specialist).toBe("inteligencia_competitiva");
      expect(json.text).toContain("Experimento Comercial Estruturado");
      expect(runner.generateCompletion).not.toHaveBeenCalled();
    });
  });
});
