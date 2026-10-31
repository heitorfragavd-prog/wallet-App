import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { TrendingUp, RefreshCw } from 'lucide-react';
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

interface CeoCommercialAnalysisTabProps {
  workspaceId: string;
}

export const CeoCommercialAnalysisTab: React.FC<CeoCommercialAnalysisTabProps> = () => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [comparar, setComparar] = useState('periodo_anterior');
  const [canal, setCanal] = useState('todos');

  // Dados da evolução de vendas (Este período vs Período anterior)
  const salesEvolutionData = [
    { date: '01/10', estePeriodo: 7200, periodoAnterior: 6400 },
    { date: '05/10', estePeriodo: 9400, periodoAnterior: 8100 },
    { date: '10/10', estePeriodo: 13500, periodoAnterior: 9800 },
    { date: '15/10', estePeriodo: 11200, periodoAnterior: 10400 },
    { date: '20/10', estePeriodo: 12800, periodoAnterior: 8900 },
    { date: '25/10', estePeriodo: 15600, periodoAnterior: 12100 },
    { date: '30/10', estePeriodo: 17400, periodoAnterior: 11800 },
  ];

  // Distribuição por Canal (Donut)
  const channelsData = [
    { name: 'Salão', value: 45.2, faturamento: 129918.59, color: '#3b82f6' },
    { name: 'iFood', value: 28.7, faturamento: 82492.55, color: '#ef4444' },
    { name: '99Food', value: 15.4, faturamento: 44264.30, color: '#f59e0b' },
    { name: 'Delivery Direto', value: 8.1, faturamento: 23281.87, color: '#10b981' },
    { name: 'Outros', value: 2.6, faturamento: 7473.19, color: '#8b5cf6' },
  ];

  // Top 10 Produtos por Faturamento
  const topProducts = [
    { rank: 1, name: 'X-Tudo Especial', quantity: 1243, revenue: 46752.30, margin: 28 },
    { rank: 2, name: 'X-Bacon', quantity: 982, revenue: 32164.50, margin: 32 },
    { rank: 3, name: 'X-Salada', quantity: 876, revenue: 25430.10, margin: 35 },
    { rank: 4, name: 'Batata Frita', quantity: 1102, revenue: 18334.20, margin: 40 },
    { rank: 5, name: 'Refrigerante Lata', quantity: 1890, revenue: 14175.00, margin: 52 },
    { rank: 6, name: 'Pastel de Carne', quantity: 720, revenue: 10800.00, margin: 38 },
    { rank: 7, name: 'Suco Natural 500ml', quantity: 610, revenue: 9150.00, margin: 45 },
    { rank: 8, name: 'Misto Quente', quantity: 540, revenue: 7020.00, margin: 42 },
    { rank: 9, name: 'Cerveja Long Neck', quantity: 480, revenue: 6720.00, margin: 48 },
    { rank: 10, name: 'Café Espresso', quantity: 1200, revenue: 6000.00, margin: 65 },
  ];

  // Matriz de calor: Dias x Horas
  const daysOfWeek = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const hoursOfDay = ['11h', '13h', '15h', '17h', '19h', '21h', '23h'];

  // Intensidades calculadas (0 = baixa, 1 = média-baixa, 2 = média, 3 = alta, 4 = pico)
  const heatmapGrid: number[][] = [
    // 11h: almoço iniciando
    [2, 2, 2, 2, 3, 3, 2],
    // 13h: pico almoço
    [3, 3, 3, 3, 4, 4, 3],
    // 15h: baixa da tarde
    [1, 1, 1, 1, 2, 2, 1],
    // 17h: transição
    [2, 2, 2, 2, 3, 3, 2],
    // 19h: jantar forte
    [3, 3, 4, 4, 4, 4, 4],
    // 21h: pico jantar
    [4, 4, 4, 4, 4, 4, 4],
    // 23h: fechamento
    [1, 1, 2, 2, 3, 3, 2],
  ];

  const getHeatmapColor = (intensity: number) => {
    switch (intensity) {
      case 4:
        return 'bg-amber-500';
      case 3:
        return 'bg-amber-600/80';
      case 2:
        return 'bg-amber-700/60';
      case 1:
        return 'bg-amber-900/40';
      default:
        return 'bg-slate-800/60';
    }
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
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Comparar com:</span>
            <Select value={comparar} onValueChange={setComparar}>
              <SelectTrigger className="w-[150px] h-8 text-xs bg-card/60">
                <SelectValue placeholder="Comparar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="periodo_anterior">Período anterior</SelectItem>
                <SelectItem value="mesmo_periodo_ano_passado">Ano anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Canal:</span>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-card/60">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="salao">Salão</SelectItem>
                <SelectItem value="ifood">iFood</SelectItem>
                <SelectItem value="99food">99Food</SelectItem>
                <SelectItem value="direto">Delivery Direto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* 4 KPIs Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vendas Totais */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Vendas Totais</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ 287.430,50
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>↑ 12,3%</span>
              <span className="text-muted-foreground font-normal">vs. período anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Pedidos */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Pedidos</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              8.972
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>↑ 9,1%</span>
              <span className="text-muted-foreground font-normal">vs. período anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Ticket Médio */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Ticket Médio</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ 32,05
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>↑ 2,9%</span>
              <span className="text-muted-foreground font-normal">vs. período anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Itens Vendidos */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Itens Vendidos</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              28.436
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>↑ 11,8%</span>
              <span className="text-muted-foreground font-normal">vs. período anterior</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 1: Evolução de Vendas & Vendas por Canal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Line Chart: Evolução de Vendas */}
        <Card className="lg:col-span-7 bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Evolução de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesEvolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? `${v / 1000}k` : v}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    formatter={(val: number) => [`R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                  />
                  <Line
                    type="monotone"
                    dataKey="estePeriodo"
                    name="Este período"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#38bdf8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="periodoAnterior"
                    name="Período anterior"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 2.5, fill: '#f97316' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-400"></span>
                <span className="text-muted-foreground">Este período</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <span className="text-muted-foreground">Período anterior</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Donut Chart: Vendas por Canal */}
        <Card className="lg:col-span-5 bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Vendas por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="relative w-[180px] h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelsData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {channelsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-sm font-bold text-foreground">R$ 287.430</span>
                </div>
              </div>

              {/* Legenda de Canais */}
              <div className="space-y-1.5 text-xs w-full sm:w-auto">
                {channelsData.map((c) => (
                  <div key={c.name} className="flex items-center justify-between sm:justify-start gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }}></span>
                      <span className="text-muted-foreground">{c.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">{c.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Top 10 Produtos & Horários de Maior Movimento Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top 10 Produtos por Faturamento */}
        <Card className="lg:col-span-7 bg-card/70 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Top 10 Produtos por Faturamento</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4 w-10">#</th>
                    <th className="py-2.5 px-4">Produto</th>
                    <th className="py-2.5 px-4 text-right">Quantidade</th>
                    <th className="py-2.5 px-4 text-right">Faturamento</th>
                    <th className="py-2.5 px-4 text-right">Margem Estimada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {topProducts.map((p) => (
                    <tr key={p.rank} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-amber-400">{p.rank}</td>
                      <td className="py-2.5 px-4 font-medium text-foreground">{p.name}</td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">{p.quantity.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-foreground">
                        R$ {p.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={`font-semibold ${
                            p.margin < 30 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {p.margin}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Heatmap: Horários de Maior Movimento */}
        <Card className="lg:col-span-5 bg-card/70 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Horários de Maior Movimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {/* Header com Dias da Semana */}
              <div className="grid grid-cols-8 gap-1.5 text-center text-[10px] text-muted-foreground font-semibold">
                <div></div>
                {daysOfWeek.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              {/* Linhas da Matriz (Horas) */}
              {hoursOfDay.map((hour, rowIndex) => (
                <div key={hour} className="grid grid-cols-8 gap-1.5 items-center">
                  <div className="text-[10px] text-muted-foreground font-medium text-right pr-1">
                    {hour}
                  </div>
                  {heatmapGrid[rowIndex].map((intensity, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className={`h-5 rounded-sm transition-all hover:ring-1 hover:ring-amber-300 ${getHeatmapColor(
                        intensity
                      )}`}
                      title={`${daysOfWeek[colIndex]} às ${hour}`}
                    ></div>
                  ))}
                </div>
              ))}

              {/* Legenda de Intensidade */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-4 mt-2 border-t border-border/30">
                <span>Baixo</span>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-slate-800"></span>
                  <span className="w-3 h-3 rounded-sm bg-amber-900/40"></span>
                  <span className="w-3 h-3 rounded-sm bg-amber-700/60"></span>
                  <span className="w-3 h-3 rounded-sm bg-amber-600/80"></span>
                  <span className="w-3 h-3 rounded-sm bg-amber-500"></span>
                </div>
                <span>Alto</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
