import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/20260911120000_pdv_wallet_reconciliation.sql");
const rollbackPath = resolve("supabase/migrations/rollback/20260911120000_pdv_wallet_reconciliation.down.sql");

describe("Fatia 1: Migration e RPC de Conciliação PDV -> Carteira", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const rollbackSql = readFileSync(rollbackPath, "utf8");

  it("cria a tabela pdv_conciliacoes com campos monetários estritamente em BIGINT (centavos)", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.pdv_conciliacoes");
    expect(sql).toContain("gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents >= 0)");
    expect(sql).toContain("fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0)");
    expect(sql).toContain("net_amount_cents BIGINT NOT NULL CHECK (net_amount_cents >= 0)");
    expect(sql).toContain("CONSTRAINT pdv_conciliacoes_amounts_check CHECK (net_amount_cents = (gross_amount_cents - fee_cents))");
  });

  it("garante idempotência estrita via índice único multi-tenant (workspace_id, external_transaction_id)", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS pdv_conciliacoes_workspace_external_uidx");
    expect(sql).toContain("ON public.pdv_conciliacoes (workspace_id, external_transaction_id)");
  });

  it("habilita RLS e aplica políticas com tem_acesso_workspace", () => {
    expect(sql).toContain("ALTER TABLE public.pdv_conciliacoes ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("USING (public.tem_acesso_workspace(workspace_id))");
    expect(sql).toContain("WITH CHECK (public.tem_acesso_workspace(workspace_id))");
  });

  it("define a RPC reconcile_pdv_transaction com SECURITY DEFINER e search_path seguro", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reconcile_pdv_transaction(");
    expect(sql).toContain("p_external_id TEXT");
    expect(sql).toContain("p_wallet_id UUID");
    expect(sql).toContain("p_gross_amount_cents BIGINT");
    expect(sql).toContain("p_fee_cents BIGINT");
    expect(sql).toContain("p_net_amount_cents BIGINT");
    expect(sql).toContain("p_occurred_at TIMESTAMPTZ");
    expect(sql).toContain("p_payment_method TEXT");
    expect(sql).toContain("p_metadata JSONB DEFAULT '{}'::jsonb");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
  });

  it("valida autorização anti-IDOR na RPC exigindo tem_acesso_workspace para a carteira", () => {
    expect(sql).toContain("public.tem_acesso_workspace(v_workspace_id)");
    expect(sql).toContain("Acesso negado: usuário não tem permissão para operar no workspace desta carteira");
  });

  it("valida tratamento de idempotência retornando status already_reconciled sem duplicar", () => {
    expect(sql).toContain("'already_reconciled'");
    expect(sql).toContain("'idempotent', true");
  });

  it("possui script de rollback cirúrgico e não-destrutivo para outras tabelas", () => {
    expect(rollbackSql).toContain("DROP FUNCTION IF EXISTS public.reconcile_pdv_transaction");
    expect(rollbackSql).toContain("DROP TABLE IF EXISTS public.pdv_conciliacoes CASCADE;");
    expect(rollbackSql).not.toContain("DROP TABLE public.workspaces");
    expect(rollbackSql).not.toContain("DROP TABLE public.transacoes");
  });
});
