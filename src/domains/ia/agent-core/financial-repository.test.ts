import { describe, expect, it } from "vitest";
import {
  createFinancialRepository,
  type FinancialDataQuery,
} from "../../../../supabase/functions/_shared/ai/financial-repository";
import type { AiExecutionContext } from "../../../../supabase/functions/_shared/ai/auth";

const context: AiExecutionContext = Object.freeze({
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  accessToken: "secret",
});
const period = { start: "2026-08-01", end: "2026-08-31" };

describe("financial repository", () => {
  it("applies user and workspace equality filters to every data source", async () => {
    const queries: FinancialDataQuery[] = [];
    const repository = createFinancialRepository(async (query) => {
      queries.push(query);
      return [];
    });

    await Promise.all([
      repository.listRevenues(context, period),
      repository.listExpenses(context, period),
      repository.listTransactions(context, period),
      repository.listBalances(context),
      repository.listDebts(context, period),
    ]);

    expect(queries.map((query) => query.table)).toEqual([
      "receitas",
      "despesas",
      "transacoes",
      "contas_usuario",
      "dividas",
    ]);
    for (const query of queries) {
      expect(query.equals).toEqual({
        user_id: context.userId,
        workspace_id: context.workspaceId,
      });
      expect(JSON.stringify(query)).not.toContain("is.null");
    }
  });

  it("normalizes records and preserves an explicit deduplication key", async () => {
    const repository = createFinancialRepository(async (query) => {
      if (query.table !== "receitas") return [];
      return [
        {
          id: "income-1",
          user_id: context.userId,
          workspace_id: context.workspaceId,
          descricao: "Venda PDV",
          valor: "150.50",
          data: "2026-08-10",
          deduplication_key: "pdv:sale-42",
        },
      ];
    });

    await expect(repository.listRevenues(context, period)).resolves.toEqual([
      expect.objectContaining({
        sourceType: "receita",
        amount: 150.5,
        kind: "income",
        deduplicationKey: "pdv:sale-42",
      }),
    ]);
  });

  it("fails closed when a returned row does not match the authenticated scope", async () => {
    const repository = createFinancialRepository(async () => [
      {
        id: "income-1",
        user_id: context.userId,
        workspace_id: "33333333-3333-4333-8333-333333333333",
        descricao: "Outro workspace",
        valor: 10,
        data: "2026-08-10",
      },
    ]);

    await expect(repository.listRevenues(context, period)).rejects.toThrow("repository_scope_mismatch");
  });
});
