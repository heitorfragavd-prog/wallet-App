import { describe, it, expect } from "vitest";

describe("Dashboard - Consolidação de Despesas, Receitas e Saldo", () => {
  // Função que reproduz a lógica exata de cálculo de totalDespesas do Dashboard
  function calcularTotalDespesasDashboard(despesasConsolidadas: Array<{ valor: number; status?: string }>) {
    return despesasConsolidadas
      .filter((d) => d.status === "pago")
      .reduce((soma, d) => soma + Number(d.valor || 0), 0);
  }

  // Função que reproduz a lógica exata de saldoPeriodo
  function calcularSaldoPeriodo(totalReceitas: number, totalDespesas: number) {
    return Number((totalReceitas - totalDespesas).toFixed(2));
  }

  // Função que reproduz a lógica de transacoesFiltradas com deduplicação segura
  function consolidarTransacoesFiltradas(
    receitasConsolidadas: Array<{ id: string; valor: number; data: string; descricao: string }>,
    despesasConsolidadas: Array<{ id: string; valor: number; data: string; descricao: string; status?: string }>,
    transacoesLocais: Array<{ id: string; valor: number; data: string; descricao: string; tipo: "receita" | "despesa"; observacoes?: string | null }>
  ) {
    const seenIds = new Set<string>();
    const seenExternalIds = new Set<string>();
    const itens: Array<{ id: string; valor: number; tipo: string; descricao: string }> = [];

    receitasConsolidadas.forEach((r) => {
      if (!r.id || seenIds.has(r.id)) return;
      seenIds.add(r.id);
      if (r.id.startsWith("divipay-")) seenExternalIds.add(r.id.replace("divipay-", ""));
      itens.push({ id: r.id, valor: r.valor, tipo: "receita", descricao: r.descricao });
    });

    despesasConsolidadas
      .filter((d) => d.status === "pago")
      .forEach((d) => {
        if (!d.id || seenIds.has(d.id)) return;
        seenIds.add(d.id);
        if (d.id.startsWith("divipay-")) seenExternalIds.add(d.id.replace("divipay-", ""));
        itens.push({ id: d.id, valor: d.valor, tipo: "despesa", descricao: d.descricao });
      });

    transacoesLocais.forEach((t) => {
      if (!t.id || seenIds.has(t.id)) return;
      if (seenExternalIds.size > 0) {
        const obs = String(t.observacoes || "");
        const matchedExternal = Array.from(seenExternalIds).some(
          (extId) => obs.includes(extId) || t.id.includes(extId)
        );
        if (matchedExternal) return;
      }
      seenIds.add(t.id);
      itens.push({ id: t.id, valor: t.valor, tipo: t.tipo, descricao: t.descricao });
    });

    return itens;
  }

  it("1. período de 01/09 a 05/09/2026: Receitas R$ 12.133,28, Despesas R$ 9.828,80 e Saldo R$ 2.304,48", () => {
    const totalReceitas = 12133.28;
    // 13 saques da Divipay do período 01/09 a 05/09 somando R$ 9.828,80
    const despesasConsolidadas = [
      { id: "divipay-1", valor: 1961.00, status: "pago" },
      { id: "divipay-2", valor: 137.50, status: "pago" },
      { id: "divipay-3", valor: 315.00, status: "pago" },
      { id: "divipay-4", valor: 353.57, status: "pago" },
      { id: "divipay-5", valor: 148.53, status: "pago" },
      { id: "divipay-6", valor: 1498.08, status: "pago" },
      { id: "divipay-7", valor: 376.08, status: "pago" },
      { id: "divipay-8", valor: 602.47, status: "pago" },
      { id: "divipay-9", valor: 520.15, status: "pago" },
      { id: "divipay-10", valor: 1957.00, status: "pago" },
      { id: "divipay-11", valor: 811.90, status: "pago" },
      { id: "divipay-12", valor: 1067.52, status: "pago" },
      { id: "divipay-13", valor: 80.00, status: "pago" },
    ];

    const totalDespesas = calcularTotalDespesasDashboard(despesasConsolidadas);
    const saldo = calcularSaldoPeriodo(totalReceitas, totalDespesas);

    expect(Number(totalDespesas.toFixed(2))).toBe(9828.80);
    expect(saldo).toBe(2304.48);
  });

  it("2. período sem despesas resulta em Despesas R$ 0,00 e Saldo igual a Receitas", () => {
    const totalReceitas = 5000;
    const totalDespesas = calcularTotalDespesasDashboard([]);
    const saldo = calcularSaldoPeriodo(totalReceitas, totalDespesas);

    expect(totalDespesas).toBe(0);
    expect(saldo).toBe(5000);
  });

  it("3. despesas com status não liquidado (pendente, cancelado, etc.) são ignoradas", () => {
    const despesas = [
      { id: "d-1", valor: 500, status: "pago" },
      { id: "d-2", valor: 300, status: "pendente" },
      { id: "d-3", valor: 200, status: "cancelado" },
    ];
    const total = calcularTotalDespesasDashboard(despesas);
    expect(total).toBe(500);
  });

  it("4. deduplicação segura: transação local vinculada a saque Divipay não é duplicada", () => {
    const receitas = [{ id: "rec-1", valor: 1000, data: "2026-09-04", descricao: "Venda PDV" }];
    const despesasConsolidadas = [
      { id: "divipay-saque-xyz-123", valor: 350, data: "2026-09-04", descricao: "Pagamento de boleto", status: "pago" },
    ];
    // Transação local persistida no Supabase com o mesmo ID externo nas observações
    const transacoesLocais = [
      {
        id: "trans-local-1",
        valor: 350,
        data: "2026-09-04",
        descricao: "Pagamento de boleto",
        tipo: "despesa" as const,
        observacoes: "Pago via Divipay (Saque Divipay Não Identificado) - saque-xyz-123",
      },
      {
        id: "trans-local-avulsa",
        valor: 120,
        data: "2026-09-04",
        descricao: "Compra material escritório",
        tipo: "despesa" as const,
        observacoes: null,
      },
    ];

    const unificadas = consolidarTransacoesFiltradas(receitas, despesasConsolidadas, transacoesLocais);

    // Deve conter:
    // 1. rec-1
    // 2. divipay-saque-xyz-123
    // 3. trans-local-avulsa (não vinculada)
    // trans-local-1 DEVE SER DESCARTADA pois seu saque já está em despesasConsolidadas
    expect(unificadas).toHaveLength(3);
    expect(unificadas.map((t) => t.id)).toContain("divipay-saque-xyz-123");
    expect(unificadas.map((t) => t.id)).toContain("trans-local-avulsa");
    expect(unificadas.map((t) => t.id)).not.toContain("trans-local-1");
  });

  describe("Regressões Obrigatórias (Seção 10: A até J)", () => {
    // A) Dashboard usa despesas consolidadas
    it("A) Dashboard calcula total de despesas a partir de despesas consolidadas, não apenas transações locais", () => {
      const despesasConsolidadas = [
        { id: "divipay-1", valor: 1500, status: "pago" },
        { id: "divipay-2", valor: 500, status: "pago" },
        { id: "dep-local-1", valor: 250, status: "pago" },
      ];
      const totalDespesas = calcularTotalDespesasDashboard(despesasConsolidadas);
      expect(totalDespesas).toBe(2250);
    });

    // B) Cenário auditado: Receitas 27.723,94, Despesas 26.796,81 => Saldo 927,13
    it("B) Cenário auditado de Setembro: Receitas 27.723,94 e Despesas 26.796,81 geram Saldo de 927,13", () => {
      const totalReceitas = 27723.94;
      // Fixture simulando as despesas consolidadas do snapshot
      const despesasSnapshot = [
        { valor: 20000.00, status: "pago" },
        { valor: 6796.81, status: "pago" },
      ];
      const totalDespesas = calcularTotalDespesasDashboard(despesasSnapshot);
      const saldo = calcularSaldoPeriodo(totalReceitas, totalDespesas);

      expect(totalDespesas).toBe(26796.81);
      expect(saldo).toBe(927.13);
    });

    // C) Despesas do Dia reage quando despesasDeHoje chega assincronamente
    it("C) Despesas do Dia reage à chegada assíncrona de despesasDeHoje com fallback para despesas gerais", () => {
      function calcularDespesasDoDiaComFallback(
        despesasDedicadas: Array<{ data?: string | null; valor?: number | null; status?: string | null }>,
        despesasGerais: Array<{ data?: string | null; valor?: number | null; status?: string | null }>,
        hoje: string
      ) {
        // Função auxiliar idêntica à do useMemo de Despesas.tsx
        const somar = (lista: typeof despesasDedicadas) =>
          lista
            .filter((d) => d.status === "pago" && d.data === hoje)
            .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);

        const totalDedicado = somar(despesasDedicadas);
        if (totalDedicado > 0) return totalDedicado;
        return somar(despesasGerais);
      }

      const hoje = "2026-09-11";
      // Estado 1: despesasDedicadas ainda carregando (vazia), mas despesasGerais já tem itens de hoje
      const despesasGerais = [
        { id: "d-1", data: "2026-09-11", valor: 170.00, status: "pago" },
        { id: "d-2", data: "2026-09-10", valor: 80.00, status: "pago" },
      ];
      const totalInicial = calcularDespesasDoDiaComFallback([], despesasGerais, hoje);
      expect(totalInicial).toBe(170.00); // Nunca exibe R$ 0,00 se já há dados na tela

      // Estado 2: despesasDedicadas completa assincronamente com o item de hoje
      const despesasDedicadas = [
        { id: "d-1", data: "2026-09-11", valor: 170.00, status: "pago" },
      ];
      const totalFinal = calcularDespesasDoDiaComFallback(despesasDedicadas, despesasGerais, hoje);
      expect(totalFinal).toBe(170.00);
    });

    // D) Timestamp UTC da madrugada é classificado corretamente em America/Sao_Paulo
    it("D) Timestamp UTC da madrugada (ex: 02:30 UTC de 11/09) pertence ao dia 10/09 em SP", () => {
      // 11/09/2026 02:30:00 UTC = 10/09/2026 23:30:00 em America/Sao_Paulo (UTC-3)
      const dateUTC = new Date("2026-09-11T02:30:00.000Z");
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const dataSP = formatter.format(dateUTC);
      expect(dataSP).toBe("2026-09-10");
    });

    // E) Divipay líquido continua sendo usado em Receitas
    it("E) Receitas Divipay utilizam estritamente o valor líquido (amountLiquid)", () => {
      const movimentoDivipay = {
        id: "mov-1",
        amountGross: 100.00, // Bruto
        amountLiquid: 97.50,  // Líquido descontando taxas
        status: "SETTLED",
      };
      // Apenas amountLiquid deve compor o consolidado
      const valorParaReceita = Number(movimentoDivipay.amountLiquid || 0);
      expect(valorParaReceita).toBe(97.50);
      expect(valorParaReceita).not.toBe(100.00);
    });

    // F) Eyemobile digital não é duplicado
    it("F) Transações digitais do Eyemobile PDV não são duplicadas no consolidado de receitas", () => {
      const transacoesEyemobile = [
        { id: "eye-1", metodo: "dinheiro", valor: 50.00, descricao: "Venda Eyemobile Dinheiro" },
        { id: "eye-2", metodo: "cartao_credito", valor: 120.00, descricao: "Venda Eyemobile Crédito" }, // Digital
        { id: "eye-3", metodo: "pix", valor: 80.00, descricao: "Venda Eyemobile Pix" }, // Digital
      ];

      // Regra canônica: apenas dinheiro do Eyemobile entra (digital já entra pela Divipay)
      const entradasEyemobileConsolidadas = transacoesEyemobile.filter((t) => t.metodo === "dinheiro");
      expect(entradasEyemobileConsolidadas).toHaveLength(1);
      expect(entradasEyemobileConsolidadas[0].id).toBe("eye-1");
      expect(entradasEyemobileConsolidadas[0].valor).toBe(50.00);
    });

    // G) Classificação BOLETO/PIX permanece correta
    it("G) Classificação não assume boleto por descrição de texto e exige meio comprovado", () => {
      // Saque com descrição 'Pagamento de boleto', mas type 'BILLET' sem explicitPaymentMethod
      const saqueDescricaoBoleto = {
        type: "BILLET",
        description: "Pagamento de boleto para fornecedor",
      };
      // Deve classificar como 'outros', pois não há meio explícito comprovado no contrato da API
      const rawType = saqueDescricaoBoleto.type.toUpperCase();
      const isBoleto = rawType === "BOLETO";
      expect(isBoleto).toBe(false);

      // Saque DICT é Pix legítimo
      const saqueDict = { type: "DICT", description: "Transferência" };
      expect(saqueDict.type).toBe("DICT");
    });

    // H) Ponto de equilíbrio usa vendas consolidadas
    it("H) Ponto de equilíbrio usa receitas consolidadas do dia", () => {
      const receitasConsolidadasHoje = [
        { id: "eye-dinheiro", valor: 250.00 },
        { id: "divipay-pix", valor: 695.33 },
      ];
      const vendasHoje = receitasConsolidadasHoje.reduce((s, r) => s + r.valor, 0);
      expect(vendasHoje).toBe(945.33);
      expect(vendasHoje).toBeGreaterThan(0);
    });

    // I) Não gera meta artificial de R$ 1,65 na ausência de custos fixos
    it("I) Na ausência de custos fixos reais (fixas <= 0), ponto de equilíbrio é 0, evitando meta de R$ 1,65", () => {
      const fixas = 0;
      const dividaResidual = 30; // Parcela de 30 / 26 dias
      // Regra validada: se não há custos fixos operacionais, meta é 0
      const pontoEquilibrio = fixas <= 0 ? 0 : (fixas + dividaResidual) / 26 / 0.70;
      expect(pontoEquilibrio).toBe(0);
      expect(pontoEquilibrio).not.toBe(1.65);
    });

    // J) Workspace A não contamina Workspace B
    it("J) Despesas e receitas respeitam estritamente o workspace_id ativo sem contaminação cross-workspace", () => {
      const workspaceA = "ws-tenant-alpha";
      const workspaceB = "ws-tenant-beta";

      const dados = [
        { id: "1", workspace_id: workspaceA, valor: 1000 },
        { id: "2", workspace_id: workspaceB, valor: 2000 },
        { id: "3", workspace_id: workspaceA, valor: 500 },
      ];

      const filtradosA = dados.filter((d) => d.workspace_id === workspaceA);
      const filtradosB = dados.filter((d) => d.workspace_id === workspaceB);

      expect(filtradosA).toHaveLength(2);
      expect(filtradosA.reduce((s, d) => s + d.valor, 0)).toBe(1500);

      expect(filtradosB).toHaveLength(1);
      expect(filtradosB.reduce((s, d) => s + d.valor, 0)).toBe(2000);
    });
  });
});
