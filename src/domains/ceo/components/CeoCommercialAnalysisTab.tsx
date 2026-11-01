import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, ShoppingBag, TrendingUp, TrendingDown, Package } from 'lucide-react';
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
} from '@/domains/ceo/services/CeoFinancialMetricsService';

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

  // Estados de dados reais
  const [vendasTotais, setVendasTotais] = useState<number>(0);
  const [crescimentoVendas, setCrescimentoVendas] = useState<number | null>(null);
  const [pedidosTotal, setPedidosTotal] = useState<number>(0);
  const [crescimentoPedidos, setCrescimentoPedidos] = useState<number | null>(null);
  const [ticketMedio, setTicketMedio] = useState<number | null>(null);
  const [crescimentoTicket, setCrescimentoTicket] = useState<number | null>(null);
  const [itensVendidos, setItensVendidos] = useState<number>(0);
  const [crescimentoItens, setCrescimentoItens] = useState<number | null>(null);

  const [dailySalesData, setDailySalesData] = useState<DailySaleBar[]>([]);
  const [topProducts, setTopProducts] = useState<TopProdutoFaturamento[]>([]);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);

    try {
      const hoje = new Date();
      let diasAtras = 30;
      if (periodo === 'este_mes') {
        diasAtras = hoje.getDate();
      } else if (periodo === 'ultimos_7_dias') {
        diasAtras = 7;
      }

      const fimStr = getSaoPauloDateString(hoje);
      const inicioStr = getSaoPauloDateString(new Date(hoje.getTime() - diasAtras * 24 * 60 * 60 * 1000));

      // Período anterior equivalente real (sem multiplicadores arbitrários)
      const inicioAntStr = getSaoPauloDateString(new Date(hoje.getTime() - diasAtras * 2 * 24 * 60 * 60 * 1000));
      const fimAntStr = getSaoPauloDateString(new Date(hoje.getTime() - (diasAtras + 1) * 24 * 60 * 60 * 1000));

      // 1. Transações reais deste período com paginação integral segura
      const tx = await CeoFinancialMetricsService.fetchAllPaginated<{ valor: number; data: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioStr)
            .lte('data', `${fimStr}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );

      // 2. Transações reais do período anterior equivalente
      const txAnt = await CeoFinancialMetricsService.fetchAllPaginated<{ valor: number; data: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioAntStr)
            .lte('data', `${fimAntStr}T23:59:59.999Z`)
            .range(from, to)
      );

      const total = tx.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const count = tx.length;
      const totalAnt = txAnt.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const countAnt = txAnt.length;

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

      // 3. Vendas por dia (BarChart real)
      const dayMap = new Map<string, number>();
      for (const t of tx || []) {
        if (!t.data) continue;
        const d = t.data.slice(0, 10);
        dayMap.set(d, (dayMap.get(d) || 0) + Number(t.valor || 0));
      }

      const dailyBars: DailySaleBar[] = [];
      const numDias = Math.min(diasAtras, 30);
      for (let i = numDias - 1; i >= 0; i--) {
        const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = d.toISOString().slice(0, 10);
        dailyBars.push({
          dayLabel: `${d.getDate()}`,
          faturamento: dayMap.get(iso) || 0,
        });
      }
      setDailySalesData(dailyBars);

      // 4. Itens vendidos reais (somando quantidades em delivery_order_items ou total de transações)
      const { data: orderItems } = await supabase
        .from('delivery_order_items')
        .select('quantity')
        .eq('workspace_id', workspaceId);

      const totalItens = (orderItems || []).reduce((acc, it) => acc + Number(it.quantity || 1), 0);
      setItensVendidos(totalItens > 0 ? totalItens : count);
      setCrescimentoItens(null); // Sem histórico inflado

      // 5. Top 5 Produtos reais
      const prods = await CeoFinancialMetricsService.getTopProducts(workspaceId);
      setTopProducts(prods.slice(0, 5));
    } catch (err) {
      console.warn('[CeoCommercialAnalysisTab] Erro ao carregar dados comerciais:', err);
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

      {/* 4 KPIs Cards Comerciais Conforme Referência */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Vendas Totais */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Vendas Totais</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
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
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Pedidos</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              {pedidosTotal.toLocaleString('pt-BR')}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoPedidos !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoPedidos >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoPedidos >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoPedidos > 0 ? `+${crescimentoPedidos}%` : `${crescimentoPedidos}%`}
                </span>
              ) : (
                <span className="text-slate-500">Transações PDV/KDS</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Ticket Médio */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
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
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Itens Vendidos</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              {itensVendidos.toLocaleString('pt-BR')}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoItens !== null ? (
                <span className="text-emerald-400 font-medium">+{crescimentoItens}%</span>
              ) : (
                <span className="text-slate-500">Itens apurados</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Vendas por Dia + Top 5 Produtos (faturamento) Conforme Painel 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Vendas por Dia (BarChart Azul) */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span>Vendas por Dia</span>
              <span className="text-xs font-normal text-sky-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Faturamento diário
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {dailySalesData.some((d) => d.faturamento > 0) ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
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
              <div className="h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
                <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma venda registrada no período selecionado.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Top 5 Produtos (faturamento) */}
        <Card className="bg-card/70 border-border/50 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span>Top 5 Produtos (faturamento)</span>
              <span className="text-xs font-normal text-amber-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Participação de receita
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-center">
            {topProducts.length > 0 ? (
              <div className="space-y-3.5">
                {topProducts.map((p) => (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[200px]">
                        {p.produto}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-300 font-semibold">
                          R$ {p.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-amber-400 w-12 text-right">
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
              <div className="h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-2">
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
    </div>
  );
};
