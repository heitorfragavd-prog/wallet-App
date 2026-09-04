import { describe, it, expect } from "vitest";
function calc(now) {
  const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}
function calcBug(now) {
  return `${now.getFullYear()}-${String(now.getMonth()-2).padStart(2,"0")}-01`;
}
describe("inicioJanela", () => {
  it("Janeiro -> Outubro ano anterior", () => { expect(calc(new Date(2026,0,15))).toBe("2025-10-01"); });
  it("Fevereiro -> Novembro ano anterior", () => { expect(calc(new Date(2026,1,10))).toBe("2025-11-01"); });
  it("Agosto -> Maio", () => { expect(calc(new Date(2026,7,26))).toBe("2026-05-01"); });
  it("Dezembro dia 31 -> Setembro sem overflow", () => { expect(calc(new Date(2026,11,31))).toBe("2026-09-01"); });
  it("termina sempre com -01", () => { expect(calc(new Date(2026,0,15))).toMatch(/-01$/); });
  it("mes nunca e negativo em todos os meses", () => {
    for (let m = 0; m < 12; m++) {
      expect(parseInt(calc(new Date(2026,m,1)).split("-")[1])).toBeGreaterThanOrEqual(1);
    }
  });
  it("BUG: Janeiro com bug -> string malformada", () => { expect(calcBug(new Date(2026,0,15))).toBe("2026--2-01"); });
});