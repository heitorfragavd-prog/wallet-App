import { describe, it, expect } from "vitest";
import {
  SPECIALIST_AGENTS_REGISTRY,
  authorizeSpecialistAccess,
  type SpecialistAgentId,
} from "../../supabase/functions/_shared/ai/specialist-registry";
import {
  routeUserQueryToSpecialists,
  buildFinancialSpecialistDeterministicResponse,
} from "../../supabase/functions/_shared/ai/specialist-router";

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

  describe("Gate 6: Respostas Determinísticas do Agente Financeiro", () => {
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
  });
});
