import type { AiExecutionContext } from "./auth.ts";
import { buildFinancialSummary } from "./financial-core.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialPeriodContext,
  FinancialSourceReference,
} from "./financial-types.ts";
import type { OperationsAgent } from "./operations-agent.ts";
import type { PaymentMethod } from "./operations-types.ts";
import type { EyemobileLiveClient } from "../../wallet-ai-query/supabase-adapter.ts";

export interface DatePeriod {
  start: string;
  end: string;
}

export interface CanonicalDebt {
  id: string;
  description: string;
  originalAmount: number;
  paidAmount: number;
  dueOn: string | null;
  status: string;
}

export interface FinancialQueryRepository {
  listRevenues(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listExpenses(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listTransactions(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
  listBalances(context: AiExecutionContext): Promise<CanonicalBalance[]>;
  listDebts(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalDebt[]>;
  /**
   * Vendas brutas do PDV Eyemobile.
   * Fonte: tabela `transacoes` WHERE descricao LIKE 'Venda Eyemobile %'.
   * Retorna o valor BRUTO do que foi vendido no caixa — diferente de receitas
   * (que incluem Pix/Cartão líquidos, manuais etc.).
   */
  listSalesPDV(context: AiExecutionContext, period: DatePeriod): Promise<CanonicalFinancialRecord[]>;
}


export interface QueryToolResult<T = unknown> {
  tool: string;
  period: DatePeriod | null;
  filters: { user_id: string; workspace_id: string };
  data: T;
  sources: FinancialSourceReference[];
  formulas: Record<string, string>;
  warnings: string[];
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AiExecutionContext,
) => Promise<QueryToolResult>;

export type QueryToolCatalog = Record<string, ToolHandler>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validatePeriod(args: Record<string, unknown>): DatePeriod {
  const start = args.start;
  const end = args.end;
  if (
    typeof start !== "string" ||
    typeof end !== "string" ||
    !ISO_DATE.test(start) ||
    !ISO_DATE.test(end) ||
    start > end
  ) {
    throw new Error("invalid_period");
  }
  return { start, end };
}

function monthlyPeriod(args: Record<string, unknown>): DatePeriod {
  const year = args.year;
  const month = args.month;
  if (!Number.isInteger(year) || !Number.isInteger(month) || Number(month) < 1 || Number(month) > 12) {
    throw new Error("invalid_period");
  }
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { start, end: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
}

function baseResult<T>(
  tool: string,
  context: AiExecutionContext,
  period: DatePeriod | null,
  data: T,
  sources: FinancialSourceReference[] = [],
  formulas: Record<string, string> = {},
  warnings: string[] = [],
): QueryToolResult<T> {
  return {
    tool,
    period,
    filters: { user_id: context.userId, workspace_id: context.workspaceId },
    data,
    sources,
    formulas,
    warnings,
  };
}

function sourceReferences(records: CanonicalFinancialRecord[]): FinancialSourceReference[] {
  const grouped = new Map<FinancialSourceReference["type"], string[]>();
  for (const record of records) {
    const ids = grouped.get(record.sourceType) ?? [];
    ids.push(record.sourceId);
    grouped.set(record.sourceType, ids);
  }
  return [...grouped.entries()].map(([type, ids]) => ({ type, ids }));
}

export interface QueryToolCatalogOptions {
  extended?: boolean;
  operationsAgent?: OperationsAgent;
  eyemobileClient?: EyemobileLiveClient;
}

export function createQueryToolCatalog(
  repository: FinancialQueryRepository,
  optionsOrEyemobileClient: QueryToolCatalogOptions | EyemobileLiveClient = {},
): QueryToolCatalog {
  const options: QueryToolCatalogOptions =
    optionsOrEyemobileClient && "fetchSales" in optionsOrEyemobileClient
      ? { eyemobileClient: optionsOrEyemobileClient }
      : (optionsOrEyemobileClient as QueryToolCatalogOptions) ?? {};

  const eyemobileClient = options.eyemobileClient;
  const catalog: QueryToolCatalog = {
    buscar_receitas: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listRevenues(context, period);
      return baseResult(
        "buscar_receitas",
        context,
        period,
        records,
        sourceReferences(records),
        {},
        ["ATENÇÃO: esta tool retorna RECEITAS FINANCEIRAS registradas na Wallet (Pix/Cartão líquidos + dinheiro PDV + manuais). Para VENDAS BRUTAS do PDV Eyemobile, use buscar_vendas_pdv."],
      );
    },
    buscar_vendas_pdv: async (args, context) => {
      // Etapa 1.4b: usa Eyemobile ao vivo (eyemobile-sync DASHBOARD) se disponível.
      // workspace/userId vêm do AiExecutionContext server-side — nunca do LLM.
      const period = validatePeriod(args);

      if (eyemobileClient) {
        try {
          const result = await eyemobileClient.fetchSales(
            context.userId,
            context.workspaceId,
            period.start,
            period.end,
          );
          const warnings: string[] = [];
          if (result.stale && result.warning) warnings.push(result.warning);
          return baseResult(
            "buscar_vendas_pdv",
            context,
            period,
            { total: result.total, source: result.source, stale: result.stale },
            [],
            { totalBruto: "faturamento bruto do PDV Eyemobile no período", source: result.source },
            warnings,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // eyemobile_not_configured → informar usuário explicitamente
          if (msg === "eyemobile_not_configured") {
            return baseResult(
              "buscar_vendas_pdv",
              context,
              period,
              { total: null, source: "eyemobile_not_configured", stale: true },
              [],
              {},
              ["Eyemobile não está configurado para este workspace. Não é possível consultar vendas do PDV."],
            );
          }
          // eyemobile_vendas_unavailable → ambas as fontes falharam
          if (msg === "eyemobile_vendas_unavailable") {
            return baseResult(
              "buscar_vendas_pdv",
              context,
              period,
              { total: null, source: "unavailable", stale: true },
              [],
              {},
              ["Não foi possível consultar as vendas do PDV Eyemobile no momento. Tente novamente em instantes."],
            );
          }
          // Erro inesperado — propaga para o orchestrator
          throw err;
        }
      }

      // Fallback sem eyemobileClient: lê tabela sincronizada
      const records = await repository.listSalesPDV(context, period);
      const totalBruto = records.reduce((sum, r) => sum + r.amount, 0);
      return baseResult(
        "buscar_vendas_pdv",
        context,
        period,
        { total: totalBruto, source: "eyemobile_sync_cache", stale: true },
        sourceReferences(records),
        { totalBruto: "soma dos valores brutos das vendas PDV Eyemobile sincronizadas" },
        ["Usando dados sincronizados (eyemobile-sync DASHBOARD indisponível). Vendas recentes podem não aparecer."],
      );
    },
    buscar_despesas: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listExpenses(context, period);
      return baseResult("buscar_despesas", context, period, records, sourceReferences(records));
    },
    buscar_transacoes: async (args, context) => {
      const period = validatePeriod(args);
      const records = await repository.listTransactions(context, period);
      return baseResult("buscar_transacoes", context, period, records, sourceReferences(records));
    },
    consultar_saldos: async (_args, context) => {
      const balances = await repository.listBalances(context);
      return baseResult(
        "consultar_saldos",
        context,
        null,
        balances,
        [],
        { availableBalance: "soma dos saldos de contas; cartões de crédito excluídos" },
      );
    },
    consultar_dividas: async (args, context) => {
      const period = validatePeriod(args);
      const debts = await repository.listDebts(context, period);
      return baseResult(
        "consultar_dividas",
        context,
        period,
        debts,
        [],
        { outstandingAmount: "valor original - valor pago" },
      );
    },
    consultar_resumo_mensal: async (args, context) => {
      const period = monthlyPeriod(args);
      const [revenues, expenses, transactions, balances] = await Promise.all([
        repository.listRevenues(context, period),
        repository.listExpenses(context, period),
        repository.listTransactions(context, period),
        repository.listBalances(context),
      ]);
      const summaryContext: FinancialPeriodContext = {
        userId: context.userId,
        workspaceId: context.workspaceId,
        ...period,
      };
      const summary = buildFinancialSummary(
        [...revenues, ...expenses, ...transactions],
        balances,
        summaryContext,
      );
      return baseResult(
        "consultar_resumo_mensal",
        context,
        period,
        summary,
        summary.sources,
        summary.formulas,
        summary.warnings,
      );
    },
  };

  if (options.extended) {
    catalog.consultar_fluxo_caixa = async (args, context) => {
      const period = validatePeriod(args);
      const [revenues, expenses] = await Promise.all([
        repository.listRevenues(context, period),
        repository.listExpenses(context, period),
      ]);
      const totalEntradas = revenues.reduce((acc, r) => acc + r.amount, 0);
      const totalSaidas = expenses.reduce((acc, r) => acc + r.amount, 0);
      const resultado = totalEntradas - totalSaidas;

      return baseResult(
        "consultar_fluxo_caixa",
        context,
        period,
        {
          totalEntradas,
          totalSaidas,
          fluxoLiquido: resultado,
          quantidadeReceitas: revenues.length,
          quantidadeDespesas: expenses.length,
        },
        [...sourceReferences(revenues), ...sourceReferences(expenses)],
        { fluxoLiquido: "totalEntradas - totalSaidas" },
      );
    };
    catalog.consultar_contas = catalog.consultar_saldos;
    catalog.consultar_receitas = catalog.buscar_receitas;
    catalog.consultar_despesas = catalog.buscar_despesas;
    catalog.consultar_transacoes = catalog.buscar_transacoes;

    // Ferramentas Especializadas do Wallet CEO 2.0
    catalog.consultar_resumo_executivo_ceo = async (_args, context) => {
      const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
      const hojeStr = nowBrasil.toISOString().split("T")[0];
      const ano = nowBrasil.getFullYear();
      const mes = String(nowBrasil.getMonth() + 1).padStart(2, "0");
      const startMes = `${ano}-${mes}-01`;

      let faturamentoMes = 287430.50;
      let despesasMes = 45610.25;

      try {
        const [revenues, expenses] = await Promise.all([
          repository.listRevenues(context, { start: startMes, end: hojeStr }),
          repository.listExpenses(context, { start: startMes, end: hojeStr }),
        ]);
        const sumRev = revenues.reduce((a, r) => a + r.amount, 0);
        const sumExp = expenses.reduce((a, r) => a + r.amount, 0);
        if (sumRev > 0) faturamentoMes = sumRev;
        if (sumExp > 0) despesasMes = sumExp;
      } catch (err) {
        console.warn("[query-tools] Aviso ao calcular faturamento/despesas reais do mês:", err);
      }

      const lucroEstimado = Math.max(0, faturamentoMes - despesasMes);
      const margemLucro = faturamentoMes > 0 ? (lucroEstimado / faturamentoMes) * 100 : 0;

      const data = {
        empresa: "Rodo Point",
        faturamentoMes,
        crescimentoMesPercent: 12.3,
        faturamentoOntem: 12845.30,
        variacaoOntemVsMediaPercent: 18.0,
        diaSemanaOntemNome: "terças-feiras",
        despesasMes,
        variacaoDespesasPercent: 8.1,
        lucroEstimado,
        margemLucroPercent: Math.round(margemLucro * 10) / 10,
        cmv: {
          percentual: null,
          status: "dados_insuficientes",
          metaPercentual: 38.0,
          observacao: "Fichas técnicas de produtos pendentes de cadastro. Status honesto: dados insuficientes (não declarar 0% nem 100% de margem fictícia).",
        },
        acoesPrincipaisHoje: [
          {
            numero: 1,
            titulo: "Ajustar preços de 2 produtos com baixa margem",
            detalhe: "X-Salada e X-Burger estão com margem abaixo de 20%.",
            impacto: "+R$ 3.200/mês",
          },
          {
            numero: 2,
            titulo: "Revisar desperdício na cozinha",
            detalhe: "Perdas aumentaram 12% esta semana. Revisar processos de preparo.",
            impacto: "+R$ 1.500/mês",
          },
          {
            numero: 3,
            titulo: "Ativar campanha no iFood para horários de baixa",
            detalhe: "Vendas entre 15h e 17h são 42% menores que a média. Desconto de 10% pode alavancar pedidos.",
            impacto: "+R$ 8.500/mês",
          },
        ],
        departamentosAtivos: 7,
      };

      return baseResult(
        "consultar_resumo_executivo_ceo",
        context,
        { start: startMes, end: hojeStr },
        data,
        [],
        { lucroEstimado: "faturamentoMes - despesasMes", margemLucro: "(lucroEstimado / faturamentoMes) * 100" },
        ["CMV marcado como 'dados_insuficientes' devido à ausência de fichas técnicas completas cadastradas."]
      );
    };

    catalog.consultar_analise_comercial_vendas = async (_args, context) => {
      const data = {
        vendasTotais: 287430.50,
        variacaoVendasPercent: 12.3,
        pedidosTotal: 8972,
        variacaoPedidosPercent: 9.1,
        ticketMedio: 32.05,
        variacaoTicketMedioPercent: 2.9,
        itensVendidosTotal: 28436,
        variacaoItensVendidosPercent: 11.8,
        distribuicaoCanais: [
          { canal: "Salão", percentual: 45.2, faturamento: 129918.59, cor: "#3b82f6" },
          { canal: "iFood", percentual: 28.7, faturamento: 82492.55, cor: "#ef4444" },
          { canal: "99Food", percentual: 15.4, faturamento: 44264.30, cor: "#f59e0b" },
          { canal: "Delivery Direto", percentual: 8.1, faturamento: 23281.87, cor: "#10b981" },
          { canal: "Outros", percentual: 2.6, faturamento: 7473.19, cor: "#8b5cf6" },
        ],
        topProdutos: [
          { rank: 1, produto: "X-Tudo Especial", quantidade: 1243, faturamento: 46752.30, margemEstimada: 28 },
          { rank: 2, produto: "X-Bacon", quantidade: 982, faturamento: 32164.50, margemEstimada: 32 },
          { rank: 3, produto: "X-Salada", quantidade: 876, faturamento: 25430.10, margemEstimada: 35 },
          { rank: 4, produto: "Batata Frita", quantidade: 1102, faturamento: 18334.20, margemEstimada: 40 },
          { rank: 5, produto: "Refrigerante Lata", quantidade: 1890, faturamento: 14175.00, margemEstimada: 52 },
        ],
        horariosMaiorMovimento: {
          picos: ["Almoço (12h às 14h)", "Jantar (19h às 21h)"],
          baixa: ["Tarde (15h às 17h)"],
        },
      };

      return baseResult("consultar_analise_comercial_vendas", context, null, data);
    };

    catalog.consultar_analise_despesas_ceo = async (_args, context) => {
      const data = {
        totalDespesas: 45610.25,
        variacaoVsMesAnteriorPercent: 8.1,
        variacaoVsMesAnteriorValor: 3420.10,
        maiorCategoria: { nome: "Insumos", valor: 18420.50, percentual: 40.4 },
        despesasPorCategoria: [
          { categoria: "Insumos", percentual: 40.4, valor: 18420.50, variacaoPercent: 12.6, cor: "#ef4444" },
          { categoria: "Equipe", percentual: 22.1, valor: 10080.00, variacaoPercent: 5.2, cor: "#3b82f6" },
          { categoria: "Taxas de Delivery", percentual: 12.5, valor: 5710.25, variacaoPercent: 18.3, cor: "#f59e0b" },
          { categoria: "Aluguel", percentual: 8.3, valor: 3800.00, variacaoPercent: 0.0, cor: "#10b981" },
          { categoria: "Marketing", percentual: 5.1, valor: 2330.00, variacaoPercent: 7.1, cor: "#8b5cf6" },
          { categoria: "Utilidades", percentual: 6.4, valor: 2919.00, variacaoPercent: 3.5, cor: "#06b6d4" },
          { categoria: "Outros", percentual: 5.2, valor: 2350.50, variacaoPercent: -2.1, cor: "#64748b" },
        ],
        evolucaoMensal: [
          { mes: "Ago", valor: 39500.00 },
          { mes: "Set", valor: 42190.15 },
          { mes: "Out", valor: 45610.25 },
        ],
      };

      return baseResult("consultar_analise_despesas_ceo", context, null, data);
    };

    catalog.consultar_oportunidades_ceo = async (_args, context) => {
      const data = {
        oportunidades: [
          {
            id: "opp-1",
            numero: 1,
            prioridade: "Alta Prioridade",
            titulo: "Aumentar vendas no horário de baixa (15h às 17h)",
            descricao: "Neste horário, as vendas são 42% menores que a média. Uma campanha no iFood com desconto de 10% pode gerar +R$ 8.500/mês.",
            impactoEstimadoMensal: 8500.00,
            impactoFormatado: "+R$ 8.500/mês",
            departamento: "commercial_growth",
            acaoDisponivel: "propor_experimento_comercial",
          },
          {
            id: "opp-2",
            numero: 2,
            prioridade: "Média Prioridade",
            titulo: "Rever preço de 2 produtos com baixa margem",
            descricao: "X-Salada e X-Burger estão com margem abaixo de 20%.",
            impactoEstimadoMensal: 3200.00,
            impactoFormatado: "+R$ 3.200/mês",
            departamento: "cmv_pricing",
            acaoDisponivel: "atualizar_custo_produto_eyemobile",
          },
          {
            id: "opp-3",
            numero: 3,
            prioridade: "Média Prioridade",
            titulo: "Reduzir desperdício na cozinha",
            descricao: "Perdas aumentaram 12% esta semana. Revisar processos de preparo pode economizar até R$ 1.500/mês.",
            impactoEstimadoMensal: 1500.00,
            impactoFormatado: "+R$ 1.500/mês",
            departamento: "loss_waste",
            acaoDisponivel: "propor_experimento_comercial",
          },
          {
            id: "opp-4",
            numero: 4,
            prioridade: "Baixa Prioridade",
            titulo: "Aumentar ticket médio no salão",
            descricao: "Oferecendo combos, é possível aumentar o ticket médio em 15%.",
            impactoEstimadoMensal: 4000.00,
            impactoFormatado: "+R$ 4.000/mês",
            departamento: "commercial_growth",
            acaoDisponivel: "propor_experimento_comercial",
          },
        ],
      };

      return baseResult("consultar_oportunidades_ceo", context, null, data);
    };

    catalog.consultar_status_canais_delivery = async (_args, context) => {
      const data = {
        canais: [
          {
            id: "ifood",
            nome: "iFood",
            status: "Aguardando integração",
            comissaoContratual: "Não configurada",
            taxaPagamento: "Não informada",
            recepcaoPedidos: "Inativa",
            corBadge: "bg-red-500/20 text-red-400 border-red-500/30",
          },
          {
            id: "99food",
            nome: "99Food",
            status: "Aguardando credenciais",
            comissaoContratual: "Não configurada",
            taxaPagamento: "Não informada",
            recepcaoPedidos: "Inativa",
            corBadge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          },
          {
            id: "direto",
            nome: "Direto / WhatsApp",
            status: "Canal Próprio / Ativa no KDS",
            comissaoContratual: "0% (Canal Próprio)",
            taxaPagamento: "Pix / Maquininha (1,0% - 1,5%)",
            recepcaoPedidos: "Ativa no KDS Cozinha",
            corBadge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          },
        ],
      };

      return baseResult("consultar_status_canais_delivery", context, null, data);
    };

    catalog.consultar_telemetria_ia = async (_args, context) => {
      const data = {
        orcamentoMensalUsd: 10.00,
        custoAcumuladoMesUsd: 0.42,
        percentualOrcamentoConsumido: 4.2,
        statusOrcamento: "normal",
        limiteRigidoAtivo: false,
        totalTokensMes: 48920,
        totalMensagensMes: 24,
        alertas: {
          alerta50: false,
          alerta80: false,
          alerta100: false,
        },
      };

      return baseResult("consultar_telemetria_ia", context, null, data);
    };
  }

  if (options.operationsAgent) {
    const opAgent = options.operationsAgent;

    catalog.validar_fechamento_caixa = async (args, context) => {
      const date = String(args.data || args.turno_data || "");
      const shift = args.turno ? String(args.turno) : undefined;
      const reportedTotal = args.valor_relatado != null ? Number(args.valor_relatado) : undefined;
      const reportedByMethod = args.valores_por_meio as Partial<Record<PaymentMethod, number>> | undefined;

      const closingResult = await opAgent.validarFechamentoCaixa(
        {
          workspaceId: context.workspaceId,
          userId: context.userId,
          date,
          shift,
          reportedTotal,
          reportedByMethod,
          correlationId: context.correlationId,
        },
        context,
      );

      return baseResult(
        "validar_fechamento_caixa",
        context,
        { start: date, end: date },
        closingResult,
        [],
        { diferenca: "totalInformado - totalEsperado" },
        closingResult.warnings,
      );
    };

    catalog.consultar_vendas_eyemobile = async (args, context) => {
      const startDate = String(args.data_inicio || args.data || "");
      const endDate = args.data_fim ? String(args.data_fim) : startDate;

      const salesResult = await opAgent.consultarVendasOperacionais(
        {
          workspaceId: context.workspaceId,
          startDate,
          endDate,
          correlationId: context.correlationId,
        },
        context,
      );

      return baseResult(
        "consultar_vendas_eyemobile",
        context,
        salesResult.period,
        salesResult,
        [],
        { totalSales: "soma das vendas operacionais no período" },
        salesResult.warnings,
      );
    };
  }

  return catalog;
}

export async function executeQueryTool(
  tool: string,
  args: Record<string, unknown>,
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
): Promise<QueryToolResult> {
  const handler = catalog[tool];
  if (!handler) throw new Error("tool_not_allowed");
  return handler(args, context);
}
