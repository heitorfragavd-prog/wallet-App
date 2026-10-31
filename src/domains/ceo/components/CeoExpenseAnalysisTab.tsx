import { getSaoPauloDateString } from '@/domains/ceo/services/CeoFinancialMetricsService';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Button } from '@/shared/components/ui/button';
import { RefreshCw, Receipt, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
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
}

interface DailyResultItem {
  date: string;
  receita: number;
  despesas: number;
}

export const CeoExpenseAnalysisTab: React.FC<CeoExpenseAnalysisTabProps> = ({
  workspaceId,
}) => {
  const [periodo, setPeriodo] = useState('ultimos_30_dias');
  const [isLoading, setIsLoading] = useState(false);

  // 4 KPIs Financeiros
  const [receitaBruta, setReceitaBruta] = useState(0);
  const [crescimentoReceita, setCrescimentoReceita] = useState<number | null>(null);
  const [cmvValor, setCmvValor] = useState<number | null>(null);
  const [cmvPercent, setCmvPercent] = useState<number | null>(null);
  const [despesasOperacionais, setDespesasOperacionais] = useState(0);
  const [variacaoDespesas, setVariacaoDespesas] = useState<number | null>(null);
  const [resultadoOperacional, setResultadoOperacional] = useState(0);
  const [margemOperacional, setMargemOperacional] = useState<number | null>(null);

  const [categoryData, setCategoryData] = useState<ExpenseCategoryItem[]>([]);
  const [dailyResultData, setDailyResultData] = useState<DailyResultItem[]>([]);

  const loadFinancialData = useCallback(async () => {
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

      const inicioStr = getSaoPauloDateString(new Date(hoje.getTime() - diasAtras * 24 * 60 * 60 * 1000));
      const fimStr = getSaoPauloDateString(hoje);

      // Período anterior equivalente
      const inicioAntStr = getSaoPauloDateString(new Date(hoje.getTime() - diasAtras * 2 * 24 * 60 * 60 * 1000));
      const fimAntStr = getSaoPauloDateString(new Date(hoje.getTime() - (diasAtras + 1) * 24 * 60 * 60 * 1000));

      // 1. Receitas do período
      const { data: rec } = await supabase
        .from('transacoes')
        .select('valor, data')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioStr)
        .lte('data', fimStr)
        .order('data', { ascending: true });

      // 2. Receitas do período anterior
      const { data: recAnt } = await supabase
        .from('transacoes')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioAntStr)
        .lte('data', fimAntStr);

      // 3. Despesas do período
      const { data: desp } = await supabase
        .from('despesas')
        .select('valor, data, categoria_id, descricao')
        .eq('workspace_id', workspaceId)
        .gte('data', inicioStr)
        .lte('data', fimStr)
        .order('data', { ascending: true });

      // 4. Despesas do período anterior
      const { data: despAnt } = await supabase
        .from('despesas')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .gte('data', inicioAntStr)
        .lte('data', fimAntStr);

      const totalRec = (rec || []).reduce((acc, r) => acc + Number(r.valor || 0), 0);
      const totalRecAnt = (recAnt || []).reduce((acc, r) => acc + Number(r.valor || 0), 0);
      const totalDesp = (desp || []).reduce((acc, d) => acc + Number(d.valor || 0), 0);
      const totalDespAnt = (despAnt || []).reduce((acc, d) => acc + Number(d.valor || 0), 0);

      setReceitaBruta(totalRec);
      setDespesasOperacionais(totalDesp);

      if (totalRecAnt > 0) {
        setCrescimentoReceita(Math.round(((totalRec - totalRecAnt) / totalRecAnt) * 1000) / 10);
      } else {
        setCrescimentoReceita(null);
      }

      if (totalDespAnt > 0) {
        setVariacaoDespesas(Math.round(((totalDesp - totalDespAnt) / totalDespAnt) * 1000) / 10);
      } else {
        setVariacaoDespesas(null);
      }

      // Resultado operacional real (permite negativo se despesas > receitas)
      const resOp = totalRec - totalDesp;
      setResultadoOperacional(resOp);
      setMargemOperacional(totalRec > 0 ? Math.round((resOp / totalRec) * 1000) / 10 : null);

      // 5. CMV Status
      const { count: countFichas } = await supabase
        .from('fichas_tecnicas')
        .select('*', { count: 'exact', head: true });

      if (countFichas && countFichas > 0) {
        // Se houver fichas cadastradas com cobertura
        setCmvValor(null);
        setCmvPercent(null);
      } else {
        setCmvValor(null);
        setCmvPercent(null);
      }

      // 6. Agrupamento de Despesas por Categoria Canônica (tabela categorias)
      const { data: categorias } = await supabase
        .from('categorias')
        .select('id, nome')
        .eq('workspace_id', workspaceId);

      const catNamesById = new Map<string, string>();
      for (const c of categorias || []) {
        if (c.id && c.nome) catNamesById.set(c.id, c.nome);
      }

      const catMap = new Map<string, number>();
      for (const d of desp || []) {
        const catName = (d.categoria_id && catNamesById.get(d.categoria_id)) || 'Outros / Operacional';
        catMap.set(catName, (catMap.get(catName) || 0) + Number(d.valor || 0));
      }

      const categoryPalette = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#8b5cf6'];
      const categories: ExpenseCategoryItem[] = [];
      let colorIdx = 0;

      for (const [name, amount] of catMap.entries()) {
        const pct = totalDesp > 0 ? Math.round((amount / totalDesp) * 1000) / 10 : 0;
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

      // 7. Evolução diária de Receita vs Despesas
      const recMap = new Map<string, number>();
      for (const r of rec || []) {
        if (!r.data) continue;
        const d = r.data.slice(0, 10);
        recMap.set(d, (recMap.get(d) || 0) + Number(r.valor || 0));
      }

      const despMap = new Map<string, number>();
      for (const d of desp || []) {
        if (!d.data) continue;
        const dia = d.data.slice(0, 10);
        despMap.set(dia, (despMap.get(dia) || 0) + Number(d.valor || 0));
      }

      const dailyLines: DailyResultItem[] = [];
      const numDias = Math.min(diasAtras, 30);
      for (let i = numDias - 1; i >= 0; i--) {
        const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = d.toISOString().slice(0, 10);
        dailyLines.push({
          date: `${d.getDate()}/${d.getMonth() + 1}`,
          receita: recMap.get(iso) || 0,
          despesas: despMap.get(iso) || 0,
        });
      }
      setDailyResultData(dailyLines);
    } catch (err) {
      console.warn('[CeoExpenseAnalysisTab] Erro ao carregar dados financeiros:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, periodo]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  const isPositiveMargin = resultadoOperacional >= 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Filters Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">💳</span>
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
              CEO — Análise Financeira & Despesas
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">
            Receitas, despesas, resultado e composição de custos (CMV).
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
            onClick={loadFinancialData}
            disabled={isLoading}
            className="h-9 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* 4 KPIs Financeiros Conforme Painel 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Receita Bruta */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Receita Bruta</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              R$ {receitaBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoReceita !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoReceita >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoReceita >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoReceita > 0 ? `+${crescimentoReceita}%` : `${crescimentoReceita}%`}
                </span>
              ) : (
                <span className="text-slate-500">Período selecionado</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. CMV */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">CMV</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              {cmvValor !== null ? `R$ ${cmvValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Dados insuficientes'}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {cmvPercent !== null ? `${cmvPercent}% da receita` : 'Requer fichas técnicas'}
            </div>
          </CardContent>
        </Card>

        {/* 3. Despesas Operacionais */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Despesas Operacionais</div>
            <div className="text-xl md:text-2xl font-bold text-foreground mt-1">
              R$ {despesasOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs">
              {variacaoDespesas !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${variacaoDespesas <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {variacaoDespesas <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {variacaoDespesas > 0 ? `+${variacaoDespesas}%` : `${variacaoDespesas}%`}
                </span>
              ) : (
                <span className="text-slate-500">Despesas lançadas</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4. Resultado Operacional */}
        <Card className={`border ${isPositiveMargin ? 'bg-card/70 border-border/50' : 'bg-rose-950/20 border-rose-900/40'}`}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Resultado Operacional</div>
            <div className={`text-xl md:text-2xl font-bold mt-1 ${isPositiveMargin ? 'text-foreground' : 'text-rose-400'}`}>
              {resultadoOperacional < 0 ? `-R$ ${Math.abs(resultadoOperacional).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : `R$ ${resultadoOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </div>
            <div className="mt-2 text-xs">
              {margemOperacional !== null ? (
                <span className={`font-semibold ${isPositiveMargin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Margem: {margemOperacional}%
                </span>
              ) : (
                <span className="text-slate-500">Receitas - Despesas</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Despesas por Categoria (Donut) + Evolução do Resultado (LineChart 2 linhas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Despesas por Categoria (Donut) */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {categoryData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="h-52 w-52 relative flex items-center justify-center shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cat-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground">Total</span>
                    <span className="text-xs font-bold text-foreground">
                      R$ {despesasOperacionais >= 1000 ? `${(despesasOperacionais / 1000).toFixed(1)}k` : despesasOperacionais.toFixed(0)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 flex-1 w-full max-h-52 overflow-y-auto">
                  {categoryData.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-slate-300 truncate">{cat.name}</span>
                      </div>
                      <span className="text-slate-400 font-medium ml-2">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1">
                <Receipt className="w-8 h-8 text-slate-600 mb-1" />
                <span>Nenhuma despesa registrada no período.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Evolução do Resultado (Receita vs Despesas) */}
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Evolução do Resultado
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Receita
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Despesas
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {dailyResultData.some((d) => d.receita > 0 || d.despesas > 0) ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyResultData}>
                    <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} interval={4} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(val: number, name: string) => [`R$ ${val.toFixed(2)}`, name === 'receita' ? 'Receita' : 'Despesas']}
                    />
                    <Line
                      type="monotone"
                      dataKey="receita"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      name="receita"
                    />
                    <Line
                      type="monotone"
                      dataKey="despesas"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      name="despesas"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center text-xs text-muted-foreground space-y-1">
                <Receipt className="w-8 h-8 text-slate-600 mb-1" />
                <span>Sem histórico suficiente para evolução comparativa.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
