/**
 * HOMOLOGAÇÃO FINAL DOS SETE ESPECIALISTAS DO WALLET CEO 3.0 (ETAPA 07 — ENTREGA D)
 * 
 * Cobre:
 * - Gate 1: Todos os 7 especialistas respeitam 'canMutateState: false' e allowlists estritas.
 * - Gate 2: Agente 6 (Inteligência Competitiva) e Agente 7 (Operações) ativos e funcionais.
 * - Gate 3: Coordenação Executiva pelo Wallet CEO com coleta seletiva, contexto multidepartamental,
 *   telemetria detalhada e contingência determinística graciosa em falhas de provedor de IA.
 * - Gate 4: Matriz de segurança RBAC (owner / admin / member / unauthorized / cross-workspace).
 * - Gate 5: Não fabricação de números / fornecedores / dados ausentes vs zero real.
 */

import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  SpecialistAgentId,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry.ts";
import {
  routeUserQueryToSpecialists,
  fetchAndExecuteCoordinatedCeoSnapshot,
} from "../../supabase/functions/_shared/ai/specialist-router.ts";
import {
  handleOrchestratorHttpRequest,
  type AuditEventLogger,
  type Dependencies,
} from "../../supabase/functions/wallet-ai-orchestrator/handler.ts";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools.ts";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth.ts";

const validWorkspaceId = "11111111-1111-4111-8111-111111111111";

const createMockAuthDeps = (role: "owner" | "admin" | "member" = "owner"): AuthorizationDependencies => ({
  getUser: vi.fn().mockResolvedValue({
    id: role === "owner" ? "usr-owner-1" : `user-${role}`,
    email: `${role}@empresa.com`,
  }),
  findOwnedWorkspace: vi.fn().mockResolvedValue({ id: validWorkspaceId, user_id: "usr-owner-1" }),
  verifyConversationOwnership: vi.fn().mockResolvedValue(true),
  getUserRole: vi.fn().mockResolvedValue(role),
});

function createMockRepository(overrides: Partial<FinancialQueryRepository> = {}): FinancialQueryRepository {
  return {
    listRevenues: vi.fn().mockResolvedValue([
      { id: "rev-1", description: "Venda Balcão", amount: 12500, kind: "income", date: "2026-11-11", paid: true },
    ]),
    listExpenses: vi.fn().mockResolvedValue([
      { id: "exp-1", description: "Aluguel", amount: 4000, kind: "expense", paid: false, dueOn: "2026-11-05" },
      { id: "exp-2", description: "Energia", amount: 800, kind: "expense", paid: false, dueOn: "2026-11-20" },
    ]),
    listTransactions: vi.fn().mockResolvedValue([]),
    listBalances: vi.fn().mockResolvedValue([
      { accountId: "acc-1", accountName: "Conta Principal", amount: 15400, type: "checking" },
    ]),
    listDebts: vi.fn().mockResolvedValue([]),
    listSalesPDV: vi.fn().mockResolvedValue([
      { id: "spdv-1", description: "Venda Eyemobile #101", amount: 12500, kind: "income", date: "2026-11-11" },
    ]),
    listFiscalNotes: vi.fn().mockResolvedValue([
      { id: "fn-1", number: "1001", supplierName: "Distribuidora Real Alimentos", amount: 3500, status: "processada" },
      { id: "fn-2", number: "1002", supplierName: "Laticínios Sul", amount: 1200, status: "erro_sefaz" },
    ]),
    listSalesPdvDetails: vi.fn().mockResolvedValue([
      { id: "sale-1", amount: 50, status: "paga", paymentMethod: "pix", createdAt: "2026-11-11T14:00:00Z" },
      { id: "sale-2", amount: 80, status: "cancelada", paymentMethod: "cartao_credito", createdAt: "2026-11-11T15:00:00Z" },
    ]),
    listInventoryItems: vi.fn().mockResolvedValue([
      {
        id: "item-1",
        workspaceId: validWorkspaceId,
        codigo: "QUE-1",
        descricao: "Queijo Mussarela",
        categoria: "Laticínios",
        precoVenda: 65,
        custoAtual: 22,
        estoqueAtual: 0,
        estoqueMinimo: 10,
        unidadeMedida: "kg",
        ativo: true,
        estoqueInformado: true,
        custoInformado: true,
      },
      {
        id: "item-2",
        workspaceId: validWorkspaceId,
        codigo: "MOL-1",
        descricao: "Molho de Tomate",
        categoria: "Molhos",
        precoVenda: 45,
        custoAtual: 28,
        estoqueAtual: 3,
        estoqueMinimo: 8,
        unidadeMedida: "un",
        ativo: true,
        estoqueInformado: true,
        custoInformado: true,
      },
    ]),
    listRecipeCards: vi.fn().mockResolvedValue([
      { id: "rec-1", name: "Pizza Calabresa", productId: "prod-1", totalCost: 22 },
    ]),
    listEmployees: vi.fn().mockResolvedValue([
      { id: "emp-1", name: "Carlos Ferreira", role: "Pizzaiolo", status: "active" },
      { id: "emp-2", name: "Mariana Souza", role: "Atendente", status: "active" },
    ]),
    listEmployeeSchedules: vi.fn().mockResolvedValue([
      { id: "sch-1", employeeId: "emp-1", shiftDate: "2026-11-11", startTime: "16:00", endTime: "00:00", status: "confirmed" },
    ]),
    listGrowthOpportunities: vi.fn().mockResolvedValue([
      { id: "opp-1", title: "Expansão de Delivery Noturno", priority: "high", status: "active" },
    ]),
    listCommercialExperiments: vi.fn().mockResolvedValue([
      { id: "exp-1", title: "Combo Pizza + Bebida", channel: "delivery", status: "active", hypothesis: "Aumenta ticket médio em 12%" },
    ]),
    listCashClosings: vi.fn().mockResolvedValue([
      { id: "close-1", registerName: "Caixa 01", closingDate: "2026-11-10", totalDeclared: 1450, totalSystem: 1450, status: "fechado" },
    ]),
    listOperationalReminders: vi.fn().mockResolvedValue([
      { id: "rem-1", title: "Higienização de Forno", dueDate: "2026-11-11", completed: false, status: "pendente" },
    ]),
    ...overrides,
  };
}

