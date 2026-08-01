import React, { useMemo, useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useFluxoCaixaData, type FluxoCaixaModo } from "@/domains/finance/hooks/useFluxoCaixaData";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ChevronLeft,
  ChevronRight,
  LineChart as LineChartIcon,
  CalendarDays,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FluxoCaixaPage: React.FC = () => {
  const agora = new Date();
  const [modo, setModo] = useState<FluxoCaixaModo>("mensal");
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());

  const dados = useFluxoCaixaData(modo, ano, mes);
  const { contas } = useContasUsuario();
  const contasDinheiro = useMemo(
    () => (contas ?? []).filter((c) => c.tipo !== "cartao_credito"),
    [contas]
  );

  const hojeStr = useMemo(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  }, []);

  const navAnterior = () => {
    if (modo === "mensal") setAno((a) => a - 1);
    else if (mes === 0) { setMes(11); setAno((a) => a - 1); }
    else setMes((m) => m - 1);
  };
  const navProximo = () => {
    if (modo === "mensal") setAno((a) => a + 1);
    else if (mes === 11) { setMes(0); setAno((a) => a + 1); }
    else setMes((m) => m + 1);
  };

  const tituloPeriodo = modo === "mensal" ? String(ano) : `${MESES_FULL[mes]} de ${ano}`;
  const saldoFinalReal = dados.buckets[dados.buckets.length - 1]?.saldoRealizado ?? 0;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/15">
              <LineChartIcon className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fluxo de Caixa</h1>
              <p className="text-sm text-muted-foreground">
                Previsto × Realizado — {modo === "mensal" ? "visão mensal" : "visão diária"}
              </p>
            </div>
          </div>

          {/* Tabs estilo Falcon */}
          <div className="flex gap-2">
            <Button
              variant={modo === "mensal" ? "default" : "outline"}
              size="sm"
              onClick={() => setModo("mensal")}
              className="gap-2"
            >
              <LineChartIcon className="h-4 w-4" /> Fluxo de Caixa Mensal
            </Button>
            <Button
              variant={modo === "diario" ? "default" : "outline"}
              size="sm"
              onClick={() => setModo("diario")}
              className="gap-2"
            >
              <CalendarDays className="h-4 w-4" /> Fluxo de Caixa Diário
            </Button>
          </div>
        </div>

        {/* ── Navegação de período ───────────────────────────────── */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" size="icon" onClick={navAnterior} aria-label="Período anterior">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-lg font-semibold text-emerald-400 min-w-[180px] text-center">
            {modo === "mensal" ? ano : MESES_FULL[mes]}
          </span>
          <Button variant="ghost" size="icon" onClick={navProximo} aria-label="Próximo período">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* ── Saldos por conta ───────────────────────────────────── */}
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

        {/* ── KPIs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Saldo em Contas
              </p>
              <p className={`text-xl font-bold ${dados.saldoContasHoje >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(dados.saldoContasHoje)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">dinheiro real hoje</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-400" /> Receitas
              </p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(dados.totalReceitaRealizada)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                previsto: {formatCurrency(dados.totalReceitaPrevista)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-400" /> Despesas
              </p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(dados.totalDespesaRealizada)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                previsto: {formatCurrency(dados.totalDespesaPrevista)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Saldo Final Previsto</p>
              <p className={`text-xl font-bold ${dados.saldoFinalPrevisto >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(dados.saldoFinalPrevisto)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                realizado: {formatCurrency(saldoFinalReal)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Gráfico 6 séries ───────────────────────────────────── */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base text-center">
              {modo === "mensal" ? `Fluxo de Caixa Mensal de ${ano}` : `Fluxo de Caixa Diário | ${tituloPeriodo}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="pr-2">
            {dados.loading ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dados.buckets} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Line type="monotone" dataKey="despesaPrevista" name="Desp. Prevista" stroke="#fca5a5" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="despesaRealizada" name="Despesa" stroke="#ef4444" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="receitaPrevista" name="Rec. Prevista" stroke="#86efac" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="receitaRealizada" name="Receita" stroke="#22c55e" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="saldoPrevisto" name="Saldo Previsto" stroke="#9ca3af" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="saldoRealizado" name="Saldo Realizado" stroke="#6366f1" dot={false} strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Tabela DIÁRIA ──────────────────────────────────────── */}
        {modo === "diario" && !dados.loading && (
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Detalhamento Diário — {tituloPeriodo}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Despesa Prevista</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Despesa Realizada</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Receita Prevista</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Receita Realizada</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Saldo Previsto</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Saldo Realizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {dados.buckets.map((b) => {
                      const ehHoje = b.chave === hojeStr;
                      return (
                        <tr
                          key={b.chave}
                          className={`transition-colors hover:bg-muted/20 ${ehHoje ? "bg-amber-500/15" : ""}`}
                        >
                          <td className="px-4 py-2.5 font-medium">
                            {b.dataInicio.split("-").reverse().join("/")}
                            {ehHoje && <span className="ml-2 text-xs text-amber-400">(hoje)</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-300/80 tabular-nums">
                            {b.despesaPrevista > 0 ? formatCurrency(b.despesaPrevista) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-400 tabular-nums">
                            {b.despesaRealizada > 0 ? formatCurrency(b.despesaRealizada) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-emerald-300/80 tabular-nums">
                            {b.receitaPrevista > 0 ? formatCurrency(b.receitaPrevista) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 tabular-nums">
                            {b.receitaRealizada > 0 ? formatCurrency(b.receitaRealizada) : "—"}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${b.saldoPrevisto < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                            {formatCurrency(b.saldoPrevisto)}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${b.saldoRealizado < 0 ? "text-red-400" : "text-foreground"}`}>
                            {formatCurrency(b.saldoRealizado)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabela MENSAL (categoria × mês) ────────────────────── */}
        {modo === "mensal" && !dados.loading && (
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Detalhamento Mensal — {ano}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground sticky left-0 bg-muted/95 z-10 min-w-[160px]">
                        Categoria
                      </th>
                      {dados.buckets.map((b) => (
                        <th key={b.chave} className="text-right px-3 py-2.5 font-medium text-muted-foreground min-w-[100px]">
                          {MESES_FULL[Number(b.chave.split("-")[1]) - 1]}
                          {b.futuro && <span className="block text-[10px] font-normal">(previsto)</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {/* Saldo anterior */}
                    <tr className="bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold sticky left-0 bg-card z-10">Saldo Anterior</td>
                      {dados.buckets.map((b, i) => {
                        const anterior = i === 0 ? dados.saldoInicial : dados.buckets[i - 1].saldoRealizado;
                        return (
                          <td key={b.chave} className={`px-3 py-2.5 text-right tabular-nums ${anterior < 0 ? "text-red-400" : "text-foreground"}`}>
                            {formatCurrency(anterior)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Receitas por categoria */}
                    {dados.categoriasReceita.map((cat) => (
                      <tr key={`rec-${cat}`}>
                        <td className="px-4 py-2.5 pl-8 sticky left-0 bg-card z-10 text-muted-foreground">{cat}</td>
                        {dados.buckets.map((b) => (
                          <td key={b.chave} className="px-3 py-2.5 text-right text-emerald-400 tabular-nums">
                            {b.receitasPorCategoria[cat] ? formatCurrency(b.receitasPorCategoria[cat]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-emerald-500/5">
                      <td className="px-4 py-2.5 font-semibold sticky left-0 bg-card z-10">Total Receitas</td>
                      {dados.buckets.map((b) => (
                        <td key={b.chave} className="px-3 py-2.5 text-right font-semibold text-emerald-400 tabular-nums">
                          {formatCurrency(b.receitaRealizada)}
                          {b.receitaPrevista > 0 && (
                            <span className="block text-[10px] font-normal text-emerald-300/70">
                              prev. {formatCurrency(b.receitaPrevista)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Despesas por categoria */}
                    {dados.categoriasDespesa.map((cat) => (
                      <tr key={`desp-${cat}`}>
                        <td className="px-4 py-2.5 pl-8 sticky left-0 bg-card z-10 text-muted-foreground">{cat}</td>
                        {dados.buckets.map((b) => (
                          <td key={b.chave} className="px-3 py-2.5 text-right text-red-400 tabular-nums">
                            {b.despesasPorCategoria[cat] ? formatCurrency(b.despesasPorCategoria[cat]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-red-500/5">
                      <td className="px-4 py-2.5 font-semibold sticky left-0 bg-card z-10">Total Despesas</td>
                      {dados.buckets.map((b) => (
                        <td key={b.chave} className="px-3 py-2.5 text-right font-semibold text-red-400 tabular-nums">
                          {formatCurrency(b.despesaRealizada)}
                          {b.despesaPrevista > 0 && (
                            <span className="block text-[10px] font-normal text-red-300/70">
                              prev. {formatCurrency(b.despesaPrevista)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Saldos */}
                    <tr className="bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold sticky left-0 bg-card z-10">Saldo do Mês</td>
                      {dados.buckets.map((b) => {
                        const saldoMes = b.receitaRealizada - b.despesaRealizada;
                        const saldoMesPrev = saldoMes + (b.dataFim > hojeStr ? b.receitaPrevista - b.despesaPrevista : 0);
                        return (
                          <td key={b.chave} className={`px-3 py-2.5 text-right font-semibold tabular-nums ${saldoMes < 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {formatCurrency(saldoMes)}
                            {b.dataFim > hojeStr && (
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                prev. {formatCurrency(saldoMesPrev)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-indigo-500/10">
                      <td className="px-4 py-2.5 font-bold sticky left-0 bg-card z-10">Saldo Acumulado</td>
                      {dados.buckets.map((b) => (
                        <td key={b.chave} className={`px-3 py-2.5 text-right font-bold tabular-nums ${b.saldoRealizado < 0 ? "text-red-400" : "text-foreground"}`}>
                          {formatCurrency(b.saldoRealizado)}
                          {b.dataFim > hojeStr && (
                            <span className="block text-[10px] font-normal text-indigo-300/80">
                              prev. {formatCurrency(b.saldoPrevisto)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          * Realizado = dados reais (Divipay líquido + dinheiro PDV + lançamentos). Previsto = recorrentes ativas +
          dívidas pendentes por vencimento. Saldo inicial = saldo atual das contas de dinheiro − resultado do período.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default FluxoCaixaPage;
