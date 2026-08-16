import { useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useComparativoDiario } from "@/domains/finance/hooks/useComparativoDiario";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { ComparativoKpiCard } from "./ComparativoKpiCard";
import { ComparativoTooltip } from "./ComparativoTooltip";

export function ComparativoDiarioView({ compact = false }: { compact?: boolean }) {
  const [monthsCount, setMonthsCount] = useState(6);
  const [selectedDay, setSelectedDay] = useState<number>();
  const { data, isLoading, error } = useComparativoDiario({ monthsCount, selectedDay });
  const cards = data?.cards;
  const day = cards?.diaSelecionado ?? selectedDay ?? new Date().getDate();

  return <section data-testid="comparativo-diario" className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="font-bold">Ritmo diário</h3><p className="text-xs text-muted-foreground">Mês atual contra a média histórica até o mesmo dia</p></div>
      <div className="flex flex-wrap gap-2">
        <Select value={String(day)} onValueChange={(value) => setSelectedDay(Number(value))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: cards?.maxDiaDisponivel ?? new Date().getDate() }, (_, i) => i + 1).map((d) => <SelectItem key={d} value={String(d)}>Dia {String(d).padStart(2, "0")}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-lg border p-1">{[3, 6, 12].map((m) => <Button key={m} size="sm" variant={m === monthsCount ? "default" : "ghost"} onClick={() => setMonthsCount(m)}>{m}M</Button>)}</div>
      </div>
    </div>
    {error && <div className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400"><AlertCircle className="h-5 w-5" />Não foi possível carregar os dados diários</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <ComparativoKpiCard label={`Receita até Dia ${day}`} value={cards?.receitaAtual ?? null} tone="green" loading={isLoading} unavailable={!!error} detail={cards ? `Média histórica: ${formatCurrency(cards.receitaMedia)} · ${cards.receitaDiffPct.toFixed(1)}%` : undefined} />
      <ComparativoKpiCard label={`Despesa até Dia ${day}`} value={cards?.despesaAtual ?? null} tone="red" loading={isLoading} unavailable={!!error} detail={cards ? `Média histórica: ${formatCurrency(cards.despesaMedia)} · ${cards.despesaDiffPct.toFixed(1)}%` : undefined} />
      <ComparativoKpiCard label={`Saldo até Dia ${day}`} value={cards?.saldoAtual ?? null} tone="amber" loading={isLoading} unavailable={!!error} detail={cards ? `Média histórica: ${formatCurrency(cards.saldoMedio)} · ${cards.saldoDiffPct.toFixed(1)}%` : undefined} />
    </div>
    {data?.insight && <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><Sparkles className="h-4 w-4 shrink-0 text-amber-400" /><span><b>Insight Financeiro Diário:</b> {data.insight.mensagem}</span></div>}
    <Card className="border-blue-500/20"><CardHeader><CardTitle className="text-sm">Trajetória diária acumulada</CardTitle></CardHeader><CardContent className={compact ? "h-72 px-1" : "h-96 px-1 sm:px-4"}>
      {isLoading ? <Skeleton className="h-full w-full" /> : !data?.chartData.some((p) => (p.receitaReal ?? 0) !== 0 || (p.despesaReal ?? 0) !== 0) ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem movimentação</div> :
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.chartData} margin={{ top: 20, right: 38, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.12} /><XAxis dataKey="labelDia" interval={2} tick={{ fontSize: 10 }} /><YAxis tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} tick={{ fontSize: 10 }} />
        <Tooltip content={<ComparativoTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine x={`Dia ${String(day).padStart(2, "0")}`} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `Dia ${day}`, fill: "#f59e0b", position: "top" }} />
        <Line name="Receita real" dataKey="receitaReal" stroke="#10b981" strokeWidth={3} dot={false} connectNulls={false} />
        <Line name="Despesa real" dataKey="despesaReal" stroke="#f43f5e" strokeWidth={3} dot={false} connectNulls={false} />
        <Line name="Receita média" dataKey="receitaMedia" stroke="#34d399" strokeDasharray="5 5" dot={false} />
        <Line name="Despesa média" dataKey="despesaMedia" stroke="#fb7185" strokeDasharray="5 5" dot={false} />
      </ComposedChart></ResponsiveContainer>}
    </CardContent></Card>
  </section>;
}
