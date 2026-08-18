import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy assistente-financeiro security", () => {
  it("derives identity from Auth and scopes every financial query to workspace", () => {
    const source = readFileSync(resolve("supabase/functions/assistente-financeiro/index.ts"), "utf8");
    expect(source).toContain("authorizeAiRequest(req, workspaceId");
    expect(source).toContain('.eq("user_id", context.userId)');
    expect(source).toContain('.eq("workspace_id", context.workspaceId)');
    expect(source).not.toMatch(/const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*await req\.json/);
  });
});
