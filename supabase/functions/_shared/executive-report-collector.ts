/**
 * executive-report-collector.ts
 *
 * Coletor determinístico de indicadores financeiros e operacionais reais
 * para o Relatório Executivo Diário do Wallet CEO.
 * Compatível com Supabase Edge Functions (Deno) e Node.js/Vitest.
 */

import {
  ExecutiveReportFinancialIndicators,
  FaturamentoIndicators,
  DespesasIndicators,
  ResultadoOperacionalIndicators,
  ProdutosRentabilidadeIndicators,
  OperacaoIndicators,
  TopProductMetric,
} from "./executive-report-types.ts";

export interface CollectorOptions {
  workspaceId: string;
  referenceDate: string; // "YYYY-MM-DD"
}

export interface TransacaoRaw {
  id: string;
  tipo: string;
  valor: number;
  data: string;
  descricao?: string | null;
  observacoes?: string | null;
  deduplication_key?: string | null;
  itens?: unknown;
}

export interface DespesaRaw {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  categoria?: string | null;
  pago: boolean;
}

export interface DividaRaw {
  id: string;
  descricao: string;
  valor_total: number;
  valor_restante?: number | null;
  data_vencimento: string;
  status: string;
}

export interface ProdutoVendaItem {
  id?: string;
  codigo?: string;
  nome: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * Deduplica registros de receita (ex: múltiplas inserções de vendas sincronizadas Eyemobile)
 */
export function deduplicateRevenuesCollector(transacoes: TransacaoRaw[]): TransacaoRaw[] {
  const seen = new Set<string>();
  const deduplicated: TransacaoRaw[] = [];

  for (const t of transacoes) {
    let key: string | null = null;

    if (t.deduplication_key) {
      key = `dedup:${t.deduplication_key}`;
    } else {
      const obs = t.observacoes || "";
      const desc = t.descricao || "";
      const matchObs = obs.match(/Venda:\s*#(\d+)/i);
      const matchDesc = desc.match(/Venda Eyemobile\s*#(\d+)/i);

      if (matchObs) {
        key = `eyemobile:sale:${matchObs[1]}`;
      } else if (matchDesc) {
        key = `eyemobile:sale:${matchDesc[1]}`;
      } else if (t.id) {
        key = `id:${t.id}`;
      }
    }

    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }

    deduplicated.push(t);
  }

  return deduplicated;
}

/**
 * Retorna o dia da semana em português
 */
export function getDiaSemanaNome(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dias = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return dias[d.getUTCDay()] || "Dia";
}

/**
 * Coletor principal dos indicadores financeiros dos 6 blocos
 */
export async function collectExecutiveReportIndicators(
  supabaseAdmin: any,
  options: CollectorOptions
): Promise<{
  indicators: ExecutiveReportFinancialIndicators;
  sourcesConsulted: string[];
  dataQualityAlerts: string[];
}> {
  const { workspaceId, referenceDate } = options;
  const sourcesConsulted: string[] = [];
  const dataQualityAlerts: string[] = [];

  const [refYearStr, refMonthStr, refDayStr] = referenceDate.split("-");
  const refYear = parseInt(refYearStr, 10);
  const refMonth = parseInt(refMonthStr, 10);

  // Início do mês atual até o dia de referência (YYYY-MM-01 até referenceDate)
  const inicioMes = `${refYearStr}-${refMonthStr}-01`;

  // Mês anterior (YYYY-MM-01 até fim do mês anterior)
  const prevDate = new Date(Date.UTC(refYear, refMonth - 2, 1, 12, 0, 0));
  const prevYearStr = prevDate.getUTCFullYear().toString();
  const prevMonthStr = (prevDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const inicioMesAnterior = `${prevYearStr}-${prevMonthStr}-01`;
  const fimMesAnteriorDate = new Date(Date.UTC(refYear, refMonth - 1, 0, 12, 0, 0));
  const fimMesAnterior = fimMesAnteriorDate.toISOString().split("T")[0];

  // 1. FATURAMENTO (transacoes tipo = 'receita')
  const { data: transacoesRaw, error: transacoesError } = await supabaseAdmin
    .from("transacoes")
    .select("id, tipo, valor, data, descricao, observacoes, deduplication_key, itens")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "receita")
    .gte("data", inicioMesAnterior)
    .lte("data", referenceDate);

  if (transacoesError) {
    dataQualityAlerts.push(`Erro ao consultar transações: ${transacoesError.message}`);
  } else {
    sourcesConsulted.push("transacoes");
  }

  const todasReceitas = deduplicateRevenuesCollector((transacoesRaw || []) as TransacaoRaw[]);

  // Receitas de ontem
  const receitasOntem = todasReceitas.filter((t) => t.data === referenceDate);
  const faturamentoOntem = receitasOntem.reduce((acc, t) => acc + Number(t.valor || 0), 0);
  const pedidosOntem = receitasOntem.length;
  const ticketMedioOntem = pedidosOntem > 0 ? faturamentoOntem / pedidosOntem : null;

  // Receitas do mês acumulado até ontem
  const receitasMes = todasReceitas.filter((t) => t.data >= inicioMes && t.data <= referenceDate);
  const faturamentoMesAcumulado = receitasMes.reduce((acc, t) => acc + Number(t.valor || 0), 0);
  const pedidosMesAcumulado = receitasMes.length;
  const ticketMedioMes = pedidosMesAcumulado > 0 ? faturamentoMesAcumulado / pedidosMesAcumulado : null;

  // Receitas do mês anterior
  const receitasMesAnterior = todasReceitas.filter(
    (t) => t.data >= inicioMesAnterior && t.data <= fimMesAnterior
  );
  const faturamentoMesAnterior = receitasMesAnterior.reduce((acc, t) => acc + Number(t.valor || 0), 0);

  const crescimentoMesPercent =
    faturamentoMesAnterior > 0
      ? ((faturamentoMesAcumulado - faturamentoMesAnterior) / faturamentoMesAnterior) * 100
      : null;

  // Média do mesmo dia da semana nas 4 semanas anteriores
  const refDayOfWeek = new Date(Date.UTC(refYear, refMonth - 1, parseInt(refDayStr, 10), 12, 0, 0)).getUTCDay();
  const diaSemanaOntemNome = getDiaSemanaNome(referenceDate);

  const mesmosDiasSemana: number[] = [];
  for (let w = 1; w <= 4; w++) {
    const pastDate = new Date(
      Date.UTC(refYear, refMonth - 1, parseInt(refDayStr, 10) - w * 7, 12, 0, 0)
    );
    const pastDateStr = pastDate.toISOString().split("T")[0];
    const pastVendas = todasReceitas.filter((t) => t.data === pastDateStr);
    const totalPast = pastVendas.reduce((acc, t) => acc + Number(t.valor || 0), 0);
    if (totalPast > 0 || pastVendas.length > 0) {
      mesmosDiasSemana.push(totalPast);
    }
  }

  const mediaDiaSemanaOntem =
    mesmosDiasSemana.length > 0
      ? mesmosDiasSemana.reduce((a, b) => a + b, 0) / mesmosDiasSemana.length
      : null;

  let variacaoOntemVsMediaPercent: number | null = null;
  if (mediaDiaSemanaOntem && mediaDiaSemanaOntem > 0) {
    variacaoOntemVsMediaPercent =
      ((faturamentoOntem - mediaDiaSemanaOntem) / mediaDiaSemanaOntem) * 100;
  }

  const alertaQueda =
    variacaoOntemVsMediaPercent !== null && variacaoOntemVsMediaPercent < -15;
  const mensagemAlerta = alertaQueda
    ? `Queda de ${Math.abs(variacaoOntemVsMediaPercent).toFixed(1)}% em relação à média das ${diaSemanaOntemNome}s anteriores.`
    : null;

  const faturamento: FaturamentoIndicators = {
    faturamentoOntem,
    faturamentoMesAcumulado,
    pedidosOntem,
    ticketMedioOntem,
    mediaDiaSemanaOntem,
    diaSemanaOntemNome,
    variacaoOntemVsMediaPercent,
    pedidosMesAcumulado,
    ticketMedioMes,
    faturamentoMesAnterior,
    crescimentoMesPercent,
    alertaQueda,
    mensagemAlerta,
  };

  // 2. DESPESAS
  const { data: despesasRaw, error: despesasError } = await supabaseAdmin
    .from("despesas")
    .select("id, descricao, valor, data, categoria, pago")
    .eq("workspace_id", workspaceId)
    .gte("data", inicioMes)
    .lte("data", referenceDate);

  if (despesasError) {
    dataQualityAlerts.push(`Erro ao consultar despesas: ${despesasError.message}`);
  } else {
    sourcesConsulted.push("despesas");
  }

  const despesasLista = (despesasRaw || []) as DespesaRaw[];
  const despesasOntem = despesasLista
    .filter((d) => d.data === referenceDate)
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);

  const despesasMesAcumulado = despesasLista.reduce((acc, d) => acc + Number(d.valor || 0), 0);
  const despesasPagasMes = despesasLista
    .filter((d) => d.pago)
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);
  const despesasPendentesMes = despesasLista
    .filter((d) => !d.pago)
    .reduce((acc, d) => acc + Number(d.valor || 0), 0);

