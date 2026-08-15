import React, { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useComparativoDiario } from "@/domains/finance/hooks/useComparativoDiario";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Sparkles,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Comparativo() {
  const [monthsCount, setMonthsCount] = useState<number>(6);
  const [selectedDay, setSelectedDay] = useState<number | undefined>(undefined);

  const { data, isLoading, error } = useComparativoDiario({
    monthsCount,
    selectedDay,
  });

  const chartData = data?.chartData || [];
  const cards = data?.cards || {
    diaSelecionado: selectedDay || new Date().getDate(),
    maxDiaDisponivel: new Date().getDate(),
    receitaAtual: 0,
    receitaMedia: 0,
    receitaDiffRs: 0,
    receitaDiffPct: 0,
    despesaAtual: 0,
    despesaMedia: 0,
    despesaDiffRs: 0,
    despesaDiffPct: 0,
    saldoAtual: 0,
    saldoMedio: 0,
    saldoDiffRs: 0,
    saldoDiffPct: 0,
  };
  const insight = data?.insight || {
    status: "neutro" as const,
    mensagem: "Carregando comparativo diário...",
  };

  const diaAtualSelecionado = cards.diaSelecionado;
  const maxDiaDisponivel = cards.maxDiaDisponivel;
  const diaHoje = new Date().getDate();

  // Gerar opções de dias (1 até maxDiaDisponivel)
  const opcoesDias = Array.from({ length: maxDiaDisponivel }, (_, i) => i + 1);

  // Rótulo da ReferenceLine para o dia selecionado
  const selectedDayLabel = `Dia ${String(diaAtualSelecionado).padStart(2, "0")}`;
  const isHoje = diaAtualSelecionado === diaHoje;
  const referenceLineText = isHoje ? "Hoje" : `Dia ${diaAtualSelecionado}`;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/20">
              <BarChart3 className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                Comparativo Diário
              </h1>
              <p className="text-xs text-muted-foreground">
                Mês atual até o dia {diaAtualSelecionado} vs Média histórica dos últimos {monthsCount} meses até o mesmo dia
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Dia */}
            <div className="flex items-center gap-1.5 bg-card border border-border/60 rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Comparar até o:</span>
              <Select
                value={String(diaAtualSelecionado)}
                onValueChange={(v) => setSelectedDay(Number(v))}
              >
                <SelectTrigger className="w-[100px] h-7 border-none bg-transparent p-0 text-xs font-bold text-foreground focus:ring-0">
                  <SelectValue placeholder="Dia" />
                </SelectTrigger>
                <SelectContent align="end">
                  {opcoesDias.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Dia {String(d).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Seletor de Histórico */}
            <div className="flex items-center bg-card border border-border/60 rounded-xl p-1 gap-1">
              {[3, 6, 12].map((m) => (
                <Button
                  key={m}
                  variant={monthsCount === m ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMonthsCount(m)}
                  className={`h-7 px-2.5 text-xs font-bold rounded-lg transition-all ${
                    monthsCount === m
                      ? "bg-amber-500 hover:bg-amber-600 text-black shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}M
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Exibição de Erro Explícito se Houver Falha */}
        {error ? (
          <Card className="border-rose-500/50 bg-rose-500/10 p-4 flex items-center gap-3 text-rose-500">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Falha no carregamento dos dados comparativos</h4>
              <p className="text-xs opacity-90">{(error as Error).message}</p>
            </div>
          </Card>
        ) : null}

        {/* Insight Inteligente */}
        <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5 p-4 relative overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground tracking-wide">
                  Insight Financeiro Diário
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-wider px-1.5 py-0 h-4 border ${
                    insight.status === "positivo"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : insight.status === "alerta"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {insight.status === "positivo" ? "Desempenho Favorável" : insight.status === "alerta" ? "Alerta de Desvio" : "Em Acompanhamento"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {insight.mensagem}
              </p>
            </div>
          </div>
        </Card>

        {/* 3 Cards Obrigatórios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Receita */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Receita até Dia {diaAtualSelecionado}
              </span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-extrabold text-emerald-500">
                {formatCurrency(cards.receitaAtual)}
              </div>
              <div className="text-xs text-muted-foreground">
                Média histórica: <span className="font-semibold text-foreground">{formatCurrency(cards.receitaMedia)}</span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Diferença acumulada:</span>
              <span
                className={`font-bold flex items-center gap-0.5 ${
                  cards.receitaDiffRs >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {cards.receitaDiffRs >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {formatCurrency(cards.receitaDiffRs)} ({cards.receitaDiffPct >= 0 ? "+" : ""}{cards.receitaDiffPct.toFixed(1)}%)
              </span>
            </div>
          </Card>

          {/* Card 2: Despesa */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Despesa até Dia {diaAtualSelecionado}
              </span>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-extrabold text-rose-500">
                {formatCurrency(cards.despesaAtual)}
              </div>
              <div className="text-xs text-muted-foreground">
                Média histórica: <span className="font-semibold text-foreground">{formatCurrency(cards.despesaMedia)}</span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Diferença acumulada:</span>
              <span
                className={`font-bold flex items-center gap-0.5 ${
                  cards.despesaDiffRs <= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {cards.despesaDiffRs >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {formatCurrency(cards.despesaDiffRs)} ({cards.despesaDiffPct >= 0 ? "+" : ""}{cards.despesaDiffPct.toFixed(1)}%)
              </span>
            </div>
          </Card>

          {/* Card 3: Saldo */}
          <Card className="rounded-2xl border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Saldo até Dia {diaAtualSelecionado}
              </span>
              <div
                className={`p-2 rounded-xl ${
                  cards.saldoAtual >= 0 ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-500"
                }`}
              >
                <BarChart3 className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-1">
              <div
                className={`text-2xl font-extrabold ${
                  cards.saldoAtual >= 0 ? "text-amber-500" : "text-rose-500"
                }`}
              >
                {formatCurrency(cards.saldoAtual)}
              </div>
              <div className="text-xs text-muted-foreground">
                Saldo médio histórico: <span className="font-semibold text-foreground">{formatCurrency(cards.saldoMedio)}</span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Diferença acumulada:</span>
              <span
                className={`font-bold flex items-center gap-0.5 ${
                  cards.saldoDiffRs >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {cards.saldoDiffRs >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {formatCurrency(cards.saldoDiffRs)} ({cards.saldoDiffPct >= 0 ? "+" : ""}{cards.saldoDiffPct.toFixed(1)}%)
              </span>
            </div>
          </Card>
        </div>

        {/* Gráfico Diário de Séries Acumuladas (Dias 1 a 31) */}
        <Card className="rounded-2xl border-border/60 bg-card p-6 space-y-4">
          <CardHeader className="p-0 pb-2 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Trajetória Diária Acumulada (Dia 01 ao Dia 31)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                As linhas reais terminam no dia atual. Linhas pontilhadas representam o padrão médio histórico.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0 pt-4 h-[380px]">
            {isLoading ? (
              <Skeleton className="w-full h-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 15, right: 30, left: -5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="labelDia"
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                    tickMargin={8}
                    className="text-[11px] text-muted-foreground font-medium"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`}
                    className="text-[10px] text-muted-foreground font-mono"
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      value !== null ? formatCurrency(Number(value)) : "Futuro",
                      name === "receitaReal"
                        ? "Receita Real Mês Atual"
                        : name === "receitaMedia"
                        ? "Receita Média Histórica"
                        : name === "despesaReal"
                        ? "Despesa Real Mês Atual"
                        : "Despesa Média Histórica",
                    ]}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#3f3f46",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "receitaReal"
                        ? "Receita Real (Mês Atual)"
                        : value === "receitaMedia"
                        ? "Receita Média"
                        : value === "despesaReal"
                        ? "Despesa Real (Mês Atual)"
                        : "Despesa Média"
                    }
                    wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                  />

                  {/* Linha vertical no dia selecionado */}
                  <ReferenceLine
                    x={selectedDayLabel}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{
                      value: referenceLineText,
                      position: "top",
                      fill: "#f59e0b",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />

                  {/* Séries Reais (Linhas Contínuas - Param no dia atual) */}
                  <Line
                    type="monotone"
                    dataKey="receitaReal"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="despesaReal"
                    stroke="#f43f5e"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />

                  {/* Séries Médias Históricas (Linhas Pontilhadas) */}
                  <Line
                    type="monotone"
                    dataKey="receitaMedia"
                    stroke="#34d399"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="despesaMedia"
                    stroke="#fb7185"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
