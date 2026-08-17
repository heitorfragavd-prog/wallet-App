import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooks = ["useComparativoPeriodos.ts", "useComparativoDiario.ts"];

describe("escopo de dados legados dos comparativos", () => {
  it.each(hooks)("inclui a carteira atual e registros antigos sem workspace em %s", (filename) => {
    const source = readFileSync(resolve(process.cwd(), "src/domains/finance/hooks", filename), "utf8");

    expect(source).toContain('query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)');
    expect(source).not.toContain('query.eq("workspace_id", workspaceId)');
  });
});
