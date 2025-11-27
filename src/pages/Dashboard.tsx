import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Progress } from "@/shared/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Home,
  Utensils,
  TrendingUp as Investment,
  Car,
  Package,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  PieChart,
  Clock,
  AlertCircle,
  ChevronRight,
  Target,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { useItensMercado } from "@/domains/market/hooks/useItensMercado";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useVeiculos } from "@/domains/vehicles/hooks/useVeiculos";
import { useMetas } from "@/domains/finance/hooks/useMetas";
import { useProfile } from "@/domains/auth/hooks/useProfile";

// Função para formatar a data corretamente
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

// Função para formatar data relativa (Hoje, Ontem, etc)
const formatarDataRelativa = (dataString: string) => {
  if (!dataString) return "";
  const data = new Date(dataString.split("T")[0] + "T12:00:00");
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return formatarData(dataString);
};

// Função para obter a data atual no formato do banco (YYYY-MM-DD)
const getDataAtual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// Função para obter o primeiro dia da semana
const getPrimeiroDiaSemana = () => {
  const now = new Date();
  const primeiroDiaSemana = new Date(now);
  primeiroDiaSemana.setDate(now.getDate() - now.getDay());
  return `${primeiroDiaSemana.getFullYear()}-${String(primeiroDiaSemana.getMonth() + 1).padStart(2, "0")}-${String(primeiroDiaSemana.getDate()).padStart(2, "0")}`;
};

// Função para obter o primeiro dia do mês
const getPrimeiroDiaMes = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

// Função para obter o primeiro dia do ano
const getPrimeiroDiaAno = () => {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
};

