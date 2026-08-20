import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  Brain,
  Zap,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Activity,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface AuditEvent {
  id: string;
  user_id: string;
  workspace_id: string;
  tool_name: string;
  execution_status: string;
  duration_ms: number;
  error_code: string | null;
  created_at: string;
}

export const AIMetricsDashboard: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "all">("30d");

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("wallet_ai_audit_events")
        .select("*")
        .order("created_at", { ascending: false });

      if (activeWorkspace?.id) {
        query = query.or(`workspace_id.eq.${activeWorkspace.id},workspace_id.is.null`);
      }

      if (periodo === "7d") {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        query = query.gte("created_at", seteDiasAtras.toISOString());
      } else if (periodo === "30d") {
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        query = query.gte("created_at", trintaDiasAtras.toISOString());
      }

      const { data, error } = await query.limit(500);
      if (!error && data) {
        setEvents(data as AuditEvent[]);
      }
    } catch (err) {
      console.error("Erro ao carregar métricas de IA:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [activeWorkspace?.id, periodo]);

  // Cálculos consolidados
  const totalCalls = events.length;
  const successfulCalls = events.filter((e) => e.execution_status === "success").length;
  const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 100;
  const avgDuration =
    totalCalls > 0
      ? Math.round(events.reduce((acc, e) => acc + (e.duration_ms || 0), 0) / totalCalls)
      : 0;

  // Estimativas de tokens e custos reais
  const estimatedTokens = events.reduce((acc, e) => acc + (Number((e as any).tokens_total) || 500), 0);
  const estimatedCostUsd = (estimatedTokens / 1_000_000) * 0.15; // Preço gpt-4o-mini
  const estimatedCostBrl = estimatedCostUsd * 5.65;

  const chartData = useMemo(() => {
    const grouped: Record<string, { data: string; total: number; erros: number; msMedio: number; count: number; duracaoTotal: number }> = {};
    for (const e of events) {
      const dia = new Date(e.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!grouped[dia]) {
        grouped[dia] = { data: dia, total: 0, erros: 0, msMedio: 0, count: 0, duracaoTotal: 0 };
      }
      grouped[dia].total += 1;
      if (e.execution_status !== "success") grouped[dia].erros += 1;
      grouped[dia].duracaoTotal += e.duration_ms || 0;
      grouped[dia].count += 1;
    }
    return Object.values(grouped).map((g) => ({
      ...g,
      msMedio: Math.round(g.duracaoTotal / (g.count || 1)),
    })).reverse();
  }, [events]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Painel de Métricas & Custos de IA</h1>
              <p className="text-sm text-muted-foreground">
                Monitoramento de desempenho, tokens, latência e custo do Wallet Finance Agent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
              <SelectTrigger className="w-36 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchMetrics} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Cards de Métricas Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total de Requisições */}
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Requisições IA
              </CardTitle>
              <Activity className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totalCalls}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {successRate.toFixed(1)}% taxa de sucesso
              </p>
            </CardContent>
          </Card>

          {/* Tokens Estimados */}
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tokens Processados
              </CardTitle>
              <Layers className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {estimatedTokens.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Prompt + Completion</p>
            </CardContent>
          </Card>

          {/* Custo Estimado */}
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Custo Acumulado
              </CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">
                {formatCurrency(estimatedCostBrl)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ${estimatedCostUsd.toFixed(4)} USD (gpt-4o-mini)
              </p>
            </CardContent>
          </Card>

          {/* Latência Média */}
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tempo Médio Resposta
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{avgDuration} ms</div>
              <p className="text-xs text-muted-foreground mt-1">Latência ponta a ponta</p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico de Requisições por Dia */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Volume de Consultas por Dia
            </CardTitle>
            <CardDescription>Distribuição diária de requisições do assistente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="data" stroke="#71717a" fontSize={11} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Bar dataKey="total" name="Consultas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Nenhum dado registrado para o período selecionado.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Últimas Consultas Auditadas */}
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Últimas Ações Auditadas
            </CardTitle>
            <CardDescription>Registro auditável e determinístico de chamadas da IA</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-muted-foreground border-b border-border bg-muted/30">
                  <tr>
                    <th className="p-2.5">Data/Hora</th>
                    <th className="p-2.5">Ferramenta</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Duração</th>
                    <th className="p-2.5">Código de Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.slice(0, 10).map((evt) => (
                    <tr key={evt.id} className="hover:bg-muted/20">
                      <td className="p-2.5 text-muted-foreground">
                        {new Date(evt.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-2.5 font-medium text-foreground">
                        <code>{evt.tool_name}</code>
                      </td>
                      <td className="p-2.5">
                        {evt.execution_status === "success" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Sucesso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400">
                            <AlertTriangle className="h-3 w-3" /> Erro
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{evt.duration_ms} ms</td>
                      <td className="p-2.5 text-muted-foreground">{evt.error_code || "—"}</td>
                    </tr>
                  ))}
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Nenhum evento de auditoria encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AIMetricsDashboard;
