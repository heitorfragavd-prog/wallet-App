import { describe, it, expect, vi } from "vitest";
import {
  buildSalesPdvSpecialistDeterministicResponse,
  fetchAndExecuteSalesPdvSpecialist,
  routeUserQueryToSpecialists,
} from "../../supabase/functions/_shared/ai/specialist-router";
import type { SalesPdvDeterministicData } from "../../supabase/functions/_shared/ai/specialist-router";
import type {
  FinancialQueryRepository,
  SalesPdvDetailRecord,
  InventoryItemRecord,
  RecipeCardRecord,
} from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext } from "../../supabase/functions/_shared/ai/auth";

describe("Wallet CEO 3.0 — Testes Canônicos do Chat (Cenários A a H)", () => {
  const mockContext: AiExecutionContext = {
    userId: "user-ceo-rodo-point",
    workspaceId: "2af415b6-76aa-4134-8133-a9b405671c1c",
    correlationId: "corr-ceo-queries-a-to-h",
    role: "owner",
  };

  const mockSalesData: SalesPdvDeterministicData = {
    vendasOntemTotal: 1540.5,
    pedidosOntemTotal: 85,
    itensOntemTotal: 142,
    lucroBrutoOntemCalculavel: 720.4,
    coberturaCustosOntemPercent: 88.5,
    produtosSemCustoOntemQtd: 1,
    yesterdayDateStr: "2026-11-19",
    targetDateStr: "2025-11-20",
    vendasTargetDateTotal: 999.1,
    pedidosTargetDateTotal: 89,
    top5ProdutosOntem: [
      {
        nome: "TRIDENT",
        codigo: "2032416",
        quantidade: 32,
        total: 128.0,
        custoUnitario: 1.71,
        cmvTotal: 54.72,
        lucroBruto: 73.28,
        margem: 57.3,
        statusCusto: "confirmado",
      },
      {
        nome: "Pão de Queijo",
        codigo: "100001",
        quantidade: 28,
        total: 84.0,
        custoUnitario: 1.35,
        cmvTotal: 37.8,
        lucroBruto: 46.2,
        margem: 55.0,
        statusCusto: "confirmado",
      },
      {
        nome: "TRENTO",
        codigo: "2032412",
        quantidade: 22,
        total: 77.0,
        custoUnitario: 1.63,
        cmvTotal: 35.86,
        lucroBruto: 41.14,
        margem: 53.4,
        statusCusto: "confirmado",
      },
      {
        nome: "Snickers",
        codigo: "2032404",
        quantidade: 18,
        total: 90.0,
        custoUnitario: 3.05,
        cmvTotal: 54.9,
        lucroBruto: 35.1,
        margem: 39.0,
        statusCusto: "confirmado",
      },
      {
        nome: "Salgado Especial Sem Custo",
        codigo: "999999",
        quantidade: 15,
        total: 135.0,
        custoUnitario: null,
        cmvTotal: null,
        lucroBruto: null,
        margem: null,
        statusCusto: "sem_custo",
      },
    ],
  };

  it("Teste A: 'Quais foram os cinco produtos mais vendidos ontem?' -> retorna tabela GATE 5 com Custo unitário", () => {
    const plan = routeUserQueryToSpecialists("Quais foram os cinco produtos mais vendidos ontem?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quais foram os cinco produtos mais vendidos ontem?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("| Produto | Quantidade | Faturamento | Custo unitário | CMV | Lucro bruto | Margem |");
    expect(res.answer).toContain("TRIDENT");
    expect(res.answer).toContain("R$ 1.71");
    expect(res.answer).toContain("57.3%");
    expect(res.answer).toContain("Custo não confirmado"); // Salgado especial sem custo
  });

  it("Teste B: 'Lista para mim os cinco produtos que mais vendi ontem.' -> roteia e responde perfeitamente", () => {
    const plan = routeUserQueryToSpecialists("Lista para mim os cinco produtos que mais vendi ontem.");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Lista para mim os cinco produtos que mais vendi ontem.", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("TOP 5 PRODUTOS");
    expect(res.answer).toContain("TRIDENT");
  });

  it("Teste C: 'Quais foram os cinco produtos mais vendidos ontem e a margem de lucro?' -> traz margens detalhadas", () => {
    const plan = routeUserQueryToSpecialists("Quais foram os cinco produtos mais vendidos ontem e a margem de lucro?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quais foram os cinco produtos mais vendidos ontem e a margem de lucro?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("57.3%");
    expect(res.answer).toContain("55.0%");
  });

  it("Teste D: 'Quanto ganhei com cada um desses produtos?' -> traz ranking por lucro bruto em reais", () => {
    const plan = routeUserQueryToSpecialists("Quanto ganhei com cada um desses produtos?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quanto ganhei com cada um desses produtos?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("Comparativo de Lucro Bruto em Reais");
    expect(res.answer).toContain("🏆 **TRIDENT**");
    expect(res.answer).toContain("R$ 73.28");
  });

  it("Teste E: 'Quais os custos de atacado desses cinco produtos?' -> identifica proveniência (Orçamento 16852 / Ficha Técnica)", () => {
    const plan = routeUserQueryToSpecialists("Quais os custos de atacado desses cinco produtos?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quais os custos de atacado desses cinco produtos?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("Custos de Atacado dos 5 Produtos Mais Vendidos");
    expect(res.answer).toContain("Orçamento nº 16852 de 13/11/2026 - Atacado"); // Trident, Trento, Snickers
    expect(res.answer).toContain("Ficha técnica de produção própria"); // Pão de Queijo
    expect(res.answer).toContain("Custo não confirmado — margem indisponível"); // Salgado sem custo
  });

  it("Teste F: 'Quanto foi o CMV de ontem?' -> apura CMV com segregação de receita sem custo", () => {
    const plan = routeUserQueryToSpecialists("Quanto foi o CMV de ontem?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quanto foi o CMV de ontem?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("Apuração do CMV de Ontem");
    expect(res.answer).toContain("Faturamento Total Auditado:");
    expect(res.answer).toContain("CMV Total Realizado:");
    expect(res.answer).toContain("Receita sem Custo Confirmado:");
  });

  it("Teste G: 'Quais produtos ainda estão sem custo confirmado?' -> lista itens pendentes de custo", () => {
    const plan = routeUserQueryToSpecialists("Quais produtos ainda estão sem custo confirmado?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quais produtos ainda estão sem custo confirmado?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("Produtos Vendidos sem Custo Confirmado");
    expect(res.answer).toContain("Salgado Especial Sem Custo");
  });

  it("Teste H: 'Quanto vendi em 20/11/2025?' -> apura data histórica arbitrária", () => {
    const plan = routeUserQueryToSpecialists("Quanto vendi em 20/11/2025?");
    expect(plan.primarySpecialist).toBe("vendas_pdv");
    expect(plan.isDeterministicPossible).toBe(true);

    const res = buildSalesPdvSpecialistDeterministicResponse("Quanto vendi em 20/11/2025?", mockSalesData);
    expect(res.handled).toBe(true);
    expect(res.answer).toContain("Vendas em 20/11/2025 (Balcão)");
    expect(res.answer).toContain("Faturamento Bruto:* R$ 999.10");
    expect(res.answer).toContain("89 comanda(s)");
    expect(res.answer).toContain("Ticket Médio por Comanda:* R$ 11.23");
  });
});
