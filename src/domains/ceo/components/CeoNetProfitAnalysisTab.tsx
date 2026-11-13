import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import {
  RefreshCw,
  Coins,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PieChart as PieChartIcon,
  BarChart3,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,

} from 'recharts';
import {
  CeoFinancialMetricsService,
  RelatorioLucroLiquidoReal,
  getSaoPauloParts,
} from '@/domains/ceo/services/CeoFinancialMetricsService';
import { usePrivacy } from '@/contexts/PrivacyContext';

interface CeoNetProfitAnalysisTabProps {
  workspaceId: string;
}


export const CeoNetProfitAnalysisTab: React.FC<CeoNetProfitAnalysisTabProps> = ({
  workspaceId,
}) => {
  const { isPrivate: _isPrivate, formatCurrency } = usePrivacy();

  const [periodo, setPeriodo] = useState<'mes_atual' | 'mes_anterior' | 'ultimos_3_meses' | 'ultimos_6_meses'>('mes_atual');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioLucroLiquidoReal | null>(null);

  // Filtro e expansão de lançamentos para auditoria
  const [mostrarLancamentos, setMostrarLancamentos] = useState(false);
  const [mostrarProdutosSemCusto, setMostrarProdutosSemCusto] = useState(false);
  const [buscaLancamento, setBuscaLancamento] = useState('');
  const [filtroGrupoLancamento, setFiltroGrupoLancamento] = useState<string>('todos');

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const sp = getSaoPauloParts(new Date());
      let mes = sp.month;
      let ano = sp.year;

      if (periodo === 'mes_anterior') {
        if (mes === 1) {
          mes = 12;
          ano -= 1;
        } else {
          mes -= 1;
        }
      }

      const rep = await CeoFinancialMetricsService.getRealNetProfit(workspaceId, {
        mes,
        ano,
      });

      if (rep.dadosIndisponiveis) {
        setErrorMessage(rep.erroMensagem || 'Falha ao consultar dados de lucro líquido');
      }

      setRelatorio(rep);
    } catch (err) {
      console.error('[CeoNetProfitAnalysisTab] Erro ao carregar relatório:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao processar indicadores');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, periodo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lançamentos filtrados para auditoria transparente
  const lancamentosFiltrados = useMemo(() => {
    if (!relatorio?.lancamentos) return [];
    return relatorio.lancamentos.filter((l) => {
      const matchBusca =
        !buscaLancamento ||
        l.descricao.toLowerCase().includes(buscaLancamento.toLowerCase()) ||
        (l.categoria && l.categoria.toLowerCase().includes(buscaLancamento.toLowerCase()));

      const matchGrupo =
        filtroGrupoLancamento === 'todos' || l.grupo === filtroGrupoLancamento;

      return matchBusca && matchGrupo;
    });
  }, [relatorio, buscaLancamento, filtroGrupoLancamento]);

  // Dados do gráfico de evolução
  const dadosGraficoEvolucao = useMemo(() => {
    if (!relatorio?.evolucaoMensal) return [];
    return relatorio.evolucaoMensal.map((m) => ({
      periodo: m.periodo,
      Receita: m.receitaLiquida,
      CMV: m.cmvReal,
      Despesas: m.despesasOperacionais,
      LucroLiquido: m.lucroLiquido,
    }));
  }, [relatorio]);

  const lucroPositivo = (relatorio?.lucroLiquido ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Barra de Controles e Filtros */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card/60 p-4 rounded-xl border border-border/50">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-400" />
            Resultado e Lucro Líquido Real
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Apuração contábil canônica por competência com custos reais de atacado e despesas operacionais.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={periodo} onValueChange={(val: 'mes_atual' | 'mes_anterior' | 'ultimos_3_meses' | 'ultimos_6_meses') => setPeriodo(val)}>
            <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs">
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes_atual" className="text-xs">Mês Atual</SelectItem>
              <SelectItem value="mes_anterior" className="text-xs">Mês Anterior</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="h-9 px-3 gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Banner de Confiabilidade dos Dados */}
      {relatorio && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            relatorio.statusConfiabilidade === 'confirmado'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : relatorio.statusConfiabilidade === 'parcial'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-background/40 shrink-0 mt-0.5">
              {relatorio.statusConfiabilidade === 'confirmado' ? (
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
              ) : relatorio.statusConfiabilidade === 'parcial' ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : (
                <FileText className="h-5 w-5 text-blue-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Qualidade dos Dados: {relatorio.statusConfiabilidade === 'confirmado' ? 'Lucro Líquido Definitivo' : relatorio.statusConfiabilidade === 'parcial' ? 'Resultado Preliminar com Custos Conhecidos' : 'Resultado Estimado'}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-current font-semibold">
                  {relatorio.coberturaCustosPercent}% de cobertura total ({relatorio.coberturaComprovadaPercent ?? 0}% NF | {relatorio.coberturaEstimadaPercent ?? 0}% Cotado/Estimado)
                </Badge>
                {relatorio.tributosStatus === 'pendente_escrituracao' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-400 font-semibold">
                    Tributos pendentes de escrituração
                  </Badge>
                )}
              </div>
              <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                {relatorio.motivoConfiabilidade}
              </p>
            </div>
          </div>

          {relatorio.produtosVendidosSemCusto.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarProdutosSemCusto((prev) => !prev)}
              className="text-xs h-8 shrink-0 border-current bg-background/50 hover:bg-background/80"
            >
              {mostrarProdutosSemCusto ? 'Ocultar pendências' : `Ver ${relatorio.produtosVendidosSemCusto.length} produtos sem custo`}
            </Button>
          )}
        </div>
      )}

      {/* Lista Retrátil de Produtos Sem Custo Cadastrado */}
      {mostrarProdutosSemCusto && relatorio && relatorio.produtosVendidosSemCusto.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="py-3 px-4 border-b border-amber-500/20">
            <CardTitle className="text-xs font-bold text-amber-400 flex items-center justify-between">
              <span>Produtos Vendidos sem Custo de Atacado Cadastrado ({relatorio.produtosVendidosSemCusto.length})</span>
              <span className="text-[11px] font-normal text-muted-foreground">Cadastre no Eyemobile para cobertura total</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-56 overflow-y-auto divide-y divide-border/30 text-xs">
              {relatorio.produtosVendidosSemCusto.map((prod) => (
                <div key={prod.codigo} className="px-4 py-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground">{prod.nome}</span>
                    <span className="text-muted-foreground text-[11px] ml-2 font-mono">#{prod.codigo}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground font-mono">{prod.quantidade} unid.</span>
                    <span className="font-bold text-foreground ml-3">{formatCurrency(prod.faturamento)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4 Cards de Destaque Executivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Lucro Líquido Real / Preliminar Realizado */}
        <Card className={`border ${lucroPositivo ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {relatorio?.statusConfiabilidade === 'confirmado' ? '💰 Lucro Líquido Definitivo' : '📊 Resultado Preliminar Realizado'}
              </span>
              <div className={`p-2 rounded-lg ${lucroPositivo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className={`text-xl sm:text-2xl font-black tracking-tight ${lucroPositivo ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(relatorio?.resultadoPreliminarCustosConhecidos ?? relatorio?.lucroLiquido ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                {relatorio?.margemLiquidaPercent !== null && relatorio?.margemLiquidaPercent !== undefined ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-muted/60">
                    {relatorio.margemLiquidaPercent.toFixed(1)}% margem líquida
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400/50 text-amber-400 font-medium">
                    Margem em apuração (CMV parcial)
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  (Receitas menos desp. operacionais incorridas)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Lucro Bruto dos Produtos Cobertos */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                📈 {relatorio?.faturamentoVendasSemCusto ? 'Lucro Bruto (Produtos Cobertos)' : 'Lucro Bruto Comercial'}
              </span>
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCurrency(relatorio?.lucroBruto ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <span>
                  {relatorio?.margemBrutaPercent !== null && relatorio?.margemBrutaPercent !== undefined
                    ? `${relatorio.margemBrutaPercent.toFixed(1)}% margem produtos c/ custo`
                    : '—'}
                </span>
                <span>•</span>
                <span>CMV: {formatCurrency(relatorio?.cmvReal ?? 0)}</span>
                {relatorio && relatorio.faturamentoVendasSemCusto > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400">Em apuração: {formatCurrency(relatorio.faturamentoVendasSemCusto)}</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: EBITDA / Resultado Operacional */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">💼 Resultado Operacional (EBITDA)</span>
              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                <BarChart3 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCurrency(relatorio?.resultadoOperacional ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>Desp. Incorridas: {formatCurrency(relatorio?.resultadoRealizadoAteData?.despesasIncorridas ?? relatorio?.despesasOperacionais ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Faturamento e Receita Líquida */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">💵 Receita Líquida</span>
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCurrency(relatorio?.receitaLiquida ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>Bruto: {formatCurrency(relatorio?.faturamentoBruto ?? 0)}</span>
                {relatorio?.deducoesVendas ? (
                  <span>(Deduções: -{formatCurrency(relatorio.deducoesVendas)})</span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* HOTFIX 7: As 3 Visões Canônicas Obrigatórias (Gate 3 e Gate 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Visão 1: Resultado Realizado até a Data */}
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="py-3 px-4 border-b border-emerald-500/10">
            <CardTitle className="text-xs font-bold text-emerald-400 flex items-center justify-between">
              <span>1. Resultado Realizado até a Data</span>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">Competência</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendas PDV ({relatorio?.resultadoRealizadoAteData?.diasComVendas || 1} dias reconciliados):</span>
              <span className="font-bold text-foreground font-mono">{formatCurrency(relatorio?.faturamentoBruto ?? 0)}</span>
            </div>
            <div className="space-y-1 py-1 border-y border-border/20">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">(-) CMV dos Produtos Vendidos:</span>
                <span className="font-mono text-rose-400 font-semibold">({formatCurrency(relatorio?.cmvReal ?? 0)})</span>
              </div>
              <div className="flex justify-between text-[11px] pl-2 text-muted-foreground">
                <span>↳ Comprovado por NF SEFAZ:</span>
                <span className="font-mono text-rose-300">({formatCurrency(relatorio?.cmvComprovado ?? 0)})</span>
              </div>
              <div className="flex justify-between text-[11px] pl-2 text-muted-foreground">
                <span>↳ Cotado / Estimativa Operacional:</span>
                <span className="font-mono text-amber-300/80">({formatCurrency(relatorio?.cmvEstimado ?? 0)})</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(-) Desp. Operacionais Incorridas:</span>
              <span className="font-mono text-rose-400">({formatCurrency(relatorio?.resultadoRealizadoAteData?.despesasIncorridas ?? relatorio?.despesasOperacionaisPagas ?? 0)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(-) Tarifas Bancárias:</span>
              <span className="font-mono text-rose-400">({formatCurrency(relatorio?.despesasFinanceiras ?? 0)})</span>
            </div>
            <div className="border-t border-emerald-500/20 pt-2 flex justify-between font-bold text-sm">
              <span className="text-emerald-400">(=) Saldo Preliminar Realizado:</span>
              <span className="font-mono text-emerald-400">
                {formatCurrency(relatorio?.resultadoRealizadoAteData?.resultadoLiquidoPreliminar ?? relatorio?.resultadoPreliminarCustosConhecidos ?? 0)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              * Deste saldo preliminar será deduzido o CMV dos salgados e produtos fabricados quando cadastrados.
            </p>
          </CardContent>
        </Card>

        {/* Visão 2: Fluxo de Caixa Realizado */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="py-3 px-4 border-b border-blue-500/10">
            <CardTitle className="text-xs font-bold text-blue-400 flex items-center justify-between">
              <span>2. Fluxo de Caixa Realizado</span>
              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-300">Caixa</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entradas de Vendas:</span>
              <span className="font-bold text-foreground font-mono">{formatCurrency(relatorio?.faturamentoBruto ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(-) Pessoal / Serviços Pagos:</span>
              <span className="font-mono text-rose-400">({formatCurrency(relatorio?.visaoCaixa?.saidasOperacionaisPagas ?? 0)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(-) Boletos & Compras de Estoque:</span>
              <span className="font-mono text-rose-400">({formatCurrency(relatorio?.visaoCaixa?.saidasFornecedoresEstoquePagas ?? relatorio?.despesasExcluidasDuplicidade?.comprasEstoqueExcluidas ?? 0)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(-) Tarifas Bancárias:</span>
              <span className="font-mono text-rose-400">({formatCurrency(relatorio?.visaoCaixa?.saidasFinanceirasPagas ?? 0)})</span>
            </div>
            <div className="border-t border-blue-500/20 pt-2 flex justify-between font-bold text-sm">
              <span className="text-blue-400">(=) Saldo Operacional de Caixa:</span>
              <span className={`font-mono ${(relatorio?.visaoCaixa?.saldoCaixaPeriodo ?? 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(relatorio?.visaoCaixa?.saldoCaixaPeriodo ?? 0)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              * Desembolsos de compras de mercadorias concentrados para revenda ao longo de todo o mês.
            </p>
          </CardContent>
        </Card>

        {/* Visão 3: Fechamento Projetado do Mês (Hotfix 8 - Modelo com Rigor Estatístico) */}
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader className="py-3 px-4 border-b border-purple-500/10">
            <CardTitle className="text-xs font-bold text-purple-400 flex items-center justify-between">
              <span>3. Fechamento Projetado do Mês</span>
              <Badge variant="outline" className={`text-[10px] ${
                relatorio?.resultadoProjetadoMes?.projecaoDisponivel === false
                  ? 'border-amber-500/40 text-amber-300'
                  : 'border-purple-500/30 text-purple-300'
              }`}>
                {relatorio?.resultadoProjetadoMes?.projecaoDisponivel === false ? 'Dados Insuficientes' : 'Projeção'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            {relatorio?.resultadoProjetadoMes?.projecaoDisponivel === false ? (
              <div className="space-y-2.5 py-1">
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                  <div className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Projeção Indisponível
                  </div>
                  {relatorio?.resultadoProjetadoMes?.motivoIndisponibilidade || 'São necessários ao menos 7 dias operacionais e 80% de cobertura de custos por NF para projeção com rigor financeiro.'}
                </div>
                <div className="flex justify-between text-muted-foreground pt-1 border-t border-purple-500/10">
                  <span>Obrigações Agendadas a Vencer:</span>
                  <span className="font-mono text-foreground font-semibold">{formatCurrency(relatorio?.resultadoProjetadoMes?.obrigacoesFuturasAgendadas ?? 0)}</span>
                </div>
                <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                  <span>• Pró-labores:</span>
                  <span className="font-mono">{formatCurrency(relatorio?.obrigacoesFuturas?.proLabores ?? 0)}</span>
                </div>
                <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                  <span>• Acertos de Equipe:</span>
                  <span className="font-mono">{formatCurrency(relatorio?.obrigacoesFuturas?.acertosEquipe ?? 0)}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faturamento Previsto (30 dias):</span>
                  <span className="font-bold text-foreground font-mono">{formatCurrency(relatorio?.resultadoProjetadoMes?.receitaProjetada ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Obrigações Agendadas a Vencer:</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(relatorio?.resultadoProjetadoMes?.obrigacoesFuturasAgendadas ?? 0)}</span>
                </div>
                <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                  <span>• Pró-labores:</span>
                  <span className="font-mono">{formatCurrency(relatorio?.obrigacoesFuturas?.proLabores ?? 0)}</span>
                </div>
                <div className="flex justify-between pl-2 text-[11px] text-muted-foreground">
                  <span>• Acertos de Equipe:</span>
                  <span className="font-mono">{formatCurrency(relatorio?.obrigacoesFuturas?.acertosEquipe ?? 0)}</span>
                </div>
                <div className="border-t border-purple-500/20 pt-2 flex justify-between font-bold text-sm">
                  <span className="text-purple-400">(=) Resultado Líquido Projetado:</span>
                  <span className={`font-mono ${(relatorio?.resultadoProjetadoMes?.resultadoProjetado ?? 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {formatCurrency(relatorio?.resultadoProjetadoMes?.resultadoProjetado ?? 0)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  * Baseado na média diária ponderada e na cobertura de custos auditada.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cascata DRE Gerencial Canônica */}
      <Card className="border-border/50 bg-card/60 overflow-hidden">
        <CardHeader className="py-4 px-5 border-b border-border/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-400" />
              Demonstrativo de Resultado do Exercício — {relatorio?.periodoFormatado || 'Mês'}
            </CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              Competência Contábil
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20 text-muted-foreground text-left">
                  <th className="px-4 sm:px-6 py-2.5 font-semibold">Linha DRE Canônica</th>
                  <th className="px-4 sm:px-6 py-2.5 font-semibold text-right">Valor (R$)</th>
                  <th className="px-4 sm:px-6 py-2.5 font-semibold text-right hidden sm:table-cell">% Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {/* 1. Faturamento Bruto */}
                <tr className="hover:bg-muted/30 font-medium">
                  <td className="px-4 sm:px-6 py-2.5 text-foreground">(+) Receita Operacional Bruta (Vendas PDV)</td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono font-bold text-foreground">
                    {formatCurrency(relatorio?.faturamentoBruto ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right text-muted-foreground hidden sm:table-cell">100.0%</td>
                </tr>

                {/* 2. Deduções */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">(-) Deduções, Devoluções e Cancelamentos</td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-rose-400">
                    {relatorio?.deducoesVendas ? `(${formatCurrency(relatorio.deducoesVendas)})` : 'R$ 0,00'}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio && relatorio.faturamentoBruto > 0 ? `${((relatorio.deducoesVendas / relatorio.faturamentoBruto) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                </tr>

                {/* 3. Receita Líquida */}
                <tr className="bg-muted/40 font-bold border-y border-border/40">
                  <td className="px-4 sm:px-6 py-2.5 text-foreground">(=) RECEITA LÍQUIDA DE VENDAS</td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-foreground">
                    {formatCurrency(relatorio?.receitaLiquida ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">100.0%</td>
                </tr>

                {/* 4. CMV */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>(-) CMV Real dos Produtos Efetivamente Vendidos</span>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                        {relatorio?.coberturaCustosPercent || 0}% de cobertura
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      NF SEFAZ: {formatCurrency(relatorio?.cmvComprovado ?? 0)} ({relatorio?.coberturaComprovadaPercent ?? 0}%) | Cotado/Estimado: {formatCurrency(relatorio?.cmvEstimado ?? 0)} ({relatorio?.coberturaEstimadaPercent ?? 0}%)
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-rose-400">
                    {relatorio?.cmvReal ? `(${formatCurrency(relatorio.cmvReal)})` : 'R$ 0,00'}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio && relatorio.receitaLiquida > 0 ? `${((relatorio.cmvReal / relatorio.receitaLiquida) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                </tr>

                {/* 5. Lucro Bruto */}
                <tr className="bg-muted/40 font-bold border-y border-border/40">
                  <td className="px-4 sm:px-6 py-2.5 text-foreground">
                    <div className="flex flex-col">
                      <span>
                        {relatorio && relatorio.faturamentoVendasSemCusto > 0
                          ? '(=) LUCRO BRUTO DOS PRODUTOS COBERTOS'
                          : '(=) LUCRO BRUTO COMERCIAL'}
                      </span>
                      {relatorio && relatorio.faturamentoVendasSemCusto > 0 ? (
                        <span className="text-[11px] font-normal text-amber-400">
                          Receita c/ Custo Conhecido: {formatCurrency(relatorio.receitaComCustoConhecido ?? 0)} | CMV: {formatCurrency(relatorio.cmvReal)} | Vendas em apuração de custo: {formatCurrency(relatorio.faturamentoVendasSemCusto)}
                        </span>
                      ) : (
                        relatorio && (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            Comprovado por NF SEFAZ: {formatCurrency(relatorio.lucroBrutoComprovado)}
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-emerald-400">
                    {formatCurrency(relatorio?.lucroBruto ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell text-emerald-400">
                    {relatorio?.margemBrutaPercent !== null && relatorio?.margemBrutaPercent !== undefined ? `${relatorio.margemBrutaPercent.toFixed(1)}%` : '—'}
                  </td>
                </tr>

                {/* 6. Despesas Operacionais */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">
                    <div className="flex flex-col">
                      <span>(-) Despesas Operacionais por Competência</span>
                      {relatorio && relatorio.despesasOperacionaisPendentes > 0 && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          Quitadas até a data: {formatCurrency(relatorio.despesasOperacionaisPagas)} | Agendadas/Pendentes no mês: {formatCurrency(relatorio.despesasOperacionaisPendentes)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-rose-400">
                    {relatorio?.despesasOperacionais ? `(${formatCurrency(relatorio.despesasOperacionais)})` : 'R$ 0,00'}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio && relatorio.receitaLiquida > 0 ? `${((relatorio.despesasOperacionais / relatorio.receitaLiquida) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                </tr>

                {/* 7. EBITDA / Resultado Operacional */}
                <tr className="bg-muted/40 font-bold border-y border-border/40">
                  <td className="px-4 sm:px-6 py-2.5 text-foreground">(=) RESULTADO OPERACIONAL (EBITDA)</td>
                  <td className={`px-4 sm:px-6 py-2.5 text-right font-mono ${((relatorio?.resultadoOperacional ?? 0) >= 0) ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(relatorio?.resultadoOperacional ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio?.margemOperacionalPercent !== null && relatorio?.margemOperacionalPercent !== undefined ? `${relatorio.margemOperacionalPercent.toFixed(1)}%` : '—'}
                  </td>
                </tr>

                {/* 8. Despesas Financeiras */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">(-) Despesas Financeiras e Tarifas Bancárias Líquidas</td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-rose-400">
                    {relatorio?.despesasFinanceiras ? `(${formatCurrency(relatorio.despesasFinanceiras)})` : 'R$ 0,00'}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio && relatorio.receitaLiquida > 0 && relatorio.despesasFinanceiras > 0
                      ? `${((relatorio.despesasFinanceiras / relatorio.receitaLiquida) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </td>
                </tr>

                {/* 9. Tributos sobre o Resultado */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>(-) Tributos sobre o Resultado / DAS Simples Nacional</span>
                      {(!relatorio?.tributosSobreResultado || relatorio.tributosSobreResultado === 0) && (
                        <span className="text-[10px] text-amber-400 font-semibold">(Pendente de escrituração fiscal)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-rose-400">
                    {relatorio?.tributosSobreResultado ? `(${formatCurrency(relatorio.tributosSobreResultado)})` : 'R$ 0,00'}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell">
                    {relatorio && relatorio.receitaLiquida > 0 && relatorio.tributosSobreResultado > 0
                      ? `${((relatorio.tributosSobreResultado / relatorio.receitaLiquida) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </td>
                </tr>

                {/* 10. LUCRO LÍQUIDO FINAL */}
                <tr className={`font-black text-sm sm:text-base border-t-2 ${lucroPositivo ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  <td className="px-4 sm:px-6 py-3.5">
                    <div className="flex flex-col">
                      <span>(=) RESULTADO LÍQUIDO PRELIMINAR (OPERAÇÃO REALIZADA)</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        Apurado sobre as vendas reconciliadas e despesas operacionais incorridas no período
                      </span>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-3.5 text-right font-mono tracking-tight">
                    {formatCurrency(relatorio?.resultadoPreliminarCustosConhecidos ?? relatorio?.lucroLiquido ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-3.5 text-right hidden sm:table-cell">
                    {relatorio?.margemLiquidaPercent !== null && relatorio?.margemLiquidaPercent !== undefined ? `${relatorio.margemLiquidaPercent.toFixed(1)}%` : '—'}
                  </td>
                </tr>

                {/* 11. Conciliação de Fornecedores e Obrigações Futuras */}
                <tr className="bg-muted/10 text-xs text-muted-foreground border-t border-border/30">
                  <td colSpan={3} className="px-4 sm:px-6 py-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>📦 <strong>Compras de Mercadorias para Revenda / Fornecedores Pagos no Caixa:</strong></span>
                      <span className="font-mono font-bold text-foreground">
                        {formatCurrency(relatorio?.despesasExcluidasDuplicidade?.comprasEstoqueExcluidas ?? 0)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      * Segregados da despesa operacional na DRE por competência para evitar dupla dedução com o CMV dos produtos quando vendidos.
                    </p>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/20">
                      <span>⏳ <strong>Obrigações Futuras Agendadas do Mês (Pró-labores & Acertos a Vencer):</strong></span>
                      <span className="font-mono font-bold text-amber-400">
                        {formatCurrency(relatorio?.obrigacoesFuturas?.total ?? 0)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      * Obrigações futuras e acertos agendados por competência não reduzem o resultado realizado antes de seus respectivos vencimentos.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos: Evolução Mensal e Despesas por Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Evolução Histórica dos Resultados */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="py-4 px-5 border-b border-border/40">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              Evolução Histórica (Receita vs Custos vs Lucro Líquido)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dadosGraficoEvolucao} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="periodo" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number | string | undefined, name: string | undefined) => [formatCurrency(Number(value || 0)), String(name || '')]}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Receita" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="LucroLiquido" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Despesas Operacionais por Centro de Custo */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="py-4 px-5 border-b border-border/40">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-orange-400" />
              Centros de Custos Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {relatorio?.despesasPorCategoria && relatorio.despesasPorCategoria.length > 0 ? (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  {relatorio.despesasPorCategoria.slice(0, 5).map((cat) => (
                    <div key={cat.categoria} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{cat.categoria}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono">{formatCurrency(cat.valor)}</span>
                          <span className="font-bold text-orange-400 w-12 text-right">{cat.percentual}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
                          style={{ width: `${Math.min(100, cat.percentual)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {relatorio.despesasPorCategoria.length > 5 && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    + {relatorio.despesasPorCategoria.length - 5} outras categorias de despesas operacionais
                  </p>
                )}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-xs text-center p-4">
                <Layers className="h-8 w-8 mb-2 opacity-40" />
                <p>Nenhuma despesa operacional cadastrada no período.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagnóstico Inteligente do CEO (Fatores Fatuais) */}
      {relatorio?.fatoresExplicativos && relatorio.fatoresExplicativos.length > 0 && (
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="py-4 px-5 border-b border-border/40">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Diagnóstico Estratégico do CEO — Fatores Determinantes do Resultado
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {relatorio.fatoresExplicativos.map((fator, index) => (
                <div
                  key={index}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    fator.tipo === 'positivo'
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : fator.tipo === 'alerta'
                      ? 'bg-amber-500/5 border-amber-500/20'
                      : fator.tipo === 'negativo'
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-blue-500/5 border-blue-500/20'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {fator.tipo === 'positivo' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : fator.tipo === 'alerta' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    ) : fator.tipo === 'negativo' ? (
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-400" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground">{fator.titulo}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{fator.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lançamentos Detalhados para Auditoria */}
      <Card className="border-border/50 bg-card/60">
        <CardHeader
          className="py-3 px-5 border-b border-border/40 cursor-pointer select-none hover:bg-muted/30 transition-colors"
          onClick={() => setMostrarLancamentos((prev) => !prev)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-xs sm:text-sm font-bold text-foreground">
                Auditoria de Lançamentos ({relatorio?.lancamentos.length ?? 0} registros)
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{mostrarLancamentos ? 'Recolher' : 'Expandir detalhamento'}</span>
              {mostrarLancamentos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>

        {mostrarLancamentos && (
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar lançamento por descrição ou categoria..."
                  value={buscaLancamento}
                  onChange={(e) => setBuscaLancamento(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <Select value={filtroGrupoLancamento} onValueChange={setFiltroGrupoLancamento}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 text-xs">
                  <SelectValue placeholder="Filtrar por grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos os grupos</SelectItem>
                  <SelectItem value="receita" className="text-xs">Receitas</SelectItem>
                  <SelectItem value="cmv" className="text-xs">CMV</SelectItem>
                  <SelectItem value="despesa_operacional" className="text-xs">Despesas Operacionais</SelectItem>
                  <SelectItem value="despesa_financeira" className="text-xs">Despesas Financeiras</SelectItem>
                  <SelectItem value="tributo" className="text-xs">Tributos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-80 overflow-y-auto border border-border/40 rounded-lg divide-y divide-border/20 text-xs">
              {lancamentosFiltrados.length > 0 ? (
                lancamentosFiltrados.map((l) => (
                  <div key={l.id} className="p-3 flex items-center justify-between hover:bg-muted/20">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{l.descricao}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{l.data}</span>
                        {l.categoria && <span>• {l.categoria}</span>}
                        <span>• Grupo: {l.grupo}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-bold ${l.valor >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatCurrency(l.valor)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  Nenhum lançamento encontrado para os filtros selecionados.
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