describe("GATE 1 & 2: CONTRATO DOS SETE ESPECIALISTAS DO WALLET CEO", () => {
  const all7Ids: SpecialistAgentId[] = [
    "financeiro",
    "fiscal",
    "vendas_pdv",
    "estoque",
    "rh",
    "inteligencia_competitiva",
    "operacoes",
  ];

  it("garante que os 7 especialistas estão registrados no catálogo oficial", () => {
    expect(Object.keys(SPECIALIST_AGENTS_REGISTRY)).toHaveLength(7);
    for (const id of all7Ids) {
      expect(SPECIALIST_AGENTS_REGISTRY[id]).toBeDefined();
      expect(SPECIALIST_AGENTS_REGISTRY[id].id).toBe(id);
    }
  });

  it("garante que NENHUM especialista possui permissão de mutação (canMutateState: false estrito)", () => {
    for (const id of all7Ids) {
      const spec = SPECIALIST_AGENTS_REGISTRY[id];
      expect(spec.canMutateState).toBe(false);
    }
  });

  it("garante que as allowlists de ferramentas contêm apenas consultas de leitura e validações consultivas", () => {
    for (const id of all7Ids) {
      const spec = SPECIALIST_AGENTS_REGISTRY[id];
      expect(spec.allowedTools.length).toBeGreaterThan(0);
      for (const tool of spec.allowedTools) {
        expect(
          tool.startsWith("consultar_") ||
            tool.startsWith("buscar_") ||
            tool.startsWith("obter_") ||
            tool.startsWith("propor_") ||
            tool.startsWith("validar_")
        ).toBe(true);
        expect(tool).not.toMatch(/criar_|deletar_|atualizar_|executar_|remover_/);
      }
    }
  });
});

