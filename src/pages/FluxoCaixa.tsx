import React, { useMemo, useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useFluxoCaixaProjetado } from "@/domains/finance/hooks/useFluxoCaixaProjetado";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FluxoCaixaPage: React.FC = () => {
  const [diasProjecao, setDiasProjecao] = useState(30);

  // 1. Somente contas de DINHEIRO REAL (exclui cartões de crédito)
  const { contas, loading: loadingContas } = useContasUsuario();
  const contasDinheiro = useMemo(
    () => contas.filter((c) => c.tipo !== "cartao_credito"),
    [contas]
  );
  const saldoRealAtual = useMemo(
    () => contasDinheiro.reduce((sum, c) => sum + (Number(c.saldo_atual) || 0), 0),
    [contasDinheiro]
  );

  // 2. Pontos de projeção do hook (calcula variações futuras relativas)
  const { pontos, loading: loadingPontos } = useFluxoCaixaProjetado(diasProjecao);

  // 3. Offset: diferença entre o saldo real de dinheiro e o saldo calculado pelo hook
  const pontosCorrigidos = useMemo(() => {
    if (pontos.length === 0) return [];
    const saldoHookDia0 = pontos[0]?.saldoProjetado ?? 0;
    const offset = saldoRealAtual - saldoHookDia0;
    return pontos.map((p) => ({
      ...p,
      saldoProjetado: parseFloat((p.saldoProjetado + offset).toFixed(2)),
    }));
  }, [pontos, saldoRealAtual]);

  const loading = loadingContas || loadingPontos;
  const saldoAtual = pontosCorrigidos[0]?.saldoProjetado ?? saldoRealAtual;
  const saldoFinal = pontosCorrigidos[pontosCorrigidos.length - 1]?.saldoProjetado ?? saldoRealAtual;
  const diasNegativos = pontosCorrigidos.filter((p) => p.saldoProjetado < 0).length;
  const variacaoTotal = saldoFinal - saldoAtual;

  const getSaldoBadge = () => {
    if (diasNegativos > 5) return { label: "Atenção: Saldo negativo projetado", variant: "destructive" as const };
    if (variacaoTotal < 0) return { label: "Tendência de queda", variant: "secondary" as const };
    return { label: "Saldo positivo projetado", variant: "default" as const };
  };

  const badge = getSaldoBadge();

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/15">
              <TrendingUp className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fluxo de Caixa</h1>
              <p className="text-sm text-muted-foreground">Projeção para os próximos dias</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={badge.variant} className="text-xs py-1 px-3">
              {diasNegativos > 0 && <AlertTriangle className="h-3 w-3 mr-1" />}
              {badge.label}
            </Badge>
            <div className="flex gap-1">
              {[15, 30, 60, 90].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={diasProjecao === d ? "default" : "outline"}
                  onClick={() => setDiasProjecao(d)}
                  className="text-xs px-3"
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Saldo por conta bancária de dinheiro real */}
        {contasDinheiro.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {contasDinheiro.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-sm"
              >
                <span className="text-muted-foreground">{c.nome}</span>
                <span className={`font-semibold ${Number(c.saldo_atual) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatCurrency(Number(c.saldo_atual) || 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Saldo Atual
              </p>
              <p className={`text-xl font-bold ${saldoAtual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(saldoAtual)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">saldo consolidado real</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Saldo Final Projetado</p>
              <p className={`text-xl font-bold ${saldoFinal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(saldoFinal)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">em {diasProjecao} dias</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                {variacaoTotal >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                Variação
              </p>
              <p className={`text-xl font-bold ${variacaoTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {variacaoTotal >= 0 ? "+" : ""}{formatCurrency(variacaoTotal)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">receitas - despesas - dívidas</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-400" /> Dias Críticos
              </p>
              <p className={`text-xl font-bold ${diasNegativos > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {diasNegativos}
              </p>
              <p className="text-xs text-muted-foreground">saldo negativo projetado</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Projeção de Saldo — {diasProjecao} dias</CardTitle>
          </CardHeader>
          <CardContent className="pr-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={pontosCorrigidos} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="dataFormatada"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    interval={Math.floor(pontosCorrigidos.length / 6)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Saldo projetado"]}
                    labelFormatter={(label) => `Dia ${label}`}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Area
                    type="monotone"
                    dataKey="saldoProjetado"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#saldoGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#6366f1" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tabela diária */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Detalhamento Diário</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Receitas</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Despesas</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Dívidas</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {pontosCorrigidos.slice(0, 20).map((ponto, i) => (
                    <tr
                      key={i}
                      className={`hover:bg-muted/20 transition-colors ${ponto.saldoProjetado < 0 ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium">{ponto.dataFormatada}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400 hidden sm:table-cell">
                        {ponto.receitasProjetadas > 0 ? formatCurrency(ponto.receitasProjetadas) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-400 hidden sm:table-cell">
                        {ponto.despesasProjetadas > 0 ? `(${formatCurrency(ponto.despesasProjetadas)})` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-amber-400 hidden md:table-cell">
                        {ponto.dividasProjetadas > 0 ? `(${formatCurrency(ponto.dividasProjetadas)})` : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${ponto.saldoProjetado < 0 ? "text-red-400" : "text-foreground"}`}>
                        {formatCurrency(ponto.saldoProjetado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          * Saldo atual = soma dos saldos reais de contas bancárias (exclui cartões de crédito). Projeção considera receitas/despesas/dívidas futuras.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default FluxoCaixaPage;
