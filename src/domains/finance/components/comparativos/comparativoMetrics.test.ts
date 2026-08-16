import { describe, expect, it } from "vitest";
import { buildMonthlyPresentation, summarizeMonthly } from "./comparativoMetrics";

const months = [
  { mes: "06/2026", receitas: 100, despesas: 60, saldo: 40, variacaoReceitas: 0, variacaoDespesas: 0 },
  { mes: "07/2026", receitas: 80, despesas: 120, saldo: -40, variacaoReceitas: -20, variacaoDespesas: 100 },
];

describe("comparativoMetrics", () => {
  it("define resultado exatamente como receitas menos despesas", () => {
    expect(buildMonthlyPresentation(months, new Date(2026, 6, 15))[1].resultado).toBe(-40);
  });

  it("marca somente o mês corrente como parcial", () => {
    expect(buildMonthlyPresentation(months, new Date(2026, 6, 15)).map((item) => item.parcial)).toEqual([false, true]);
  });

  it("calcula médias e melhor resultado usando os mesmos meses", () => {
    expect(summarizeMonthly(months)).toEqual({ mediaReceitas: 90, mediaDespesas: 90, mediaResultado: 0, melhorResultado: 40, melhorMes: "06/2026" });
  });

  it("retorna nulls explícitos quando não há meses", () => {
    expect(summarizeMonthly([])).toEqual({ mediaReceitas: null, mediaDespesas: null, mediaResultado: null, melhorResultado: null, melhorMes: null });
  });
});
