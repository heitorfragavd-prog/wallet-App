import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooks = ["useComparativoPeriodos.ts", "useComparativoDiario.ts"];

describe("escopo isolado de dados dos comparativos", () => {
  it.each(hooks)("isolar dados estritamente por workspace_id em %s", (filename) => {
    const source = readFileSync(resolve(process.cwd(), "src/domains/finance/hooks", filename), "utf8");

    expect(source).toContain('.eq("workspace_id", workspaceId)');
    expect(source).not.toContain('workspace_id.is.null');
  });
});
