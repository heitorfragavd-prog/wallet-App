import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseAuthorizationDependencies,
  executeSupabaseFinancialQuery,
  writeSupabaseAiAudit,
} from "../../../../supabase/functions/wallet-ai-query/supabase-adapter";

class FakeQuery implements PromiseLike<{ data: Record<string, unknown>[]; error: null }> {
  calls: Array<[string, ...unknown[]]> = [];

  select(columns: string): this {
    this.calls.push(["select", columns]);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.calls.push(["eq", column, value]);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.calls.push(["gte", column, value]);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.calls.push(["lte", column, value]);
    return this;
  }

  maybeSingle(): Promise<{ data: { id: string } | null; error: null }> {
    this.calls.push(["maybeSingle"]);
    return Promise.resolve({ data: { id: "workspace" }, error: null });
  }

  insert(value: unknown): Promise<{ error: null }> {
    this.calls.push(["insert", value]);
    return Promise.resolve({ error: null });
  }

  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }
}

describe("wallet AI Supabase adapter", () => {
  it("applies both scope filters and the requested date range", async () => {
    const query = new FakeQuery();
    const client = { from: vi.fn(() => query) };

    await executeSupabaseFinancialQuery(client, {
      table: "receitas",
      columns: "id,user_id,workspace_id",
      equals: { user_id: "user", workspace_id: "workspace" },
      dateRange: { column: "data", start: "2026-08-01", end: "2026-08-31" },
    });

    expect(query.calls).toEqual([
      ["select", "id,user_id,workspace_id"],
      ["eq", "user_id", "user"],
      ["eq", "workspace_id", "workspace"],
      ["gte", "data", "2026-08-01"],
      ["lte", "data", "2026-08-31"],
    ]);
  });

  it("validates the token and workspace owner through server dependencies", async () => {
    const query = new FakeQuery();
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user" } }, error: null })) },
      from: vi.fn(() => query),
    };
    const dependencies = createSupabaseAuthorizationDependencies(client);

    await expect(dependencies.getUser("token")).resolves.toEqual({ id: "user" });
    await expect(dependencies.findOwnedWorkspace("workspace", "user")).resolves.toEqual({ id: "workspace" });
    expect(query.calls).toContainEqual(["eq", "id", "workspace"]);
    expect(query.calls).toContainEqual(["eq", "user_id", "user"]);
  });

  it("writes only sanitized audit metadata", async () => {
    const query = new FakeQuery();
    const client = { from: vi.fn(() => query) };
    await writeSupabaseAiAudit(client, {
      userId: "user",
      workspaceId: "workspace",
      tool: "consultar_saldos",
      status: "success",
      durationMs: 12,
    });

    const inserted = query.calls.find(([method]) => method === "insert")?.[1];
    expect(inserted).toEqual({
      user_id: "user",
      workspace_id: "workspace",
      tool_name: "consultar_saldos",
      execution_status: "success",
      duration_ms: 12,
      error_code: null,
    });
    expect(JSON.stringify(inserted)).not.toContain("token");
  });
});
