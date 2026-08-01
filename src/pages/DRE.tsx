import React, { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useDRE } from "@/domains/finance/hooks/useDRE";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { FileText, TrendingUp, TrendingDown, BarChart3, ChevronRight } from "lucide-react";
import type { LinhaDRE } from "@/domains/finance/types/foodCost";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function getTipoStyle(tipo: LinhaDRE["tipo"]) {
  switch (tipo) {
    case "total":    return "bg-primary/10 text-foreground font-bold border-l-2 border-primary";
    case "subtotal": return "bg-muted/50 text-foreground font-semibold border-l-2 border-muted-foreground";
    case "negativo": return "text-muted-foreground";
    case "positivo": return "text-emerald-400 font-medium";
    default:         return "text-foreground";
  }
}

const DREPage: React.FC = () => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const { dre, loading } = useDRE(mes, ano);

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - i);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15">
              <FileText className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">DRE Gerencial</h1>
              <p className="text-sm text-muted-foreground">Demonstrativo de Resultado do Exercício</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : dre ? (
          <>
            {/* KPIs de Margem */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Receita Bruta</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(dre.receitaBruta)}</p>
                  <p className="text-xs text-muted-foreground">{dre.periodo}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Margem Bruta
                  </p>
                  <p className={`text-xl font-bold ${dre.margemBruta >= 50 ? "text-emerald-400" : dre.margemBruta >= 30 ? "text-amber-400" : "text-red-400"}`}>
                    {dre.margemBruta.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dre.lucroBruto)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> EBITDA
                  </p>
                  <p className={`text-xl font-bold ${dre.margemEbitda >= 15 ? "text-emerald-400" : dre.margemEbitda >= 5 ? "text-amber-400" : "text-red-400"}`}>
                    {dre.margemEbitda.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dre.ebitda)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    {dre.lucroLiquido >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    Lucro Líquido
                  </p>
                  <p className={`text-xl font-bold ${dre.lucroLiquido >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {dre.margemLiquida.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dre.lucroLiquido)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabela DRE */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle className="text-base">Demonstrativo — {dre.periodo}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Descrição</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Valor (R$)</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">% Receita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {dre.linhas.map((linha, i) => (
                        <tr
                          key={i}
                          className={`${getTipoStyle(linha.tipo)} ${linha.tipo === "total" || linha.tipo === "subtotal" ? "rounded" : ""}`}
                        >
                          <td className={`px-4 py-2.5 ${linha.indent ? "pl-" + (linha.indent * 4 + 4) : ""}`}>
                            <span className={linha.indent ? "pl-4 text-muted-foreground" : ""}>{linha.label}</span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${linha.valor < 0 ? "text-red-400" : linha.tipo === "total" ? "text-foreground" : linha.tipo === "subtotal" ? "text-foreground" : linha.valor > 0 ? "text-emerald-400" : ""}`}>
                            {linha.valor < 0
                              ? `(${formatCurrency(Math.abs(linha.valor))})`
                              : formatCurrency(linha.valor)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                            {linha.percentualSobreReceita !== undefined
                              ? `${linha.percentualSobreReceita.toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Nota metodológica */}
            <p className="text-xs text-muted-foreground text-center px-4">
              * Simples Nacional: ICMS 7% + PIS/COFINS 3,65% + ISS 2%. CMV calculado pelas fichas técnicas (estimativa de 30% quando não disponível). IR: 15% sobre LAIR positivo.
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
