import { describe, it, expect } from "vitest";
import { getCeoPeriodRange } from "./ceoDateRanges";

describe("ceoDateRanges — Gate 2: Filtros, Datas e Comparativos", () => {
  it("1. Cenário 01/11/2026: 'este_mes' inicia estritamente em 2026-11-01 e compara com 2026-10-01", () => {
    const ref = new Date("2026-11-01T14:00:00-03:00");
    const range = getCeoPeriodRange("este_mes", ref);

    expect(range.inicioStr).toBe("2026-11-01");
    expect(range.fimStr).toBe("2026-11-01");
    expect(range.inicioAntStr).toBe("2026-10-01");
    expect(range.fimAntStr).toBe("2026-10-01");
    expect(range.diasNoPeriodo).toBe(1);
  });

  it("2. Cenário 02/11/2026: 'este_mes' cobre de 2026-11-01 a 2026-11-02 vs 2026-10-01 a 2026-10-02", () => {
    const ref = new Date("2026-11-02T10:00:00-03:00");
    const range = getCeoPeriodRange("este_mes", ref);

    expect(range.inicioStr).toBe("2026-11-01");
    expect(range.fimStr).toBe("2026-11-02");
    expect(range.inicioAntStr).toBe("2026-10-01");
    expect(range.fimAntStr).toBe("2026-10-02");
    expect(range.diasNoPeriodo).toBe(2);
  });

  it("3. Último dia do mês (31/03/2026): mês anterior (fevereiro) capta até dia 28", () => {
    const ref = new Date("2026-03-31T18:00:00-03:00");
    const range = getCeoPeriodRange("este_mes", ref);

    expect(range.inicioStr).toBe("2026-03-01");
    expect(range.fimStr).toBe("2026-03-31");
    // Fevereiro de 2026 tem 28 dias
    expect(range.inicioAntStr).toBe("2026-02-01");
    expect(range.fimAntStr).toBe("2026-02-28");
    expect(range.diasNoPeriodo).toBe(31);
  });

  it("4. Janeiro após dezembro (05/01/2027): ano anterior vira corretamente para 2026", () => {
    const ref = new Date("2027-01-05T12:00:00-03:00");
    const range = getCeoPeriodRange("este_mes", ref);

    expect(range.inicioStr).toBe("2027-01-01");
    expect(range.fimStr).toBe("2027-01-05");
    expect(range.inicioAntStr).toBe("2026-12-01");
    expect(range.fimAntStr).toBe("2026-12-05");
    expect(range.diasNoPeriodo).toBe(5);
  });

  it("5. Fevereiro em ano bissexto (29/02/2024): período equivalente capta 29 dias em janeiro", () => {
    const ref = new Date("2024-02-29T15:00:00-03:00");
    const range = getCeoPeriodRange("este_mes", ref);

    expect(range.inicioStr).toBe("2024-02-01");
    expect(range.fimStr).toBe("2024-02-29");
    expect(range.inicioAntStr).toBe("2024-01-01");
    expect(range.fimAntStr).toBe("2024-01-29");
    expect(range.diasNoPeriodo).toBe(29);
  });

  it("6. Últimos 7 dias (02/11/2026): janela exata de 7 dias contíguos (27/10 a 02/11) vs (20/10 a 26/10)", () => {
    const ref = new Date("2026-11-02T12:00:00-03:00");
    const range = getCeoPeriodRange("ultimos_7_dias", ref);

    expect(range.inicioStr).toBe("2026-10-27");
    expect(range.fimStr).toBe("2026-11-02");
    expect(range.inicioAntStr).toBe("2026-10-20");
    expect(range.fimAntStr).toBe("2026-10-26");
    expect(range.diasNoPeriodo).toBe(7);
  });

  it("7. Últimos 30 dias (02/11/2026): janela de 30 dias contíguos (04/10 a 02/11) vs (04/09 a 03/10)", () => {
    const ref = new Date("2026-11-02T12:00:00-03:00");
    const range = getCeoPeriodRange("ultimos_30_dias", ref);

    expect(range.inicioStr).toBe("2026-10-04");
    expect(range.fimStr).toBe("2026-11-02");
    expect(range.inicioAntStr).toBe("2026-09-04");
    expect(range.fimAntStr).toBe("2026-10-03");
    expect(range.diasNoPeriodo).toBe(30);
  });
});
