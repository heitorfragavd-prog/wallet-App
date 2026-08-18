import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("wallet-ai-query edge entrypoint", () => {
  it("wires the secure handler without accepting client identity", () => {
    const source = readFileSync(resolve("supabase/functions/wallet-ai-query/index.ts"), "utf8");
    expect(source).toContain("Deno.serve(handler)");
    expect(source).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(source).toContain("authorizeAiRequest");
    expect(source).toContain("createSupabaseAuthorizationDependencies");
    expect(source).toContain("createFinancialRepository");
    expect(source).not.toMatch(/body\.(userId|user_id)/);
    expect(source).not.toContain("OPENAI_API_KEY");
  });
});
