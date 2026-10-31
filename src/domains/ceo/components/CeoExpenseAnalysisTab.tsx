import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { ArrowUpRight } from 'lucide-react';
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
} from 'recharts';

interface CeoExpenseAnalysisTabProps {
  workspaceId: string;
}

export const CeoExpenseAnalysisTab: React.FC<CeoExpenseAnalysisTabProps> = () => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [categoria, setCategoria] = useState('todas');

  // Distribuição por Categoria de Despesas (Donut)
  const categoryData = [
    { name: 'Insumos', value: 40.4, amount: 18420.50, color: '#ef4444' },
    { name: 'Equipe', value: 22.1, amount: 10080.00, color: '#3b82f6' },
    { name: 'Taxas de Delivery', value: 12.5, amount: 5710.25, color: '#ec4899' },
    { name: 'Aluguel', value: 8.3, amount: 3800.00, color: '#eab308' },
    { name: 'Utilidades', value: 6.4, amount: 2919.00, color: '#06b6d4' },
    { name: 'Marketing', value: 5.1, amount: 2330.00, color: '#a855f7' },
    { name: 'Outros', value: 5.2, amount: 2350.50, color: '#6366f1' },
  ];

  // Evolução de Despesas (Ago, Set, Out)
  const monthlyExpenseEvolution = [
    { month: 'Ago', despesas: 39500, meta: 38000 },
    { month: 'Set', despesas: 42190, meta: 40000 },
    { month: 'Out', despesas: 45610, meta: 42000 },
  ];

  // Detalhamento Top 5 Despesas
  const topExpenses = [
    { category: 'Insumos', value: 18420.50, percent: 40.4, variation: 12.6, color: '#ef4444' },
    { category: 'Equipe', value: 10080.00, percent: 22.1, variation: 5.2, color: '#3b82f6' },
    { category: 'Taxas de Delivery', value: 5710.25, percent: 12.5, variation: 18.3, color: '#ec4899' },
    { category: 'Aluguel', value: 3800.00, percent: 8.3, variation: 0.0, color: '#eab308' },
    { category: 'Marketing', value: 2330.00, percent: 5.1, variation: 7.1, color: '#a855f7' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Filters Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="text-amber-400">👑 Wallet CEO</span>
          <span>›</span>
          <span>Financeiro</span>
          <span>›</span>
          <span className="text-foreground font-semibold">Despesas</span>
        </div>

        <div className="flex items-center gap-3">
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
            <span className="text-xs text-muted-foreground">Categoria:</span>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-card/60">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="insumos">Insumos</SelectItem>
                <SelectItem value="equipe">Equipe</SelectItem>
                <SelectItem value="delivery">Taxas de Delivery</SelectItem>
                <SelectItem value="aluguel">Aluguel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total de Despesas */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Total de Despesas</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ 45.610,25
            </div>
            <div className="flex items-center gap-1.5 text-xs text-red-400 mt-2 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>↑ 8,1%</span>
              <span className="text-muted-foreground font-normal">vs. mês anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Maior Categoria */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Maior Categoria</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              Insumos
            </div>
            <div className="text-xs text-muted-foreground mt-2 font-medium">
              R$ 18.420,50 <span className="text-red-400 font-semibold">(40,4%)</span>
            </div>
          </CardContent>
        </Card>

        {/* Variação vs. Mês Anterior */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Variação vs. Mês Anterior</div>
            <div className="text-2xl font-bold tracking-tight text-red-400 mt-1">
              +R$ 3.420,10
            </div>
            <div className="flex items-center gap-1.5 text-xs text-red-400 mt-2 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>+8,1% de aumento</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 1: Donut de Despesas por Categoria & Evolução de Despesas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart: Despesas por Categoria */}
        <Card className="lg:col-span-7 bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <div className="relative w-[200px] h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-sm font-bold text-foreground">R$ 45.610</span>
                </div>
              </div>

              {/* Legenda com percentuais */}
              <div className="grid grid-cols-1 gap-2 text-xs w-full sm:w-auto">
                {categoryData.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-6">
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

        {/* Bar Chart: Evolução de Despesas */}
        <Card className="lg:col-span-5 bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Evolução de Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyExpenseEvolution} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? `${v / 1000}k` : v}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    formatter={(val: number) => [`R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Despesas']}
                  />
                  <Bar dataKey="despesas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={36} />
                  <Line
                    type="monotone"
                    dataKey="despesas"
                    stroke="#f87171"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={{ r: 4, fill: '#fff', stroke: '#ef4444', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Detalhamento de Despesas (Top 5) */}
      <Card className="bg-card/70 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Detalhamento de Despesas (Top 5)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4 text-right">Valor</th>
                  <th className="py-2.5 px-4 text-right">%</th>
                  <th className="py-2.5 px-4 text-right">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {topExpenses.map((exp) => (
                  <tr key={exp.category} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-foreground flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: exp.color }}></span>
                      <span>{exp.category}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-foreground">
                      R$ {exp.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">
                      {exp.percent.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {exp.variation > 0 ? (
                        <span className="text-red-400 font-semibold flex items-center justify-end gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          +{exp.variation.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">0,0%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
