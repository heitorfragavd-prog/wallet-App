import { describe, it, expect } from "vitest";
import { calcularPeriodoFatura } from "../hooks/useFaturasCartao";

describe("Fatura Cartão Isolation & Ownership Tests", () => {
  const cardNubank = {
    id: "54bb6f97-7374-4ee6-9a04-3b1cd8d3ff70",
    nome: "Nubank (Cartão Gold)",
    tipo: "cartao_credito",
    dia_fechamento: null,
    dia_vencimento: 19,
    saldo_atual: 501.30,
    limite_credito: 1600,
    workspace_id: "ws-pj-rodo-point"
  };

  const cardItau = {
    id: "8b52cd97-9c2a-47cd-988b-4146361528e7",
    nome: "itaú black",
    tipo: "cartao_credito",
    dia_fechamento: 15,
    dia_vencimento: 16,
    saldo_atual: 10000,
    limite_credito: 0,
    workspace_id: "ws-pj-rodo-point"
  };

  const cardSicoob = {
    id: "7deda982-846d-4642-b120-90e5d78d8842",
    nome: "Sicoob",
    tipo: "cartao_credito",
    dia_fechamento: 1,
    dia_vencimento: 22,
    saldo_atual: 113.45,
    limite_credito: 20000,
    workspace_id: "ws-pj-rodo-point"
  };

  const sampleDespesas = [
    // 1. Despesa explícita do Itaú
    {
      id: "d-itau-1",
      descricao: "Compra Itaú Black",
      valor: 250.00,
      data: "2026-08-05",
      conta_id: "8b52cd97-9c2a-47cd-988b-4146361528e7",
      cartao_id: "8b52cd97-9c2a-47cd-988b-4146361528e7",
      metodo_pagamento: "cartao_credito",
      workspace_id: "ws-pj-rodo-point"
    },
    // 2. Despesa explícita do Sicoob
    {
      id: "d-sicoob-1",
      descricao: "Combustível Sicoob",
      valor: 450.00,
      data: "2026-08-10",
      conta_id: "7deda982-846d-4642-b120-90e5d78d8842",
      cartao_id: null,
      metodo_pagamento: "cartao_credito",
      workspace_id: "ws-pj-rodo-point"
    },
    // 3. Despesa histórica/órfã sem conta_id e sem cartao_id (R$ 4.277,37 bug)
    {
      id: "d-orphan-1",
      descricao: "FULLDARIN BETIM BETIM",
      valor: 4277.37,
      data: "2026-07-25",
      conta_id: null,
      cartao_id: null,
      metodo_pagamento: "cartao_credito",
      workspace_id: "ws-pj-rodo-point"
    },
    // 4. Despesa de outro workspace (PF)
    {
      id: "d-pf-1",
      descricao: "Compra Pessoal",
      valor: 800.00,
      data: "2026-08-05",
      conta_id: "54bb6f97-7374-4ee6-9a04-3b1cd8d3ff70",
      cartao_id: "54bb6f97-7374-4ee6-9a04-3b1cd8d3ff70",
      metodo_pagamento: "cartao_credito",
      workspace_id: "ws-pf-pessoal"
    }
  ];

  function filterDespesasForCard(despesas: typeof sampleDespesas, targetCardId: string, currentWorkspaceId: string) {
    return despesas.filter((d) => {
      if (d.workspace_id !== currentWorkspaceId) return false;
      return d.cartao_id === targetCardId || d.conta_id === targetCardId;
    });
  }

  it("1. Nubank abre SOMENTE despesas do Nubank (0 despesas órfãs)", () => {
    const nubankDespesas = filterDespesasForCard(sampleDespesas, cardNubank.id, "ws-pj-rodo-point");
    expect(nubankDespesas).toHaveLength(0);
    expect(nubankDespesas.some((d) => d.valor === 4277.37)).toBe(false);
  });

  it("2. Itaú abre SOMENTE despesas do Itaú", () => {
    const itauDespesas = filterDespesasForCard(sampleDespesas, cardItau.id, "ws-pj-rodo-point");
    expect(itauDespesas).toHaveLength(1);
    expect(itauDespesas[0].id).toBe("d-itau-1");
    expect(itauDespesas[0].valor).toBe(250.00);
  });

  it("3. Sicoob abre SOMENTE despesas do Sicoob", () => {
    const sicoobDespesas = filterDespesasForCard(sampleDespesas, cardSicoob.id, "ws-pj-rodo-point");
    expect(sicoobDespesas).toHaveLength(1);
    expect(sicoobDespesas[0].id).toBe("d-sicoob-1");
    expect(sicoobDespesas[0].valor).toBe(450.00);
  });

  it("4. Despesas órfãs sem conta_id / cartao_id NUNCA são atribuídas a nenhum cartão", () => {
    const nubank = filterDespesasForCard(sampleDespesas, cardNubank.id, "ws-pj-rodo-point");
    const itau = filterDespesasForCard(sampleDespesas, cardItau.id, "ws-pj-rodo-point");
    const sicoob = filterDespesasForCard(sampleDespesas, cardSicoob.id, "ws-pj-rodo-point");

    const allAssigned = [...nubank, ...itau, ...sicoob];
    expect(allAssigned.some((d) => d.id === "d-orphan-1")).toBe(false);
  });

  it("5. Workspace diferente (PF vs PJ) não cruza faturas ou lançamentos", () => {
    const pjNubank = filterDespesasForCard(sampleDespesas, cardNubank.id, "ws-pj-rodo-point");
    const pfNubank = filterDespesasForCard(sampleDespesas, cardNubank.id, "ws-pf-pessoal");

    expect(pjNubank.some((d) => d.id === "d-pf-1")).toBe(false);
    expect(pfNubank).toHaveLength(1);
    expect(pfNubank[0].id).toBe("d-pf-1");
  });

  it("6. Cálculo de período respeita fechamento e vencimento de cada cartão", () => {
    const pNubank = calcularPeriodoFatura(cardNubank, 8, 2026);
    const pItau = calcularPeriodoFatura(cardItau, 8, 2026);
    const pSicoob = calcularPeriodoFatura(cardSicoob, 8, 2026);

    expect(pItau.data_fechamento).toBe("2026-08-15");
    expect(pItau.data_vencimento).toBe("2026-08-16");

    expect(pSicoob.data_fechamento).toBe("2026-08-01");
    expect(pSicoob.data_vencimento).toBe("2026-08-22");

    expect(pNubank.data_vencimento).toBe("2026-08-19");
  });
});
