import React, { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useDRE } from "@/domains/finance/hooks/useDRE";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { FileText, TrendingUp, TrendingDown, BarChart3, FileDown, Table2, LineChart as LineChartIcon, CreditCard } from "lucide-react";
import { useExportarRelatorios } from "@/domains/finance/hooks/useExportarRelatorios";
import type { LinhaDRE } from "@/domains/finance/types/foodCost";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatCurrencyContabil = (v: number) => { if (v < 0) return `(${formatCurrency(Math.abs(v))})`; return formatCurrency(v); };

function getTipoStyle(tipo: LinhaDRE["tipo"]) {
  switch (tipo) {
    case "total": return "bg-primary/10 text-foreground font-bold border-l-2 border-primary";
    case "subtotal": return "bg-muted/50 text-foreground font-semibold border-l-2 border-muted-foreground";
    case "negativo": return "text-muted-foreground";
    case "positivo": return "text-emerald-400 font-medium";
    default: return "text-foreground";
  }
}

const CHART_COLORS = { receita: "#10b981", lucro: "#3b82f6", ebitda: "#f59e0b", despesa: "#ef4444", cartao: "#8b5cf6" };

const DREPage: React.FC = () => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [abaAtiva, setAbaAtiva] = useState<"dre" | "evolucao" | "composicao">("dre");
  const { dre, historico, loading } = useDRE(mes, ano);
  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - i);
  const { exportarDRE_PDF, exportarDRE_Excel } = useExportarRelatorios();

  const chartData = useMemo(() => {
    if (!historico) return [];
    return historico.map((h) => ({ periodo: h.periodo, receita: h.receitaBruta, lucroBruto: h.lucroBruto, ebitda: h.ebitda, lucroLiquido: h.lucroLiquido, despesasOp: h.despesasOperacionais, despesasCartao: (h as any).despesasCartao || 0, margemBruta: h.margemBruta, margemLiquida: h.margemLiquida }));
  }, [historico]);

  const composicaoData = useMemo(() => {
    if (!dre) return [];
    const d = dre as any;
    return [
      { name: "Impostos", value: dre.impostosSimples + dre.pisCofinsSobreReceita + dre.issServicos, color: "#f97316" },
      { name: "CMV", value: dre.cmv, color: "#8b5cf6" },
      { name: "Desp. Operacionais", value: dre.despesasOperacionais, color: "#ef4444" },
      { name: "Cartão de Crédito", value: d.despesasCartao || 0, color: "#06b6d4" },
      { name: "Depreciação", value: dre.depreciacao, color: "#6b7280" },
      { name: "IRPJ", value: dre.irpj, color: "#ec4899" },
      { name: "Lucro Líquido", value: Math.max(0, dre.lucroLiquido), color: "#10b981" },
    ].filter((d) => d.value > 0);
  }, [dre]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload?.map((p, i: number) => (<p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15"><FileText className="h-6 w-6 text-blue-400" /></div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">DRE Gerencial</h1>
              <p className="text-sm text-muted-foreground">Demonstrativo de Resultado do Exercício</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((m, i) => (<SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{anos.map((a) => (<SelectItem key={a} value={String(a)}>{a}</SelectItem>))}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => dre && exportarDRE_PDF(dre, dre.periodo)} className="gap-2 text-xs"><FileDown className="h-4 w-4" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => dre && exportarDRE_Excel(dre, historico || [], dre.periodo)} className="gap-2 text-xs"><Table2 className="h-4 w-4" />Excel</Button>
          </div>
        </div>

        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          {[{ key: "dre", label: "Demonstrativo", icon: Table2 }, { key: "evolucao", label: "Evolução", icon: LineChartIcon }, { key: "composicao", label: "Composição", icon: BarChart3 }].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setAbaAtiva(key as any)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${abaAtiva === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : dre ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Receita Bruta</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(dre.receitaBruta)}</p>
                <p className="text-xs text-muted-foreground">{dre.periodo}</p>
              </CardContent></Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Margem Bruta</p>
                <p className={`text-lg font-bold ${dre.margemBruta >= 50 ? "text-emerald-400" : dre.margemBruta >= 30 ? "text-amber-400" : "text-red-400"}`}>{dre.margemBruta.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{formatCurrencyContabil(dre.lucroBruto)}</p>
              </CardContent></Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><BarChart3 className="h-3 w-3" /> EBITDA</p>
                <p className={`text-lg font-bold ${dre.ebitda >= 0 ? "text-emerald-400" : "text-red-400"}`}>{dre.margemEbitda.toFixed(1)}%</p>
                <p className={`text-xs ${dre.ebitda < 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>{formatCurrencyContabil(dre.ebitda)}</p>
              </CardContent></Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</p>
                <p className="text-lg font-bold text-cyan-400">{formatCurrency((dre as any).despesasCartao || 0)}</p>
                <p className="text-xs text-muted-foreground">{(dre as any).despesasCartao ? ((dre as any).despesasCartao / dre.receitaBruta * 100).toFixed(1) : "0"}% da receita</p>
              </CardContent></Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">{dre.lucroLiquido >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} Lucro Líquido</p>
                <p className={`text-lg font-bold ${dre.lucroLiquido >= 0 ? "text-emerald-400" : "text-red-400"}`}>{dre.margemLiquida.toFixed(1)}%</p>
                <p className={`text-xs ${dre.lucroLiquido < 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>{formatCurrencyContabil(dre.lucroLiquido)}</p>
              </CardContent></Card>
            </div>

            {abaAtiva === "dre" && (
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="pb-0"><CardTitle className="text-base">Demonstrativo — {dre.periodo}</CardTitle></CardHeader>
                <CardContent className="p-0 mt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Descrição</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Valor (R$)</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">% Receita</th>
                      </tr></thead>
                      <tbody className="divide-y divide-border/20">
                        {dre.linhas.map((linha, i) => (
                          <tr key={i} className={`${getTipoStyle(linha.tipo)} ${linha.tipo === "total" || linha.tipo === "subtotal" ? "rounded" : ""}`}>
                            <td className="px-4 py-2.5"><span className={linha.indent ? "pl-4 text-muted-foreground" : ""}>{linha.label}</span></td>
                            <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${linha.valor < 0 ? "text-red-400" : linha.tipo === "total" ? "text-foreground font-bold" : linha.tipo === "subtotal" ? "text-foreground font-semibold" : linha.valor > 0 ? "text-emerald-400" : ""}`}>
                              {linha.valor < 0 ? `(${formatCurrency(Math.abs(linha.valor))})` : formatCurrency(linha.valor)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground hidden sm:table-cell">{linha.percentualSobreReceita !== undefined ? `${linha.percentualSobreReceita.toFixed(1)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {abaAtiva === "evolucao" && historico && historico.length > 0 && (
              <div className="space-y-4">
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><LineChartIcon className="h-4 w-4 text-blue-400" /> Evolução Mensal (últimos {historico.length} meses)</CardTitle></CardHeader>
                  <CardContent><div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.receita} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_COLORS.receita} stopOpacity={0}/></linearGradient>
                          <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS.lucro} stopOpacity={0.3}/><stop offset="95%" stopColor={CHART_COLORS.lucro} stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--kimi-color-border)" opacity={0.3} />
                        <XAxis dataKey="periodo" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="receita" name="Receita Bruta" stroke={CHART_COLORS.receita} fill="url(#colorReceita)" strokeWidth={2} />
                        <Area type="monotone" dataKey="lucroBruto" name="Lucro Bruto" stroke={CHART_COLORS.lucro} fill="url(#colorLucro)" strokeWidth={2} />
                        <Area type="monotone" dataKey="ebitda" name="EBITDA" stroke={CHART_COLORS.ebitda} fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                        <Area type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke={CHART_COLORS.despesa} fill="transparent" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div></CardContent>
                </Card>

                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-amber-400" /> Margens (%)</CardTitle></CardHeader>
                  <CardContent><div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--kimi-color-border)" opacity={0.3} />
                        <XAxis dataKey="periodo" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="margemBruta" name="Margem Bruta" fill={CHART_COLORS.lucro} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="margemLiquida" name="Margem Líquida" fill={CHART_COLORS.despesa} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div></CardContent>
                </Card>
              </div>
            )}

            {abaAtiva === "composicao" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                  <CardHeader><CardTitle className="text-base">Composição do Resultado</CardTitle></CardHeader>
                  <CardContent><div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={composicaoData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {composicaoData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div></CardContent>
                </Card>

                <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                  <CardHeader><CardTitle className="text-base">Resumo do Período</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Receita Bruta", valor: dre.receitaBruta, cor: "text-emerald-400" },
                      { label: "(-) Impostos", valor: -(dre.impostosSimples + dre.pisCofinsSobreReceita + dre.issServicos), cor: "text-orange-400" },
                      { label: "(-) CMV", valor: -dre.cmv, cor: "text-purple-400" },
                      { label: "(-) Desp. Operacionais", valor: -dre.despesasOperacionais, cor: "text-red-400" },
                      { label: "(-) Cartão de Crédito", valor: -(dre as any).despesasCartao || 0, cor: "text-cyan-400" },
                      { label: "(-) Depreciação + IR", valor: -(dre.depreciacao + dre.irpj), cor: "text-gray-400" },
                      { label: "= Lucro Líquido", valor: dre.lucroLiquido, cor: dre.lucroLiquido >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold" },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className={`text-sm font-mono tabular-nums ${item.cor}`}>{item.valor < 0 ? `(${formatCurrency(Math.abs(item.valor))})` : formatCurrency(item.valor)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center px-4">
              * Simples Nacional: ICMS 7% + PIS/COFINS 3,65% + ISS 2%. CMV calculado pelas fichas técnicas (estimativa de 30% quando não disponível). IR: 15% sobre LAIR positivo. Despesas com cartão de crédito são separadas das despesas operacionais do negócio.
            </p>
          </>
        ) : (
          <div className="text-center py-16 text-muted-foreground">Nenhum dado para o período selecionado.</div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DREPage;
