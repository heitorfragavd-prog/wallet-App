import { describe, it, expect } from "vitest";
import {
  FinancialConsolidationService,
  DespesaInput,
  TransacaoInput,
  DivipayWithdrawInput,
} from "./FinancialConsolidationService";

describe("FinancialConsolidationService — Gate 1: Prevenção Canônica de Duplicidade de Despesas", () => {
  const workspaceId = "ws-rodo-point-123";

  // 1. Despesa manual sem pagamento correspondente
  it("Cenário 1: Despesa manual sem pagamento correspondente reconhece competência mas não caixa", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-energia-nov",
        valor: 500.0,
        data: "2026-11-01",
        descricao: "Conta de Energia CPFL Nov/26",
        workspace_id: workspaceId,
        status: "pendente",
        pago: false,
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes: [],
    });

    expect(report.totalPorCompetencia).toBe(500.0);
    expect(report.totalPorCaixa).toBe(0.0);
    expect(report.lancamentosUnicos).toBe(1);
    expect(report.duplicidadesConfirmadas).toBe(0);
    expect(report.itensConsolidados[0].classificacaoContabil).toBe("obrigacao_cadastrada");
  });

  // 2. Despesa manual posteriormente paga
  it("Cenário 2: Despesa manual posteriormente paga produz SOMENTE UMA despesa econômica (R$ 500,00, não R$ 1.000,00)", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-500",
        valor: 500.0,
        data: "2026-11-01",
        descricao: "Conta de Energia CPFL",
        workspace_id: workspaceId,
        status: "pago",
        pago: true,
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-banco-500",
        valor: 500.0,
        data: "2026-11-02",
        descricao: "DEB ELEKTRON CPFL",
        tipo: "despesa",
        workspace_id: workspaceId,
        deduplication_key: "despesa:desp-500",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    // Total de origem bruto = 1000, mas o consolidado econômico DEVE ser 500!
    expect(report.totalBrutoOrigem).toBe(1000.0);
    expect(report.totalPorCompetencia).toBe(500.0);
    expect(report.totalPorCaixa).toBe(500.0);
    expect(report.duplicidadesConfirmadas).toBe(1);
    expect(report.duplicidadesEvitadasValor).toBe(500.0);
    expect(report.lancamentosConciliados).toBe(1);
    expect(report.lancamentosUnicos).toBe(1);
  });

  // 3. Pagamento via Divipay
  it("Cenário 3: Pagamento via Divipay já persistido na base é contabilizado uma única vez", () => {
    const transacoes: TransacaoInput[] = [
      {
        id: "tx-divipay-1",
        valor: 350.0,
        data: "2026-11-01",
        descricao: "Saque Pix Fornecedor Alimentos",
        tipo: "despesa",
        workspace_id: workspaceId,
        divipay_external_id: "div-saque-abc-999",
      },
    ];

    const divipayWithdraws: DivipayWithdrawInput[] = [
      {
        id: "div-saque-abc-999",
        amount: 350.0,
        createdAt: "2026-11-01T14:30:00Z",
        description: "Saque Pix Fornecedor Alimentos",
        status: "COMPLETED",
        paymentMethod: "pix",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      transacoes,
      divipayWithdraws,
    });

    expect(report.totalBrutoOrigem).toBe(700.0);
    expect(report.totalPorCompetencia).toBe(350.0);
    expect(report.totalPorCaixa).toBe(350.0);
    expect(report.duplicidadesConfirmadas).toBe(1);
    expect(report.duplicidadesEvitadasValor).toBe(350.0);
    expect(report.lancamentosUnicos).toBe(1);
  });

  // 4. Compra no cartão e pagamento da fatura
  it("Cenário 4: Compras no cartão e liquidação de fatura — não duplica para R$ 200,00", () => {
    const despesas: DespesaInput[] = [
      {
        id: "cartao-item-1",
        valor: 60.0,
        data: "2026-11-01",
        descricao: "Café em Grãos Distribuidora",
        workspace_id: workspaceId,
        metodo_pagamento: "cartao_credito",
        status: "pago",
      },
      {
        id: "cartao-item-2",
        valor: 40.0,
        data: "2026-11-01",
        descricao: "Embalagens P/ Viagem",
        workspace_id: workspaceId,
        metodo_pagamento: "cartao_credito",
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-fatura-itau",
        valor: 100.0,
        data: "2026-11-05",
        descricao: "PAGAMENTO DE FATURA CARTÃO ITAU",
        tipo: "despesa",
        workspace_id: workspaceId,
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    // 60 + 40 = 100 de despesas operacionais. Fatura é liquidação de passivo!
    expect(report.totalBrutoOrigem).toBe(200.0);
    expect(report.totalPorCompetencia).toBe(100.0);
    expect(report.totalPorCaixa).toBe(100.0);
    expect(report.lancamentosUnicos).toBe(2);
    expect(
      report.diferencasJustificadas.some((j) => j.tipo === "fatura_cartao")
    ).toBe(true);
  });

  // 5. Transferência entre contas próprias
  it("Cenário 5: Transferência entre contas próprias é excluída do resultado operacional (R$ 0,00)", () => {
    const despesas: DespesaInput[] = [
      {
        id: "transf-1",
        valor: 1000.0,
        data: "2026-11-02",
        descricao: "Transferência → Banco Itaú",
        workspace_id: workspaceId,
        metodo_pagamento: "transferencia",
        status: "pago",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
    });

    expect(report.totalBrutoOrigem).toBe(1000.0);
    expect(report.totalPorCompetencia).toBe(0.0);
    expect(report.totalPorCaixa).toBe(0.0);
    expect(report.lancamentosUnicos).toBe(0);
    expect(
      report.diferencasJustificadas.some((j) => j.tipo === "transferencia_propria")
    ).toBe(true);
  });

  // 6. Pagamento parcial
  it("Cenário 6: Pagamento parcial reconhece obrigação total em competência e valor pago em caixa", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-fornecedor-1000",
        valor: 1000.0,
        data: "2026-11-01",
        descricao: "Fornecedor Panificação Lote 1",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-parcial-400",
        valor: 400.0,
        data: "2026-11-02",
        descricao: "PIX PARCIAL PANIFICACAO",
        tipo: "despesa",
        workspace_id: workspaceId,
        deduplication_key: "despesa:desp-fornecedor-1000",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    expect(report.totalPorCompetencia).toBe(1000.0);
    expect(report.totalPorCaixa).toBe(400.0);
    expect(report.lancamentosConciliados).toBe(1);
    expect(report.lancamentosUnicos).toBe(1);
  });

  // 7. Despesa parcelada
  it("Cenário 7: Despesa parcelada — filtra apenas parcelas que pertencem ao período solicitado", () => {
    const despesas: DespesaInput[] = [
      {
        id: "parc-1",
        valor: 150.0,
        data: "2026-10-15",
        descricao: "Manutenção Maquinário 1/3",
        workspace_id: workspaceId,
        recorrencia_id: "rec-maq-1",
        status: "pago",
      },
      {
        id: "parc-2",
        valor: 150.0,
        data: "2026-11-15",
        descricao: "Manutenção Maquinário 2/3",
        workspace_id: workspaceId,
        recorrencia_id: "rec-maq-1",
        status: "pendente",
      },
    ];

    // Consulta apenas mês de Novembro/2026
    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      options: {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      },
    });

    expect(report.totalPorCompetencia).toBe(150.0);
    expect(report.lancamentosUnicos).toBe(1);
    expect(report.itensConsolidados[0].id).toBe("desp-parc-2");
  });

  // 8. Estorno de pagamento
  it("Cenário 8: Estorno de pagamento reduz o líquido operacional corretamente", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-orig",
        valor: 200.0,
        data: "2026-11-01",
        descricao: "Compra de Insumo com Defeito",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-estorno",
        valor: 200.0,
        data: "2026-11-02",
        descricao: "Estorno de Compra Insumo Defeito",
        tipo: "despesa",
        workspace_id: workspaceId,
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    // 200 da despesa - 200 do estorno = 0
    expect(report.totalPorCompetencia).toBe(0.0);
    expect(report.totalPorCaixa).toBe(0.0);
    expect(
      report.diferencasJustificadas.some((j) => j.tipo === "estorno_reembolso")
    ).toBe(true);
  });

  // 9. Reembolso
  it("Cenário 9: Reembolso ajusta o valor líquido da despesa", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-viagem",
        valor: 150.0,
        data: "2026-11-01",
        descricao: "Adiantamento Despesa de Transporte",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-reembolso",
        valor: 50.0,
        data: "2026-11-02",
        descricao: "Reembolso Transporte Não Utilizado",
        tipo: "despesa",
        workspace_id: workspaceId,
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    // 150 - 50 = 100
    expect(report.totalPorCompetencia).toBe(100.0);
    expect(report.totalPorCaixa).toBe(100.0);
  });

  // 10. Duas despesas legítimas com valores idênticos
  it("Cenário 10: Duas despesas legítimas com valores idênticos no mesmo dia NÃO são descartadas", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-lanche-manha",
        valor: 25.0,
        data: "2026-11-02",
        descricao: "Café Fornecedor Matutino",
        workspace_id: workspaceId,
        status: "pago",
      },
      {
        id: "desp-lanche-tarde",
        valor: 25.0,
        data: "2026-11-02",
        descricao: "Café Fornecedor Vespertino",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
    });

    expect(report.totalPorCompetencia).toBe(50.0);
    expect(report.totalPorCaixa).toBe(50.0);
    expect(report.lancamentosUnicos).toBe(2);
    expect(report.duplicidadesConfirmadas).toBe(0);
  });

  // 11. Lançamentos sem identificador de vínculo
  it("Cenário 11: Lançamentos em tabelas distintas com mesmo valor/data sem vínculo são marcados como conciliação pendente", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-sem-vinculo",
        valor: 89.9,
        data: "2026-11-02",
        descricao: "Material Limpeza Loja",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-sem-vinculo",
        valor: 89.9,
        data: "2026-11-02",
        descricao: "SUPERMERCADO DIA A DIA",
        tipo: "despesa",
        workspace_id: workspaceId,
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    // Não apaga cegamente! Sinaliza conciliação pendente
    expect(report.registrosPendentes).toBe(1);
    expect(
      report.diferencasJustificadas.some((j) => j.tipo === "conciliacao_pendente")
    ).toBe(true);
    expect(report.lancamentosUnicos).toBe(2);
  });

  // 12. Mesma despesa representada em duas tabelas com vínculo explícito
  it("Cenário 12: Vínculo explícito via observações (despesa_id) unifica em lançamento único", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-aluguel-nov",
        valor: 2500.0,
        data: "2026-11-01",
        descricao: "Aluguel Loja Rodovia",
        workspace_id: workspaceId,
        status: "pago",
      },
    ];

    const transacoes: TransacaoInput[] = [
      {
        id: "tx-ted-imobiliaria",
        valor: 2500.0,
        data: "2026-11-02",
        descricao: "TRANSF ELETR IMOBILIARIA RODOVIA",
        tipo: "despesa",
        workspace_id: workspaceId,
        observacoes: "despesa_id: desp-aluguel-nov",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
      transacoes,
    });

    expect(report.totalPorCompetencia).toBe(2500.0);
    expect(report.totalPorCaixa).toBe(2500.0);
    expect(report.duplicidadesConfirmadas).toBe(1);
    expect(report.duplicidadesEvitadasValor).toBe(2500.0);
    expect(report.lancamentosUnicos).toBe(1);
  });

  // 13. Registros de workspaces diferentes
  it("Cenário 13: Registros de workspaces diferentes são estritamente isolados", () => {
    const despesas: DespesaInput[] = [
      {
        id: "desp-ws-correto",
        valor: 300.0,
        data: "2026-11-01",
        descricao: "Despesa do Workspace Alvo",
        workspace_id: workspaceId,
        status: "pago",
      },
      {
        id: "desp-ws-alheio",
        valor: 700.0,
        data: "2026-11-01",
        descricao: "Despesa de Outro Workspace",
        workspace_id: "ws-outro-tenant-999",
        status: "pago",
      },
    ];

    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas,
    });

    expect(report.totalPorCompetencia).toBe(300.0);
    expect(report.lancamentosUnicos).toBe(1);
    expect(report.itensConsolidados[0].id).toBe("desp-desp-ws-correto");
  });

  // 14. Falha de consulta e resultado parcial
  it("Cenário 14: Falha de consulta ou nulos são tratados com resiliência e sinalização de dados parciais", () => {
    const report = FinancialConsolidationService.consolidate({
      workspaceId,
      despesas: null,
      transacoes: null,
      divipayWithdraws: null,
      options: { dadosParciais: true },
    });

    expect(report.totalPorCompetencia).toBe(0.0);
    expect(report.totalPorCaixa).toBe(0.0);
    expect(report.totalBrutoOrigem).toBe(0.0);
    expect(report.dadosParciais).toBe(true);
    expect(report.itensConsolidados).toEqual([]);
  });
});
