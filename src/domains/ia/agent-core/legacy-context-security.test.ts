import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy financial context workspace isolation", () => {
  it("does not include null-workspace records or query without an active workspace", () => {
    const source = readFileSync(resolve("src/domains/ia/hooks/useFinancialContext.ts"), "utf8");
    expect(source).not.toContain("workspace_id.is.null");
    expect(source).toContain("if (!workspaceId)");
    expect(source).toContain('.eq("workspace_id", workspaceId)');
  });
});
