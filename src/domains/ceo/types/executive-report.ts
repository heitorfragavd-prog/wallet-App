/**
 * executive-report.ts
 *
 * Definições canônicas de tipos para o Relatório Executivo Diário do Wallet CEO.
 * Compatível com Frontend e Supabase Edge Functions.
 */

export type ReportStatus = 'generating' | 'completed' | 'failed' | 'fallback_deterministic';
export type PeriodType = 'daily' | 'weekly' | 'monthly';
export type ProfitReliability = 'confirmado' | 'parcial' | 'estimado' | 'dados_insuficientes';

export interface TopProductMetric {
  id: string;
  nome: string;
  quantidade: number;
  faturamento: number;
  custoUnitario?: number | null;
  margemEstimadaPercent?: number | null;
  custoComprovadoNota: boolean;
}

export interface ExecutiveRecommendation {
  numero: number;
  titulo: string;
  problemaOuOportunidade: string;
  evidencia: string;
  impactoEstimado?: string | null;
  grauConfianca: 'alto' | 'medio' | 'baixo';
  acaoRecomendada: string;
}

export interface FaturamentoIndicators {
  faturamentoOntem: number;
  faturamentoMesAcumulado: number;
  pedidosOntem: number;
  ticketMedioOntem: number | null;
  mediaDiaSemanaOntem: number | null;
  diaSemanaOntemNome: string;
  variacaoOntemVsMediaPercent: number | null;
  pedidosMesAcumulado: number;
  ticketMedioMes: number | null;
  faturamentoMesAnterior: number;
  crescimentoMesPercent: number | null;
  alertaQueda: boolean;
  mensagemAlerta?: string | null;
}

export interface DespesasIndicators {
  despesasOntem: number;
  despesasMesAcumulado: number;
  despesasPagasMes: number;
  despesasPendentesMes: number;
  contasVencidasQuantidade: number;
  contasVencidasValor: number;
  contasVencer7DiasQuantidade: number;
  contasVencer7DiasValor: number;
  possiveisDuplicidadesQuantidade: number;
  possiveisDuplicidadesValor: number;
  alertaDespesasExtraordinarias?: string | null;
}

export interface ResultadoOperacionalIndicators {
  receitaCompetencia: number;
  despesasCompetencia: number;
  resultadoOperacional: number;
  margemOperacionalPercent: number | null;
  lucroBrutoConfirmado: number | null;
  margemBrutaConfirmadaPercent: number | null;
  cmvTotal: number | null;
  cmvPercent: number | null;
  coberturaFichasPercent: number;
  statusConfiabilidadeLucro: ProfitReliability;
  motivoConfiabilidade?: string | null;
}

export interface ProdutosRentabilidadeIndicators {
  top5Faturamento: TopProductMetric[];
  top5Quantidade: TopProductMetric[];
  produtosComCustoCadastrado: number;
  totalProdutosCatalogo: number;
  coberturaCustosPercent: number;
  produtosSemCustoConhecido: number;
  oportunidadesComerciais: string[];
}

export interface OperacaoIndicators {
  atividadesAtrasadasQuantidade: number;
  tarefasPendentesQuantidade: number;
  alertasEstoqueQuantidade: number;
  pendenciasFornecedoresQuantidade: number;
  problemasConciliacaoQuantidade: number;
  alertasOperacionais: string[];
}

export interface ExecutiveReportFinancialIndicators {
  faturamento: FaturamentoIndicators;
  despesas: DespesasIndicators;
  resultado: ResultadoOperacionalIndicators;
  produtos: ProdutosRentabilidadeIndicators;
  operacao: OperacaoIndicators;
  recomendaçõesResumo: string[];
}

export interface CeoExecutiveReport {
  id: string;
  workspace_id: string;
  owner_id: string;
  reference_date: string; // "YYYY-MM-DD"
  generated_at: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  financial_indicators: ExecutiveReportFinancialIndicators;
  executive_summary: string;
  recommendations: ExecutiveRecommendation[];
  status: ReportStatus;
  sources_consulted: string[];
  data_quality_alerts: string[];
  ai_model?: string | null;
  ai_tokens_used?: number;
  ai_estimated_cost_usd?: number;
  dispatch_status: {
    app?: boolean;
    push?: boolean;
    telegram?: boolean;
    dispatched_at?: string;
  };
  error_message?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
