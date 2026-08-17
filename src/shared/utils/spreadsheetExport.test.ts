import { describe, expect, it } from "vitest";
import { createSpreadsheetXml, toCsv } from "./spreadsheetExport";

describe("spreadsheetExport", () => {
  it("escapa XML e neutraliza formulas vindas de dados", () => {
    const xml = createSpreadsheetXml([{ name: "Dados", rows: [{ Nome: "<Teste>", Valor: "=1+1" }] }]);
    expect(xml).toContain("&lt;Teste&gt;");
    expect(xml).toContain("&apos;=1+1");
  });

  it("gera CSV UTF-8 seguro para Excel", () => {
    expect(toCsv([{ Nome: "A;B", Valor: "+CMD" }])).toContain('"A;B";\"\'+CMD\"');
  });
});
