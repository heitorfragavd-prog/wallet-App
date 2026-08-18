import { describe, expect, it } from "vitest";
import {
  buildFinancialSummary,
  deduplicateRecords,
} from "../../../../supabase/functions/_shared/ai/financial-core";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
} from "../../../../supabase/functions/_shared/ai/financial-types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function record(overrides: Partial<CanonicalFinancialRecord> = {}): CanonicalFinancialRecord {
  return {
    id: "record-1",
    sourceType: "receita",
    sourceId: "source-1",
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    kind: "income",
    amount: 100,
    occurredOn: "2026-08-10",
    deduplicationKey: "receita:source-1",
    description: "Venda",
    ...overrides,
  };
}

describe("financial core", () => {
  it("deduplicates mirrored records by canonical key", () => {
    const records = [
      record(),
      record({ id: "record-2", sourceType: "transacao", sourceId: "mirror-1" }),
    ];

    const result = deduplicateRecords(records);

    expect(result.records).toHaveLength(1);
    expect(result.duplicates).toEqual([
      expect.objectContaining({ id: "record-2", deduplicationKey: "receita:source-1" }),
    ]);
  });

  it("keeps internal transfers out of operational income and expenses", () => {
    const records = [
      record({ amount: 500 }),
      record({
        id: "expense-1",
        sourceType: "despesa",
        sourceId: "expense-1",
        kind: "expense",
        amount: 125,
        deduplicationKey: "despesa:expense-1",
      }),
      record({
        id: "transfer-1",
        sourceType: "transacao",
        sourceId: "transfer-1",
        kind: "transfer",
        amount: 900,
        deduplicationKey: "transacao:transfer-1",
      }),
    ];

    const summary = buildFinancialSummary(records, [], {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(summary.operationalIncome).toBe(500);
    expect(summary.operationalExpenses).toBe(125);
    expect(summary.cashResult).toBe(375);
    expect(summary.internalTransfers).toBe(900);
  });

  it("reports account balance separately from cash result", () => {
    const balances: CanonicalBalance[] = [
      { accountId: "cash", name: "Caixa", amount: 1_000, type: "checking" },
      { accountId: "card", name: "Cartão", amount: -300, type: "credit_card" },
    ];

    const summary = buildFinancialSummary([record({ amount: 200 })], balances, {
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(summary.availableBalance).toBe(1_000);
    expect(summary.cashResult).toBe(200);
    expect(summary.formulas.availableBalance).toContain("cartões de crédito excluídos");
  });

  it("rejects records from another workspace instead of silently mixing them", () => {
    expect(() =>
      buildFinancialSummary(
        [record({ workspaceId: "33333333-3333-4333-8333-333333333333" })],
        [],
        {
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          start: "2026-08-01",
          end: "2026-08-31",
        },
      ),
    ).toThrow("financial_record_scope_mismatch");
  });

  it("returns source references and duplicate warnings", () => {
    const summary = buildFinancialSummary(
      [record(), record({ id: "record-2", sourceType: "transacao" })],
      [],
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        start: "2026-08-01",
        end: "2026-08-31",
      },
    );

    expect(summary.sources).toEqual([{ type: "receita", ids: ["source-1"] }]);
    expect(summary.warnings).toContain("1 registro duplicado foi desconsiderado.");
  });
});
