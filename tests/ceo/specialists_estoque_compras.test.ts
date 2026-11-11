import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  buildInventorySpecialistDeterministicResponse,
  fetchAndExecuteInventorySpecialist,
  fetchAndExecuteSpecialistTurn,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type {
  FinancialQueryRepository,
  InventoryItemRecord,
  RecipeCardRecord,
} from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Entrega C: Agente 4 — Estoque e Compras (Gate 1 & Gate 5)", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validConversationId = "22222222-2222-4222-8222-222222222222";

  const dummyContext: AiExecutionContext = {
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

  const createMockRunner = (responseText = "Resposta do assistente"): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: responseText },
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ROTEAMENTO DO ESPECIALISTA DE ESTOQUE
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Roteamento Inteligente e Determinístico de Estoque", () => {
    it("deve direcionar perguntas de estoque e reposição ao Agente de Estoque e Compras", () => {
      const prompts = [
        "Quais produtos estão acabando?",
        "Quais itens estão abaixo do estoque mínimo?",
        "Quais produtos preciso comprar hoje?",
        "Quanto tenho em estoque?",
        "Quais produtos têm maior custo?",
        "Quais produtos estão com margem baixa?",
        "Qual é meu CMV?",
        "Previsão de ruptura de insumos",
      ];

      prompts.forEach((prompt) => {
        const plan = routeUserQueryToSpecialists(prompt);
        expect(plan.primarySpecialist).toBe("estoque");
        expect(plan.isDeterministicPossible).toBe(true);
      });
    });

    it("Agente de Estoque deve ser acessível para member (operacional) e admin (gerencial)", () => {
      const authMember = authorizeSpecialistAccess("estoque", "member");
      expect(authMember.authorized).toBe(true);

      const authAdmin = authorizeSpecialistAccess("estoque", "admin");
      expect(authAdmin.authorized).toBe(true);
    });

    it("Agente de Estoque deve ter canMutateState === false (estritamente consultivo)", () => {
      expect(SPECIALIST_AGENTS_REGISTRY.estoque.canMutateState).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. RESPOSTAS DETERMINÍSTICAS DE ESTOQUE E REPOSIÇÃO
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Respostas Determinísticas: Níveis de Estoque e Compras", () => {
    it("deve responder adequadamente quando todos os itens estão normais (0 críticos)", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quais produtos estão acabando?", {
        itensAbaixoMinimo: [],
      });

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("estoque");
      expect(res.answer).toContain("Todos os produtos cadastrados estão com estoque acima do nível mínimo");
    });

    it("deve listar itens em nível crítico e destacar itens com estoque zerado", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quais itens estão abaixo do estoque mínimo?", {
        itensAbaixoMinimo: [
          {
            id: "1",
            workspaceId: validWorkspaceId,
            codigo: "PAO-01",
            descricao: "Pão de Queijo Tradicional",
            categoria: "Lanches",
            precoVenda: 5.0,
            custoAtual: 1.5,
            estoqueAtual: 0,
            estoqueMinimo: 20,
            estoqueIdeal: 50,
            unidadeMedida: "UN",
            multiploCompra: 10,
            fornecedorPadrao: "Fornecedor Minas",
            margemRealPercentual: 70.0,
            ativo: true,
          },
          {
            id: "2",
            workspaceId: validWorkspaceId,
            codigo: "REF-02",
            descricao: "Refrigerante Cola 350ml",
            categoria: "Bebidas",
            precoVenda: 6.0,
            custoAtual: 2.8,
            estoqueAtual: 4,
            estoqueMinimo: 12,
            estoqueIdeal: 36,
            unidadeMedida: "LATA",
            multiploCompra: 12,
            fornecedorPadrao: "Distribuidora Bebidas",
            margemRealPercentual: 53.3,
            ativo: true,
          },
        ],
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Itens em Nível Crítico (2)");
      expect(res.answer).toContain("Pão de Queijo Tradicional*: 0 UN (Mínimo: 20 UN) — ⚠️ *ESTOQUE ZERADO*");
      expect(res.answer).toContain("Refrigerante Cola 350ml*: 4 LATA (Mínimo: 12 LATA)");
    });

    it("deve gerar sugestão de compras inteligente com múltiplos de embalagem e fornecedores", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quais produtos preciso comprar hoje?", {
        sugestaoCompras: [
          {
            produto: "Refrigerante Cola 350ml",
            estoqueAtual: 4,
            estoqueIdeal: 36,
            quantidadeComprar: 36, // múltiplo de 12 aplicado (32 arredondado para 36)
            embalagem: "LATA",
            multiploCompra: 12,
            custoUnitario: 2.8,
            custoTotalEstimado: 100.8,
            fornecedor: "Distribuidora Bebidas",
            prioridade: "Alta (Abaixo Mínimo)",
            justificativa: "Estoque atual (4) abaixo do mínimo (12)",
          },
          {
            produto: "Água Mineral 500ml",
            estoqueAtual: 0,
            estoqueIdeal: 48,
            quantidadeComprar: 48,
            embalagem: "GARRAFA",
            multiploCompra: 24,
            custoUnitario: 1.2,
            custoTotalEstimado: 57.6,
            fornecedor: "Distribuidora Bebidas",
            prioridade: "Urgente (Zerado)",
            justificativa: "Estoque zerado no balcão",
          },
        ],
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Sugestão de Compras Inteligente");
      expect(res.answer).toContain("Fornecedor: Distribuidora Bebidas");
      expect(res.answer).toContain("Refrigerante Cola 350ml*: Comprar *36 LATA* (Emb. c/ 12)");
      expect(res.answer).toContain("Água Mineral 500ml*: Comprar *48 GARRAFA* (Emb. c/ 24)");
      expect(res.answer).toContain("Total Geral Estimado:* R$ 158.40");
      expect(res.answer).toContain("canMutateState: false");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SEGURANÇA E RESTRIÇÕES POR CARGO (OPERACIONAL VS FINANCEIRO)
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Segurança: Restrição de Custos e Margens para Colaboradores", () => {
    it("colaborador (member) consultando 'Quanto tenho em estoque?' deve ver apenas volumes físicos", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quanto tenho em estoque?", {
        itensEstoque: [
          {
            id: "1",
            workspaceId: validWorkspaceId,
            codigo: "1",
            descricao: "Item 1",
            categoria: "Lanches",
            precoVenda: 10,
            custoAtual: 4,
            estoqueAtual: 50,
            estoqueMinimo: 10,
            estoqueIdeal: 30,
            unidadeMedida: "UN",
            multiploCompra: 1,
            fornecedorPadrao: null,
            margemRealPercentual: 60,
            ativo: true,
          },
        ],
        valorTotalEstoque: 200.0,
        isMemberRole: true,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Posição Operacional de Estoque");
      expect(res.answer).toContain("Total de Produtos/SKUs:* 1");
      expect(res.answer).toContain("Volume Físico Consolidado:* 50 unidade(s)");
      expect(res.answer).not.toContain("R$ 200.00");
      expect(res.answer).toContain("Valores monetários e custos financeiros de estoque são restritos a gestores.");
    });

    it("proprietário (owner) consultando 'Quanto tenho em estoque?' deve ver valor financeiro consolidado", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quanto tenho em estoque?", {
        itensEstoque: [
          {
            id: "1",
            workspaceId: validWorkspaceId,
            codigo: "1",
            descricao: "Item 1",
            categoria: "Lanches",
            precoVenda: 10,
            custoAtual: 4,
            estoqueAtual: 50,
            estoqueMinimo: 10,
            estoqueIdeal: 30,
            unidadeMedida: "UN",
            multiploCompra: 1,
            fornecedorPadrao: null,
            margemRealPercentual: 60,
            ativo: true,
          },
        ],
        valorTotalEstoque: 200.0,
        isMemberRole: false,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Posição Consolidada de Estoque");
      expect(res.answer).toContain("Valor Total em Estoque:* R$ 200.00");
    });

    it("colaborador (member) tentando consultar produtos com maior custo deve receber bloqueio de acesso", () => {
      const res = buildInventorySpecialistDeterministicResponse("Quais produtos têm maior custo?", {
        itensEstoque: [],
        isMemberRole: true,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Acesso Restrito — Agente de Estoque e Compras");
      expect(res.answer).toContain("Custos de atacado, margens de lucro e precificação são restritos aos administradores");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CMV E PREVISÃO DE RUPTURA
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. CMV Auditado e Previsão de Ruptura por Consumo", () => {
    it("deve reportar dados indisponíveis quando não há fichas técnicas comprovadas suficientes", () => {
      const res = buildInventorySpecialistDeterministicResponse("Qual é meu CMV?", {
        cmvInfo: { tipo: "indisponivel" },
        isMemberRole: false,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Dados de CMV pendentes de conciliação completa");
      expect(res.answer).toContain("O Wallet CEO evita estimativas infundadas");
    });

    it("deve reportar CMV confirmado quando 80%+ das fichas estão auditadas", () => {
      const res = buildInventorySpecialistDeterministicResponse("Qual é meu CMV?", {
        cmvInfo: {
          tipo: "confirmado",
          cmvPercentual: 32.5,
          detalhes: "Baseado em 15 fichas técnicas auditadas e comprovadas.",
        },
        isMemberRole: false,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("CMV Calculado:* *32.5%* do faturamento bruto");
      expect(res.answer).toContain("15 fichas técnicas auditadas e comprovadas");
    });

    it("deve alertar sobre previsão de ruptura para produtos com cobertura inferior a 3 dias", () => {
      const res = buildInventorySpecialistDeterministicResponse("Previsão de ruptura", {
        previsaoRuptura: [
          {
            produto: "Pão Francês Congelado",
            estoqueAtual: 40,
            consumoDiario: 20,
            coberturaDias: 2.0,
          },
        ],
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Alerta de Previsão de Ruptura");
      expect(res.answer).toContain("Pão Francês Congelado*: Cobertura estimada de *2.0 dia(s)* de vendas");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. INTEGRAÇÃO END-TO-END NO ORCHESTRATOR
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Integração E2E via handleOrchestratorHttpRequest", () => {
    it("deve acionar o Agente de Estoque no fluxo HTTP com 200 OK e resposta determinística", async () => {
      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quais produtos estão acabando?" }],
        }),
      });

      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn().mockResolvedValue([]),
        listExpenses: vi.fn().mockResolvedValue([]),
        listTransactions: vi.fn().mockResolvedValue([]),
        listBalances: vi.fn().mockResolvedValue([]),
        listDebts: vi.fn().mockResolvedValue([]),
        listSalesPDV: vi.fn().mockResolvedValue([]),
        listInventoryItems: vi.fn().mockResolvedValue([
          {
            id: "1",
            workspaceId: validWorkspaceId,
            codigo: "CAF-01",
            descricao: "Café em Grãos Especial 1kg",
            categoria: "Insumos",
            precoVenda: 0,
            custoAtual: 65.0,
            estoqueAtual: 1,
            estoqueMinimo: 5,
            estoqueIdeal: 15,
            unidadeMedida: "PCT",
            multiploCompra: 5,
            fornecedorPadrao: "Torrefação Café Real",
            margemRealPercentual: 0,
            ativo: true,
          },
        ]),
        listRecipeCards: vi.fn().mockResolvedValue([]),
        listSalesPdvDetails: vi.fn().mockResolvedValue([]),
      };

      const runner = createMockRunner();
      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => mockRepo,
        runnerFactory: () => runner,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.specialist).toBe("estoque");
      expect(data.text).toContain("Café em Grãos Especial 1kg");
      expect(data.text).toContain("1 PCT (Mínimo: 5 PCT)");
    });
  });
});
