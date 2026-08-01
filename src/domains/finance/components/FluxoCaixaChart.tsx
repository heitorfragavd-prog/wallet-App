import React, { useMemo, useState } from "react";
import { useFluxoCaixaProjetado } from "@/domains/finance/hooks/useFluxoCaixaProjetado";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";

const formatarMoeda = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export const FluxoCaixaChart: React.FC = () => {
  const [dias, setDias] = useState<15 | 30 | 60 | 90>(30);

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

  // 2. Pontos de projeção do hook
  const { pontos, loading: loadingPontos } = useFluxoCaixaProjetado(dias);

  // 3. Ajuste do offset para que a projeção parta do saldo real das contas de dinheiro
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
  const saldoInicial = pontosCorrigidos[0]?.saldoProjetado ?? saldoRealAtual;
  const saldoFinal = pontosCorrigidos[pontosCorrigidos.length - 1]?.saldoProjetado ?? saldoRealAtual;
  const variacao = saldoFinal - saldoInicial;
  const variacaoPositiva = variacao >= 0;

  return (
    <Card className="col-span-full border-border bg-card shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Previsão de Fluxo de Caixa (Saldo Projetado)
            </CardTitle>
            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
              Preditivo
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Projeção de saldo futuro considerando receitas, despesas agendadas e dívidas a vencer.
          </CardDescription>
        </div>

        {/* Seletor de período (15, 30, 60, 90 dias) */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-stretch sm:self-auto justify-center">
          <Button
            size="sm"
            variant={dias === 15 ? "default" : "ghost"}
            className="text-xs h-7 px-3"
            onClick={() => setDias(15)}
          >
            15 Dias
          </Button>
          <Button
            size="sm"
            variant={dias === 30 ? "default" : "ghost"}
            className="text-xs h-7 px-3"
            onClick={() => setDias(30)}
          >
            30 Dias
          </Button>
          <Button
            size="sm"
            variant={dias === 60 ? "default" : "ghost"}
            className="text-xs h-7 px-3"
            onClick={() => setDias(60)}
          >
            60 Dias
          </Button>
          <Button
            size="sm"
            variant={dias === 90 ? "default" : "ghost"}
            className="text-xs h-7 px-3"
            onClick={() => setDias(90)}
          >
            90 Dias
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pílulas de Origem das Contas Bancárias (Apenas Dinheiro Real) */}
        {contasDinheiro.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {contasDinheiro.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 text-xs"
              >
                <span className="text-muted-foreground">{c.nome}</span>
                <span className={`font-semibold ${Number(c.saldo_atual) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatarMoeda(Number(c.saldo_atual) || 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Resumo visual rápido */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-muted/40 rounded-lg border border-border">
            <span className="text-xs text-muted-foreground font-medium block">Saldo Atual (Hoje)</span>
            <span className="text-lg font-bold text-foreground">{formatarMoeda(saldoInicial)}</span>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg border border-border">
            <span className="text-xs text-muted-foreground font-medium block">Saldo Projetado em {dias} dias</span>
            <span className={`text-lg font-bold ${saldoFinal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {formatarMoeda(saldoFinal)}
            </span>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg border border-border">
            <span className="text-xs text-muted-foreground font-medium block">Variação Estimada</span>
            <div className="flex items-center gap-1">
              {variacaoPositiva ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
              <span className={`text-sm font-semibold ${variacaoPositiva ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {variacaoPositiva ? "+" : ""}
                {formatarMoeda(variacao)}
              </span>
            </div>
          </div>
        </div>

        {/* Gráfico de Projeção */}
        <div className="h-72 w-full pt-2">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Calculando projeção de caixa...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pontosCorrigidos} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="dataFormatada" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#888888"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-xs space-y-1">
                          <p className="font-bold text-foreground border-b pb-1">Data: {data.data}</p>
                          <p className="text-orange-600 dark:text-orange-400 font-semibold">
                            Saldo Projetado: {formatarMoeda(data.saldoProjetado)}
                          </p>
                          {data.receitasProjetadas > 0 && (
                            <p className="text-emerald-600">Receitas a entrar: +{formatarMoeda(data.receitasProjetadas)}</p>
                          )}
                          {data.despesasProjetadas > 0 && (
                            <p className="text-rose-600">Despesas a sair: -{formatarMoeda(data.despesasProjetadas)}</p>
                          )}
                          {data.dividasProjetadas > 0 && (
                            <p className="text-amber-600">Dívidas a vencer: -{formatarMoeda(data.dividasProjetadas)}</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="saldoProjetado"
                  stroke="#f97316"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSaldo)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
