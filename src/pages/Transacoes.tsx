import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Label } from "@/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  ArrowLeftRight,
  X,
  Receipt,
  Calendar,
  ChevronDown,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";

// Função para formatar data
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

// Função para formatar data relativa
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

// Funções para calcular períodos
const getDataHoje = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const getDataInicioSemana = () => {
  const now = new Date();
  const primeiro = new Date(now);
  primeiro.setDate(now.getDate() - now.getDay());
  return `${primeiro.getFullYear()}-${String(primeiro.getMonth() + 1).padStart(2, "0")}-${String(primeiro.getDate()).padStart(2, "0")}`;
};

const getDataInicioMes = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const getDataInicioAno = () => {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
};

const getDataUltimos30Dias = () => {
  const now = new Date();
  now.setDate(now.getDate() - 30);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const getDataUltimos90Dias = () => {
  const now = new Date();
  now.setDate(now.getDate() - 90);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const Transacoes = () => {
  const { transacoes, loading } = useTransacoes();

  // Filtros básicos
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  
  // Filtros de data
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  
  // Filtros avançados
  const [valorMinimo, setValorMinimo] = useState("");
  const [valorMaximo, setValorMaximo] = useState("");
  const [metodoPagamentoFiltro, setMetodoPagamentoFiltro] = useState("");
  const [contaFiltro, setContaFiltro] = useState("");
  const [tagFiltro, setTagFiltro] = useState("");
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);

  // Dados processados
  const { transacoesFiltradas, transacoesAgrupadas, totalReceitas, totalDespesas, saldoTotal, categorias, estatisticasFiltradas } = useMemo(() => {
    let filtradas = transacoes.filter((t) => {
      // Filtro de texto
      const matchDescricao = t.descricao.toLowerCase().includes(filtro.toLowerCase());
      // Filtro de tipo
      const matchTipo = tipoFiltro === "" || t.tipo === tipoFiltro;
      // Filtro de categoria
      const matchCategoria = categoriaFiltro === "" || t.categorias?.nome === categoriaFiltro;
      
      // Filtro de período predefinido
      let matchPeriodo = true;
      if (periodoFiltro) {
        const dataTransacao = t.data.split("T")[0];
        const hoje = getDataHoje();
        switch (periodoFiltro) {
          case "hoje":
            matchPeriodo = dataTransacao === hoje;
            break;
          case "semana":
            matchPeriodo = dataTransacao >= getDataInicioSemana();
            break;
          case "mes":
            matchPeriodo = dataTransacao >= getDataInicioMes();
            break;
          case "ano":
            matchPeriodo = dataTransacao >= getDataInicioAno();
            break;
          case "30dias":
            matchPeriodo = dataTransacao >= getDataUltimos30Dias();
            break;
          case "90dias":
            matchPeriodo = dataTransacao >= getDataUltimos90Dias();
            break;
        }
      }
      
      // Filtro de data personalizada
      let matchDataPersonalizada = true;
      if (dataInicio || dataFim) {
        const dataTransacao = t.data.split("T")[0];
        if (dataInicio && dataTransacao < dataInicio) matchDataPersonalizada = false;
        if (dataFim && dataTransacao > dataFim) matchDataPersonalizada = false;
      }
      
      // Filtro de valor
      let matchValor = true;
      if (valorMinimo && t.valor < parseFloat(valorMinimo)) matchValor = false;
      if (valorMaximo && t.valor > parseFloat(valorMaximo)) matchValor = false;
      
      // Filtro de método de pagamento
      const matchMetodoPagamento = metodoPagamentoFiltro === "" || t.metodo_pagamento === metodoPagamentoFiltro;
      
      // Filtro de conta
      const matchConta = contaFiltro === "" || t.conta_id === contaFiltro;
      
      // Filtro de tag
      let matchTag = true;
      if (tagFiltro && t.tags) {
        matchTag = t.tags.some(tag => tag.toLowerCase().includes(tagFiltro.toLowerCase()));
      } else if (tagFiltro) {
        matchTag = false;
      }

      return matchDescricao && matchTipo && matchCategoria && matchPeriodo && matchDataPersonalizada && matchValor && matchMetodoPagamento && matchConta && matchTag;
    });

    // Ordenar por data da transação e depois por cadastro como critério de desempate
    filtradas = filtradas.sort((a, b) => {
      const dateDiff = new Date(b.data).getTime() - new Date(a.data).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Agrupar por data da transação
    const grupos: { [key: string]: typeof filtradas } = {};
    filtradas.forEach((t) => {
      const dataKey = formatarDataRelativa(t.data);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(t);
    });

    // Estatísticas gerais (sem filtro)
    const receitas = transacoes.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + t.valor, 0);
    const despesas = transacoes.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + t.valor, 0);
    
    // Estatísticas filtradas
    const receitasFiltradas = filtradas.filter((t) => t.tipo === "receita").reduce((sum, t) => sum + t.valor, 0);
    const despesasFiltradas = filtradas.filter((t) => t.tipo === "despesa").reduce((sum, t) => sum + t.valor, 0);
    
    const cats = [...new Set(transacoes.map((t) => t.categorias?.nome).filter(Boolean))];

    return {
      transacoesFiltradas: filtradas,
      transacoesAgrupadas: grupos,
      totalReceitas: receitas,
      totalDespesas: despesas,
      saldoTotal: receitas - despesas,
      categorias: cats,
      estatisticasFiltradas: {
        receitas: receitasFiltradas,
        despesas: despesasFiltradas,
        saldo: receitasFiltradas - despesasFiltradas,
        total: filtradas.length,
      },
    };
  }, [transacoes, filtro, tipoFiltro, categoriaFiltro, periodoFiltro, dataInicio, dataFim, valorMinimo, valorMaximo, metodoPagamentoFiltro, contaFiltro, tagFiltro]);

  const limparFiltros = () => {
    setFiltro("");
    setTipoFiltro("");
    setCategoriaFiltro("");
    setPeriodoFiltro("");
    setDataInicio("");
    setDataFim("");
    setValorMinimo("");
    setValorMaximo("");
    setMetodoPagamentoFiltro("");
    setContaFiltro("");
    setTagFiltro("");
  };

  const temFiltrosAtivos = filtro !== "" || tipoFiltro !== "" || categoriaFiltro !== "" || periodoFiltro !== "" || dataInicio !== "" || dataFim !== "" || valorMinimo !== "" || valorMaximo !== "" || metodoPagamentoFiltro !== "" || contaFiltro !== "" || tagFiltro !== "";
  
  const getPeriodoLabel = (periodo: string) => {
    const labels: { [key: string]: string } = {
      hoje: "Hoje",
      semana: "Esta semana",
      mes: "Este mês",
      ano: "Este ano",
      "30dias": "Últimos 30 dias",
      "90dias": "Últimos 90 dias",
    };
    return labels[periodo] || periodo;
  };

  // Usar estatísticas filtradas quando há filtros ativos
  const statsToShow = temFiltrosAtivos ? estatisticasFiltradas : {
    receitas: totalReceitas,
    despesas: totalDespesas,
    saldo: saldoTotal,
    total: transacoes.length,
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-3 shadow-lg shadow-violet-500/20">
            <ArrowLeftRight className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transações</h1>
            <p className="text-muted-foreground">Visualização completa de receitas e despesas</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {temFiltrosAtivos ? "Receitas (filtrado)" : "Total Receitas"}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-green-500">
                      R$ {statsToShow.receitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {temFiltrosAtivos ? "Despesas (filtrado)" : "Total Despesas"}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-red-500">
                      R$ {statsToShow.despesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {temFiltrosAtivos ? "Saldo (filtrado)" : "Saldo Total"}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className={`text-2xl font-bold ${statsToShow.saldo >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                      R$ {statsToShow.saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-xl ${statsToShow.saldo >= 0 ? "bg-blue-500/20" : "bg-orange-500/20"}`}>
                  <DollarSign className={`w-5 h-5 ${statsToShow.saldo >= 0 ? "text-blue-500" : "text-orange-500"}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {temFiltrosAtivos ? "Transações (filtrado)" : "Total Transações"}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{statsToShow.total}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Receipt className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Filtros */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Filtros principais */}
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar transações..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Todos os tipos</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Todas as categorias</option>
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={periodoFiltro}
                onChange={(e) => {
                  setPeriodoFiltro(e.target.value);
                  if (e.target.value) {
                    setDataInicio("");
                    setDataFim("");
                  }
                }}
                className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Todos os períodos</option>
                <option value="hoje">Hoje</option>
                <option value="semana">Esta semana</option>
                <option value="mes">Este mês</option>
                <option value="ano">Este ano</option>
                <option value="30dias">Últimos 30 dias</option>
                <option value="90dias">Últimos 90 dias</option>
              </select>
            </div>

            {/* Filtros avançados */}
            <Collapsible open={filtrosAvancadosAbertos} onOpenChange={setFiltrosAvancadosAbertos}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Filtros avançados
                  <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${filtrosAvancadosAbertos ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Data inicial
                    </Label>
                    <Input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => {
                        setDataInicio(e.target.value);
                        if (e.target.value) setPeriodoFiltro("");
                      }}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Data final
                    </Label>
                    <Input
                      type="date"
                      value={dataFim}
                      onChange={(e) => {
                        setDataFim(e.target.value);
                        if (e.target.value) setPeriodoFiltro("");
                      }}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Valor mínimo
                    </Label>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={valorMinimo}
                      onChange={(e) => setValorMinimo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Valor máximo
                    </Label>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={valorMaximo}
                      onChange={(e) => setValorMaximo(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Método de Pagamento</Label>
                    <select
                      value={metodoPagamentoFiltro}
                      onChange={(e) => setMetodoPagamentoFiltro(e.target.value)}
                      className="h-9 w-full px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">Todos</option>
                      <option value="pix">PIX</option>
                      <option value="cartao_credito">Cartão de Crédito</option>
                      <option value="cartao_debito">Cartão de Débito</option>
                      <option value="boleto">Boleto</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="transferencia">Transferência</option>
                      <option value="voucher">Voucher</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Tag</Label>
                    <Input
                      placeholder="Buscar por tag..."
                      value={tagFiltro}
                      onChange={(e) => setTagFiltro(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Filtros ativos */}
            {temFiltrosAtivos && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                {filtro && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    Busca: {filtro}
                    <button onClick={() => setFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {tipoFiltro && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    {tipoFiltro === "receita" ? "Receitas" : "Despesas"}
                    <button onClick={() => setTipoFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {categoriaFiltro && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    {categoriaFiltro}
                    <button onClick={() => setCategoriaFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {periodoFiltro && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-violet-500/20 text-violet-600">
                    <Calendar className="w-3 h-3" />
                    {getPeriodoLabel(periodoFiltro)}
                    <button onClick={() => setPeriodoFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {dataInicio && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-violet-500/20 text-violet-600">
                    De: {formatarData(dataInicio)}
                    <button onClick={() => setDataInicio("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {dataFim && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-violet-500/20 text-violet-600">
                    Até: {formatarData(dataFim)}
                    <button onClick={() => setDataFim("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {valorMinimo && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-blue-500/20 text-blue-600">
                    Min: R$ {parseFloat(valorMinimo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    <button onClick={() => setValorMinimo("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {valorMaximo && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-blue-500/20 text-blue-600">
                    Max: R$ {parseFloat(valorMaximo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    <button onClick={() => setValorMaximo("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {metodoPagamentoFiltro && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-purple-500/20 text-purple-600">
                    {metodoPagamentoFiltro === "pix" && "PIX"}
                    {metodoPagamentoFiltro === "cartao_credito" && "Cartão de Crédito"}
                    {metodoPagamentoFiltro === "cartao_debito" && "Cartão de Débito"}
                    {metodoPagamentoFiltro === "boleto" && "Boleto"}
                    {metodoPagamentoFiltro === "dinheiro" && "Dinheiro"}
                    {metodoPagamentoFiltro === "transferencia" && "Transferência"}
                    {metodoPagamentoFiltro === "voucher" && "Voucher"}
                    <button onClick={() => setMetodoPagamentoFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {tagFiltro && (
                  <Badge variant="secondary" className="text-xs gap-1 bg-orange-500/20 text-orange-600">
                    Tag: {tagFiltro}
                    <button onClick={() => setTagFiltro("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3 mr-1" />
                  Limpar todos
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  {transacoesFiltradas.length} resultado{transacoesFiltradas.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Lista Desktop */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Descrição</TableHead>
                    <TableHead className="font-semibold">Categoria</TableHead>
                    <TableHead className="font-semibold">Tipo</TableHead>
                    <TableHead className="font-semibold">Pagamento</TableHead>
                    <TableHead className="font-semibold">Data</TableHead>
                    <TableHead className="font-semibold text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : transacoesFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        Nenhuma transação encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    transacoesFiltradas.map((transacao) => (
                      <TableRow key={transacao.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${transacao.tipo === "receita" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                              {transacao.tipo === "receita" ? (
                                <ArrowUpRight className="w-4 h-4 text-green-500" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{transacao.descricao}</span>
                              {transacao.tags && transacao.tags.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {transacao.tags.slice(0, 2).map((tag, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {transacao.tags.length > 2 && (
                                    <Badge variant="outline" className="text-xs px-1 py-0">
                                      +{transacao.tags.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {transacao.categorias?.nome || "Sem categoria"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${transacao.tipo === "receita" ? "bg-green-500/20 text-green-600 hover:bg-green-500/30" : "bg-red-500/20 text-red-600 hover:bg-red-500/30"} border-0`}>
                            {transacao.tipo === "receita" ? "Receita" : "Despesa"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {transacao.metodo_pagamento ? (
                            <Badge variant="outline" className="text-xs">
                              {transacao.metodo_pagamento === "pix" && "PIX"}
                              {transacao.metodo_pagamento === "cartao_credito" && "Crédito"}
                              {transacao.metodo_pagamento === "cartao_debito" && "Débito"}
                              {transacao.metodo_pagamento === "boleto" && "Boleto"}
                              {transacao.metodo_pagamento === "dinheiro" && "Dinheiro"}
                              {transacao.metodo_pagamento === "transferencia" && "Transf."}
                              {transacao.metodo_pagamento === "voucher" && "Voucher"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatarData(transacao.data)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${transacao.tipo === "receita" ? "text-green-500" : "text-red-500"}`}>
                            {transacao.tipo === "receita" ? "+" : "-"}R$ {transacao.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Lista Mobile */}
        <div className="md:hidden">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-5 w-20" />
                      </div>
                    ))}
                  </div>
                ) : Object.keys(transacoesAgrupadas).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Wallet className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma transação encontrada</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(transacoesAgrupadas).map(([data, items]) => (
                      <div key={data}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{data}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="space-y-2">
                          {items.map((transacao) => (
                            <div key={transacao.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                              <div className={`p-2 rounded-lg shrink-0 ${transacao.tipo === "receita" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                                {transacao.tipo === "receita" ? (
                                  <ArrowUpRight className="w-4 h-4 text-green-500" />
                                ) : (
                                  <ArrowDownRight className="w-4 h-4 text-red-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 space-y-2">
                                <p className="font-medium text-foreground truncate">{transacao.descricao}</p>
                                <div className="flex flex-col gap-2">
                                  <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0 w-fit">
                                    {transacao.categorias?.nome || "Sem categoria"}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{formatarData(transacao.data)}</span>
                                </div>
                                <div className={`font-semibold ${transacao.tipo === "receita" ? "text-green-500" : "text-red-500"}`}>
                                  {transacao.tipo === "receita" ? "+" : "-"}R$ {transacao.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Transacoes;
