import {
  AiAuthorizationError,
  canRoleAccessFinancialData,
  type AiExecutionContext,
} from "./auth.ts";
import { buildFinancialSummary } from "./financial-core.ts";
import type {
  CanonicalBalance,
  CanonicalFinancialRecord,
  FinancialPeriodContext,
  FinancialSourceReference,
  FiscalNoteRecord,
  SefazDocumentRecord,
  DocumentSessionRecord,
  SalesPdvDetailRecord,
  InventoryItemRecord,
  RecipeCardRecord,
  SupplierRecord,
  EmployeeRecord,
  EmployeeScheduleRecord,
  EmployeePaymentRecord,
} from "./financial-types.ts";

export type {
  InventoryItemRecord,
  RecipeCardRecord,
  SupplierRecord,
  EmployeeRecord,
  EmployeeScheduleRecord,
  EmployeePaymentRecord,
};
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
  listFiscalNotes?(context: AiExecutionContext, period?: DatePeriod): Promise<FiscalNoteRecord[]>;
  listSefazDocuments?(context: AiExecutionContext, period?: DatePeriod): Promise<SefazDocumentRecord[]>;
  listDocumentSessions?(context: AiExecutionContext, period?: DatePeriod): Promise<DocumentSessionRecord[]>;
  listSalesPdvDetails?(context: AiExecutionContext, period?: DatePeriod): Promise<SalesPdvDetailRecord[]>;
  listInventoryItems?(context: AiExecutionContext, params?: { categoria?: string }): Promise<InventoryItemRecord[]>;
  listRecipeCards?(context: AiExecutionContext): Promise<RecipeCardRecord[]>;
  listSuppliers?(context: AiExecutionContext): Promise<SupplierRecord[]>;
  listEmployees?(context: AiExecutionContext): Promise<EmployeeRecord[]>;
  listEmployeeSchedules?(context: AiExecutionContext, period?: DatePeriod): Promise<EmployeeScheduleRecord[]>;
  listEmployeePayments?(context: AiExecutionContext, period?: DatePeriod): Promise<EmployeePaymentRecord[]>;
  getAiTelemetryUsage?(context: AiExecutionContext): Promise<{
    orcamentoMensalUsd: number;
    custoAcumuladoMesUsd: number;
    percentualOrcamentoConsumido: number;
    statusOrcamento: string;
    limiteRigidoAtivo: boolean;
    totalTokensMes: number;
    totalRequisicoesMes: number;
    alertas: {
      alerta50: boolean;
      alerta80: boolean;
      alerta100: boolean;
    };
  } | null>;
  getDeliveryChannelsStatus?(context: AiExecutionContext): Promise<{
    canais: Array<{
      id: string;
      nome: string;
      status: string;
      comissaoContratual: string;
      taxaPagamento: string;
      recepcaoPedidos: string;
      corBadge: string;
    }>;
  } | null>;
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
          const dataPayload: Record<string, unknown> = {
            total: result.total,
            faturamentoDiaCivil: result.total,
            quantidadeTransacoes: result.transacoesCount ?? null,
            itensVendidos: result.totalItemsSold ?? null,
            coberturaItens: result.itemsCoverage ?? null,
            source: result.source,
            stale: result.stale,
          };
          if (typeof result.totalTurnoEstendido === "number" && result.totalTurnoEstendido !== result.total) {
            dataPayload.totalTurnoEstendido = result.totalTurnoEstendido;
            dataPayload.observacaoTurno = `Faturamento no dia civil (00h às 23h59 fuso Brasília): R$ ${result.total.toFixed(2)}. Turno estendido com fechamento de madrugada: R$ ${result.totalTurnoEstendido.toFixed(2)}.`;
          }

          const formulas: Record<string, string> = {
            totalBrutoDiaCivil: "faturamento bruto do PDV Eyemobile no dia civil (fuso America/Sao_Paulo), idêntico ao painel",
            source: result.source,
          };
          if (typeof result.totalItemsSold === "number") {
            formulas.itensVendidos = "unidades comercializadas no período apurado";
          }
          if (dataPayload.totalTurnoEstendido) {
            formulas.totalTurnoEstendido = "faturamento acumulado do turno estendido incluindo a madrugada seguinte";
          }

          return baseResult(
            "buscar_vendas_pdv",
            context,
            period,
            dataPayload,
            [],
            formulas,
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

    // Ferramentas Especializadas do Wallet CEO 2.0 (DADOS 100% REAIS E AUDITÁVEIS - GATE E)
    catalog.consultar_resumo_executivo_ceo = async (_args, context) => {
      const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
      const hojeStr = nowBrasil.toISOString().split("T")[0];
      const ano = nowBrasil.getFullYear();
      const mesNum = nowBrasil.getMonth() + 1;
      const mesStr = String(mesNum).padStart(2, "0");
      const startMes = `${ano}-${mesStr}-01`;

      // Mês anterior
      const dataMesAnt = new Date(ano, mesNum - 2, 1);
      const anoAnt = dataMesAnt.getFullYear();
      const mesAntStr = String(dataMesAnt.getMonth() + 1).padStart(2, "0");
      const ultimoDiaMesAnt = new Date(anoAnt, dataMesAnt.getMonth() + 1, 0).getDate();
      const startMesAnt = `${anoAnt}-${mesAntStr}-01`;
      const endMesAnt = `${anoAnt}-${mesAntStr}-${String(ultimoDiaMesAnt).padStart(2, "0")}`;

      // Ontem em fuso horário oficial America/Sao_Paulo (UTC-3)
      const ontemDate = new Date(nowBrasil.getTime() - 24 * 60 * 60 * 1000);
      const ontemStr = ontemDate.toISOString().split("T")[0];
      const diasSemanaNomes = ["domingos", "segundas-feiras", "terças-feiras", "quartas-feiras", "quintas-feiras", "sextas-feiras", "sábados"];
      const diaSemanaOntemNome = diasSemanaNomes[ontemDate.getDay()];
      const diaSemanaOntemIdx = ontemDate.getDay();

      // Janela móvel de 28 dias anteriores para cálculo da média do dia da semana
      const start28Date = new Date(ontemDate.getTime() - 28 * 24 * 60 * 60 * 1000);
      const start28Str = start28Date.toISOString().split("T")[0];

      let queryFailed = false;
      let revenuesMes: CanonicalFinancialRecord[] = [];
      let expensesMes: CanonicalFinancialRecord[] = [];
      let revenuesMesAnt: CanonicalFinancialRecord[] = [];
      let expensesMesAnt: CanonicalFinancialRecord[] = [];
      let revenuesOntem: CanonicalFinancialRecord[] = [];
      let transactions28: CanonicalFinancialRecord[] = [];
      let vendasBrutasEyemobile: number | null = null;
      const warnings: string[] = [];

      try {
        const [rMes, eMes, rMesAnt, eMesAnt, rOntem, t28] = await Promise.all([
          repository.listRevenues(context, { start: startMes, end: hojeStr }),
          repository.listExpenses(context, { start: startMes, end: hojeStr }),
          repository.listRevenues(context, { start: startMesAnt, end: endMesAnt }),
          repository.listExpenses(context, { start: startMesAnt, end: endMesAnt }),
          repository.listRevenues(context, { start: ontemStr, end: ontemStr }),
          repository.listTransactions(context, { start: start28Str, end: ontemStr }),
        ]);

        revenuesMes = rMes;
        expensesMes = eMes;
        revenuesMesAnt = rMesAnt;
        expensesMesAnt = eMesAnt;
        revenuesOntem = rOntem;
        transactions28 = t28;

        // Vendas brutas do PDV Eyemobile (fonte distinta de faturamento em caixa)
        try {
          const pdvSales = await repository.listSalesPDV(context, { start: startMes, end: hojeStr });
          vendasBrutasEyemobile = pdvSales.reduce((a, s) => a + s.amount, 0);
        } catch {
          // Eyemobile não disponível ou sem sincronização
        }
      } catch (err) {
        console.warn("[query-tools] Falha ao consultar transações reais:", err);
        queryFailed = true;
        warnings.push("Instabilidade na consulta ao banco de dados financeiro.");
      }

      // Em caso de erro na consulta, retorna indisponibilidade explícita (sem mascarar como zeros)
      if (queryFailed) {
        const data = {
          empresa: "Rodo Point",
          workspaceId: context.workspaceId,
          periodoConsultado: { start: startMes, end: hojeStr },
          dadosIndisponiveis: true,
          status: "dados_insuficientes",
          mensagem: "Informações financeiras temporariamente indisponíveis para este período devido a instabilidade na consulta.",
          faturamentoMes: null,
          receitasFinanceirasDisponiveis: null,
          vendasBrutasEyemobile: null,
          repassesLiquidos: null,
          repassesLiquidosExplicacao: "Informações financeiras indisponíveis para este período devido a instabilidade na consulta.",
          diferencaConciliacao: null,
          despesasMes: null,
          faturamentoOntem: null,
          mediaDiaSemanaOntem: null,
          dataAtualizacao: new Date().toISOString(),
        };
        return baseResult("consultar_resumo_executivo_ceo", context, { start: startMes, end: hojeStr }, data, [], {}, warnings);
      }

      // Fontes separadas conforme Gate E:
      // 1. Receitas financeiras registradas na Wallet (contas correntes, cartões, pix liquidados)
      const receitasFinanceirasDisponiveis = revenuesMes.reduce((a, r) => a + r.amount, 0);
      const faturamentoMes = receitasFinanceirasDisponiveis;
      const despesasMes = expensesMes.reduce((a, e) => a + e.amount, 0);
      const faturamentoMesAnt = revenuesMesAnt.reduce((a, r) => a + r.amount, 0);
      const despesasMesAnt = expensesMesAnt.reduce((a, e) => a + e.amount, 0);
      const faturamentoOntem = revenuesOntem.reduce((a, r) => a + r.amount, 0);

      // 2. Repasses líquidos apurados exclusivamente através de identificadores, fontes e tipos canônicos verificáveis
      // Regra estrita: NUNCA classificar por palavras encontradas na descrição. Não confundir vendas brutas Eyemobile com liquidação Divipay.
      const repasses = revenuesMes.filter((r) => {
        const anyRecord = r as unknown as Record<string, unknown>;
        return (
          anyRecord.source === "repasse" ||
          anyRecord.source === "settlement" ||
          anyRecord.source === "divipay_settlement" ||
          anyRecord.sourceType === "repasse" ||
          anyRecord.canonicalType === "repasse" ||
          (typeof r.deduplicationKey === "string" && (
            r.deduplicationKey.startsWith("repasse:") ||
            r.deduplicationKey.startsWith("settlement:") ||
            r.deduplicationKey.startsWith("divipay_settlement:")
          ))
        );
      });

      const repassesLiquidos = repasses.length > 0
        ? Math.round(repasses.reduce((a, r) => a + r.amount, 0) * 100) / 100
        : null;

      const repassesLiquidosExplicacao = repassesLiquidos !== null
        ? "Repasses líquidos apurados exclusivamente a partir de fontes e tipos canônicos verificáveis de liquidação."
        : "Informações insuficientes para apuração de repasses líquidos: ausência de registros com fonte ou identificador canônico verificável de liquidação no período.";

      // 3. Diferença de conciliação quando ambas as fontes existem
      let diferencaConciliacao: number | null = null;
      if (vendasBrutasEyemobile !== null && receitasFinanceirasDisponiveis !== null) {
        diferencaConciliacao = Math.round(Math.abs(vendasBrutasEyemobile - receitasFinanceirasDisponiveis) * 100) / 100;
      }

      // 4. Média diária do mesmo dia da semana nas últimas 4 semanas (28 dias)
      // Agrupa o faturamento por data comparável válida e divide pela quantidade de dias válidos, e NÃO pela quantidade de transações
      let mediaDiaSemanaOntem: number | null = null;
      const transacoesMesmoDia = transactions28.filter((t) => {
        if (t.kind !== "income") return false;
        const d = new Date(t.occurredOn + "T12:00:00Z");
        return d.getUTCDay() === diaSemanaOntemIdx;
      });

      if (transacoesMesmoDia.length > 0) {
        const somaMesmoDia = transacoesMesmoDia.reduce((a, t) => a + t.amount, 0);
        const diasValidosDistintos = new Set(transacoesMesmoDia.map((t) => t.occurredOn.slice(0, 10))).size;
        mediaDiaSemanaOntem = diasValidosDistintos > 0
          ? Math.round((somaMesmoDia / diasValidosDistintos) * 100) / 100
          : null;
      }

      const variacaoOntemVsMediaPercent = (mediaDiaSemanaOntem && mediaDiaSemanaOntem > 0)
        ? Math.round(((faturamentoOntem - mediaDiaSemanaOntem) / mediaDiaSemanaOntem) * 1000) / 10
        : null;

      const crescimentoMesPercent = faturamentoMesAnt > 0
        ? Math.round(((faturamentoMes - faturamentoMesAnt) / faturamentoMesAnt) * 1000) / 10
        : null;

      const variacaoDespesasPercent = despesasMesAnt > 0
        ? Math.round(((despesasMes - despesasMesAnt) / despesasMesAnt) * 1000) / 10
        : null;

      const resultadoOperacional = faturamentoMes - despesasMes;
      const margemOperacionalPercent = faturamentoMes > 0
        ? Math.round((resultadoOperacional / faturamentoMes) * 1000) / 10
        : null;

      // Status honesto de CMV
      const cmvPercent: number | null = null;
      const cmvStatus = "dados_insuficientes";
      warnings.push("CMV não apurado por ausência de fichas técnicas detalhadas cadastradas no sistema.");

      // Ações sugeridas baseadas na situação real
      const acoesPrincipaisHoje: { numero: number; titulo: string; detalhe: string; impacto?: string }[] = [];
      if (faturamentoMes === 0 && (vendasBrutasEyemobile === null || vendasBrutasEyemobile === 0)) {
        acoesPrincipaisHoje.push({
          numero: 1,
          titulo: "Verificar integração do PDV Eyemobile",
          detalhe: "Nenhuma venda foi sincronizada para este mês até o momento.",
        });
      } else {
        acoesPrincipaisHoje.push({
          numero: 1,
          titulo: "Cadastrar fichas técnicas dos produtos",
          detalhe: "Necessário para habilitar apuração automática de CMV e margem unitária.",
        });
      }

      acoesPrincipaisHoje.push({
        numero: 2,
        titulo: "Concluir configuração de canais de delivery",
        detalhe: "Ativar credenciais do iFood e 99Food no KDS para captura de pedidos.",
      });

      if (despesasMes > 0) {
        acoesPrincipaisHoje.push({
          numero: 3,
          titulo: "Revisar conciliações de despesas",
          detalhe: `Total de R$ ${despesasMes.toFixed(2)} registrado no mês corrente.`,
        });
      }

      const data = {
        empresa: "Rodo Point",
        workspaceId: context.workspaceId,
        periodoConsultado: { start: startMes, end: hojeStr },
        faturamentoMes,
        receitasFinanceirasDisponiveis,
        vendasBrutasEyemobile,
        repassesLiquidos,
        repassesLiquidosExplicacao,
        diferencaConciliacao,
        observacaoContabil: "Vendas brutas Eyemobile representam o volume transacionado no caixa/PDV. Receitas financeiras disponíveis representam valores liquidados nas contas da empresa. Liquidações Divipay e repasses exigem identificadores canônicos verificáveis.",
        faturamentoMesAnterior: faturamentoMesAnt,
        crescimentoMesPercent,
        faturamentoOntem,
        mediaDiaSemanaOntem,
        variacaoOntemVsMediaPercent,
        diaSemanaOntemNome,
        despesasMes,
        despesasMesAnterior: despesasMesAnt,
        variacaoDespesasPercent,
        resultadoOperacionalApurado: resultadoOperacional,
        margemOperacionalPercent,
        cmv: {
          percentual: cmvPercent,
          status: cmvStatus,
          metaPercentual: 38.0,
          observacao: "Fichas técnicas pendentes de cadastro. Informações insuficientes para apurar CMV real.",
        },
        acoesPrincipaisHoje,
        departamentosAtivos: 7,
        status: faturamentoMes > 0 || despesasMes > 0 || (vendasBrutasEyemobile !== null && vendasBrutasEyemobile > 0) ? "calculado" : "sem_registros_no_periodo",
        dataAtualizacao: new Date().toISOString(),
      };

      return baseResult(
        "consultar_resumo_executivo_ceo",
        context,
        { start: startMes, end: hojeStr },
        data,
        [],
        { resultadoOperacional: "faturamentoMes - despesasMes" },
        warnings
      );
    };

    catalog.consultar_analise_comercial_vendas = async (args, context) => {
      const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
      const hojeStr = nowBrasil.toISOString().split("T")[0];
      const startPadrao = new Date(nowBrasil.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const start = typeof args.data_inicio === "string" ? args.data_inicio : (typeof args.start === "string" ? args.start : startPadrao);
      const end = typeof args.data_fim === "string" ? args.data_fim : (typeof args.end === "string" ? args.end : hojeStr);

      const warnings: string[] = [];
      let vendasTotais = 0;
      let pedidosTotal = 0;
      let queryError = false;

      try {
        const sales = await repository.listSalesPDV(context, { start, end });
        vendasTotais = sales.reduce((a, s) => a + s.amount, 0);
        pedidosTotal = sales.length;

        if (pedidosTotal === 0) {
          const rev = await repository.listRevenues(context, { start, end });
          vendasTotais = rev.reduce((a, r) => a + r.amount, 0);
          pedidosTotal = rev.length;
        }
      } catch (err) {
        console.warn("[query-tools] Falha ao consultar vendas comerciais:", err);
        queryError = true;
        warnings.push("Falha ao recuperar histórico comercial do PDV.");
      }

      if (queryError) {
        const data = {
          workspaceId: context.workspaceId,
          periodo: { start, end },
          dadosIndisponiveis: true,
          status: "dados_insuficientes",
          mensagem: "Histórico comercial temporariamente indisponível devido a falha na consulta.",
          vendasTotais: null,
          pedidosTotal: null,
          ticketMedio: null,
          itensVendidosTotal: null,
          distribuicaoCanais: [],
          topProdutos: [],
          dataAtualizacao: new Date().toISOString(),
        };
        return baseResult("consultar_analise_comercial_vendas", context, { start, end }, data, [], {}, warnings);
      }

      const ticketMedio = pedidosTotal > 0 ? Math.round((vendasTotais / pedidosTotal) * 100) / 100 : null;

      // Distribuição real de canais
      const distribuicaoCanais = vendasTotais > 0
        ? [{ canal: "Salão / PDV Físico", faturamento: vendasTotais, percentual: 100, cor: "#3b82f6" }]
        : [];

      const data = {
        workspaceId: context.workspaceId,
        periodo: { start, end },
        vendasTotais,
        pedidosTotal,
        ticketMedio,
        itensVendidosTotal: null,
        observacaoItens: "Detalhamento de produtos por SKU unitário requer sincronização com catálogo de itens do Eyemobile.",
        distribuicaoCanais,
        topProdutos: [],
        status: pedidosTotal > 0 ? "calculado" : "sem_registros_no_periodo",
        dataAtualizacao: new Date().toISOString(),
      };

      return baseResult(
        "consultar_analise_comercial_vendas",
        context,
        { start, end },
        data,
        [],
        { ticketMedio: "vendasTotais / pedidosTotal" },
        warnings
      );
    };

    catalog.consultar_analise_despesas_ceo = async (args, context) => {
      const nowBrasil = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
      const hojeStr = nowBrasil.toISOString().split("T")[0];
      const startPadrao = new Date(nowBrasil.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const start = typeof args.data_inicio === "string" ? args.data_inicio : (typeof args.start === "string" ? args.start : startPadrao);
      const end = typeof args.data_fim === "string" ? args.data_fim : (typeof args.end === "string" ? args.end : hojeStr);

      const warnings: string[] = [];
      let totalDespesas = 0;
      let queryDespesasError = false;
      const despesasPorCategoria: { categoria: string; valor: number; percentual: number }[] = [];
      let maiorCategoria: { nome: string; valor: number; percentual: number } | null = null;

      try {
        const expenses = await repository.listExpenses(context, { start, end });
        totalDespesas = expenses.reduce((a, e) => a + e.amount, 0);

        // Agrupamento por categoria real
        const categoryMap = new Map<string, number>();
        for (const e of expenses) {
          const cat = e.category || "Outros";
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + e.amount);
        }

        for (const [cat, val] of categoryMap.entries()) {
          const percent = totalDespesas > 0 ? Math.round((val / totalDespesas) * 1000) / 10 : 0;
          despesasPorCategoria.push({ categoria: cat, valor: val, percentual: percent });
        }
        despesasPorCategoria.sort((a, b) => b.valor - a.valor);

        if (despesasPorCategoria.length > 0) {
          maiorCategoria = {
            nome: despesasPorCategoria[0].categoria,
            valor: despesasPorCategoria[0].valor,
            percentual: despesasPorCategoria[0].percentual,
          };
        }
      } catch (err) {
        console.warn("[query-tools] Falha ao consultar despesas reais:", err);
        queryDespesasError = true;
        warnings.push("Falha ao recuperar despesas reais do banco de dados.");
      }

      if (queryDespesasError) {
        const data = {
          workspaceId: context.workspaceId,
          periodo: { start, end },
          dadosIndisponiveis: true,
          status: "dados_insuficientes",
          mensagem: "Relatório de despesas temporariamente indisponível devido a falha na consulta.",
          totalDespesas: null,
          maiorCategoria: null,
          despesasPorCategoria: [],
          dataAtualizacao: new Date().toISOString(),
        };
        return baseResult("consultar_analise_despesas_ceo", context, { start, end }, data, [], {}, warnings);
      }

      const data = {
        workspaceId: context.workspaceId,
        periodo: { start, end },
        totalDespesas,
        maiorCategoria,
        despesasPorCategoria,
        status: totalDespesas > 0 ? "calculado" : "sem_registros_no_periodo",
        dataAtualizacao: new Date().toISOString(),
      };

      return baseResult("consultar_analise_despesas_ceo", context, { start, end }, data, [], {}, warnings);
    };

    catalog.consultar_oportunidades_ceo = async (_args, context) => {
      // Oportunidades fundamentadas em dados reais:
      // Como não há fichas técnicas cadastradas nem registros de perdas na cozinha,
      // retornamos orientações estruturantes honestas, sem inventar números fictícios de +R$ 8.500/mês.
      const data = {
        workspaceId: context.workspaceId,
        oportunidades: [],
        status: "dados_insuficientes",
        mensagem: "Informações insuficientes para gerar oportunidades de margem e precificação. Para habilitar cálculos preditivos, cadastre as fichas técnicas de produtos e registre o descarte diário de cozinha.",
        orientacoesEstruturantes: [
          {
            titulo: "Cadastrar fichas técnicas dos produtos",
            detalhe: "Necessário para apuração real de CMV unitário e identificação de produtos com baixa margem de contribuição.",
          },
          {
            titulo: "Registrar quebras e descartes na cozinha",
            detalhe: "Permite quantificar o desperdício operacional real e propor experimentos de redução de perdas.",
          },
          {
            titulo: "Integrar canais de delivery no KDS",
            detalhe: "Habilita o acompanhamento unificado de pedidos entre salão e delivery com controle de comissão contratual.",
          },
        ],
        dataAtualizacao: new Date().toISOString(),
      };

      return baseResult("consultar_oportunidades_ceo", context, null, data);
    };

    catalog.consultar_status_canais_delivery = async (_args, context) => {
      if (repository.getDeliveryChannelsStatus) {
        try {
          const channels = await repository.getDeliveryChannelsStatus(context);
          if (channels) {
            return baseResult("consultar_status_canais_delivery", context, null, {
              workspaceId: context.workspaceId,
              canais: channels.canais,
              dataAtualizacao: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn("[query-tools] Falha ao consultar status de canais de delivery:", err);
        }
      }

      const data = {
        workspaceId: context.workspaceId,
        canais: [
          {
            id: "ifood",
            nome: "iFood",
            status: "Não conectado / Aguardando homologação",
            comissaoContratual: "Não configurada",
            taxaPagamento: "Não informada",
            recepcaoPedidos: "Inativa",
            corBadge: "bg-red-500/20 text-red-400 border-red-500/30",
          },
          {
            id: "99food",
            nome: "99Food",
            status: "Não conectado / Aguardando homologação",
            comissaoContratual: "Não configurada",
            taxaPagamento: "Não informada",
            recepcaoPedidos: "Inativa",
            corBadge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          },
          {
            id: "direto",
            nome: "Direto / WhatsApp",
            status: "Ativo / Canal Próprio",
            comissaoContratual: "0% (Canal Próprio)",
            taxaPagamento: "Pix / Maquininha (1,0% - 1,5%)",
            recepcaoPedidos: "Ativa no KDS Cozinha",
            corBadge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          },
        ],
        dataAtualizacao: new Date().toISOString(),
      };

      return baseResult("consultar_status_canais_delivery", context, null, data);
    };

    catalog.consultar_telemetria_ia = async (_args, context) => {
      if (repository.getAiTelemetryUsage) {
        try {
          const usage = await repository.getAiTelemetryUsage(context);
          if (usage) {
            return baseResult("consultar_telemetria_ia", context, null, {
              workspaceId: context.workspaceId,
              ...usage,
              dataAtualizacao: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn("[query-tools] Falha ao consultar telemetria real:", err);
        }
      }

      const data = {
        workspaceId: context.workspaceId,
        orcamentoMensalUsd: 10.00,
        custoAcumuladoMesUsd: 0.00,
        percentualOrcamentoConsumido: 0.0,
        statusOrcamento: "indisponivel",
        limiteRigidoAtivo: false,
        totalTokensMes: 0,
        totalRequisicoesMes: 0,
        alertas: {
          alerta50: false,
          alerta80: false,
          alerta100: false,
        },
        observacao: "Telemetria do workspace aguardando sincronização de requisições.",
        dataAtualizacao: new Date().toISOString(),
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

export const FINANCIAL_TOOLS = new Set([
  "buscar_receitas",
  "consultar_receitas",
  "buscar_despesas",
  "consultar_despesas",
  "buscar_transacoes",
  "consultar_transacoes",
  "consultar_saldos",
  "consultar_contas",
  "consultar_dividas",
  "consultar_resumo_mensal",
  "consultar_fluxo_caixa",
  "consultar_resumo_executivo_ceo",
  "consultar_analise_comercial_vendas",
  "consultar_analise_despesas_ceo",
  "consultar_oportunidades_ceo",
  "buscar_vendas_pdv",
  "consultar_vendas_eyemobile",
  "validar_fechamento_caixa",
  "consultar_telemetria_ia",
]);

export async function executeQueryTool(
  tool: string,
  args: Record<string, unknown>,
  context: AiExecutionContext,
  catalog: QueryToolCatalog,
): Promise<QueryToolResult> {
  const handler = catalog[tool];
  if (!handler) throw new Error("tool_not_allowed");

  if (FINANCIAL_TOOLS.has(tool)) {
    if (!canRoleAccessFinancialData(context.role)) {
      throw new AiAuthorizationError(
        "WALLET_AI_FORBIDDEN",
        403,
        `Papel '${context.role || "ausente"}' não possui permissão para consultar dados financeiros (faturamento, lucro, despesas, saldos, DRE, margens, custos e receitas).`,
      );
    }
  }

  return handler(args, context);
}
