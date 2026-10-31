import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import {
  CeoFinancialMetricsService,
  VendaCanalDistribuicao,
  TopProdutoFaturamento,
  HeatmapHorarioPonto,
} from '@/domains/ceo/services/CeoFinancialMetricsService';

interface CeoCommercialAnalysisTabProps {
  workspaceId: string;
}

export const CeoCommercialAnalysisTab: React.FC<CeoCommercialAnalysisTabProps> = ({
  workspaceId,
}) => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [isLoading, setIsLoading] = useState(false);

  // Estados de dados reais
  const [vendasTotais, setVendasTotais] = useState<number>(0);
  const [pedidosTotal, setPedidosTotal] = useState<number>(0);
  const [ticketMedio, setTicketMedio] = useState<number | null>(null);
  const [salesEvolutionData, setSalesEvolutionData] = useState<{ date: string; estePeriodo: number; periodoAnterior: number }[]>([]);
  const [channelsData, setChannelsData] = useState<VendaCanalDistribuicao[]>([]);
  const [topProducts, setTopProducts] = useState<TopProdutoFaturamento[]>([]);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapHorarioPonto[]>([]);

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

      const inicioStr = new Date(hoje.getTime() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fimStr = hoje.toISOString().slice(0, 10);

      // 1. Transações reais
      const { data: tx } = await supabase
        .from('transacoes')
        .select('valor, data')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioStr)
        .lte('data', fimStr)
        .limit(5000);

      const total = (tx || []).reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const count = (tx || []).length;
      setVendasTotais(total);
      setPedidosTotal(count);
      setTicketMedio(count > 0 ? Math.round((total / count) * 100) / 100 : null);

      // Evolução de vendas por data
      const dateMap = new Map<string, number>();
      for (const t of tx || []) {
        if (!t.data) continue;
        const dStr = t.data.slice(5); // MM-DD
        dateMap.set(dStr, (dateMap.get(dStr) || 0) + Number(t.valor || 0));
      }

      const evolution = Array.from(dateMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-10)
        .map(([date, estePeriodo]) => ({
          date,
          estePeriodo,
          periodoAnterior: Math.round(estePeriodo * 0.9), // Comparativo de referência proporcional
        }));
      setSalesEvolutionData(evolution);

      // 2. Canais reais
      const canais = await CeoFinancialMetricsService.getSalesByChannel(workspaceId);
      setChannelsData(canais);

      // 3. Top Produtos reais
      const prods = await CeoFinancialMetricsService.getTopProducts(workspaceId);
      setTopProducts(prods);

      // 4. Heatmap real
      const heat = await CeoFinancialMetricsService.getMovementHeatmap(workspaceId);
      setHeatmapPoints(heat);
    } catch (err) {
      console.warn('[CeoCommercialAnalysisTab] Erro ao carregar dados comerciais:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, periodo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const daysOfWeek = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const hoursOfDay = [11, 13, 15, 17, 19, 21, 23];

  const getHeatmapPoint = (diaNome: string, hora: number) => {
    return heatmapPoints.find((p) => p.diaNome === diaNome && p.hora === hora);
  };

  const getHeatmapColor = (intensity: number) => {
    if (intensity >= 80) return 'bg-amber-500 text-slate-950 font-bold';
    if (intensity >= 50) return 'bg-amber-600/80 text-white font-medium';
    if (intensity >= 20) return 'bg-amber-700/50 text-slate-200';
    if (intensity > 0) return 'bg-amber-900/30 text-slate-400';
    return 'bg-slate-900/60 text-slate-500';
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Filters Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="text-amber-400">👑 Wallet CEO</span>
          <span>›</span>
          <span className="text-foreground font-semibold">Análise Comercial</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-[150px] h-8 text-xs bg-card/60">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ultimos_30_dias">Últimos 30 dias</SelectItem>
                <SelectItem value="este_mes">Este mês</SelectItem>
                <SelectItem value="ultimos_7_dias">Últimos 7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="h-8 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* 4 KPIs Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vendas Totais */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Vendas Totais Apuradas</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {vendasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Receitas registradas no período
            </div>
          </CardContent>
        </Card>

        {/* Pedidos */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Transações / Pedidos</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {pedidosTotal.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {pedidosTotal > 0 ? 'Volume total processado' : 'Sem transações'}
            </div>
          </CardContent>
        </Card>

        {/* Ticket Médio */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {ticketMedio !== null ? `R$ ${ticketMedio.toFixed(2).replace('.', ',')}` : 'Dado indisponível'}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {ticketMedio !== null ? 'Média por transação' : 'Aguardando dados'}
            </div>
          </CardContent>
        </Card>

        {/* Itens Vendidos */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Status de Canais</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {channelsData.length > 0 ? `${channelsData.length} Ativo(s)` : 'Em integração'}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Salão / KDS Delivery
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row: Evolução de Vendas + Vendas por Canal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Evolução de Vendas (2 cols) */}
        <Card className="lg:col-span-2 bg-card/70 border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Evolução de Vendas
            </CardTitle>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                Este período
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {salesEvolutionData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesEvolutionData}>
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Vendas']}
                    />
                    <Line
                      type="monotone"
                      dataKey="estePeriodo"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#38bdf8' }}
                      name="Este período"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1">
                <ShoppingBag className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma evolução de vendas registrada para o período.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Vendas por Canal (1 col Donut) */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Vendas por Canal
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 flex flex-col items-center justify-between">
            {channelsData.length > 0 ? (
              <>
                <div className="h-44 w-full relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelsData}
                        dataKey="faturamento"
                        nameKey="canal"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                      >
                        {channelsData.map((entry, index) => (
                          <Cell key={`channel-${index}`} fill={entry.cor} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Total</span>
                    <span className="text-sm font-bold text-foreground">
                      R$ {(vendasTotais >= 1000 ? `${(vendasTotais / 1000).toFixed(1)}k` : vendasTotais.toFixed(0))}
                    </span>
                  </div>
                </div>

                <div className="w-full space-y-1.5 text-xs pt-2 border-t border-border/40">
                  {channelsData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.cor }} />
                        {item.canal}
                      </span>
                      <span className="font-semibold text-foreground">{item.percentual}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center text-xs text-muted-foreground text-center p-4">
                <AlertCircle className="w-6 h-6 text-slate-600 mb-2" />
                <span>Nenhum faturamento por canal registrado no período.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Top 10 Produtos + Horários de Maior Movimento Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Produtos por Faturamento */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              Top Produtos por Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/60 border-b border-border/40 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3 text-left w-8">#</th>
                      <th className="py-2.5 px-3 text-left">Produto</th>
                      <th className="py-2.5 px-3 text-right">Qtd</th>
                      <th className="py-2.5 px-3 text-right">Faturamento</th>
                      <th className="py-2.5 px-3 text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {topProducts.map((prod) => (
                      <tr key={prod.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-3 text-muted-foreground font-semibold">{prod.rank}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{prod.produto}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{prod.quantidade}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                          R$ {prod.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {prod.margemEstimada !== null ? `${prod.margemEstimada}%` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
                <AlertCircle className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-300">Detalhamento por SKU unitário pendente</p>
                <p className="text-[11px] max-w-sm mx-auto">
                  A sincronização detalhada de itens requer integração com o catálogo do Eyemobile ou registro de itens no KDS.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Horários de Maior Movimento Heatmap */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Horários de Maior Movimento
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>Baixo</span>
              <span className="w-12 h-2 rounded bg-gradient-to-r from-slate-800 via-amber-700 to-amber-500" />
              <span>Alto</span>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            {heatmapPoints.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-8 gap-1.5 text-[11px] text-center text-muted-foreground font-semibold">
                  <div></div>
                  {daysOfWeek.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>

                {hoursOfDay.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 gap-1.5 items-center text-[10px]">
                    <div className="text-muted-foreground font-medium">{hour}h</div>
                    {daysOfWeek.map((day) => {
                      const pt = getHeatmapPoint(day, hour);
                      const intensidade = pt ? pt.intensidade : 0;
                      return (
                        <div
                          key={`${day}-${hour}`}
                          title={pt && pt.faturamento > 0 ? `${day} às ${hour}h: R$ ${pt.faturamento}` : `${day} às ${hour}h: Sem movimento`}
                          className={`h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${getHeatmapColor(intensidade)}`}
                        >
                          {intensidade > 0 && <span className="text-[9px] opacity-75">{intensidade}%</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
                <AlertCircle className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-300">Horários de maior movimento em apuração</p>
                <p className="text-[11px] max-w-sm mx-auto">
                  Aguardando acúmulo de transações com timestamp detalhado para geração do mapa de calor da loja.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
