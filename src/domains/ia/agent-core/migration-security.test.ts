import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const upPath = resolve("supabase/migrations/20260818010000_wallet_ai_phase1_security.sql");
const downPath = resolve("supabase/migrations/rollback/20260818010000_wallet_ai_phase1_security.down.sql");

describe("Wallet AI phase 1 migration", () => {
  it("creates a scoped audit table without raw financial payload columns", () => {
    const sql = readFileSync(upPath, "utf8").toLowerCase();
    expect(sql).toContain("create table public.wallet_ai_audit_events");
    expect(sql).toContain("user_id uuid not null references auth.users");
    expect(sql).toContain("workspace_id uuid not null references public.workspaces");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.wallet_ai_audit_events from authenticated");
    expect(sql).not.toMatch(/\b(prompt|access_token|api_key|financial_payload)\b/);
  });

  it("adds strict workspace scope to accounts and canonical deduplication columns", () => {
    const sql = readFileSync(upPath, "utf8").toLowerCase();
    expect(sql).toContain("alter table public.contas_usuario");
    expect(sql).toContain("add column if not exists workspace_id");
    expect(sql).toContain("alter column workspace_id set not null");
    for (const table of ["receitas", "despesas", "transacoes"]) {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toContain(`idx_${table}_wallet_ai_dedup`);
    }
  });

  it("provides a rollback limited to objects introduced by this migration", () => {
    const sql = readFileSync(downPath, "utf8").toLowerCase();
    expect(sql).toContain("drop table if exists public.wallet_ai_audit_events");
    expect(sql).toContain("drop column if exists deduplication_key");
    expect(sql).toContain("alter table public.contas_usuario drop column if exists workspace_id");
    expect(sql).not.toContain("drop table public.workspaces");
  });
});
