import { describe, expect, it } from "vitest";
import { buildColaboradorPayload, createEquipeFormValues, validateEquipeForm } from "./EquipeForm";

describe("EquipeForm", () => {
  it("mantem salario, diaria e pro-labore em campos contabeis distintos", () => {
    const funcionario = buildColaboradorPayload({
      ...createEquipeFormValues(),
      nome: "Funcionaria",
      tipo: "funcionario",
      salario_bruto: "1621",
    });
    const folguista = buildColaboradorPayload({
      ...createEquipeFormValues(),
      nome: "Folguista",
      tipo: "folguista",
      valor_diaria: "100",
    });
    const socio = buildColaboradorPayload({
      ...createEquipeFormValues(),
      nome: "Socio",
      tipo: "socio",
      valor_pro_labore: "5000",
      dia_pagamento: "25",
    });

    expect(funcionario).toMatchObject({ salario_bruto: 1621, valor_diaria: 0, valor_pro_labore: 0 });
    expect(folguista).toMatchObject({ salario_bruto: 0, valor_diaria: 100, valor_pro_labore: 0 });
    expect(socio).toMatchObject({ salario_bruto: 0, valor_diaria: 0, valor_pro_labore: 5000, dia_pagamento: 25 });
  });

  it("rejeita chave Pix incompatível, valores negativos e dia fora de 1 a 28", () => {
    expect(validateEquipeForm({
      ...createEquipeFormValues(),
      nome: "Socio",
      tipo: "socio",
      valor_pro_labore: "-1",
      dia_pagamento: "31",
      pix_tipo: "cpf",
      pix_chave: "123",
    })).toEqual(expect.objectContaining({
      valor_pro_labore: expect.any(String),
      dia_pagamento: expect.any(String),
      pix_chave: expect.any(String),
    }));
  });

  it("aceita CPF Pix formatado e o normaliza no payload", () => {
    const values = {
      ...createEquipeFormValues(),
      nome: "Pessoa",
      pix_tipo: "cpf",
      pix_chave: "123.456.789-00",
    };

    expect(validateEquipeForm(values)).toEqual({});
    expect(buildColaboradorPayload(values).pix_chave).toBe("12345678900");
  });
});
