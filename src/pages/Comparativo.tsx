import React, { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useComparativoPeriodos } from "@/domains/finance/hooks/useComparativoPeriodos";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export default function Comparativo() {
  const [meses, setMeses] = useState(6);
  const { data, isLoading } = useComparativoPeriodos(meses);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15">
              <BarChart3 className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Comparativo de Períodos</h1>
              <p className="text-sm text-muted-foreground">Evolução financeira mês a mês</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[3, 6, 12].map((m) => (
              <Button
                key={m}
                variant={meses === m ? "default" : "outline"}
                size="sm"
                onClick={() => setMeses(m)}
                className="text-xs"
              >
                {m} meses
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Gráfico de Barras */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm p-4">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={data || []} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" fill="#22c55e" name="Receitas" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="#ef4444" name="Despesas" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saldo" fill="#3b82f6" name="Saldo" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Grid Mês a Mês */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data?.map((item) => (
                <Card key={item.mes} className="border-border/40 bg-card/60 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">{item.mes}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Receitas</span>
                      <span className="text-emerald-400 font-medium">
                        R$ {item.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Despesas</span>
                      <span className="text-red-400 font-medium">
                        R$ {item.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border/30 pt-1">
                      <span className="text-muted-foreground">Var. Receitas</span>
                      <span className={`flex items-center gap-1 font-medium ${item.variacaoReceitas >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {item.variacaoReceitas >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {item.variacaoReceitas}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Var. Despesas</span>
                      <span className={`flex items-center gap-1 font-medium ${item.variacaoDespesas <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {item.variacaoDespesas >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {item.variacaoDespesas}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
