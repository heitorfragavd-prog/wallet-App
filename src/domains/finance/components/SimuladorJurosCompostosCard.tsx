import { useSimuladorJurosCompostos } from "@/domains/finance/hooks/useSimuladorJurosCompostos";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Clock, TrendingUp, PiggyBank } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/shared/components/ui/table";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SimuladorJurosCompostosCard() {
  const { periodoMeses, setPeriodoMeses, resultado, periodos } = useSimuladorJurosCompostos();

  if (!resultado) {
    return (
      <Card className="bg-[#0B132B]/50 border-[#1E2942] rounded-3xl">
        <CardContent className="p-8 text-center">
          <TrendingUp className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Cadastre investimentos para ver a projeção.</p>
        </CardContent>
      </Card>
    );
  }

  const { valorFinal, totalInvestido, totalJuros, taxaMediaAnual, dadosMensais } = resultado;
  const chartData = dadosMensais.slice(1).map((d) => ({
    mes: d.mes, acumulado: d.totalAcumulado, investido: d.totalInvestido,
  }));

  return (
    <Card className="bg-[#0B132B]/50 border-[#1E2942] rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-100">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Simulador de Juros Compostos
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Botões de período */}
        <div className="flex flex-wrap gap-2">
          {periodos.map((p) => (
            <Button
              key={p.meses}
              size="sm"
              variant={periodoMeses === p.meses ? "default" : "outline"}
              className={`text-xs rounded-full transition-all ${
                periodoMeses === p.meses
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "border-[#1E2942] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30"
              }`}
              onClick={() => setPeriodoMeses(p.meses)}
            >
              <Clock className="w-3 h-3 mr-1" /> {p.label}
            </Button>
          ))}
        </div>

        {/* 3 Cards de resultado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-600 rounded-2xl p-4 text-center">
            <p className="text-[11px] text-emerald-100 uppercase tracking-wider font-medium">Valor total final</p>
            <p className="text-xl font-bold text-white mt-1">{formatCurrency(valorFinal)}</p>
          </div>
          <div className="bg-[#1E2942]/60 rounded-2xl p-4 text-center border border-[#1E2942]">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Valor total investido</p>
            <p className="text-xl font-bold text-slate-200 mt-1">{formatCurrency(totalInvestido)}</p>
          </div>
          <div className="bg-[#1E2942]/60 rounded-2xl p-4 text-center border border-[#1E2942]">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Total em juros</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(totalJuros)}</p>
          </div>
        </div>

        {/* Taxa média */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <PiggyBank className="w-4 h-4 text-emerald-400" />
          <span>Taxa média ponderada:</span>
          <span className="font-bold text-emerald-400">{taxaMediaAnual.toFixed(2)}% a.a.</span>
        </div>

        {/* Gráfico */}
        <div className="bg-[#0B132B]/40 rounded-2xl p-4 border border-[#1E2942]/60">
          <p className="text-xs font-semibold text-slate-300 mb-3 text-center">Evolução do Patrimônio</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2942" />
              <XAxis dataKey="mes" stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}m`} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#0B132B", border: "1px solid #1E2942", borderRadius: "12px", color: "#e2e8f0" }}
                formatter={(value: number) => formatCurrency(value)} labelFormatter={(label) => `Mês ${label}`} />
              <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
              <Line type="monotone" dataKey="acumulado" name="Total Acumulado" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="investido" name="Valor Investido" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela mensal */}
        <div className="bg-[#0B132B]/40 rounded-2xl border border-[#1E2942]/60 overflow-hidden">
          <p className="text-xs font-semibold text-slate-300 p-3 pb-0 text-center">Projeção Mensal</p>
          <div className="max-h-[280px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-[#0B132B] z-10">
                <TableRow className="border-b border-[#1E2942] hover:bg-transparent">
                  <TableHead className="text-[10px] text-slate-400 uppercase">Mês</TableHead>
                  <TableHead className="text-[10px] text-slate-400 uppercase text-right">Juros</TableHead>
                  <TableHead className="text-[10px] text-slate-400 uppercase text-right">Total Investido</TableHead>
                  <TableHead className="text-[10px] text-slate-400 uppercase text-right">Total Juros</TableHead>
                  <TableHead className="text-[10px] text-slate-400 uppercase text-right">Total Acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dadosMensais.map((d) => (
                  <TableRow key={d.mes} className="border-b border-[#1E2942]/40 hover:bg-[#1E2942]/20">
                    <TableCell className="text-xs text-slate-300 py-2">{d.mes}</TableCell>
                    <TableCell className="text-xs text-emerald-400 text-right py-2 font-mono">{formatCurrency(d.juros)}</TableCell>
                    <TableCell className="text-xs text-slate-300 text-right py-2 font-mono">{formatCurrency(d.totalInvestido)}</TableCell>
                    <TableCell className="text-xs text-emerald-400 text-right py-2 font-mono">{formatCurrency(d.totalJuros)}</TableCell>
                    <TableCell className="text-xs text-slate-100 text-right py-2 font-mono font-bold">{formatCurrency(d.totalAcumulado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 text-center">Projeção baseada na taxa média ponderada dos ativos atuais. Não garante retorno futuro.</p>
      </CardContent>
    </Card>
  );
}
