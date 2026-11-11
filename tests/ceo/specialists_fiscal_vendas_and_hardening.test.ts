import { describe, it, expect, vi } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  getSaoPauloDateStrings,
  buildFiscalSpecialistDeterministicResponse,
  buildSalesPdvSpecialistDeterministicResponse,
  fetchAndExecuteSpecialistTurn,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { handleOrchestratorHttpRequest } from "../../supabase/functions/wallet-ai-orchestrator/handler";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext, AuthorizationDependencies } from "../../supabase/functions/_shared/ai/auth";
import type { LlmMessage, LlmRunner } from "../../supabase/functions/_shared/ai/orchestrator-core";

describe("Etapa 07 — Entrega B: Agentes Fiscal, Vendas/PDV e Hardening Prioritário", () => {
  const validWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const validConversationId = "22222222-2222-4222-8222-222222222222";

  const dummyContext: AiExecutionContext = {
    userId: "user-test-uuid",
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

  const createMockRunner = (responseText = "Resposta gerada pelo LLM"): LlmRunner => ({
    generateCompletion: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: responseText },
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GATE 0.2: ROTEAMENTO PADRÃO SEGURO E OPERACIONAL
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gate 0.2: Roteamento Padrão Seguro (Sem Bloqueio de Colaboradores)", () => {
    it("1. Perguntas de saudação e dúvidas operacionais devem ser direcionadas ao Agente de Operações", () => {
      const saudações = [
        "Bom dia",
        "Olá, boa tarde!",
        "Quais tarefas tenho hoje?",
        "Como funciona essa ferramenta?",
        "Preciso de ajuda com uma rotina da loja",
      ];

      saudações.forEach((prompt) => {
        const plan = routeUserQueryToSpecialists(prompt);
        expect(plan.primarySpecialist).toBe("operacoes");
        expect(plan.coordinatingCeo).toBe(false);
      });
    });

    it("2. Colaboradores comuns (member) devem ter autorização concedida para o Agente de Operações", () => {
      const auth = authorizeSpecialistAccess("operacoes", "member");
      expect(auth.authorized).toBe(true);
    });

    it("3. Requisição de colaborador (member) com 'Bom dia' deve retornar 200 OK sem 403 Forbidden", async () => {
      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-member",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Bom dia, preciso de ajuda com a rotina de hoje" }],
        }),
      });

      const runner = createMockRunner("Bom dia! Estou à disposição para ajudar com as rotinas da sua loja.");
      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("member"),
        repoFactory: () => ({} as FinancialQueryRepository),
        runnerFactory: () => runner,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.specialist).toBe("operacoes");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GATE 0.3: FUSO HORÁRIO E CONSISTÊNCIA DE DADOS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gate 0.3: Fuso Horário Canônico de São Paulo e Consistência Financeira", () => {
    it("4. getSaoPauloDateStrings deve apurar datas no fuso America/Sao_Paulo com precisão", () => {
      // Data simulada em UTC (madrugada de 2026-11-11 às 01:00 UTC = 2026-11-10 às 22:00 em SP)
      const lateUtcDate = new Date("2026-11-11T01:30:00.000Z");
      const dates = getSaoPauloDateStrings(lateUtcDate);

      expect(dates.todayStr).toBe("2026-11-10");
      expect(dates.yesterdayStr).toBe("2026-11-09");
      expect(dates.startOfMonthStr).toBe("2026-11-01");
      expect(dates.in7DaysStr).toBe("2026-11-17");
    });

    it("5. Canal da requisição deve ser preservado na memória (não forçar 'web')", async () => {
      const appendMessageMock = vi.fn().mockResolvedValue(undefined);
      const mockConversationRepo = {
        getRecentMessages: vi.fn().mockResolvedValue([]),
        appendMessage: appendMessageMock,
        countMessages: vi.fn().mockResolvedValue(1),
        getSummary: vi.fn().mockResolvedValue(null),
        saveSummary: vi.fn().mockResolvedValue(undefined),
      };

      const req = new Request("http://localhost/wallet-ai-orchestrator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-owner",
        },
        body: JSON.stringify({
          workspace_id: validWorkspaceId,
          messages: [{ role: "user", content: "Quanto faturei ontem?" }],
          channel: "telegram",
          conversation_id: validConversationId,
        }),
      });

      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn().mockResolvedValue([]),
        listExpenses: vi.fn().mockResolvedValue([]),
        listTransactions: vi.fn().mockResolvedValue([]),
        listBalances: vi.fn().mockResolvedValue([]),
        listDebts: vi.fn().mockResolvedValue([]),
        listSalesPDV: vi.fn().mockResolvedValue([
          {
            id: "tx-1",
            sourceType: "transacao",
            sourceId: "1",
            workspaceId: "ws-test-uuid",
            userId: "user-test-uuid",
            kind: "income",
            amount: 500,
            occurredOn: "2026-11-10",
            deduplicationKey: "dedup-1",
            description: "Venda Eyemobile #1",
            status: "aprovada",
          },
        ]),
      };

      const res = await handleOrchestratorHttpRequest(req, {
        authDeps: createMockAuthDeps("owner"),
        repoFactory: () => mockRepo,
        runnerFactory: () => createMockRunner(),
        conversationRepo: mockConversationRepo,
      });

      expect(res.status).toBe(200);
      expect(appendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "telegram",
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GATE 1: AGENTE FISCAL (DOCUMENTOS, NOTAS E SEFAZ)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gate 1: Agente Fiscal Funcional e Consultivo", () => {
    it("6. Roteamento Fiscal: deve classificar perguntas fiscais e identificar determinismo", () => {
      const q1 = routeUserQueryToSpecialists("Quais notas fiscais recebi nesta semana?");
      expect(q1.primarySpecialist).toBe("fiscal");
      expect(q1.isDeterministicPossible).toBe(true);

      const q2 = routeUserQueryToSpecialists("Existe alguma nota pendente de processamento?");
      expect(q2.primarySpecialist).toBe("fiscal");
      expect(q2.isDeterministicPossible).toBe(true);

      const q3 = routeUserQueryToSpecialists("Quais documentos apresentaram erro na leitura?");
      expect(q3.primarySpecialist).toBe("fiscal");
      expect(q3.isDeterministicPossible).toBe(true);

      const q4 = routeUserQueryToSpecialists("Qual foi o valor das notas de fornecedores neste mês?");
      expect(q4.primarySpecialist).toBe("fiscal");
      expect(q4.isDeterministicPossible).toBe(true);

      const q5 = routeUserQueryToSpecialists("Existe divergência entre nota fiscal e lançamento?");
      expect(q5.primarySpecialist).toBe("fiscal");
      expect(q5.isDeterministicPossible).toBe(true);
    });

    it("7. Resposta determinística Fiscal com zero notas confirmadas (R$ 0,00)", () => {
      const res = buildFiscalSpecialistDeterministicResponse("Quais notas fiscais recebi nesta semana?", {
        notasSemana: [],
      });
      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("fiscal");
      expect(res.answer).toContain("Nenhuma nota fiscal de compra recebida no período consultado (R$ 0,00)");
    });

    it("8. Resposta determinística Fiscal com notas reais registradas", () => {
      const res = buildFiscalSpecialistDeterministicResponse("Quais notas fiscais recebi nesta semana?", {
        notasSemana: [
          {
            id: "nf-1",
            workspaceId: "ws-test-uuid",
            numeroNf: "12345",
            serieNf: "1",
            fornecedor: "Frigorífico São João",
            cnpjFornecedor: "12.345.678/0001-90",
            dataEmissao: "2026-11-09",
            dataEntrada: "2026-11-10",
            valorTotal: 4250.0,
            valorIcms: 510.0,
            valorProdutos: 4250.0,
            chaveAcesso: "35261112345678000190550010000123451000123456",
            status: "processada",
            origem: "sefaz",
            createdAt: "2026-11-10T10:00:00Z",
          },
        ],
      });
      expect(res.handled).toBe(true);
      expect(res.answer).toContain("R$ 4250.00");
      expect(res.answer).toContain("Frigorífico São João");
      expect(res.answer).toContain("NF 12345");
    });

    it("9. Status de processamento e auditoria de erros de leitura", () => {
      const resPendentes = buildFiscalSpecialistDeterministicResponse("Existe alguma nota pendente de processamento?", {
        notasPendentes: [],
      });
      expect(resPendentes.handled).toBe(true);
      expect(resPendentes.answer).toContain("Nenhuma pendência identificada");

      const resErro = buildFiscalSpecialistDeterministicResponse("Quais documentos apresentaram erro na leitura?", {
        documentosErro: [],
      });
      expect(resErro.handled).toBe(true);
      expect(resErro.answer).toContain("Nenhum documento fiscal apresentou erro");
    });

    it("10. Permissões: Agente Fiscal exige permissão mínima de admin", () => {
      const memberAuth = authorizeSpecialistAccess("fiscal", "member");
      expect(memberAuth.authorized).toBe(false);
      expect(memberAuth.reason).toContain("exige permissão de admin");

      const adminAuth = authorizeSpecialistAccess("fiscal", "admin");
      expect(adminAuth.authorized).toBe(true);

      const ownerAuth = authorizeSpecialistAccess("fiscal", "owner");
      expect(ownerAuth.authorized).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GATE 2: AGENTE DE VENDAS E PDV
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gate 2: Agente de Vendas e PDV Funcional", () => {
    it("11. Roteamento Vendas/PDV: deve classificar perguntas comerciais e identificar determinismo", () => {
      const q1 = routeUserQueryToSpecialists("Quanto faturamos ontem no balcão?");
      expect(q1.primarySpecialist).toBe("vendas_pdv");
      expect(q1.isDeterministicPossible).toBe(true);

      const q2 = routeUserQueryToSpecialists("Quais foram os 5 produtos mais vendidos ontem?");
      expect(q2.primarySpecialist).toBe("vendas_pdv");
      expect(q2.isDeterministicPossible).toBe(true);

      const q3 = routeUserQueryToSpecialists("Qual horário teve mais movimento ontem?");
      expect(q3.primarySpecialist).toBe("vendas_pdv");
      expect(q3.isDeterministicPossible).toBe(true);

      const q4 = routeUserQueryToSpecialists("Qual foi o faturamento deste mês comparado ao anterior?");
      expect(q4.primarySpecialist).toBe("vendas_pdv");
      expect(q4.isDeterministicPossible).toBe(true);

      const q5 = routeUserQueryToSpecialists("Como foi a divisão por forma de pagamento?");
      expect(q5.primarySpecialist).toBe("vendas_pdv");
      expect(q5.isDeterministicPossible).toBe(true);
    });

    it("12. Resposta determinística de Vendas: Faturamento de ontem no balcão e ticket médio", () => {
      const res = buildSalesPdvSpecialistDeterministicResponse("Quanto faturamos ontem no balcão?", {
        vendasOntemTotal: 1850.0,
        pedidosOntemTotal: 37,
      });

      expect(res.handled).toBe(true);
      expect(res.specialist).toBe("vendas_pdv");
      expect(res.answer).toContain("R$ 1850.00");
      expect(res.answer).toContain("37");
      expect(res.answer).toContain("R$ 50.00"); // Ticket Médio = 1850 / 37
    });

    it("13. Resposta determinística de Vendas: Top 5 produtos mais vendidos", () => {
      const res = buildSalesPdvSpecialistDeterministicResponse("Quais foram os 5 produtos mais vendidos ontem?", {
        top5ProdutosOntem: [
          { nome: "Pastel de Carne", quantidade: 65, total: 650.0 },
          { nome: "Refrigerante 350ml", quantidade: 50, total: 350.0 },
          { nome: "Café Expresso", quantidade: 42, total: 210.0 },
          { nome: "Pão de Queijo", quantidade: 38, total: 190.0 },
          { nome: "Água Mineral", quantidade: 30, total: 150.0 },
        ],
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("1. *Pastel de Carne* — 65 un. (Total: R$ 650.00)");
      expect(res.answer).toContain("2. *Refrigerante 350ml* — 50 un. (Total: R$ 350.00)");
      expect(res.answer).toContain("5. *Água Mineral* — 30 un. (Total: R$ 150.00)");
    });

    it("14. Resposta determinística de Vendas: Horário de pico em fuso SP", () => {
      const res = buildSalesPdvSpecialistDeterministicResponse("Qual horário teve mais movimento ontem?", {
        horarioPicoOntem: {
          faixa: "12h às 13h",
          turnos: "Almoço / Tarde",
          totalVendas: 780.0,
          quantidadePedidos: 16,
        },
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("12h às 13h");
      expect(res.answer).toContain("R$ 780.00");
      expect(res.answer).toContain("16 pedido(s)");
      expect(res.answer).toContain("Almoço / Tarde");
    });

    it("15. Resposta determinística de Vendas: Comparativo mensal com mês anterior", () => {
      const res = buildSalesPdvSpecialistDeterministicResponse("Qual foi o faturamento deste mês comparado ao anterior?", {
        faturamentoMesAtual: 55000.0,
        faturamentoMesAnterior: 50000.0,
        variacaoMesPercentual: 10.0,
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("R$ 55000.00");
      expect(res.answer).toContain("R$ 50000.00");
      expect(res.answer).toContain("+10.0%");
    });

    it("16. Resposta determinística de Vendas: Divisão por forma de pagamento", () => {
      const res = buildSalesPdvSpecialistDeterministicResponse("Como foi a divisão por forma de pagamento?", {
        divisaoFormasPagamento: [
          { metodo: "Cartão de Débito", valor: 25000.0, percentual: 50.0 },
          { metodo: "Pix", valor: 15000.0, percentual: 30.0 },
          { metodo: "Cartão de Crédito", valor: 7500.0, percentual: 15.0 },
          { metodo: "Dinheiro", valor: 2500.0, percentual: 5.0 },
        ],
      });

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Cartão de Débito:* R$ 25000.00 (50.0%)");
      expect(res.answer).toContain("Pix:* R$ 15000.00 (30.0%)");
      expect(res.answer).toContain("Dinheiro:* R$ 2500.00 (5.0%)");
    });

    it("17. Permissões: Agente de Vendas e PDV pode ser consultado por colaboradores (member)", () => {
      const auth = authorizeSpecialistAccess("vendas_pdv", "member");
      expect(auth.authorized).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GATE 3 & 4: INTEGRAÇÃO UNIFICADA E CONTROLE DE FERRAMENTAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Gate 3 & 4: Integração com Orchestrator e Isolamento de Ferramentas", () => {
    it("18. fetchAndExecuteSpecialistTurn deve despachar corretamente para Fiscal, Vendas ou Financeiro", async () => {
      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn().mockResolvedValue([]),
        listExpenses: vi.fn().mockResolvedValue([]),
        listTransactions: vi.fn().mockResolvedValue([]),
        listBalances: vi.fn().mockResolvedValue([]),
        listDebts: vi.fn().mockResolvedValue([]),
        listSalesPDV: vi.fn().mockResolvedValue([]),
        listFiscalNotes: vi.fn().mockResolvedValue([]),
        listDocumentSessions: vi.fn().mockResolvedValue([]),
        listSalesPdvDetails: vi.fn().mockResolvedValue([]),
      };

      const fiscalTurn = await fetchAndExecuteSpecialistTurn(
        "Quais notas fiscais recebi nesta semana?",
        dummyContext,
        mockRepo
      );
      expect(fiscalTurn.handled).toBe(true);
      expect(fiscalTurn.specialist).toBe("fiscal");

      const vendasTurn = await fetchAndExecuteSpecialistTurn(
        "Quanto faturamos ontem no balcão?",
        dummyContext,
        mockRepo
      );
      expect(vendasTurn.handled).toBe(true);
      expect(vendasTurn.specialist).toBe("vendas_pdv");

      const finTurn = await fetchAndExecuteSpecialistTurn(
        "Quanto faturei ontem?",
        dummyContext,
        mockRepo
      );
      expect(finTurn.handled).toBe(true);
      expect(finTurn.specialist).toBe("financeiro");
    });

    it("19. Nenhum especialista consultivo possui permissão de mutação direta (canMutateState === false)", () => {
      expect(SPECIALIST_AGENTS_REGISTRY.fiscal.canMutateState).toBe(false);
      expect(SPECIALIST_AGENTS_REGISTRY.vendas_pdv.canMutateState).toBe(false);
      expect(SPECIALIST_AGENTS_REGISTRY.financeiro.canMutateState).toBe(false);
    });
  });
});
