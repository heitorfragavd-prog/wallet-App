import { describe, expect, it } from "vitest";

import { vencimentoObrigacaoMensal } from "./equipeObrigacoes";

describe("vencimentoObrigacaoMensal", () => {
  it("agenda salário no quinto dia útil considerando o sábado pela CLT (ex: Dezembro/2026)", () => {
    // Competência subsequente 2026-12-01: 5º dia útil cai no sábado 05/12/2026
    expect(vencimentoObrigacaoMensal({
      tipo: "funcionario",
      competencia: "2026-12-01",
    })).toBe("2026-12-05");
  });

  it("antecipa salário para a sexta-feira anterior quando configurada antecipação bancária", () => {
    // Dezembro/2026: cai no sábado 05/12/2026, antecipa para sexta 04/12/2026
    expect(vencimentoObrigacaoMensal({
      tipo: "funcionario",
      competencia: "2026-12-01",
      anteciparSeSabado: true,
    })).toBe("2026-12-04");
  });

  it("agenda salário no quinto dia útil em modo legado ignorando fins de semana", () => {
    expect(vencimentoObrigacaoMensal({
      tipo: "funcionario",
      competencia: "2026-09-01",
      feriados: ["2026-09-07"],
      incluirSabado: false,
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
