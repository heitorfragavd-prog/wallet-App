import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Conversation Migration Security Test", () => {
  const upSqlPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260818020000_wallet_ai_conversations.sql",
  );
  const downSqlPath = resolve(
    __dirname,
    "../../../../supabase/migrations/rollback/20260818020000_wallet_ai_conversations.down.sql",
  );

  const upSql = readFileSync(upSqlPath, "utf-8");
  const downSql = readFileSync(downSqlPath, "utf-8");

  it("deve criar tabelas wallet_ai_conversations e wallet_ai_messages", () => {
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS public.wallet_ai_conversations");
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS public.wallet_ai_messages");
  });

  it("deve habilitar RLS em ambas as tabelas", () => {
    expect(upSql).toContain("ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;");
    expect(upSql).toContain("ALTER TABLE public.wallet_ai_messages ENABLE ROW LEVEL SECURITY;");
  });

  it("deve criar políticas com TO authenticated e ownership check", () => {
    expect(upSql).toContain("TO authenticated");
    expect(upSql).toContain("(select auth.uid()) = user_id");
  });

  it("o rollback deve remover as tabelas criadas", () => {
    expect(downSql).toContain("DROP TABLE IF EXISTS public.wallet_ai_messages");
    expect(downSql).toContain("DROP TABLE IF EXISTS public.wallet_ai_conversations");
  });
});