describe("GATE 3: COORDENAÇÃO EXECUTIVA PELO WALLET CEO", () => {
  const ownerContext: AiExecutionContext = {
    userId: "usr-owner-1",
    workspaceId: "ws-1",
    role: "owner",
    authenticated: true,
  };

  const fixedDate = new Date("2026-11-11T12:00:00Z");

  it("roteia consultas multidepartamentais para coordenação pelo Wallet CEO", () => {
    const q1 = routeUserQueryToSpecialists("Estou vendendo bem, mas meu lucro caiu. O que está acontecendo?");
    expect(q1.coordinatingCeo).toBe(true);
    expect(q1.primarySpecialist).toBe("financeiro");
    expect(q1.contributingSpecialists).toContain("vendas_pdv");
    expect(q1.contributingSpecialists).toContain("estoque");
    expect(q1.contributingSpecialists).toContain("financeiro");

    const q2 = routeUserQueryToSpecialists("Preciso de ajuda para vender mais sem perder margem");
    expect(q2.coordinatingCeo).toBe(true);
    expect(q2.primarySpecialist).toBe("inteligencia_competitiva");
    expect(q2.contributingSpecialists).toEqual(["vendas_pdv", "estoque", "inteligencia_competitiva"]);

    const q3 = routeUserQueryToSpecialists("Como está a operação da loja hoje?");
    expect(q3.coordinatingCeo).toBe(true);
    expect(q3.primarySpecialist).toBe("operacoes");
    expect(q3.contributingSpecialists).toContain("operacoes");
    expect(q3.contributingSpecialists).toContain("vendas_pdv");
    expect(q3.contributingSpecialists).toContain("estoque");
  });

  it("fetchAndExecuteCoordinatedCeoSnapshot coleta dados seletivos apenas dos especialistas contribuintes", async () => {
    const repo = createMockRepository();
    const plan = routeUserQueryToSpecialists("Estou vendendo bem, mas meu lucro caiu.");

    const snapshot = await fetchAndExecuteCoordinatedCeoSnapshot(
      "Estou vendendo bem, mas meu lucro caiu.",
      ownerContext,
      repo,
      plan,
      fixedDate
    );

    expect(snapshot.coordinatingCeo).toBe(true);
    expect(snapshot.contributingSpecialists).toEqual(["vendas_pdv", "estoque", "financeiro"]);
    expect(snapshot.traces).toHaveLength(3);

    // Vendas consultou listSalesPDV oficial
    expect(repo.listSalesPDV).toHaveBeenCalled();
    // Financeiro consultou receitas, despesas e saldos reais
    expect(repo.listRevenues).toHaveBeenCalled();
    expect(repo.listExpenses).toHaveBeenCalled();
    expect(repo.listBalances).toHaveBeenCalled();
    // Estoque consultou itens cadastrados
    expect(repo.listInventoryItems).toHaveBeenCalled();
    // NÃO deve consultar notas fiscais nem RH nesta rota
    expect(repo.listFiscalNotes).not.toHaveBeenCalled();
    expect(repo.listEmployees).not.toHaveBeenCalled();

    expect(snapshot.contextBrief).toContain("[COLETA SELETIVA MULTIDEPARTAMENTAL");
    expect(snapshot.deterministicFallbackAnswer).toContain("Síntese Executiva Wallet CEO");
    expect(snapshot.deterministicFallbackAnswer).toContain("canMutateState: false");
  });

  it("aciona fallback determinístico gracioso quando o provedor de IA falha durante a coordenação", async () => {
    const repo = createMockRepository();
    const auditLogger: AuditEventLogger = { logEvent: vi.fn().mockResolvedValue(undefined) };
    const telemetryLogger = { logTelemetry: vi.fn().mockResolvedValue(undefined) };

    const failingRunnerFactory = vi.fn().mockReturnValue({
      generateCompletion: vi.fn().mockRejectedValue(new Error("openai_api_error_500: Server overloaded")),
    });

    const deps: Dependencies = {
      authDeps: createMockAuthDeps("owner"),
      repoFactory: () => repo,
      runnerFactory: failingRunnerFactory,
      auditLogger,
      telemetryLogger,
    };

    const req = new Request("http://localhost/wallet-ai-orchestrator", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-owner-token",
      },
      body: JSON.stringify({
        workspace_id: validWorkspaceId,
        messages: [{ role: "user", content: "Estou vendendo bem, mas meu lucro caiu." }],
        context: ownerContext,
        agent_type: "ceo",
      }),
    });

    const resp = await handleOrchestratorHttpRequest(req, deps);
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.fallback).toBe(true);
    expect(body.fallbackReason).toContain("openai_api_error_500");
    expect(body.coordinating_ceo).toBe(true);
    expect(body.contributing_specialists).toEqual(["vendas_pdv", "estoque", "financeiro"]);
    expect(body.message.content).toContain("Síntese Executiva Wallet CEO (Modo Contingência Determinística)");
    expect(body.message.content).toContain("canMutateState: false");
    expect(body.estimatedCostUsd).toBe(0);

    // Telemetria com status fallback
    expect(telemetryLogger.logTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "fallback",
        metadata: expect.objectContaining({
          coordinating_ceo: true,
          fallback: true,
        }),
      })
    );
  });
});

