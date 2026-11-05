import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, ShoppingBag, TrendingUp, TrendingDown, Package, AlertCircle } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import {
  CeoFinancialMetricsService,
  TopProdutoFaturamento,
  TransacaoReceitaItem,
  RelatorioRentabilidadeComercial,
  ProdutoRentabilidadeItem,
  deduplicateRevenues,
} from '@/domains/ceo/services/CeoFinancialMetricsService';
import { getCeoPeriodRange } from '@/domains/ceo/utils/ceoDateRanges';
import { fetchLiveDashboard } from '@/domains/eyemobile/hooks/useEyemobileDashboard';

interface CeoCommercialAnalysisTabProps {
  workspaceId: string;
}

interface DailySaleBar {
  dayLabel: string;
  faturamento: number;
}

export const CeoCommercialAnalysisTab: React.FC<CeoCommercialAnalysisTabProps> = ({
  workspaceId,
}) => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados de dados reais
  const [vendasTotais, setVendasTotais] = useState<number>(0);
  const [crescimentoVendas, setCrescimentoVendas] = useState<number | null>(null);
  const [pedidosTotal, setPedidosTotal] = useState<number>(0);
  const [crescimentoPedidos, setCrescimentoPedidos] = useState<number | null>(null);
  const [ticketMedio, setTicketMedio] = useState<number | null>(null);
  const [crescimentoTicket, setCrescimentoTicket] = useState<number | null>(null);
  const [itensVendidos, setItensVendidos] = useState<number | null>(null);
  const [crescimentoItens, setCrescimentoItens] = useState<number | null>(null);
  const [itemsCoverage, setItemsCoverage] = useState<'complete' | 'partial' | 'unavailable'>('unavailable');
  const [itemsCoverageRatio, setItemsCoverageRatio] = useState<number>(0);
  const [unclassifiedRevenue, setUnclassifiedRevenue] = useState<number>(0);

  const [dailySalesData, setDailySalesData] = useState<DailySaleBar[]>([]);
  const [topProducts, setTopProducts] = useState<TopProdutoFaturamento[]>([]);
  const [profitabilityReport, setProfitabilityReport] = useState<RelatorioRentabilidadeComercial | null>(null);
  const [filtroRentabilidade, setFiltroRentabilidade] = useState<'mais_lucrativos' | 'maiores_margens' | 'menores_margens' | 'sem_custo'>('mais_lucrativos');

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const range = getCeoPeriodRange(periodo, new Date());
      const inicioStr = range.inicioStr;
      const fimStr = range.fimStr;
      const inicioAntStr = range.inicioAntStr;
      const fimAntStr = range.fimAntStr;

      // Fonte canônica unificada: Transações reais deste período com paginação integral segura e deduplicação
      const [txRaw, txAntRaw] = await Promise.all([
        CeoFinancialMetricsService.fetchAllPaginated<TransacaoReceitaItem>(
          (from, to) =>
            supabase
              .from('transacoes')
              .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
              .eq('workspace_id', workspaceId)
              .eq('tipo', 'receita')
              .gte('data', inicioStr)
              .lte('data', `${fimStr}T23:59:59.999Z`)
              .order('data', { ascending: true })
              .range(from, to)
        ),
        CeoFinancialMetricsService.fetchAllPaginated<TransacaoReceitaItem>(
          (from, to) =>
            supabase
              .from('transacoes')
              .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
              .eq('workspace_id', workspaceId)
              .eq('tipo', 'receita')
              .gte('data', inicioAntStr)
              .lte('data', `${fimAntStr}T23:59:59.999Z`)
              .range(from, to)
        ),
      ]);

      const tx = deduplicateRevenues(txRaw);
      const txAnt = deduplicateRevenues(txAntRaw);

      const prods = await CeoFinancialMetricsService.getTopProducts(workspaceId, {
        startDate: inicioStr,
        endDate: fimStr,
        customTransactions: tx,
      }).catch(() => []);

      const total = tx.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const count = tx.length;
      const totalAnt = txAnt.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const countAnt = txAnt.length;
      const dayMap = new Map<string, number>();

      for (const t of tx || []) {
        if (!t.data) continue;
        const d = t.data.slice(0, 10);
        dayMap.set(d, (dayMap.get(d) || 0) + Number(t.valor || 0));
      }

      // Atualiza métricas fundamentais imediatamente sem esperar Edge Functions externas
      setVendasTotais(total);
      setPedidosTotal(count);
      setTicketMedio(count > 0 ? Math.round((total / count) * 100) / 100 : null);

      if (totalAnt > 0) {
        setCrescimentoVendas(Math.round(((total - totalAnt) / totalAnt) * 1000) / 10);
      } else {
        setCrescimentoVendas(null);
      }

      if (countAnt > 0) {
        setCrescimentoPedidos(Math.round(((count - countAnt) / countAnt) * 1000) / 10);
      } else {
        setCrescimentoPedidos(null);
      }

      const tmAnt = countAnt > 0 ? totalAnt / countAnt : null;
      if (count > 0 && tmAnt !== null && tmAnt > 0) {
        const tmAtual = total / count;
        setCrescimentoTicket(Math.round(((tmAtual - tmAnt) / tmAnt) * 1000) / 10);
      } else {
        setCrescimentoTicket(null);
      }

      // Vendas por dia (BarChart real)
      const dailyBars: DailySaleBar[] = [];
      const numDias = Math.min(range.diasNoPeriodo, 30);
      const hoje = new Date();
      for (let i = numDias - 1; i >= 0; i--) {
        const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
        const parts = iso.split('-');
        const dayLabel = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
        dailyBars.push({
          dayLabel,
          faturamento: dayMap.get(iso) || 0,
        });
      }
      setDailySalesData(dailyBars);

      // Extração de itens reais deduplicados a partir das transações carregadas
      let localTotalItems = 0;
      const localProdMap = new Map<string, { quantidade: number; faturamento: number }>();
      for (const t of tx) {
        if (!t.itens || !Array.isArray(t.itens)) continue;
        for (const item of t.itens) {
          if (!item || typeof item !== 'object') continue;
          const raw = item as Record<string, unknown>;
          const q = Number(raw.quantity ?? raw.quantidade ?? 1);
          const v = Number(raw.total ?? raw.valor ?? (Number(raw.price || 0) * q));
          localTotalItems += q;
          const name = (raw.product_name as string) || (raw.name as string) || (raw.descricao as string) || 'Item sem nome';
          const cur = localProdMap.get(name) || { quantidade: 0, faturamento: 0 };
          cur.quantidade += q;
          cur.faturamento += v;
          localProdMap.set(name, cur);
        }
      }

      let topProdsList: TopProdutoFaturamento[] = prods;
      if (topProdsList.length === 0 && localProdMap.size > 0) {
        const sortedLocal = Array.from(localProdMap.entries())
          .sort((a, b) => b[1].faturamento - a[1].faturamento)
          .slice(0, 5);
        topProdsList = sortedLocal.map(([produto, stats], idx) => ({
          rank: idx + 1,
          id: `prod-${idx + 1}`,
          produto,
          quantidade: stats.quantidade,
          faturamento: stats.faturamento,
          percentualFaturamento: total > 0 ? Math.round((stats.faturamento / total) * 1000) / 10 : 0,
          margemEstimada: null,
        }));
      }

      // Enriquecimento opcional de itens via Eyemobile live dashboard com timeout estrito de 3.5s
      const eyemobilePromise = fetchLiveDashboard(
        { startDate: inicioStr, endDate: fimStr },
        workspaceId
      ).catch(() => null);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
      const eyemobileData = await Promise.race([eyemobilePromise, timeoutPromise]);

      if (eyemobileData?.configured && eyemobileData.topProducts && eyemobileData.topProducts.length > 0 && topProdsList.length === 0) {
        topProdsList = eyemobileData.topProducts.map((p, idx) => ({
          rank: idx + 1,
          id: p.id,
          produto: p.product,
          quantidade: p.quantity,
          faturamento: p.total,
          percentualFaturamento: total > 0 ? Math.round((p.total / total) * 1000) / 10 : 0,
          margemEstimada: null,
        }));
      }

      // Itens vendidos reais calculados sobre todas as vendas do período
      const remoteTotalItems = eyemobileData?.kpis?.totalItemsSold;
      const txComItens = tx.filter((t) => t.itens && Array.isArray(t.itens) && t.itens.length > 0);
      const vendasComItensCount = txComItens.length;
      const totalVendasCount = tx.length;
      const localCoverageRatio = totalVendasCount > 0 ? vendasComItensCount / totalVendasCount : 0;
      const localCoverage: 'complete' | 'partial' | 'unavailable' =
        totalVendasCount === 0
          ? 'unavailable'
          : vendasComItensCount === totalVendasCount
          ? 'complete'
          : vendasComItensCount > 0
          ? 'partial'
          : 'unavailable';

      const coverage = eyemobileData?.kpis?.itemsCoverage ?? localCoverage;
      const ratio = eyemobileData?.kpis?.itemsCoverageRatio ?? localCoverageRatio;
      setItemsCoverage(coverage);
      setItemsCoverageRatio(ratio);
      setUnclassifiedRevenue(eyemobileData?.dailySalesCoverage?.unclassifiedRevenue ?? 0);

      const effectiveItems = typeof remoteTotalItems === 'number' && remoteTotalItems > 0 ? remoteTotalItems : (localTotalItems > 0 ? localTotalItems : null);
      setItensVendidos(effectiveItems);
      setCrescimentoItens(null);

      // Top 5 Produtos reais
      setTopProducts(topProdsList.slice(0, 5));

      // Relatório de Rentabilidade Real e Custos de Atacado
      const profitReport = await CeoFinancialMetricsService.getCommercialProfitability(workspaceId, {
        startDate: inicioStr,
        endDate: fimStr,
        customTransactions: tx,
      }).catch(() => null);
      setProfitabilityReport(profitReport);
    } catch (err: unknown) {
      console.warn('[CeoCommercialAnalysisTab] Erro ao carregar dados comerciais:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Falha na consulta');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, periodo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      {/* Top Header & Filters Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
              CEO — Análise Comercial
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">
            Desempenho de vendas, produtos, canais e comportamento de compra.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[160px] h-9 text-xs bg-card/60">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ultimos_30_dias">Últimos 30 dias</SelectItem>
              <SelectItem value="este_mes">Este mês</SelectItem>
              <SelectItem value="ultimos_7_dias">Últimos 7 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="h-9 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Falha ao consultar indicadores comerciais: {errorMessage}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadData}
            className="h-7 text-xs text-rose-400 hover:bg-rose-500/20"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* 4 KPIs Cards Comerciais Conforme Referência */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Vendas Totais */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Vendas Brutas (PDV)</span>
              <span className="text-[10px] text-sky-400 font-normal px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                Eyemobile
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              R$ {vendasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoVendas !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoVendas >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoVendas >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoVendas > 0 ? `+${crescimentoVendas}%` : `${crescimentoVendas}%`}
                </span>
              ) : (
                <span className="text-slate-500">Período selecionado</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Pedidos */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Pedidos Concluídos</div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              {pedidosTotal.toLocaleString('pt-BR')}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoPedidos !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoPedidos >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoPedidos >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoPedidos > 0 ? `+${crescimentoPedidos}%` : `${crescimentoPedidos}%`}
                </span>
              ) : (
                <span className="text-slate-500">Transações PDV reais</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Ticket Médio */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              {ticketMedio !== null ? `R$ ${ticketMedio.toFixed(2)}` : 'Dado indisponível'}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoTicket !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoTicket >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoTicket >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoTicket > 0 ? `+${crescimentoTicket}%` : `${crescimentoTicket}%`}
                </span>
              ) : (
                <span className="text-slate-500">Valor médio / venda</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4. Itens Vendidos */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Itens Vendidos</div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              {itensVendidos !== null ? (
                <span>
                  {itensVendidos.toLocaleString('pt-BR')}
                  {itemsCoverage === 'partial' && (
                    <span className="text-xs font-normal text-amber-400 ml-1.5" title={`Cobertura parcial: ${Math.round(itemsCoverageRatio * 100)}% das vendas detalhadas`}>
                      (parcial)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-sm font-normal text-slate-400">Dados insuficientes</span>
              )}
            </div>
            <div className="mt-2 text-xs">
              {itemsCoverage === 'partial' ? (
                <span className="text-amber-400/90 font-medium">
                  Parcial ({Math.round(itemsCoverageRatio * 100)}% das vendas c/ itens)
                </span>
              ) : crescimentoItens !== null ? (
                <span className="text-emerald-400 font-medium">+{crescimentoItens}%</span>
              ) : (
                <span className="text-slate-500">Unidades comercializadas</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cards Executivos de CMV e Rentabilidade Comprovada */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card CMV Confirmado */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>CMV Confirmado (Atacado)</span>
              <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">NF Comprovada</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              {profitabilityReport?.dadosIndisponiveis ? (
                <span className="text-sm font-normal text-amber-400">Dados Indisponíveis</span>
              ) : profitabilityReport ? (
                `R$ ${profitabilityReport.cmvTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                'R$ 0,00'
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {profitabilityReport && !profitabilityReport.dadosIndisponiveis && profitabilityReport.receitaComCusto > 0 ? (
                <span>
                  {((profitabilityReport.cmvTotal / profitabilityReport.receitaComCusto) * 100).toFixed(1)}% do faturamento apurado com custo
                  {profitabilityReport.cmvEstimado && profitabilityReport.cmvEstimado > 0 ? (
                    <span className="block text-[11px] text-sky-400/90 mt-0.5">
                      (R$ {profitabilityReport.cmvComprovado?.toFixed(2)} auditado NF + R$ {profitabilityReport.cmvEstimado?.toFixed(2)} ref. atual)
                    </span>
                  ) : null}
                </span>
              ) : (
                <span>{profitabilityReport?.erroMensagem || 'Sem itens com custo no período'}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card Lucro Bruto Comprovado */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Lucro Bruto (Margem de Contribuição)</span>
              <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Margem Real</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-emerald-400 mt-1">
              {profitabilityReport?.dadosIndisponiveis ? (
                <span className="text-sm font-normal text-amber-400">Dados Indisponíveis</span>
              ) : profitabilityReport ? (
                `R$ ${profitabilityReport.lucroBrutoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                'R$ 0,00'
              )}
            </div>
            <div className="mt-2 text-xs">
              {profitabilityReport && !profitabilityReport.dadosIndisponiveis && profitabilityReport.margemBrutaMedia > 0 ? (
                <div className="space-y-0.5">
                  <span className="text-emerald-400 font-semibold">
                    Margem Bruta Média: {profitabilityReport.margemBrutaMedia}%
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    * Lucro Bruto Comercial antes de despesas fixas operacionais
                  </span>
                </div>
              ) : (
                <span className="text-slate-400">Margem sob custo conhecido</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card Cobertura de CMV */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Cobertura de Custos</span>
              <span className="text-[10px] text-sky-400 font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">Auditado</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              {profitabilityReport?.dadosIndisponiveis ? (
                <span className="text-sm font-normal text-amber-400">—</span>
              ) : profitabilityReport ? (
                `${profitabilityReport.coberturaReceitaPercent}%`
              ) : (
                '0%'
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {profitabilityReport && !profitabilityReport.dadosIndisponiveis ? (
                <span>
                  R$ {profitabilityReport.receitaComCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com custo ({profitabilityReport.produtosComCustoQtd} itens)
                </span>
              ) : (
                <span>Aguardando notas fiscais</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Vendas por Dia + Top 5 Produtos (faturamento) Conforme Painel 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Vendas por Dia (BarChart Azul) */}
        <Card className="bg-card/70 border-border/50 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex flex-wrap items-center justify-between gap-1">
              <span>Vendas por Dia</span>
              <span className="text-xs font-normal text-sky-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Faturamento diário
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 min-w-0 overflow-hidden">
            {dailySalesData.some((d) => d.faturamento > 0) ? (
              <div className="h-56 sm:h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={dailySalesData}>
                    <XAxis dataKey="dayLabel" stroke="#64748b" fontSize={10} tickLine={false} interval={2} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Vendas']}
                    />
                    <Bar dataKey="faturamento" fill="#0284c7" radius={[3, 3, 0, 0]} name="Vendas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma venda registrada no período selecionado.</span>
              </div>
            )}
            {unclassifiedRevenue > 0 && (
              <div className="mt-2 text-[11px] text-slate-400 border-t border-border/30 pt-2 flex items-center justify-between">
                <span>Vendas sem data exata apurada:</span>
                <span className="font-medium text-slate-300">R$ {unclassifiedRevenue.toFixed(2)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Top 5 Produtos (faturamento) */}
        <Card className="bg-card/70 border-border/50 flex flex-col min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex flex-wrap items-center justify-between gap-1">
              <span>Top 5 Produtos (faturamento)</span>
              <span className="text-xs font-normal text-amber-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Participação de receita {vendasTotais > 0 ? `(% sobre R$ ${vendasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
            {topProducts.length > 0 ? (
              <div className="space-y-3.5">
                {topProducts.map((p) => (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-foreground truncate min-w-0 flex-1">
                        {p.produto}
                      </span>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <span className="text-slate-300 font-semibold">
                          R$ {p.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-amber-400 w-11 text-right">
                          {p.percentualFaturamento}%
                        </span>
                      </div>
                    </div>
                    {/* Barra de Progresso Laranja */}
                    <div className="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, p.percentualFaturamento))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-56 sm:h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
                <Package className="w-8 h-8 text-slate-600 mb-1" />
                <span className="text-center font-medium text-slate-300">Detalhamento por produto disponível apenas para pedidos Delivery com itens registrados.</span>
                <span className="text-[11px] text-slate-500 max-w-sm text-center">
                  Vendas do Salão consolidadas no PDV Eyemobile.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seção Completa de Rentabilidade por Produto e Margens de Atacado */}
      <Card className="bg-card/70 border-border/50">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <span>💰</span> Rentabilidade por Produto & Margens de Atacado
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Custos unitários apurados via Notas Fiscais SPAL (Coca-Cola), Brasnorte (Ambev) e distribuidores credenciados.
              </p>
            </div>

            {/* Filtros de Ordenação */}
            <div className="flex flex-wrap items-center gap-1.5 self-stretch sm:self-auto">
              <Button
                size="sm"
                variant={filtroRentabilidade === 'mais_lucrativos' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFiltroRentabilidade('mais_lucrativos')}
              >
                Mais Lucrativos (R$)
              </Button>
              <Button
                size="sm"
                variant={filtroRentabilidade === 'maiores_margens' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFiltroRentabilidade('maiores_margens')}
              >
                Maiores Margens (%)
              </Button>
              <Button
                size="sm"
                variant={filtroRentabilidade === 'menores_margens' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFiltroRentabilidade('menores_margens')}
              >
                Menores Margens (%)
              </Button>
              <Button
                size="sm"
                variant={filtroRentabilidade === 'sem_custo' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFiltroRentabilidade('sem_custo')}
              >
                Custo Pendente ({profitabilityReport?.semCusto.length || 0})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {profitabilityReport ? (
            (() => {
              let displayList: ProdutoRentabilidadeItem[] = [];
              if (filtroRentabilidade === 'mais_lucrativos') displayList = profitabilityReport.maisLucrativos;
              else if (filtroRentabilidade === 'maiores_margens') displayList = profitabilityReport.maioresMargens;
              else if (filtroRentabilidade === 'menores_margens') displayList = profitabilityReport.menoresMargens;
              else displayList = profitabilityReport.semCusto;

              if (displayList.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum produto encontrado nesta categoria no período selecionado.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-slate-900/50 border-b border-border/40">
                      <tr>
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-2 text-right">Qtd</th>
                        <th className="py-2.5 px-2 text-right">Preço Venda</th>
                        <th className="py-2.5 px-2 text-right">Custo Unitário</th>
                        <th className="py-2.5 px-2 text-right">Lucro Unitário</th>
                        <th className="py-2.5 px-3 text-right">Faturamento</th>
                        <th className="py-2.5 px-3 text-right">Lucro Bruto</th>
                        <th className="py-2.5 px-2 text-right">Margem %</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {displayList.map((item) => {
                        const hasCost = item.custoUnitario !== null && item.custoUnitario > 0;
                        const isNfComprovada = item.statusCusto === 'confirmado' || item.statusCusto === 'historico_comprovado';
                        const isRefAtual = item.statusCusto === 'referencia_atual';
                        const lucroUnit = hasCost ? (item.precoVendaMedio - item.custoUnitario!) : null;

                        return (
                          <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2 px-3 font-medium text-foreground max-w-[220px] truncate" title={item.produto}>
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{item.produto}</span>
                                {item.isCombo && (
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-400 font-medium shrink-0">
                                    Combo
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              {item.quantidade}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300">
                              R$ {item.precoVendaMedio.toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {hasCost ? (
                                <span className={`font-medium ${isNfComprovada ? 'text-emerald-400' : 'text-sky-400'}`}>
                                  R$ {item.custoUnitario!.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">Pendente</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {lucroUnit !== null ? (
                                <span className="text-emerald-400 font-semibold">
                                  R$ {lucroUnit.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300 font-medium">
                              R$ {item.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {item.lucroBrutoTotal !== null ? (
                                <span className="text-emerald-400 font-bold">
                                  R$ {item.lucroBrutoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {item.margemBrutaPercent !== null ? (
                                <span className={`font-semibold ${item.margemBrutaPercent >= 60 ? 'text-emerald-400' : item.margemBrutaPercent >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                                  {item.margemBrutaPercent}%
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {isNfComprovada ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={item.tipoCustoLabel || 'Auditado por Nota Fiscal'}>
                                  Auditado por NF
                                </span>
                              ) : isRefAtual ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20" title={item.tipoCustoLabel || 'Custo de referência atual'}>
                                  Referência Atual
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20" title="Aguardando nota fiscal ou ficha técnica de composição">
                                  Sem NF / Ficha
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Carregando dados de rentabilidade...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
