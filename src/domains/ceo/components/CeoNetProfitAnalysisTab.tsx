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
                  Qualidade dos Dados: {relatorio.statusConfiabilidade === 'confirmado' ? 'Confirmado' : relatorio.statusConfiabilidade === 'parcial' ? 'Resultado Parcial' : 'Estimado'}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-current font-semibold">
                  {relatorio.coberturaCustosPercent}% de cobertura de CMV
                </Badge>
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
        {/* Card 1: Lucro Líquido Real */}
        <Card className={`border ${lucroPositivo ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">💰 Lucro Líquido</span>
              <div className={`p-2 rounded-lg ${lucroPositivo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className={`text-xl sm:text-2xl font-black tracking-tight ${lucroPositivo ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(relatorio?.lucroLiquido ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                {relatorio?.margemLiquidaPercent !== null && relatorio?.margemLiquidaPercent !== undefined && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-muted/60">
                    {relatorio.margemLiquidaPercent.toFixed(1)}% margem líquida
                  </Badge>
                )}
                {relatorio?.comparativoMesAnterior?.variacaoPercent !== null &&
                  relatorio?.comparativoMesAnterior?.variacaoPercent !== undefined && (
                    <span className={`inline-flex items-center text-[11px] font-semibold ${relatorio.comparativoMesAnterior.variacaoPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {relatorio.comparativoMesAnterior.variacaoPercent >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {relatorio.comparativoMesAnterior.variacaoPercent > 0 ? '+' : ''}{relatorio.comparativoMesAnterior.variacaoPercent.toFixed(1)}% vs anterior
                    </span>
                  )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Lucro Bruto Comercial */}
        <Card className="border-border/50 bg-card/60">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">📈 Lucro Bruto (Vendas - CMV)</span>
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {formatCurrency(relatorio?.lucroBruto ?? 0)}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{relatorio?.margemBrutaPercent !== null && relatorio?.margemBrutaPercent !== undefined ? `${relatorio.margemBrutaPercent.toFixed(1)}% margem bruta` : '—'}</span>
                <span>•</span>
                <span>CMV: {formatCurrency(relatorio?.cmvReal ?? 0)}</span>
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
                <span>Desp. Op: {formatCurrency(relatorio?.despesasOperacionais ?? 0)}</span>
                {relatorio?.despesasExcluidasDuplicidade?.comprasEstoqueExcluidas ? (
                  <span className="text-emerald-400 text-[10px] font-medium" title="Compras de estoque para revenda não duplicadas com CMV">
                    (Estoque segregado: {formatCurrency(relatorio.despesasExcluidasDuplicidade.comprasEstoqueExcluidas)})
                  </span>
                ) : null}
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
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10 flex items-center gap-1.5 flex-wrap">
                    <span>(-) CMV Real dos Produtos Efetivamente Vendidos</span>
                    {relatorio?.cmvComprovado && relatorio.cmvComprovado > 0 ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">(NF Auditada)</span>
                    ) : null}
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
                  <td className="px-4 sm:px-6 py-2.5 text-foreground">(=) LUCRO BRUTO COMERCIAL</td>
                  <td className="px-4 sm:px-6 py-2.5 text-right font-mono text-emerald-400">
                    {formatCurrency(relatorio?.lucroBruto ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-2.5 text-right hidden sm:table-cell text-emerald-400">
                    {relatorio?.margemBrutaPercent !== null && relatorio?.margemBrutaPercent !== undefined ? `${relatorio.margemBrutaPercent.toFixed(1)}%` : '—'}
                  </td>
                </tr>

                {/* 6. Despesas Operacionais */}
                <tr className="hover:bg-muted/30 text-muted-foreground">
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">(-) Despesas Operacionais por Competência</td>
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
                  <td className="px-4 sm:px-6 py-2.5 pl-8 sm:pl-10">(-) Tributos e Encargos sobre o Resultado</td>
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
                <tr className={`font-black text-sm sm:text-base border-t-2 ${lucroPositivo ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  <td className="px-4 sm:px-6 py-3.5">(=) LUCRO LÍQUIDO REAL DO PERÍODO</td>
                  <td className="px-4 sm:px-6 py-3.5 text-right font-mono tracking-tight">
                    {formatCurrency(relatorio?.lucroLiquido ?? 0)}
                  </td>
                  <td className="px-4 sm:px-6 py-3.5 text-right hidden sm:table-cell">
                    {relatorio?.margemLiquidaPercent !== null && relatorio?.margemLiquidaPercent !== undefined ? `${relatorio.margemLiquidaPercent.toFixed(1)}%` : '—'}
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
