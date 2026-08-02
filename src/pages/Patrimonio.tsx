import React from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { usePatrimonio } from "@/domains/finance/hooks/usePatrimonio";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import { Wallet, CreditCard, AlertTriangle, TrendingUp } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Patrimonio() {
  const { data, isLoading } = usePatrimonio();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const patrimonio = data || {
    ativos: { contas: 0, veiculos: 0, total: 0 },
    passivos: { dividas: 0, faturasCartao: 0, total: 0 },
    patrimonioLiquido: 0,
  };

  const percentualEndividamento = patrimonio.ativos.total > 0
    ? (patrimonio.passivos.total / patrimonio.ativos.total) * 100
    : 0;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/15">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Patrimônio Líquido</h1>
            <p className="text-sm text-muted-foreground">Consolidação de ativos e passivos</p>
          </div>
        </div>

        {/* Card Principal */}
        <Card className="border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-card/80 to-card/60 backdrop-blur-sm">
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-sm text-emerald-400 font-semibold tracking-wider">PATRIMÔNIO LÍQUIDO</p>
            <p className="text-4xl font-bold text-emerald-400">
              {formatCurrency(patrimonio.patrimonioLiquido)}
            </p>
            <p className="text-xs text-muted-foreground">
              Ativos: <span className="text-emerald-400 font-medium">{formatCurrency(patrimonio.ativos.total)}</span> — Passivos: <span className="text-red-400 font-medium">{formatCurrency(patrimonio.passivos.total)}</span>
            </p>
          </CardContent>
        </Card>

        {/* Ativos vs Passivos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-emerald-400 flex items-center gap-2 text-base">
                <Wallet className="h-5 w-5" />
                ATIVOS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contas Bancárias</span>
                <span className="font-medium">{formatCurrency(patrimonio.ativos.contas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Veículos</span>
                <span className="font-medium">{formatCurrency(patrimonio.ativos.veiculos)}</span>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between font-bold">
                <span>Total Ativos</span>
                <span className="text-emerald-400">{formatCurrency(patrimonio.ativos.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5" />
                PASSIVOS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dívidas Pendentes</span>
                <span className="font-medium">{formatCurrency(patrimonio.passivos.dividas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Faturas Cartão</span>
                <span className="font-medium">{formatCurrency(patrimonio.passivos.faturasCartao)}</span>
              </div>
              <div className="border-t border-border/30 pt-2 flex justify-between font-bold">
                <span>Total Passivos</span>
                <span className="text-red-400">{formatCurrency(patrimonio.passivos.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Índice de Endividamento */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Índice de Endividamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{percentualEndividamento.toFixed(1)}% dos ativos comprometidos</span>
              <span className={percentualEndividamento > 50 ? "text-red-400 font-semibold" : percentualEndividamento > 30 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                {percentualEndividamento > 50 ? "Alto" : percentualEndividamento > 30 ? "Moderado" : "Saudável"}
              </span>
            </div>
            <Progress value={Math.min(100, percentualEndividamento)} className="h-3" />
            {percentualEndividamento > 50 && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Endividamento acima de 50% — considere quitar dívidas prioritárias
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
