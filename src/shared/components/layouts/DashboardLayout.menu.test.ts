import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/shared/components/layouts/DashboardLayout.tsx"), "utf8");

describe("DashboardLayout navigation", () => {
  it("mantém Comparativos somente dentro de Relatórios", () => {
    expect(source).toContain('label: "Relatórios", path: "/relatorios"');
    expect(source).not.toContain('label: "Comparativo", path: "/comparativo"');
    expect(source).not.toContain("GitCompare");
  });
});
