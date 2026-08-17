import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useComparativoPeriodos } from "@/domains/finance/hooks/useComparativoPeriodos";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { buildMonthlyPresentation, summarizeMonthly } from "./comparativoMetrics";
import { ComparativoKpiCard } from "./ComparativoKpiCard";
import { ComparativoTooltip } from "./ComparativoTooltip";

export function ComparativoMensalView({ compact = false }: { compact?: boolean }) {
  const [monthsCount, setMonthsCount] = useState(6);
  const { data = [], isLoading, error } = useComparativoPeriodos(monthsCount);
  const months = buildMonthlyPresentation(data);
  const summary = summarizeMonthly(data);
  return <section data-testid="comparativo-mensal" className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">Histórico mensal</h3><p className="text-xs text-muted-foreground">Receitas, despesas e resultado mês a mês</p></div><div className="flex rounded-lg border p-1">{[3, 6, 12].map((m) => <Button key={m} size="sm" variant={m === monthsCount ? "default" : "ghost"} onClick={() => setMonthsCount(m)}>{m}M</Button>)}</div></div>
    {error && <div className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400"><AlertCircle className="h-5 w-5" />Não foi possível carregar os dados mensais</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ComparativoKpiCard label="Média mensal de receitas" value={summary.mediaReceitas} tone="green" loading={isLoading} unavailable={!!error} />
      <ComparativoKpiCard label="Média mensal de despesas" value={summary.mediaDespesas} tone="red" loading={isLoading} unavailable={!!error} />
      <ComparativoKpiCard label="Média mensal do resultado" value={summary.mediaResultado} tone="blue" loading={isLoading} unavailable={!!error} />
      <ComparativoKpiCard label="Melhor resultado do período" value={summary.melhorResultado} tone="amber" loading={isLoading} unavailable={!!error} detail={summary.melhorMes ?? undefined} />
    </div>
    <Card className="border-blue-500/20"><CardHeader><CardTitle className="text-sm">Comparativo de períodos</CardTitle></CardHeader><CardContent className={compact ? "h-72 px-1" : "h-96 px-1 sm:px-4"}>
      {isLoading ? <Skeleton className="h-full w-full" /> : months.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem movimentação</div> : <ResponsiveContainer width="100%" height="100%"><ComposedChart data={months} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" opacity={0.12} /><XAxis dataKey="mes" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} tick={{ fontSize: 10 }} /><Tooltip content={<ComparativoTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar name="Receitas" dataKey="receitas" fill="#10b981" radius={[5, 5, 0, 0]} /><Bar name="Despesas" dataKey="despesas" fill="#f43f5e" radius={[5, 5, 0, 0]} /><Line name="Resultado do mês" dataKey="resultado" stroke="#60a5fa" strokeWidth={3} /></ComposedChart></ResponsiveContainer>}
    </CardContent></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{months.map((month) => <Card key={month.mes} className="border-blue-500/20"><CardContent className="p-4 text-xs"><div className="mb-3 flex items-center justify-between"><b>{month.mes}</b>{month.parcial && <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400">Mês parcial</span>}</div><p className="text-emerald-400">Receitas: {formatCurrency(month.receitas)}</p><p className="text-rose-400">Despesas: {formatCurrency(month.despesas)}</p><p className={month.resultado >= 0 ? "font-bold text-blue-400" : "font-bold text-rose-400"}>Resultado do mês: {formatCurrency(month.resultado)}</p><p className="mt-2 text-muted-foreground">Variação das receitas: {month.variacaoReceitas.toFixed(1)}%</p><p className="text-muted-foreground">Variação das despesas: {month.variacaoDespesas.toFixed(1)}%</p></CardContent></Card>)}</div>
  </section>;
}