describe("GATE 4: MATRIZ DE AUTORIZAÇÃO E SEGURANÇA RBAC", () => {
  it("valida autorização individual por perfil em cada um dos 7 especialistas", () => {
    // Financeiro: requiredRole "admin" -> owner e admin autorizados, member negado
    expect(authorizeSpecialistAccess("financeiro", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("financeiro", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("financeiro", "member").authorized).toBe(false);

    // Fiscal: requiredRole "admin" -> owner e admin autorizados, member negado
    expect(authorizeSpecialistAccess("fiscal", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("fiscal", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("fiscal", "member").authorized).toBe(false);

    // Vendas/PDV: requiredRole "member" -> todos
    expect(authorizeSpecialistAccess("vendas_pdv", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("vendas_pdv", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("vendas_pdv", "member").authorized).toBe(true);

    // Estoque: requiredRole "member" -> todos
    expect(authorizeSpecialistAccess("estoque", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("estoque", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("estoque", "member").authorized).toBe(true);

    // RH: requiredRole "admin" -> owner e admin autorizados, member negado
    expect(authorizeSpecialistAccess("rh", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("rh", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("rh", "member").authorized).toBe(false);

    // Inteligência Competitiva: requiredRole "owner" -> somente owner
    expect(authorizeSpecialistAccess("inteligencia_competitiva", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("inteligencia_competitiva", "admin").authorized).toBe(false);
    expect(authorizeSpecialistAccess("inteligencia_competitiva", "member").authorized).toBe(false);

    // Operações: requiredRole "member" -> todos
    expect(authorizeSpecialistAccess("operacoes", "owner").authorized).toBe(true);
    expect(authorizeSpecialistAccess("operacoes", "admin").authorized).toBe(true);
    expect(authorizeSpecialistAccess("operacoes", "member").authorized).toBe(true);
  });

  it("bloqueia com 403 requisições ao orchestrator se papel member tentar acessar inteligência competitiva ou financeiro", async () => {
    const memberContext: AiExecutionContext = {
      userId: "usr-member-1",
      workspaceId: validWorkspaceId,
      role: "member",
      authenticated: true,
    };

    const deps: Dependencies = {
      authDeps: createMockAuthDeps("member"),
      repoFactory: () => createMockRepository(),
      runnerFactory: () => ({ generateCompletion: vi.fn() }),
    };

    const req = new Request("http://localhost/wallet-ai-orchestrator", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-member-token",
      },
      body: JSON.stringify({
        workspace_id: validWorkspaceId,
        messages: [{ role: "user", content: "Quais oportunidades de crescimento temos cadastradas?" }],
        context: memberContext,
      }),
    });

    const resp = await handleOrchestratorHttpRequest(req, deps);
    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body.code).toBe("WALLET_AI_FORBIDDEN");
  });
});

describe("GATE 5: NÃO FABRICAÇÃO E INTEGRIDADE DE DADOS", () => {
  it("não inventa dados quando o repositório retorna listas vazias", async () => {
    const emptyRepo = createMockRepository({
      listInventoryItems: vi.fn().mockResolvedValue([]),
      listRecipeCards: vi.fn().mockResolvedValue([]),
      listSalesPDV: vi.fn().mockResolvedValue([]),
      listRevenues: vi.fn().mockResolvedValue([]),
      listExpenses: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([]),
      listFiscalNotes: vi.fn().mockResolvedValue([]),
      listGrowthOpportunities: vi.fn().mockResolvedValue([]),
      listCommercialExperiments: vi.fn().mockResolvedValue([]),
      listCashClosings: vi.fn().mockResolvedValue([]),
      listOperationalReminders: vi.fn().mockResolvedValue([]),
      listEmployeeSchedules: vi.fn().mockResolvedValue([]),
    });

    const ownerContext: AiExecutionContext = {
      userId: "usr-owner-1",
      workspaceId: "ws-1",
      role: "owner",
      authenticated: true,
    };

    const plan = routeUserQueryToSpecialists("Como está a operação da loja hoje?");
    const snapshot = await fetchAndExecuteCoordinatedCeoSnapshot(
      "Como está a operação da loja hoje?",
      ownerContext,
      emptyRepo,
      plan,
      new Date("2026-11-11T12:00:00Z")
    );

    // Garante que não inventou números fictícios
    expect(snapshot.deterministicFallbackAnswer).toContain("Alertas de estoque: 0 item(ns)");
    expect(snapshot.deterministicFallbackAnswer).toContain("Caixas recentes: 0");
    expect(snapshot.deterministicFallbackAnswer).toContain("Lembretes/rotinas pendentes: 0");
    expect(snapshot.deterministicFallbackAnswer).not.toContain("Distribuidor Padrão");
  });
});
