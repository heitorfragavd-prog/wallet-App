import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Progress } from "@/shared/components/ui/progress";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Download,
  PieChart as PieChartIcon,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Target,
  Calendar,
  Percent,
  Activity,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { useMetas } from "@/domains/finance/hooks/useMetas";

// Funções de data
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

const getPrimeiroDiaSemana = () => {
  const now = new Date();
  const primeiro = new Date(now);
  primeiro.setDate(now.getDate() - now.getDay());
  return `${primeiro.getFullYear()}-${String(primeiro.getMonth() + 1).padStart(2, "0")}-${String(primeiro.getDate()).padStart(2, "0")}`;
};

const getPrimeiroDiaMes = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const getPrimeiroDiaTrimestre = () => {
  const now = new Date();
  const mes = Math.floor(now.getMonth() / 3) * 3 + 1;
  return `${now.getFullYear()}-${String(mes).padStart(2, "0")}-01`;
};

const getPrimeiroDiaAno = () => `${new Date().getFullYear()}-01-01`;

const getMesAnterior = () => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const Relatorios = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("mes");
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const { toast } = useToast();
  const { transacoes, loading } = useTransacoes();
  const { metas } = useMetas();

  const processedData = useMemo(() => {
    if (loading || !transacoes.length) {
      return {
        chartData: [], categoryData: [], filteredTransactions: [],
        totalReceitas: 0, totalDespesas: 0, saldoTotal: 0,
        receitasMesAnterior: 0, despesasMesAnterior: 0,
        topCategoriasDespesa: [], topCategoriasReceita: [],
        mediaReceitaDiaria: 0, mediaDespesaDiaria: 0,
        diasComTransacoes: 0, maiorReceita: null, maiorDespesa: null,
      };
    }

    // Filtrar por período
    const getDataInicio = () => {
      switch (selectedPeriod) {
        case "semana": return getPrimeiroDiaSemana();
        case "mes": return getPrimeiroDiaMes();
        case "trimestre": return getPrimeiroDiaTrimestre();
        case "ano": return getPrimeiroDiaAno();
        default: return getPrimeiroDiaMes();
      }
    };

    const dataInicio = getDataInicio();
    const filteredByPeriod = transacoes.filter((t) => t.data.split("T")[0] >= dataInicio);

    // Dados do mês anterior para comparação
    const mesAnteriorInicio = getMesAnterior();
    const mesAnteriorFim = getPrimeiroDiaMes();
    const transacoesMesAnterior = transacoes.filter((t) => {
      const data = t.data.split("T")[0];
      return data >= mesAnteriorInicio && data < mesAnteriorFim;
    });

    const receitasMesAnterior = transacoesMesAnterior.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
    const despesasMesAnterior = transacoesMesAnterior.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);

    // Totais do período atual
    const totalReceitas = filteredByPeriod.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
    const totalDespesas = filteredByPeriod.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);

    // Dados do gráfico por período
    let chartData: any[] = [];
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    if (selectedPeriod === "semana") {
      const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      chartData = days.map((day, idx) => {
        const dayTransactions = filteredByPeriod.filter((t) => new Date(t.data + "T12:00:00").getDay() === idx);
        const receitas = dayTransactions.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
        const despesas = dayTransactions.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);
        return { periodo: day, receitas, despesas, saldo: receitas - despesas };
      });
    } else if (selectedPeriod === "mes") {
      const now = new Date();
      const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      chartData = Array.from({ length: diasNoMes }, (_, i) => {
        const dia = String(i + 1).padStart(2, "0");
        const dataDia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${dia}`;
        const transacoesDia = filteredByPeriod.filter((t) => t.data.split("T")[0] === dataDia);
        const receitas = transacoesDia.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
        const despesas = transacoesDia.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);
        return { periodo: dia, receitas, despesas, saldo: receitas - despesas };
      });
    } else if (selectedPeriod === "ano") {
      chartData = meses.map((mes, idx) => {
        const mesTransactions = filteredByPeriod.filter((t) => new Date(t.data + "T12:00:00").getMonth() === idx);
        const receitas = mesTransactions.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
        const despesas = mesTransactions.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);
        return { periodo: mes, receitas, despesas, saldo: receitas - despesas };
      });
    }

    // Dados por categoria
    const categoryMap = new Map<string, { valor: number; cor: string; tipo: string }>();
    filteredByPeriod.forEach((t) => {
      const key = `${t.categorias?.nome || "Sem categoria"}-${t.tipo}`;
      const existing = categoryMap.get(key);
      if (existing) {
        categoryMap.set(key, { ...existing, valor: existing.valor + Number(t.valor) });
      } else {
        categoryMap.set(key, { valor: Number(t.valor), cor: t.categorias?.cor || "#6B7280", tipo: t.tipo });
      }
    });

    const categoryData = Array.from(categoryMap.entries())
      .filter(([_, v]) => v.tipo === "despesa")
      .map(([k, v]) => ({ categoria: k.split("-")[0], valor: v.valor, cor: v.cor }))
      .sort((a, b) => b.valor - a.valor);

    const topCategoriasDespesa = categoryData.slice(0, 5);
    const topCategoriasReceita = Array.from(categoryMap.entries())
      .filter(([_, v]) => v.tipo === "receita")
      .map(([k, v]) => ({ categoria: k.split("-")[0], valor: v.valor, cor: v.cor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Transações filtradas
    const filteredTransactions = filteredByPeriod
      .filter((t) => selectedCategory === "todas" || t.tipo === selectedCategory)
      .map((t) => ({ id: t.id, data: t.data, descricao: t.descricao, categoria: t.categorias?.nome || "Sem categoria", valor: Number(t.valor), tipo: t.tipo }))
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 50);

    // Estatísticas adicionais
    const diasUnicos = new Set(filteredByPeriod.map((t) => t.data.split("T")[0])).size;
    const maiorReceita = filteredByPeriod.filter((t) => t.tipo === "receita").sort((a, b) => Number(b.valor) - Number(a.valor))[0];
    const maiorDespesa = filteredByPeriod.filter((t) => t.tipo === "despesa").sort((a, b) => Number(b.valor) - Number(a.valor))[0];

    return {
      chartData, categoryData, filteredTransactions,
      totalReceitas, totalDespesas, saldoTotal: totalReceitas - totalDespesas,
      receitasMesAnterior, despesasMesAnterior,
      topCategoriasDespesa, topCategoriasReceita,
      mediaReceitaDiaria: diasUnicos > 0 ? totalReceitas / diasUnicos : 0,
      mediaDespesaDiaria: diasUnicos > 0 ? totalDespesas / diasUnicos : 0,
      diasComTransacoes: diasUnicos,
      maiorReceita, maiorDespesa,
    };
  }, [transacoes, selectedPeriod, selectedCategory, loading]);

  const { chartData, categoryData, filteredTransactions, totalReceitas, totalDespesas, saldoTotal,
    receitasMesAnterior, despesasMesAnterior, topCategoriasDespesa, topCategoriasReceita,
    mediaReceitaDiaria, mediaDespesaDiaria, diasComTransacoes, maiorReceita, maiorDespesa } = processedData;

  // Variações percentuais
  const variacaoReceitas = receitasMesAnterior > 0 ? ((totalReceitas - receitasMesAnterior) / receitasMesAnterior) * 100 : 0;
  const variacaoDespesas = despesasMesAnterior > 0 ? ((totalDespesas - despesasMesAnterior) / despesasMesAnterior) * 100 : 0;
  const taxaEconomia = totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;

  // Metas ativas
  const metasAtivas = metas.filter((m) => m.status === "ativa").slice(0, 3);

  const handleExportReport = () => {
    try {
      const csvHeader = "Data,Descrição,Categoria,Valor,Tipo\n";
      const csvData = filteredTransactions.map((t) => `${t.data},"${t.descricao}","${t.categoria}",${t.valor},${t.tipo}`).join("\n");
      const blob = new Blob([csvHeader + csvData], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio-${selectedPeriod}-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      toast({ title: "Relatório exportado!", description: "O arquivo CSV foi baixado." });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  const getPeriodoLabel = () => {
    switch (selectedPeriod) {
      case "semana": return "Esta Semana";
      case "mes": return "Este Mês";
      case "trimestre": return "Este Trimestre";
      case "ano": return "Este Ano";
      default: return "";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-3 shadow-lg shadow-cyan-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
              <p className="text-muted-foreground">Análise completa das suas finanças</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-36">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
                <SelectItem value="trimestre">Trimestre</SelectItem>
                <SelectItem value="ano">Ano</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExportReport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>


        {/* Cards Principais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-xs sm:text-sm text-muted-foreground">Receitas</p>
                <div className="p-1.5 sm:p-2 rounded-xl bg-green-500/20">
                  <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                </div>
              </div>
              {loading ? <Skeleton className="h-6 sm:h-8 w-24 sm:w-32" /> : (
                <>
                  <p className="text-base sm:text-2xl font-bold text-green-500 truncate">R$ {totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  {variacaoReceitas !== 0 && (
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      {variacaoReceitas > 0 ? <TrendingUp className="w-3 h-3 text-green-500 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />}
                      <span className={`text-[10px] sm:text-xs ${variacaoReceitas > 0 ? "text-green-500" : "text-red-500"} truncate`}>
                        {variacaoReceitas > 0 ? "+" : ""}{variacaoReceitas.toFixed(1)}% <span className="hidden sm:inline">vs mês anterior</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-xs sm:text-sm text-muted-foreground">Despesas</p>
                <div className="p-1.5 sm:p-2 rounded-xl bg-red-500/20">
                  <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                </div>
              </div>
              {loading ? <Skeleton className="h-6 sm:h-8 w-24 sm:w-32" /> : (
                <>
                  <p className="text-base sm:text-2xl font-bold text-red-500 truncate">R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  {variacaoDespesas !== 0 && (
                    <div className="flex items-center gap-1 mt-1 sm:mt-2">
                      {variacaoDespesas < 0 ? <TrendingDown className="w-3 h-3 text-green-500 flex-shrink-0" /> : <TrendingUp className="w-3 h-3 text-red-500 flex-shrink-0" />}
                      <span className={`text-[10px] sm:text-xs ${variacaoDespesas < 0 ? "text-green-500" : "text-red-500"} truncate`}>
                        {variacaoDespesas > 0 ? "+" : ""}{variacaoDespesas.toFixed(1)}% <span className="hidden sm:inline">vs mês anterior</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-xs sm:text-sm text-muted-foreground">Saldo</p>
                <div className={`p-1.5 sm:p-2 rounded-xl ${saldoTotal >= 0 ? "bg-blue-500/20" : "bg-orange-500/20"}`}>
                  <Wallet className={`w-3 h-3 sm:w-4 sm:h-4 ${saldoTotal >= 0 ? "text-blue-500" : "text-orange-500"}`} />
                </div>
              </div>
              {loading ? <Skeleton className="h-6 sm:h-8 w-24 sm:w-32" /> : (
                <p className={`text-base sm:text-2xl font-bold ${saldoTotal >= 0 ? "text-blue-500" : "text-orange-500"} truncate`}>
                  R$ {saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">{getPeriodoLabel()}</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Taxa Economia</p>
                <div className="p-1.5 sm:p-2 rounded-xl bg-purple-500/20">
                  <Percent className="w-3 h-3 sm:w-4 sm:h-4 text-purple-500" />
                </div>
              </div>
              {loading ? <Skeleton className="h-6 sm:h-8 w-16 sm:w-20" /> : (
                <>
                  <p className={`text-base sm:text-2xl font-bold ${taxaEconomia >= 0 ? "text-purple-500" : "text-red-500"}`}>
                    {taxaEconomia.toFixed(1)}%
                  </p>
                  <Progress value={Math.max(0, Math.min(100, taxaEconomia))} className="h-1 sm:h-1.5 mt-1 sm:mt-2" />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <ScrollArea className="w-full">
            <TabsList className="bg-muted/50 w-full sm:w-auto inline-flex">
              <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3">
                <Activity className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Visão Geral</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3">
                <PieChartIcon className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Categorias</span>
              </TabsTrigger>
              <TabsTrigger value="transactions" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3">
                <FileText className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Transações</span>
              </TabsTrigger>
              <TabsTrigger value="insights" className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white text-xs sm:text-sm px-2 sm:px-3">
                <Target className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Insights</span>
              </TabsTrigger>
            </TabsList>
          </ScrollArea>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gráfico de Área - Receitas vs Despesas */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    <span className="truncate">Receitas vs Despesas - {getPeriodoLabel()}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="h-[220px] sm:h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={60} />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                                  <p className="font-semibold text-popover-foreground mb-2">{label}</p>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                        <span className="text-sm text-muted-foreground">Receitas</span>
                                      </div>
                                      <span className="text-sm font-medium text-green-500">
                                        R$ {Number(payload[0]?.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                        <span className="text-sm text-muted-foreground">Despesas</span>
                                      </div>
                                      <span className="text-sm font-medium text-red-500">
                                        R$ {Number(payload[1]?.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area type="monotone" dataKey="receitas" stroke="#22c55e" fillOpacity={1} fill="url(#colorReceitas)" strokeWidth={2} />
                        <Area type="monotone" dataKey="despesas" stroke="#ef4444" fillOpacity={1} fill="url(#colorDespesas)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Gráfico de Linha - Evolução do Saldo */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    Evolução do Saldo
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="h-[220px] sm:h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={60} />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const saldo = Number(payload[0]?.value || 0);
                              return (
                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[160px]">
                                  <p className="font-semibold text-popover-foreground mb-2">{label}</p>
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2.5 h-2.5 rounded-full ${saldo >= 0 ? "bg-blue-500" : "bg-orange-500"}`} />
                                      <span className="text-sm text-muted-foreground">Saldo</span>
                                    </div>
                                    <span className={`text-sm font-medium ${saldo >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                                      R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={3} dot={{ fill: "#3b82f6", strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cards de Estatísticas Rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <Card className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Média Diária Receitas</p>
                <p className="text-sm sm:text-lg font-bold text-green-500 truncate">R$ {mediaReceitaDiaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </Card>
              <Card className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Média Diária Despesas</p>
                <p className="text-sm sm:text-lg font-bold text-red-500 truncate">R$ {mediaDespesaDiaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </Card>
              <Card className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Dias com Transações</p>
                <p className="text-sm sm:text-lg font-bold text-foreground">{diasComTransacoes}</p>
              </Card>
              <Card className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Total Transações</p>
                <p className="text-sm sm:text-lg font-bold text-foreground">{filteredTransactions.length}</p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Gráfico de Pizza */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    Despesas por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div className="h-[250px] sm:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={categoryData} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={60} 
                          outerRadius={100} 
                          paddingAngle={2} 
                          dataKey="valor"
                          label={({ categoria, percent }) => `${categoria} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.cor} className="outline-none focus:outline-none" />
                          ))}
                        </Pie>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              const percentual = totalDespesas > 0 ? ((data.valor / totalDespesas) * 100).toFixed(1) : 0;
                              return (
                                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.cor }} />
                                    <span className="font-semibold text-popover-foreground">{data.categoria}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Valor:</span>
                                      <span className="font-medium text-popover-foreground">
                                        R$ {data.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Percentual:</span>
                                      <span className="font-medium text-popover-foreground">{percentual}%</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36}
                          formatter={(value, entry: any) => (
                            <span className="text-sm text-foreground">{entry.payload.categoria}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Categorias */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base text-red-500">Top 5 Despesas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 sm:px-6">
                    {topCategoriasDespesa.map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.cor }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>{cat.categoria}</span>
                            <span className="font-medium">R$ {cat.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                          </div>
                          <Progress value={(cat.valor / totalDespesas) * 100} className="h-1 mt-1" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base text-green-500">Top 5 Receitas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 sm:px-6">
                    {topCategoriasReceita.map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.cor }} />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm">
                            <span>{cat.categoria}</span>
                            <span className="font-medium">R$ {cat.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                          </div>
                          <Progress value={(cat.valor / totalReceitas) * 100} className="h-1 mt-1" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>


          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">Transações - {getPeriodoLabel()}</CardTitle>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="receita">Receitas</SelectItem>
                    <SelectItem value="despesa">Despesas</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {/* Mobile: Card layout */}
                <div className="block sm:hidden space-y-3 max-h-[400px] overflow-y-auto">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))
                  ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma transação encontrada
                    </div>
                  ) : (
                    filteredTransactions.map((t) => (
                      <div key={t.id} className="p-3 rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs text-muted-foreground">{formatarData(t.data)}</span>
                          <span className={`text-sm font-semibold ${t.tipo === "receita" ? "text-green-500" : "text-red-500"}`}>
                            {t.tipo === "receita" ? "+" : "-"}R$ {t.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <p className="font-medium text-sm mb-1 truncate">{t.descricao}</p>
                        <Badge variant="secondary" className="font-normal text-xs">{t.categoria}</Badge>
                      </div>
                    ))
                  )}
                </div>
                {/* Desktop: Table layout */}
                <ScrollArea className="h-[400px] hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Nenhuma transação encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-muted-foreground">{formatarData(t.data)}</TableCell>
                            <TableCell className="font-medium">{t.descricao}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal">{t.categoria}</Badge>
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${t.tipo === "receita" ? "text-green-500" : "text-red-500"}`}>
                              {t.tipo === "receita" ? "+" : "-"}R$ {t.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Destaques */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    Destaques do Período
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-3 sm:px-6">
                  {maiorReceita && (
                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Maior Receita</p>
                      <p className="font-medium">{maiorReceita.descricao}</p>
                      <p className="text-lg font-bold text-green-500">
                        R$ {Number(maiorReceita.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{formatarData(maiorReceita.data)}</p>
                    </div>
                  )}
                  {maiorDespesa && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-muted-foreground mb-1">Maior Despesa</p>
                      <p className="font-medium">{maiorDespesa.descricao}</p>
                      <p className="text-lg font-bold text-red-500">
                        R$ {Number(maiorDespesa.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{formatarData(maiorDespesa.data)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Metas */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    Progresso das Metas
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  {metasAtivas.length > 0 ? (
                    <div className="space-y-4">
                      {metasAtivas.map((meta) => {
                        const progresso = meta.valor_alvo > 0 ? (meta.valor_atual / meta.valor_alvo) * 100 : 0;
                        return (
                          <div key={meta.id} className="p-4 rounded-xl border border-border">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-medium">{meta.titulo}</p>
                                <p className="text-xs text-muted-foreground">{meta.tipo}</p>
                              </div>
                              <Badge className="bg-violet-500/20 text-violet-600 border-0">{progresso.toFixed(0)}%</Badge>
                            </div>
                            <Progress value={Math.min(progresso, 100)} className="h-2 mb-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>R$ {meta.valor_atual.toLocaleString("pt-BR")}</span>
                              <span>R$ {meta.valor_alvo.toLocaleString("pt-BR")}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Nenhuma meta ativa</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Dicas Financeiras */}
            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="text-sm sm:text-base">💡 Análise Automática</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div className={`p-4 rounded-xl ${taxaEconomia >= 20 ? "bg-green-500/10 border-green-500/20" : taxaEconomia >= 0 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20"} border`}>
                    <p className="text-sm font-medium mb-1">Taxa de Economia</p>
                    <p className="text-xs text-muted-foreground">
                      {taxaEconomia >= 20 ? "Excelente! Você está economizando bem." : 
                       taxaEconomia >= 0 ? "Atenção: tente economizar pelo menos 20%." : 
                       "Alerta: suas despesas superam suas receitas."}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl ${variacaoDespesas <= 0 ? "bg-green-500/10 border-green-500/20" : "bg-yellow-500/10 border-yellow-500/20"} border`}>
                    <p className="text-sm font-medium mb-1">Tendência de Gastos</p>
                    <p className="text-xs text-muted-foreground">
                      {variacaoDespesas <= 0 ? "Ótimo! Seus gastos diminuíram em relação ao mês anterior." : 
                       `Seus gastos aumentaram ${variacaoDespesas.toFixed(1)}% em relação ao mês anterior.`}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm font-medium mb-1">Categoria Principal</p>
                    <p className="text-xs text-muted-foreground">
                      {topCategoriasDespesa[0] ? 
                        `"${topCategoriasDespesa[0].categoria}" representa ${((topCategoriasDespesa[0].valor / totalDespesas) * 100).toFixed(0)}% das suas despesas.` : 
                        "Sem dados suficientes para análise."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Relatorios;
