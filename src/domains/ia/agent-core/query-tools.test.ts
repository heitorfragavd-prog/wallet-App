import { describe, expect, it, vi } from "vitest";
import {
  createQueryToolCatalog,
  executeQueryTool,
  type FinancialQueryRepository,
} from "../../../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";
import type { CanonicalFinancialRecord } from "../../../../supabase/functions/_shared/ai/financial-types";

const context: AiExecutionContext = Object.freeze({
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  accessToken: "secret",
});

function income(): CanonicalFinancialRecord {
  return {
    id: "income-1",
    sourceType: "receita",
    sourceId: "income-1",
    workspaceId: context.workspaceId,
    userId: context.userId,
    kind: "income",
    amount: 250,
    occurredOn: "2026-08-10",
    deduplicationKey: "receita:income-1",
    description: "Venda",
  };
}

function repository(overrides: Partial<FinancialQueryRepository> = {}): FinancialQueryRepository {
  return {
    listRevenues: vi.fn(async () => [income()]),
    listExpenses: vi.fn(async () => []),
    listTransactions: vi.fn(async () => []),
    listBalances: vi.fn(async () => []),
    listDebts: vi.fn(async () => []),
    ...overrides,
  };
}

describe("query tool catalog", () => {
  it("exposes the seven priority read tools", () => {
    expect(Object.keys(createQueryToolCatalog(repository())).sort()).toEqual([
      "buscar_despesas",
      "buscar_receitas",
      "buscar_transacoes",
      "buscar_vendas_pdv",
      "consultar_dividas",
      "consultar_resumo_mensal",
      "consultar_saldos",
    ]);
  });


  it("passes the immutable authenticated context to repository queries", async () => {
    const repo = repository();
    await executeQueryTool(
      "buscar_receitas",
      { start: "2026-08-01", end: "2026-08-31" },
      context,
      createQueryToolCatalog(repo),
    );

    expect(repo.listRevenues).toHaveBeenCalledWith(context, {
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("rejects invalid and inverted periods before accessing data", async () => {
    const repo = repository();
    await expect(
      executeQueryTool(
        "buscar_despesas",
        { start: "31/08/2026", end: "2026-08-01" },
        context,
        createQueryToolCatalog(repo),
      ),
    ).rejects.toThrow("invalid_period");
    expect(repo.listExpenses).not.toHaveBeenCalled();
  });

  it("returns traceable values, filters and formulas for monthly summary", async () => {
    const repo = repository();
    const result = await executeQueryTool(
      "consultar_resumo_mensal",
      { year: 2026, month: 8 },
      context,
      createQueryToolCatalog(repo),
    );

    expect(result).toMatchObject({
      tool: "consultar_resumo_mensal",
      period: { start: "2026-08-01", end: "2026-08-31" },
      filters: { user_id: context.userId, workspace_id: context.workspaceId },
      data: { operationalIncome: 250, cashResult: 250 },
    });
    expect(result.formulas.cashResult).toContain("receitas operacionais");
    expect(result.sources).toEqual([{ type: "receita", ids: ["income-1"] }]);
  });

  it("rejects an unknown tool without touching the repository", async () => {
    const repo = repository();
    await expect(
      executeQueryTool("apagar_tudo", {}, context, createQueryToolCatalog(repo)),
    ).rejects.toThrow("tool_not_allowed");
    expect(repo.listRevenues).not.toHaveBeenCalled();
  });
});
