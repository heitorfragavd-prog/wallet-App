import { describe, expect, it } from "vitest";
import { aggregateEquipeReport } from "./EquipeReport";

describe("aggregateEquipeReport", () => {
  it("separa a composição contábil mesmo quando houve uma única transferência", () => {
    const result = aggregateEquipeReport([
      { natureza: "transporte", valor: 109.5 },
      { natureza: "meta", valor: 40 },
      { natureza: "salario", valor: 1621 },
    ], [{ taxa: 3.5, status: "pago" }]);

    expect(result).toMatchObject({ transporte: 109.5, meta: 40, salario: 1621, taxas: 3.5 });
    expect(result.totalEquipe).toBe(1770.5);
    expect(result.totalFinanceiro).toBe(1774);
  });
});