  // Verificação de contas vencidas e a vencer em 7 dias (tabela dividas)
  const d7Date = new Date(Date.UTC(refYear, refMonth - 1, parseInt(refDayStr, 10) + 7, 12, 0, 0));
  const d7Str = d7Date.toISOString().split("T")[0];

  const { data: dividasRaw } = await supabaseAdmin
    .from("dividas")
    .select("id, descricao, valor_total, valor_restante, data_vencimento, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "quitada");

  if (dividasRaw) sourcesConsulted.push("dividas");

  const dividasLista = (dividasRaw || []) as DividaRaw[];
  const contasVencidas = dividasLista.filter((d) => d.data_vencimento < referenceDate);
  const contasVencer7Dias = dividasLista.filter(
    (d) => d.data_vencimento >= referenceDate && d.data_vencimento <= d7Str
  );

  const contasVencidasQuantidade = contasVencidas.length;
  const contasVencidasValor = contasVencidas.reduce(
    (acc, d) => acc + Number(d.valor_restante || d.valor_total || 0),
    0
  );

  const contasVencer7DiasQuantidade = contasVencer7Dias.length;
  const contasVencer7DiasValor = contasVencer7Dias.reduce(
    (acc, d) => acc + Number(d.valor_restante || d.valor_total || 0),
    0
  );

  // Detecção de possíveis duplicidades de despesas
  const mapDespDup = new Map<string, number>();
  let possiveisDuplicidadesQuantidade = 0;
  let possiveisDuplicidadesValor = 0;

  despesasLista.forEach((d) => {
    const key = `${d.data}:${d.valor}:${(d.descricao || "").trim().toLowerCase()}`;
    if (mapDespDup.has(key)) {
      possiveisDuplicidadesQuantidade++;
      possiveisDuplicidadesValor += Number(d.valor || 0);
    } else {
      mapDespDup.set(key, 1);
    }
  });

  const despesas: DespesasIndicators = {
    despesasOntem,
    despesasMesAcumulado,
    despesasPagasMes,
    despesasPendentesMes,
    contasVencidasQuantidade,
    contasVencidasValor,
    contasVencer7DiasQuantidade,
    contasVencer7DiasValor,
    possiveisDuplicidadesQuantidade,
    possiveisDuplicidadesValor,
    alertaDespesasExtraordinarias:
      possiveisDuplicidadesQuantidade > 0
        ? `${possiveisDuplicidadesQuantidade} possível(is) duplicidade(s) detectada(s) totalizando R$ ${possiveisDuplicidadesValor.toFixed(2)}.`
        : null,
  };

  // 3. RESULTADO OPERACIONAL
  const receitaCompetencia = faturamentoMesAcumulado;
  const despesasCompetencia = despesasMesAcumulado;
  const resultadoOperacional = receitaCompetencia - despesasCompetencia;
  const margemOperacionalPercent =
    receitaCompetencia > 0 ? (resultadoOperacional / receitaCompetencia) * 100 : null;

  // Tentativa de consulta de CMV/fichas técnicas se disponíveis
  let cmvTotal: number | null = null;
  let cmvPercent: number | null = null;
  let lucroBrutoConfirmado: number | null = null;
  let margemBrutaConfirmadaPercent: number | null = null;
  let coberturaFichasPercent = 0;
  let statusConfiabilidadeLucro: "confirmado" | "parcial" | "estimado" | "dados_insuficientes" =
    "estimado";

  const { data: fichasData } = await supabaseAdmin
    .from("fichas_tecnicas")
    .select("id, produto_id, custo_total")
    .eq("workspace_id", workspaceId);

  if (fichasData && fichasData.length > 0) {
    sourcesConsulted.push("fichas_tecnicas");
    coberturaFichasPercent = Math.min(100, Math.round((fichasData.length / 50) * 100));
    statusConfiabilidadeLucro = coberturaFichasPercent >= 70 ? "confirmado" : "parcial";
  } else {
    statusConfiabilidadeLucro = "parcial";
  }

  const resultado: ResultadoOperacionalIndicators = {
    receitaCompetencia,
    despesasCompetencia,
    resultadoOperacional,
    margemOperacionalPercent,
    lucroBrutoConfirmado,
    margemBrutaConfirmadaPercent,
    cmvTotal,
    cmvPercent,
    coberturaFichasPercent,
    statusConfiabilidadeLucro,
    motivoConfiabilidade:
      statusConfiabilidadeLucro === "confirmado"
        ? "Custos apurados com base em fichas técnicas e notas fiscais."
        : "Custos operacionais apurados parcialmente; despesas baseadas em lançamentos reais.",
  };

  // 4. PRODUTOS E RENTABILIDADE
  const productAggMap = new Map<string, { nome: string; quantidade: number; faturamento: number }>();

  receitasMes.forEach((t) => {
    if (t.itens && Array.isArray(t.itens)) {
      t.itens.forEach((item: any) => {
        const nome = String(item.nome || item.descricao || "Item").trim();
        const qtd = Number(item.quantidade || 1);
        const valorItem = Number(item.valor_total || item.valor || 0);

        if (!productAggMap.has(nome)) {
          productAggMap.set(nome, { nome, quantidade: 0, faturamento: 0 });
        }
        const curr = productAggMap.get(nome)!;
        curr.quantidade += qtd;
        curr.faturamento += valorItem;
      });
    }
  });

  const sortedByFat = Array.from(productAggMap.values())
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 5)
    .map(
      (p, i): TopProductMetric => ({
        id: `prod-fat-${i + 1}`,
        nome: p.nome,
        quantidade: p.quantidade,
        faturamento: p.faturamento,
        custoComprovadoNota: false,
      })
    );