// Função para formatar o nome do mês
const formatarMes = (data: Date) => {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${meses[data.getMonth()]} de ${data.getFullYear()}`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("mês");

  const { transacoes, loading: loadingTransacoes } = useTransacoes();
  const { itensMercado, loading: loadingItens } = useItensMercado();
  const { dividas, loading: loadingDividas } = useDividas();
  const { veiculos, loading: loadingVeiculos } = useVeiculos();
  const { metas, loading: loadingMetas } = useMetas();
  const { profile } = useProfile();

  // Processar dados com useMemo para performance
  const processedData = useMemo(() => {
    if (loadingTransacoes || !transacoes.length) {
      return {
        transacoesFiltradas: [],
        totalReceitas: 0,
        totalDespesas: 0,
        saldoPeriodo: 0,
        percentualDespesas: 0,
      };
    }

    const hoje = getDataAtual();

    const transacoesFiltradas = transacoes.filter((transacao) => {
      const dataTransacao = transacao.data.split("T")[0];
      switch (selectedPeriod) {
        case "dia": return dataTransacao === hoje;
        case "semana": return dataTransacao >= getPrimeiroDiaSemana();
        case "mês": return dataTransacao >= getPrimeiroDiaMes();
        case "ano": return dataTransacao >= getPrimeiroDiaAno();
        default: return true;
      }
    });

    const totalReceitas = transacoesFiltradas
      .filter((t) => t.tipo === "receita")
      .reduce((total, t) => total + Number(t.valor), 0);

    const totalDespesas = transacoesFiltradas
      .filter((t) => t.tipo === "despesa")
      .reduce((total, t) => total + Number(t.valor), 0);

    return {
      transacoesFiltradas: transacoesFiltradas.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      totalReceitas,
      totalDespesas,
      saldoPeriodo: totalReceitas - totalDespesas,
      percentualDespesas: totalReceitas > 0 ? (totalDespesas / totalReceitas) * 100 : 0,
    };
  }, [transacoes, selectedPeriod, loadingTransacoes]);

  const { transacoesFiltradas, totalReceitas, totalDespesas, saldoPeriodo, percentualDespesas } = processedData;

  // Função para obter ícone da categoria
  const obterIconeCategoria = (categoria: string, tipo: "receita" | "despesa") => {
    const icones: { [key: string]: React.ComponentType<{ className?: string }> } = {
      Salário: DollarSign, Freelances: DollarSign, Investimentos: Investment,
      Moradia: Home, Alimentação: Utensils, Transporte: Car,
      default: tipo === "receita" ? DollarSign : TrendingDown,
    };
    return icones[categoria] || icones.default;
  };

  // Itens com estoque baixo
  const itensEstoqueBaixo = itensMercado.filter(
    (item) => item.status === "estoque_baixo" || item.status === "sem_estoque"
  );

  // Dívidas vencidas
  const dividasVencidas = dividas.filter((divida) => divida.status === "vencida");
  const totalDividasVencidas = dividasVencidas.reduce((total, d) => total + Number(d.valor_restante), 0);

  // Agrupar transações por data de cadastro
  const transacoesAgrupadas = useMemo(() => {
    const grupos: { [key: string]: typeof transacoesFiltradas } = {};
    transacoesFiltradas.slice(0, 6).forEach((t) => {
      const dataKey = formatarDataRelativa(t.created_at);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(t);
    });
    return grupos;
  }, [transacoesFiltradas]);

  // Metas ativas ordenadas por progresso
  const metasAtivas = useMemo(() => {
    return metas
      .filter((m) => m.status === "ativa")
      .map((m) => ({
        ...m,
        progresso: m.valor_alvo > 0 ? (m.valor_atual / m.valor_alvo) * 100 : 0,
      }))
      .sort((a, b) => b.progresso - a.progresso)
      .slice(0, 3);
  }, [metas]);

  const user = {
    name: profile?.name || "Usuário",
    getCurrentPeriod: () => {
      const now = new Date();
      switch (selectedPeriod) {
        case "dia": return formatarData(now.toISOString());
        case "semana": {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          return `Semana de ${formatarData(startOfWeek.toISOString())}`;
        }
        case "mês": return formatarMes(now);
        case "ano": return now.getFullYear().toString();
        default: return "Período atual";
      }
    },
  };

  const getSaudeFinanceira = () => {
    if (percentualDespesas < 70) return { label: "Excelente", color: "bg-green-500", textColor: "text-green-500" };
    if (percentualDespesas < 85) return { label: "Bom", color: "bg-emerald-500", textColor: "text-emerald-500" };
    if (percentualDespesas < 95) return { label: "Atenção", color: "bg-yellow-500", textColor: "text-yellow-500" };
    return { label: "Crítico", color: "bg-red-500", textColor: "text-red-500" };
  };

  const saude = getSaudeFinanceira();

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-3 shadow-lg shadow-orange-500/20">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Olá, {user.name}</h1>
              <p className="text-muted-foreground">{user.getCurrentPeriod()}</p>
            </div>
          </div>
          <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <TabsList className="grid grid-cols-4 bg-muted/50">
              <TabsTrigger value="dia" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Dia</TabsTrigger>
              <TabsTrigger value="semana" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Semana</TabsTrigger>
              <TabsTrigger value="mês" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Mês</TabsTrigger>
              <TabsTrigger value="ano" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Ano</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Receitas */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Receitas</p>
                  {loadingTransacoes ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <ArrowUpRight className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Despesas */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Despesas</p>
                  {loadingTransacoes ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <ArrowDownRight className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Saldo</p>
                  {loadingTransacoes ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className={`text-2xl font-bold ${saldoPeriodo >= 0 ? "text-foreground" : "text-red-500"}`}>
                      R$ {saldoPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <Wallet className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saúde Financeira */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Saúde Financeira</p>
                  <div className="p-2 rounded-xl bg-purple-500/20">
                    <PieChart className="w-4 h-4 text-purple-500" />
                  </div>
                </div>
                {loadingTransacoes ? (
                  <Skeleton className="h-6 w-20" />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className={`${saude.color} text-white border-0`}>{saude.label}</Badge>
                      <span className="text-sm text-muted-foreground">{percentualDespesas.toFixed(0)}%</span>
                    </div>
                    <Progress value={Math.min(percentualDespesas, 100)} className="h-1.5" />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Últimas Transações + Metas */}
          <div className="lg:col-span-2 space-y-4">
            {/* Últimas Transações */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <CardTitle className="text-lg">Últimas Transações</CardTitle>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600" onClick={() => navigate("/transacoes")}>
                  Ver todas <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {loadingTransacoes ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-5 w-20" />
                      </div>
                    ))}
                  </div>
                ) : Object.keys(transacoesAgrupadas).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(transacoesAgrupadas).map(([data, transacoes]) => (
                      <div key={data}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{data}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="space-y-1.5">
                          {transacoes.map((t) => {
                            const Icon = obterIconeCategoria(t.categorias?.nome || "default", t.tipo);
                            return (
                              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                                <div className={`p-2 rounded-lg ${t.tipo === "receita" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                                  <Icon className={`w-4 h-4 ${t.tipo === "receita" ? "text-green-500" : "text-red-500"}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{t.descricao}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
                                      {t.categorias?.nome || "Sem categoria"}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{formatarData(t.data)}</span>
                                  </div>
                                </div>
                                <span className={`text-sm font-semibold whitespace-nowrap ${t.tipo === "receita" ? "text-green-500" : "text-red-500"}`}>
                                  {t.tipo === "receita" ? "+" : "-"}R$ {Number(t.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Wallet className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma transação no período</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metas Financeiras */}
            <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-purple-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-violet-500" />
                  <CardTitle className="text-lg">Minhas Metas</CardTitle>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600" onClick={() => navigate("/metas")}>
                  Ver todas <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {loadingMetas ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                  </div>
                ) : metasAtivas.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {metasAtivas.map((meta) => (
                      <div
                        key={meta.id}
                        className="relative p-4 rounded-xl bg-background/60 border border-border/50 hover:border-violet-500/30 transition-colors cursor-pointer"
                        onClick={() => navigate("/metas")}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{meta.titulo}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {meta.categorias_metas?.nome || meta.tipo}
                            </p>
                          </div>
                          {meta.progresso >= 100 && (
                            <Sparkles className="w-4 h-4 text-yellow-500 shrink-0" />
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              R$ {meta.valor_atual.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                            </span>
                            <span className="font-medium text-violet-500">
                              {meta.progresso.toFixed(0)}%
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(meta.progresso, 100)} 
                            className="h-1.5 bg-violet-500/20"
                          />
                          <p className="text-xs text-muted-foreground">
                            Meta: R$ {meta.valor_alvo.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <Target className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma meta ativa</p>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="text-violet-500 mt-1"
                      onClick={() => navigate("/metas")}
                    >
                      Criar primeira meta
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Alertas */}
          <div className="space-y-4">
            {/* Dívidas Vencidas */}
            <Card className={dividasVencidas.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${dividasVencidas.length > 0 ? "bg-red-500/20" : "bg-muted"}`}>
                    <CreditCard className={`w-4 h-4 ${dividasVencidas.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Dívidas Vencidas</CardTitle>
                    <p className="text-xs text-muted-foreground">{dividasVencidas.length} pendente{dividasVencidas.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-500 h-8" onClick={() => navigate("/dividas")}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardHeader>
              {dividasVencidas.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {dividasVencidas.slice(0, 3).map((divida) => (
                      <div key={divida.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="text-sm truncate">{divida.descricao}</span>
                        </div>
                        <span className="text-sm font-medium text-red-500 whitespace-nowrap ml-2">
                          R$ {Number(divida.valor_restante).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    {dividasVencidas.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total vencido</span>
                          <span className="font-semibold text-red-500">
                            R$ {totalDividasVencidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Estoque Baixo */}
            <Card className={itensEstoqueBaixo.length > 0 ? "border-yellow-500/30 bg-yellow-500/5" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${itensEstoqueBaixo.length > 0 ? "bg-yellow-500/20" : "bg-muted"}`}>
                    <Package className={`w-4 h-4 ${itensEstoqueBaixo.length > 0 ? "text-yellow-600" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Estoque Baixo</CardTitle>
                    <p className="text-xs text-muted-foreground">{itensEstoqueBaixo.length} item{itensEstoqueBaixo.length !== 1 ? "ns" : ""}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-500 h-8" onClick={() => navigate("/mercado")}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardHeader>
              {itensEstoqueBaixo.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {itensEstoqueBaixo.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === "sem_estoque" ? "bg-red-500" : "bg-yellow-500"}`} />
                          <span className="text-sm truncate">{item.descricao}</span>
                        </div>
                        <Badge variant="outline" className={`text-xs shrink-0 ${item.status === "sem_estoque" ? "border-red-500/50 text-red-500" : "border-yellow-500/50 text-yellow-600"}`}>
                          {item.quantidade_atual}/{item.quantidade_ideal}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Veículos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Car className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">Meus Veículos</CardTitle>
                    <p className="text-xs text-muted-foreground">{veiculos.length} cadastrado{veiculos.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-500 h-8" onClick={() => navigate("/veiculos")}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingVeiculos ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : veiculos.length > 0 ? (
                  <div className="space-y-2">
                    {veiculos.slice(0, 3).map((veiculo) => (
                      <div key={veiculo.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="p-2 rounded-lg bg-muted">
                          <Car className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{veiculo.marca} {veiculo.modelo}</p>
                          <p className="text-xs text-muted-foreground">{veiculo.ano} • {veiculo.quilometragem.toLocaleString()} km</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum veículo cadastrado</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
