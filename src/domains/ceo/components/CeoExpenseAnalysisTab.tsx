import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, AlertCircle, Receipt } from 'lucide-react';
import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface CeoExpenseAnalysisTabProps {
  workspaceId: string;
}

interface ExpenseCategoryItem {
  name: string;
  amount: number;
  value: number; // percentual
  color: string;
  variation?: number;
}

interface MonthlyExpenseItem {
  month: string;
  despesas: number;
}

export const CeoExpenseAnalysisTab: React.FC<CeoExpenseAnalysisTabProps> = ({
  workspaceId,
}) => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [isLoading, setIsLoading] = useState(false);

  const [totalDespesas, setTotalDespesas] = useState(0);
  const [maiorCategoria, setMaiorCategoria] = useState<{ nome: string; valor: number; percentual: number } | null>(null);
  const [variacaoMesAnterior, setVariacaoMesAnterior] = useState<number | null>(null);
  const [categoryData, setCategoryData] = useState<ExpenseCategoryItem[]>([]);
  const [monthlyExpenseEvolution, setMonthlyExpenseEvolution] = useState<MonthlyExpenseItem[]>([]);
  const [topExpenses, setTopExpenses] = useState<ExpenseCategoryItem[]>([]);

  const loadExpenseData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);

    try {
      const hoje = new Date();
      let diasAtras = 30;
      if (periodo === 'este_mes') {
        diasAtras = hoje.getDate();
      }

      const inicioStr = new Date(hoje.getTime() - diasAtras * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fimStr = hoje.toISOString().slice(0, 10);

      // 1. Despesas no período
      const { data: desp } = await supabase
        .from('despesas')
        .select('valor, data, categoria_id, descricao')
        .eq('workspace_id', workspaceId)
        .gte('data', inicioStr)
        .lte('data', fimStr)
        .limit(5000);

      const total = (desp || []).reduce((acc, d) => acc + Number(d.valor || 0), 0);
      setTotalDespesas(total);

      // Agrupamento por categoria
      const catMap = new Map<string, number>();
      for (const d of desp || []) {
        const catName = d.descricao?.split('-')[0]?.trim() || 'Geral';
        catMap.set(catName, (catMap.get(catName) || 0) + Number(d.valor || 0));
      }

      const categoryPalette = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#8b5cf6'];
      const categories: ExpenseCategoryItem[] = [];
      let colorIdx = 0;

      for (const [name, amount] of catMap.entries()) {
        const pct = total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;
        categories.push({
          name,
          amount,
          value: pct,
          color: categoryPalette[colorIdx % categoryPalette.length],
        });
        colorIdx++;
      }

      categories.sort((a, b) => b.amount - a.amount);
      setCategoryData(categories);
      setTopExpenses(categories.slice(0, 5));

      if (categories.length > 0) {
        setMaiorCategoria({
          nome: categories[0].name,
          valor: categories[0].amount,
          percentual: categories[0].value,
        });
      } else {
        setMaiorCategoria(null);
      }

      // Evolução dos últimos 3 meses
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      const evolucao: MonthlyExpenseItem[] = [];
      for (let i = 2; i >= 0; i--) {
        const dRef = new Date(anoAtual, mesAtual - 1 - i, 1);
        const a = dRef.getFullYear();
        const m = dRef.getMonth() + 1;
        const start = `${a}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(a, m, 0).getDate();
        const end = `${a}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const { data: dM } = await supabase
          .from('despesas')
          .select('valor')
          .eq('workspace_id', workspaceId)
          .gte('data', start)
          .lte('data', end)
          .limit(5000);

        const sumM = (dM || []).reduce((acc, row) => acc + Number(row.valor || 0), 0);
        evolucao.push({
          month: mesesLabels[m - 1],
          despesas: sumM,
        });
      }

      setMonthlyExpenseEvolution(evolucao);

      // Variação vs mês anterior
      if (evolucao.length >= 2 && evolucao[1].despesas > 0) {
        const varPct = Math.round(((evolucao[2].despesas - evolucao[1].despesas) / evolucao[1].despesas) * 1000) / 10;
        setVariacaoMesAnterior(varPct);
      } else {
        setVariacaoMesAnterior(null);
      }
    } catch (err) {
      console.warn('[CeoExpenseAnalysisTab] Erro ao carregar despesas reais:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, periodo]);

  useEffect(() => {
    loadExpenseData();
  }, [loadExpenseData]);

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
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={loadExpenseData}
            disabled={isLoading}
            className="h-8 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total de Despesas */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Total de Despesas Registradas</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Lançamentos apurados no período
            </div>
          </CardContent>
        </Card>

        {/* Maior Categoria */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Maior Categoria</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {maiorCategoria ? maiorCategoria.nome : 'Em apuração'}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {maiorCategoria
                ? `R$ ${maiorCategoria.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${maiorCategoria.percentual}%)`
                : 'Sem lançamentos'}
            </div>
          </CardContent>
        </Card>

        {/* Variação vs. Mês Anterior */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Variação vs. Mês Anterior</div>
            <div className="text-2xl font-bold tracking-tight mt-1">
              {variacaoMesAnterior !== null ? (
                <span className={variacaoMesAnterior > 0 ? "text-amber-400" : "text-emerald-400"}>
                  {variacaoMesAnterior > 0 ? `+${variacaoMesAnterior}%` : `${variacaoMesAnterior}%`}
                </span>
              ) : (
                <span className="text-muted-foreground font-normal text-lg">Base anterior em apuração</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Comparativo de competência
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row: Despesas por Categoria (Donut) + Evolução de Despesas (Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Despesas por Categoria Donut */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {categoryData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="h-48 w-48 relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cat-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Total</span>
                    <span className="text-sm font-bold text-foreground">
                      R$ {(totalDespesas >= 1000 ? `${(totalDespesas / 1000).toFixed(1)}k` : totalDespesas.toFixed(0))}
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-full space-y-2 text-xs">
                  {categoryData.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="truncate max-w-[140px]">{cat.name}</span>
                      </span>
                      <span className="font-semibold text-foreground">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1.5 text-center">
                <Receipt className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma despesa registrada para o período selecionado.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evolução de Despesas Bar Chart */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Evolução Mensal de Despesas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {monthlyExpenseEvolution.some((m) => m.despesas > 0) ? (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyExpenseEvolution}>
                    <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Despesas']}
                    />
                    <Bar dataKey="despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={36} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1.5 text-center">
                <AlertCircle className="w-8 h-8 text-slate-600 mb-1" />
                <span>Sem histórico mensal de despesas acumulado.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Table: Detalhamento de Despesas (Top 5) */}
      <Card className="bg-card/70 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            Detalhamento de Despesas (Top 5 Categorias)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topExpenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60 border-b border-border/40 text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-4 text-left">Categoria</th>
                    <th className="py-2.5 px-4 text-right">Valor</th>
                    <th className="py-2.5 px-4 text-right">% do Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {topExpenses.map((exp, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-4 font-medium text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: exp.color }} />
                        {exp.name}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-foreground">
                        R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground font-medium">
                        {exp.value}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
              <Receipt className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="font-medium text-slate-300">Nenhuma despesa detalhada para exibir</p>
              <p className="text-[11px] max-w-sm mx-auto">
                Registre os custos e despesas no módulo Financeiro para visualizar o ranking por categoria.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
