import {
  CeoFinancialMetricsService,
  deduplicateRevenues,
  TransacaoReceitaItem,
} from '@/domains/ceo/services/CeoFinancialMetricsService';
import { getCeoPeriodRange } from '@/domains/ceo/utils/ceoDateRanges';
import {
  FinancialConsolidationService,
  DespesaInput,
  TransacaoInput,
} from '@/domains/finance/services/FinancialConsolidationService';
import { fetchLiveDashboard } from '@/domains/eyemobile/hooks/useEyemobileDashboard';
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
  const [isEyemobileSales, setIsEyemobileSales] = useState(false);
  const [crescimentoReceita, setCrescimentoReceita] = useState<number | null>(null);
  const [cmvValor, setCmvValor] = useState<number | null>(null);
  const [cmvPercent, setCmvPercent] = useState<number | null>(null);
  const [despesasOperacionais, setDespesasOperacionais] = useState(0);
  const [despesasPagas, setDespesasPagas] = useState(0);
  const [despesasPendentes, setDespesasPendentes] = useState(0);
  const [variacaoDespesas, setVariacaoDespesas] = useState<number | null>(null);
  const [resultadoOperacional, setResultadoOperacional] = useState<number | null>(null);
  const [margemOperacional, setMargemOperacional] = useState<number | null>(null);

  const [categoryData, setCategoryData] = useState<ExpenseCategoryItem[]>([]);
  const [dailyResultData, setDailyResultData] = useState<DailyResultItem[]>([]);

  const loadFinancialData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);

    try {
      const range = getCeoPeriodRange(periodo, new Date());
      const inicioStr = range.inicioStr;
      const fimStr = range.fimStr;
      const inicioAntStr = range.inicioAntStr;
      const fimAntStr = range.fimAntStr;

      // 1. Receitas do período com paginação integral e deduplicação canônica unificada (Hotfix 8 - Problema 2)
      const recRaw = await CeoFinancialMetricsService.fetchAllPaginated<TransacaoReceitaItem>(
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
      );
      const rec = deduplicateRevenues(recRaw);

      // 2. Receitas do período anterior com deduplicação
      const recAntRaw = await CeoFinancialMetricsService.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioAntStr)
            .lte('data', `${fimAntStr}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );
      const recAnt = deduplicateRevenues(recAntRaw);

      // 3. Despesas do período com paginação integral (consolidação canônica anti-duplicidade)
      const despContas = await CeoFinancialMetricsService.fetchAllPaginated<DespesaInput>(
        (from, to) =>
          supabase
            .from('despesas')
            .select('id, valor, data, descricao, categoria_id, status, metodo_pagamento, deduplication_key, observacoes, fatura_id, workspace_id')
            .eq('workspace_id', workspaceId)
            .gte('data', inicioStr)
            .lte('data', fimStr)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const despTransacoes = await CeoFinancialMetricsService.fetchAllPaginated<TransacaoInput>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, descricao, tipo, categoria_id, metodo_pagamento, deduplication_key, observacoes, cartao_id, workspace_id')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'despesa')
            .gte('data', inicioStr)
            .lte('data', `${fimStr}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const reportDesp = FinancialConsolidationService.consolidate({
        workspaceId,
        despesas: despContas,
        transacoes: despTransacoes,
        options: {
          startDate: inicioStr,
          endDate: fimStr,
          ignoreInternalTransfers: true,
          ignoreCreditCardInvoicePayments: true,
        },
      });

      // 4. Despesas do período anterior (com consolidação equivalente)
      const despContasAnt = await CeoFinancialMetricsService.fetchAllPaginated<DespesaInput>(
        (from, to) =>
          supabase
            .from('despesas')
            .select('id, valor, data, descricao, categoria_id, status, metodo_pagamento, deduplication_key, observacoes, fatura_id, workspace_id')
            .eq('workspace_id', workspaceId)
            .gte('data', inicioAntStr)
            .lte('data', fimAntStr)
            .range(from, to)
      );

      const despTransacoesAnt = await CeoFinancialMetricsService.fetchAllPaginated<TransacaoInput>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, descricao, tipo, categoria_id, metodo_pagamento, deduplication_key, observacoes, cartao_id, workspace_id')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'despesa')
            .gte('data', inicioAntStr)
            .lte('data', `${fimAntStr}T23:59:59.999Z`)
            .range(from, to)
      );

      const reportDespAnt = FinancialConsolidationService.consolidate({
        workspaceId,
        despesas: despContasAnt,
        transacoes: despTransacoesAnt,
        options: {
          startDate: inicioAntStr,
          endDate: fimAntStr,
          ignoreInternalTransfers: true,
          ignoreCreditCardInvoicePayments: true,
        },
      });

      const totalDesp = reportDesp.totalPorCompetencia;
      const totalDespAnt = reportDespAnt.totalPorCompetencia;
      const totalDespCaixa = reportDesp.totalPorCaixa;
      const totalDespPend = Math.max(0, reportDesp.totalPorCompetencia - reportDesp.totalPorCaixa);

      let totalRec = rec.reduce((acc, r) => acc + Number(r.valor || 0), 0);
      let isEyeOrigin = false;
      if (totalRec === 0) {
        const eyeRes = await fetchLiveDashboard({ startDate: inicioStr, endDate: fimStr }, workspaceId).catch(() => null);
        if (eyeRes?.configured && eyeRes.kpis.totalRevenue > 0) {
          totalRec = eyeRes.kpis.totalRevenue;
          isEyeOrigin = true;
        }
      }
      setIsEyemobileSales(isEyeOrigin);

      const totalRecAnt = recAnt.reduce((acc, r) => acc + Number(r.valor || 0), 0);

      setReceitaBruta(totalRec);
      setDespesasOperacionais(totalDesp);
      setDespesasPagas(totalDespCaixa);
      setDespesasPendentes(totalDespPend);

      if (!isEyeOrigin && totalRecAnt > 0) {
        setCrescimentoReceita(Math.round(((totalRec - totalRecAnt) / totalRecAnt) * 1000) / 10);
      } else {
        // Se a origem atual for Eyemobile e o anterior for transacoes, não misturar
        setCrescimentoReceita(null);
      }

      if (totalDespAnt > 0) {
        setVariacaoDespesas(Math.round(((totalDesp - totalDespAnt) / totalDespAnt) * 1000) / 10);
      } else {
        setVariacaoDespesas(null);
      }

      // Resultado operacional real (permite negativo se despesas > receitas)
      // Se não houver despesas operacionais cadastradas, o resultado fica como não apurado
      const resOp = totalDesp > 0 ? totalRec - totalDesp : null;
      setResultadoOperacional(resOp);
      setMargemOperacional(totalRec > 0 && totalDesp > 0 && resOp !== null ? Math.round((resOp / totalRec) * 1000) / 10 : null);

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
        .select('id, nome');

      const catNamesById = new Map<string, string>();
      for (const c of categorias || []) {
        if (c.id && c.nome) catNamesById.set(c.id, c.nome);
      }

      const catMap = new Map<string, number>();
      for (const item of reportDesp.itensConsolidados) {
        const catName =
          (item.categoriaId && catNamesById.get(item.categoriaId)) ||
          item.categoriaNome ||
          'Outros / Operacional';
        catMap.set(catName, (catMap.get(catName) || 0) + Number(item.valor || 0));
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
      for (const d of reportDesp.itensConsolidados) {
        if (!d.data) continue;
        const dia = d.data.slice(0, 10);
        despMap.set(dia, (despMap.get(dia) || 0) + Number(d.valor || 0));
      }

      const dailyLines: DailyResultItem[] = [];
      const numDias = Math.min(range.diasNoPeriodo, 30);
      const hojeRef = new Date();
      for (let i = numDias - 1; i >= 0; i--) {
        const d = new Date(hojeRef.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
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

  const isPositiveMargin = resultadoOperacional === null || resultadoOperacional >= 0;

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

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="flex-1 sm:w-[160px] h-9 text-xs bg-card/60">
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
            className="h-9 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* 4 KPIs Financeiros Conforme Painel 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Receita Bruta */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>{isEyemobileSales ? 'Receita Bruta (PDV)' : 'Receita Bruta'}</span>
              <span className="text-[10px] text-sky-400 font-normal px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                {isEyemobileSales ? 'PDV Eyemobile' : 'Vendas'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              R$ {receitaBruta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-xs">
              {crescimentoReceita !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${crescimentoReceita >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {crescimentoReceita >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {crescimentoReceita > 0 ? `+${crescimentoReceita}%` : `${crescimentoReceita}%`}
                </span>
              ) : (
                <span className="text-slate-500">
                  {isEyemobileSales ? 'Vendas brutas PDV' : 'Período selecionado'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. CMV */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">CMV (Custo Mercadoria)</div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              {cmvValor !== null ? `R$ ${cmvValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Dados insuficientes'}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {cmvPercent !== null ? `${cmvPercent}% da receita` : 'Requer fichas técnicas'}
            </div>
          </CardContent>
        </Card>

        {/* 3. Despesas Totais por Competência */}
        <Card className="bg-card/70 border-border/50 flex flex-col justify-between">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Despesas (Competência)</span>
              <span className="text-[10px] text-amber-400 font-normal px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Divipay + Contas
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 truncate">
              {despesasOperacionais > 0 ? (
                `R$ ${despesasOperacionais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              ) : (
                <span className="text-sm font-normal text-slate-400">Não apurado</span>
              )}
            </div>
            <div className="mt-2 text-[11px] space-y-0.5 font-medium text-slate-400">
              {despesasPagas > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                  <span>Pagas: R$ {despesasPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span>Pend: R$ {despesasPendentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {variacaoDespesas !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-medium ${variacaoDespesas <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {variacaoDespesas <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {variacaoDespesas > 0 ? `+${variacaoDespesas}%` : `${variacaoDespesas}%`} vs período anterior
                </span>
              ) : (
                <span className="text-slate-500">
                  {despesasOperacionais > 0 ? 'Despesas consolidadas' : 'Aguardando lançamento'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4. Resultado Preliminar por Competência */}
        <Card className={`border flex flex-col justify-between ${isPositiveMargin ? 'bg-card/70 border-border/50' : 'bg-rose-950/20 border-rose-900/40'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Resultado Preliminar</span>
              <span className="text-[10px] text-amber-400 font-normal px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Competência
              </span>
            </div>
            <div className={`text-xl sm:text-2xl font-bold mt-1 truncate ${isPositiveMargin ? 'text-foreground' : 'text-rose-400'}`}>
              {resultadoOperacional !== null ? (
                resultadoOperacional < 0
                  ? `-R$ ${Math.abs(resultadoOperacional).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : `R$ ${resultadoOperacional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              ) : (
                <span className="text-sm font-normal text-slate-400">Não apurado</span>
              )}
            </div>
            <div className="mt-2 text-xs">
              {margemOperacional !== null ? (
                <span className={`font-semibold ${isPositiveMargin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Margem: {margemOperacional}%
                </span>
              ) : (
                <span className="text-slate-500">Vendas vs Despesas totais</span>
              )}
              {despesasPagas > 0 && (
                <div className="text-[10px] text-slate-500 pt-0.5">
                  Dif. Vendas vs Pagas: R$ {(receitaBruta - despesasPagas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Despesas por Categoria (Donut) + Evolução do Resultado (LineChart 2 linhas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Despesas por Categoria (Donut) */}
        <Card className="bg-card/70 border-border/50 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Despesas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 min-w-0 overflow-hidden">
            {categoryData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="h-52 w-52 relative flex items-center justify-center shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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

                <div className="space-y-2 flex-1 w-full max-h-52 overflow-y-auto min-w-0">
                  {categoryData.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-slate-300 truncate">{cat.name}</span>
                      </div>
                      <span className="text-slate-400 font-medium shrink-0">{cat.value}%</span>
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
        <Card className="bg-card/70 border-border/50 min-w-0 overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-foreground truncate">
              Evolução do Resultado
            </CardTitle>
            <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
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
          <CardContent className="pt-2 min-w-0 overflow-hidden">
            {dailyResultData.some((d) => d.receita > 0 || d.despesas > 0) ? (
              <div className="h-56 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
