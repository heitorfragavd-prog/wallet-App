import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("openai-proxy and telegram-webhook Eyemobile integration", () => {
  it("includes consultar_vendas_eyemobile in TOOLS definition", () => {
    const source = readFileSync(resolve("supabase/functions/openai-proxy/index.ts"), "utf-8");
    expect(source).toContain("consultar_vendas_eyemobile");
    expect(source).toContain("data_inicio");
    expect(source).toContain("data_fim");
    expect(source).toContain("America/Sao_Paulo");
  });

  it("handles Eyemobile real-time sales calculation and fallback in executeTool", () => {
    const source = readFileSync(resolve("supabase/functions/openai-proxy/index.ts"), "utf-8");
    expect(source).toContain('case "consultar_vendas_eyemobile":');
    expect(source).toContain("total_vendas");
    expect(source).toContain("quantidade_transacoes");
    expect(source).toContain("ticket_medio");
    expect(source).toContain("vendas_por_metodo");
  });

  it("sanitizes SQL queries with ilike in openai-proxy", () => {
    const source = readFileSync(resolve("supabase/functions/openai-proxy/index.ts"), "utf-8");
    expect(source).toContain("sanitizeIlike");
    expect(source).toContain(".replace(/[%_\\\\]/g,");
  });

  it("validates JWT with Supabase Auth getUser or allows service-role internal calls", () => {
    const source = readFileSync(resolve("supabase/functions/openai-proxy/index.ts"), "utf-8");
    expect(source).toContain("supabaseAuth.auth.getUser(jwt)");
    expect(source).toContain("jwt === supabaseServiceKey && body.user_id");
  });

  it("forwards non-command messages to openai-proxy in telegram-webhook", () => {
    const source = readFileSync(resolve("supabase/functions/telegram-webhook/index.ts"), "utf-8");
    expect(source).toContain("/functions/v1/openai-proxy");
    expect(source).toContain("consultar_vendas_eyemobile");
    expect(source).toContain("gpt-4o-mini");
  });

  it("sets America/Sao_Paulo timezone default in eyemobile-sync", () => {
    const source = readFileSync(resolve("supabase/functions/eyemobile-sync/index.ts"), "utf-8");
    expect(source).toContain("America/Sao_Paulo");
    expect(source).toContain("effectiveStartDate");
    expect(source).toContain("toSaoPauloDate");
  });
});
