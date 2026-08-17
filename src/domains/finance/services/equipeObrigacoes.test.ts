import { describe, expect, it } from "vitest";

import { vencimentoObrigacaoMensal } from "./equipeObrigacoes";

describe("vencimentoObrigacaoMensal", () => {
  it("agenda salário no quinto dia útil, ignorando fim de semana e feriado", () => {
    expect(vencimentoObrigacaoMensal({
      tipo: "funcionario",
      competencia: "2026-09-01",
      feriados: ["2026-09-07"],
    })).toBe("2026-09-08");
  });

  it("agenda o pró-labore do Heitor no dia 16 mesmo quando cai no domingo", () => {
    expect(vencimentoObrigacaoMensal({
      tipo: "socio",
      competencia: "2026-08-01",
      diaPagamento: 16,
    })).toBe("2026-08-16");
  });

  it("agenda o pró-labore da Viviane no dia 25", () => {
    expect(vencimentoObrigacaoMensal({
      tipo: "socio",
      competencia: "2026-08-01",
      diaPagamento: 25,
    })).toBe("2026-08-25");
  });

  it("rejeita dia de pagamento fora da faixa segura", () => {
    expect(() => vencimentoObrigacaoMensal({
      tipo: "socio",
      competencia: "2026-08-01",
      diaPagamento: 31,
    })).toThrow(/dia de pagamento/i);
  });
});
