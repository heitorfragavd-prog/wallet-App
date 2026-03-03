import { useState, useMemo } from "react";
import { addDays, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
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
import { DatePickerWithRange } from "@/shared/components/ui/date-range-picker";
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
  TooltipProps
} from "recharts";
import { icons } from "lucide-react";
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);
  const [showAllDespesas, setShowAllDespesas] = useState<boolean>(false);
  const [showAllReceitas, setShowAllReceitas] = useState<boolean>(false);
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
    const dataInicio = dateRange?.from ? dateRange.from.toISOString().split("T")[0] : getPrimeiroDiaMes();
    const dataFim = dateRange?.to ? dateRange.to.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

    const filteredByPeriod = transacoes.filter((t) => {
      const dataTransacao = t.data.split("T")[0];
      return dataTransacao >= dataInicio && dataTransacao <= dataFim;
    });

    // Dados do mês/período anterior para comparação (mesma duração do range atual)
    let receitasMesAnterior = 0;
    let despesasMesAnterior = 0;
    
    if (dateRange?.from) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const rangeDuration = dateRange.to ? 
        Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay) : 30;
      
      const previousPeriodEnd = subDays(dateRange.from, 1);
      const previousPeriodStart = subDays(previousPeriodEnd, rangeDuration);
      
      const prevInicio = previousPeriodStart.toISOString().split("T")[0];
      const prevFim = previousPeriodEnd.toISOString().split("T")[0];

      const transacoesMesAnterior = transacoes.filter((t) => {
        const data = t.data.split("T")[0];
        return data >= prevInicio && data <= prevFim;
      });

      receitasMesAnterior = transacoesMesAnterior.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
      despesasMesAnterior = transacoesMesAnterior.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);
    }

    // Totais do período atual
    const totalReceitas = filteredByPeriod.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
    const totalDespesas = filteredByPeriod.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);

    // Dados do gráfico por período
    let chartData: Array<{ periodo: string; receitas: number; despesas: number; saldo: number }> = [];
    const msPerDay = 1000 * 60 * 60 * 24;
    const diasNoRange = dateRange?.from && dateRange?.to ? 
      Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay) + 1 : 
      dateRange?.from ? 1 : 30;

    if (diasNoRange <= 31) {
      // Agrupar por dia
      for (let i = 0; i < diasNoRange; i++) {
        const currentDate = dateRange?.from ? addDays(dateRange.from, i) : new Date();
        const dataStr = currentDate.toISOString().split("T")[0];
        
        const transacoesDia = filteredByPeriod.filter((t) => t.data.split("T")[0] === dataStr);
        const receitas = transacoesDia.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + Number(t.valor), 0);
        const despesas = transacoesDia.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + Number(t.valor), 0);
        
        const formatoDia = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        chartData.push({ periodo: formatoDia, receitas, despesas, saldo: receitas - despesas });
      }
    } else {
      // Agrupar por mês
      const mesesMap = new Map();
      filteredByPeriod.forEach(t => {
        const dateObj = new Date(t.data);
        const mesAnoVar = dateObj.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (!mesesMap.has(mesAnoVar)) {
          mesesMap.set(mesAnoVar, { periodo: mesAnoVar, receitas: 0, despesas: 0 });
        }
        
        const data = mesesMap.get(mesAnoVar);
        if (t.tipo === "receita") data.receitas += Number(t.valor);
        if (t.tipo === "despesa") data.despesas += Number(t.valor);
        data.saldo = data.receitas - data.despesas;
      });
      chartData = Array.from(mesesMap.values());
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

    const topCategoriasDespesa = categoryData;
    const topCategoriasReceita = Array.from(categoryMap.entries())
      .filter(([_, v]) => v.tipo === "receita")
      .map(([k, v]) => ({ categoria: k.split("-")[0], valor: v.valor, cor: v.cor }))
      .sort((a, b) => b.valor - a.valor);

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
  }, [transacoes, dateRange, selectedCategory, loading]);

  const { chartData, categoryData, filteredTransactions, totalReceitas, totalDespesas, saldoTotal,
    receitasMesAnterior, despesasMesAnterior, topCategoriasDespesa, topCategoriasReceita,
    mediaReceitaDiaria, mediaDespesaDiaria, diasComTransacoes, maiorReceita, maiorDespesa } = processedData;

  // Variações percentuais
  const variacaoReceitas = receitasMesAnterior > 0 ? ((totalReceitas - receitasMesAnterior) / receitasMesAnterior) * 100 : 0;
  const variacaoDespesas = despesasMesAnterior > 0 ? ((totalDespesas - despesasMesAnterior) / despesasMesAnterior) * 100 : 0;
  const taxaEconomia = totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;

  // Metas ativas
  const metasAtivas = metas.filter((m) => m.status === "ativa").slice(0, 3);

  // Projeção de saldo — baseada na média diária do período selecionado
  const diasNoPeriodo = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return Math.max(1, Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }
    return 30;
  }, [dateRange]);

  const projecaoMeses = useMemo(() => {
    if (diasNoPeriodo === 0 || (totalReceitas === 0 && totalDespesas === 0)) return [];
    const receitaDiaria = totalReceitas / diasNoPeriodo;
    const despesaDiaria = totalDespesas / diasNoPeriodo;
    const today = new Date();
    return [1, 2, 3].map((offset) => {
      const mes = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      const projetadoReceitas = receitaDiaria * diasNoMes;
      const projetadoDespesas = despesaDiaria * diasNoMes;
      return {
        mes: mes.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        receitas: projetadoReceitas,
        despesas: projetadoDespesas,
        saldo: projetadoReceitas - projetadoDespesas,
      };
    });
  }, [totalReceitas, totalDespesas, diasNoPeriodo]);

  const handleExportReport = () => {
    try {
      const csvHeader = "Data,Descrição,Categoria,Valor,Tipo\n";
      const csvData = filteredTransactions.map((t) => `${t.data},"${t.descricao}","${t.categoria}",${t.valor},${t.tipo}`).join("\n");
      const blob = new Blob([csvHeader + csvData], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const dataInicio = dateRange?.from ? dateRange.from.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      link.download = `relatorio-${dataInicio}.csv`;
      link.click();
      toast({ title: "Relatório exportado!", description: "O arquivo CSV foi baixado." });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  const getPeriodoLabel = () => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString("pt-BR")} - ${dateRange.to.toLocaleDateString("pt-BR")}`;
    } else if (dateRange?.from) {
      return `A partir de ${dateRange.from.toLocaleDateString("pt-BR")}`;
    }
    return "Selecione um período";
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
            <DatePickerWithRange 
              date={dateRange}
              setDate={setDateRange}
            />
            <Button onClick={handleExportReport} variant="outline" className="hidden sm:flex">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button onClick={handleExportReport} variant="outline" size="icon" className="sm:hidden">
              <Download className="w-4 h-4" />
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
                  <div className={`transition-all duration-300 ${showAllCategories ? "h-[500px] sm:h-[600px]" : "h-[380px] sm:h-[460px]"}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={categoryData} 
                          cx="50%" 
                          cy={showAllCategories ? "30%" : "38%"} 
                          innerRadius={65} 
                          outerRadius={95} 
                          paddingAngle={3} 
                          dataKey="valor"
                          stroke="none"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.cor} 
                              className="outline-none focus:outline-none drop-shadow-sm transition-all duration-300 hover:opacity-80" 
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          cursor={{ fill: "transparent" }}
                          content={({ active, payload }: TooltipProps<number, string>) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              const percentual = totalDespesas > 0 ? ((data.valor / totalDespesas) * 100).toFixed(1) : 0;
                              
                              // Resolving the icon from Lucide React
                              const iconName = data.icone as keyof typeof icons;
                              const IconComponent = iconName && icons[iconName] 
                                ? icons[iconName] as React.ElementType
                                : icons.Tag;

                              return (
                                <div className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-4 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/50">
                                    <div 
                                      className="flex items-center justify-center w-8 h-8 rounded-full shadow-inner" 
                                      style={{ backgroundColor: `${data.cor}20`, color: data.cor }}
                                    >
                                      <IconComponent size={16} strokeWidth={2.5} />
                                    </div>
                                    <span className="font-semibold text-foreground">{data.categoria}</span>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-end text-sm">
                                      <span className="text-muted-foreground">Valor</span>
                                      <span className="font-bold text-foreground text-base">
                                        R$ {data.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-end text-sm">
                                      <span className="text-muted-foreground">Participação</span>
                                      <div className="bg-secondary px-2 py-0.5 rounded-md text-secondary-foreground font-semibold">
                                        {percentual}%
                                      </div>
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
                          wrapperStyle={{ paddingTop: "20px" }}
                          content={(props: { payload?: Array<{ color: string; payload: any }> }) => {
                            const { payload } = props;
                            if (!payload) return null;
                            
                            const maxItems = 6;
                            const hasMore = payload.length > maxItems;
                            const displayedItems = showAllCategories ? payload : payload.slice(0, maxItems);
                            
                            return (
                              <div className="flex flex-col">
                                <ul className="grid grid-cols-2 gap-x-2 gap-y-3 pt-6">
                                  {displayedItems.map((entry: { color: string; payload: { valor: number; icone?: string; categoria?: string; cor?: string } }, index: number) => {
                                  const data = entry.payload;
                                  const iconName = data.icone as keyof typeof icons;
                                  const IconComponent = iconName && icons[iconName] 
                                    ? icons[iconName] as React.ElementType
                                    : icons.Tag;
                                    
                                  const percentual = totalDespesas > 0 ? ((data.valor / totalDespesas) * 100).toFixed(1) : 0;
                                  
                                  return (
                                    <li key={`item-${index}`} className="flex items-center gap-2 group cursor-default">
                                      <div 
                                        className="flex items-center justify-center w-7 h-7 rounded-md transition-transform group-hover:scale-110" 
                                        style={{ backgroundColor: `${entry.color}15`, color: entry.color }}
                                      >
                                        <IconComponent size={14} strokeWidth={2.5} />
                                      </div>
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-xs font-medium text-foreground truncate" title={data.categoria}>
                                          {data.categoria}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-semibold">
                                          {percentual}%
                                        </span>
                                      </div>
                                    </li>
                                  );
                                })}
                                </ul>
                                {hasMore && (
                                  <button
                                    onClick={() => setShowAllCategories(!showAllCategories)}
                                    className="mt-4 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mx-auto flex items-center gap-1 bg-secondary/30 px-3 py-1.5 rounded-full"
                                  >
                                    {showAllCategories ? "Ver menos" : `Ver mais (${payload.length - maxItems})`}
                                  </button>
                                )}
                              </div>
                            );
                          }}
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
                    <CardTitle className="text-sm sm:text-base text-red-500">Top Despesas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 sm:px-6">
                    {(showAllDespesas ? topCategoriasDespesa : topCategoriasDespesa.slice(0, 5)).map((cat, i) => (
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
                    {topCategoriasDespesa.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground hover:text-red-400 mt-1"
                        onClick={() => setShowAllDespesas(!showAllDespesas)}
                      >
                        {showAllDespesas ? "Ver menos" : `Ver mais (${topCategoriasDespesa.length - 5})`}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base text-green-500">Top Receitas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 sm:px-6">
                    {(showAllReceitas ? topCategoriasReceita : topCategoriasReceita.slice(0, 5)).map((cat, i) => (
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
                    {topCategoriasReceita.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground hover:text-green-400 mt-1"
                        onClick={() => setShowAllReceitas(!showAllReceitas)}
                      >
                        {showAllReceitas ? "Ver menos" : `Ver mais (${topCategoriasReceita.length - 5})`}
                      </Button>
                    )}
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

            {/* Projeção de Saldo */}
            {projecaoMeses.length > 0 && (
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500 flex-shrink-0" />
                    Projeção de Saldo — Próximos 3 Meses
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 space-y-4">
                  <div className="h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projecaoMeses} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                            name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Saldo",
                          ]}
                        />
                        <Bar dataKey="receitas" fill="#22c55e" radius={[4, 4, 0, 0]} name="receitas" />
                        <Bar dataKey="despesas" fill="#ef4444" radius={[4, 4, 0, 0]} name="despesas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {projecaoMeses.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium capitalize">{p.mes}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-500">+{p.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <span className="text-red-500">-{p.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          <span className={`font-semibold ${p.saldo >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                            = R$ {p.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">* Projeção baseada na média diária do período selecionado.</p>
                </CardContent>
              </Card>
            )}

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
