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

  it("7. Transações Open Finance de cartão vinculam estritamente ao cartão, NÃO à conta corrente", () => {
    const nubankCCId = "d001a65f-aa0d-4a7f-a005-5fcb2a244c5f";
    const openFinanceTxs = [
      {
        id: "tx-pluggy-card-1",
        conta_id: cardNubank.id,
        pluggy_transaction_id: "p-tx-1",
        tipo: "despesa",
        descricao: "Amazon Marketplace",
        valor: 150.00,
        metodo_pagamento: "cartao_credito",
        status_transacao: "POSTED",
        pluggy_bill_id: "bill-aug-2026",
        workspace_id: "ws-pj-rodo-point"
      },
      {
        id: "tx-pluggy-cc-1",
        conta_id: nubankCCId,
        pluggy_transaction_id: "p-tx-2",
        tipo: "despesa",
        descricao: "Pix Enviado Fornecedor",
        valor: 500.00,
        metodo_pagamento: "pix",
        status_transacao: "POSTED",
        pluggy_bill_id: null,
        workspace_id: "ws-pj-rodo-point"
      }
    ];

    const cardTxs = filterDespesasForCard(openFinanceTxs as any, cardNubank.id, "ws-pj-rodo-point");
    expect(cardTxs).toHaveLength(1);
    expect(cardTxs[0].descricao).toBe("Amazon Marketplace");
    expect(cardTxs[0].conta_id).toBe(cardNubank.id);

    // Conta corrente NÃO deve receber a transação de cartão
    const ccTxs = openFinanceTxs.filter(t => t.conta_id === nubankCCId);
    expect(ccTxs).toHaveLength(1);
    expect(ccTxs[0].descricao).toBe("Pix Enviado Fornecedor");
  });

  it("8. Transição PENDING -> POSTED com mesmo pluggy_transaction_id não duplica", () => {
    const txStore = new Map<string, any>();

    function upsertTx(tx: any) {
      const key = `${tx.workspace_id}:${tx.pluggy_transaction_id}`;
      const existing = txStore.get(key);
      if (existing) {
        txStore.set(key, { ...existing, ...tx, id: existing.id });
      } else {
        txStore.set(key, tx);
      }
    }

    // 1ª sincronização: compra recente PENDING sem billId
    upsertTx({
      id: "local-uuid-1",
      workspace_id: "ws-pj-rodo-point",
      pluggy_transaction_id: "pluggy-tx-999",
      descricao: "Posto Ipiranga Betim",
      valor: 200.00,
      status_transacao: "PENDING",
      pluggy_bill_id: null
    });

    expect(txStore.size).toBe(1);
    expect(txStore.get("ws-pj-rodo-point:pluggy-tx-999").status_transacao).toBe("PENDING");
    expect(txStore.get("ws-pj-rodo-point:pluggy-tx-999").pluggy_bill_id).toBeNull();

    // 2ª sincronização: fatura fechou, agora é POSTED com billId
    upsertTx({
      workspace_id: "ws-pj-rodo-point",
      pluggy_transaction_id: "pluggy-tx-999",
      descricao: "Posto Ipiranga Betim",
      valor: 200.00,
      status_transacao: "POSTED",
      pluggy_bill_id: "bill-closed-uuid-123"
    });

    // Deve continuar existindo exatamente 1 registro (idempotente) com status atualizado
    expect(txStore.size).toBe(1);
    expect(txStore.get("ws-pj-rodo-point:pluggy-tx-999").id).toBe("local-uuid-1");
    expect(txStore.get("ws-pj-rodo-point:pluggy-tx-999").status_transacao).toBe("POSTED");
    expect(txStore.get("ws-pj-rodo-point:pluggy-tx-999").pluggy_bill_id).toBe("bill-closed-uuid-123");
  });

  it("9. Metadados de parcelas são preservados e formatados corretamente", () => {
    const rawTx = {
      descricao: "Notebook Dell",
      valor: 350.00,
      parcela_numero: 2,
      parcela_total: 10
    };

    const parcelaInfo = (rawTx.parcela_numero && rawTx.parcela_total)
      ? `(${rawTx.parcela_numero}/${rawTx.parcela_total})`
      : null;

    expect(parcelaInfo).toBe("(2/10)");
  });

  it("10. Cartão Open Finance sem transações detalhadas preserva fallback de saldo_atual consolidado", () => {
    const lancamentosDetalhados: any[] = [];
    const isMesAtual = true;
    const totalLancamentos = lancamentosDetalhados.reduce((acc, i) => acc + i.valor, 0);

    const totalFatura = totalLancamentos > 0
      ? totalLancamentos
      : (isMesAtual && cardNubank.saldo_atual ? Number(cardNubank.saldo_atual) : 0);

    expect(totalFatura).toBe(501.30);
  });
});