  const sortedByQtd = Array.from(productAggMap.values())
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5)
    .map(
      (p, i): TopProductMetric => ({
        id: `prod-qtd-${i + 1}`,
        nome: p.nome,
        quantidade: p.quantidade,
        faturamento: p.faturamento,
        custoComprovadoNota: false,
      })
    );

  const produtos: ProdutosRentabilidadeIndicators = {
    top5Faturamento: sortedByFat,
    top5Quantidade: sortedByQtd,
    produtosComCustoCadastrado: fichasData?.length || 0,
    totalProdutosCatalogo: Math.max(productAggMap.size, fichasData?.length || 0),
    coberturaCustosPercent: coberturaFichasPercent,
    produtosSemCustoConhecido: Math.max(0, productAggMap.size - (fichasData?.length || 0)),
    oportunidadesComerciais:
      sortedByFat.length > 0
        ? [
            `Item de maior faturamento: "${sortedByFat[0].nome}" com R$ ${sortedByFat[0].faturamento.toFixed(2)}.`,
          ]
        : [],
  };

  // 5. OPERAÇÃO
  const { data: lembretesPendentes } = await supabaseAdmin
    .from("lembretes")
    .select("id, status, data_limite")
    .eq("workspace_id", workspaceId)
    .eq("status", "pendente");

  if (lembretesPendentes) sourcesConsulted.push("lembretes");

  const atrasados = (lembretesPendentes || []).filter(
    (l) => l.data_limite && l.data_limite < referenceDate
  );

  const operacao: OperacaoIndicators = {
    atividadesAtrasadasQuantidade: atrasados.length,
    tarefasPendentesQuantidade: lembretesPendentes?.length || 0,
    alertasEstoqueQuantidade: 0,
    pendenciasFornecedoresQuantidade: contasVencidasQuantidade,
    problemasConciliacaoQuantidade: possiveisDuplicidadesQuantidade,
    alertasOperacionais: [
      ...(atrasados.length > 0 ? [`${atrasados.length} atividade(s) atrasada(s).`] : []),
      ...(contasVencidasQuantidade > 0
        ? [`${contasVencidasQuantidade} conta(s) vencida(s) no valor de R$ ${contasVencidasValor.toFixed(2)}.`]
        : []),
    ],
  };

  return {
    indicators: {
      faturamento,
      despesas,
      resultado,
      produtos,
      operacao,
      recomendaçõesResumo: [],
    },
    sourcesConsulted,
    dataQualityAlerts,
  };
}
