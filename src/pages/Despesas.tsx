import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import {
  Plus,
  Search,
  TrendingDown,
  DollarSign,
  Edit,
  Trash2,
  ArrowDownRight,
  Wallet,
  Tag,
  X,
  Receipt,
  CalendarDays,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useDespesas, Despesa } from "@/domains/finance/hooks/useDespesas";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useCategorizacaoIA } from "@/domains/finance/hooks/useCategorizacaoIA";
import { useSubcategorias } from "@/domains/finance/hooks/useSubcategorias";
import { useCentrosCusto } from "@/domains/finance/hooks/useCentrosCusto";
import { useContatos } from "@/domains/finance/hooks/useContatos";
import { DateRangePicker, useDateRangeFilter } from "@/shared/components/DateRangePicker";

import { PaymentMethodSelector } from "@/domains/finance/components/PaymentMethodSelector";
import { AccountSelector } from "@/domains/finance/components/AccountSelector";
import { TagsInput } from "@/domains/finance/components/TagsInput";
import { AttachmentUploader } from "@/domains/finance/components/AttachmentUploader";
import { PaymentMethod, AnexoTransacao } from "@/domains/finance/types";

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

const formatarMetodoPagamento = (metodo?: string | null) => {
  if (!metodo) return null;
  const map: { [key: string]: string } = {
    pix: "Pix",
    boleto: "Boleto",
    cartao_credito: "Cartão Crédito",
    cartao_debito: "Cartão Débito",
    dinheiro: "Dinheiro",
    transferencia: "Transferência",
    voucher: "Voucher",
  };
  return map[metodo] || metodo;
};

const Despesas = () => {
  const { toast } = useToast();
  const { categoriasDespesa } = useCategorias();

  // ── Filtro de data ────────────────────────────────────────────
  const { dateRange, setRange, clearFilter } = useDateRangeFilter();

  const { despesas, loading, createDespesa, updateDespesa, deleteDespesa } = useDespesas({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Get today's local date range (YYYY-MM-DD)
  const hojeLocal = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const { dividas: todasDividas, loading: loadingDividas } = useDividas({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // v3.1: subcategorias, centros de custo e fornecedores
  const { subcategorias } = useSubcategorias();
  const { centrosCusto } = useCentrosCusto();
  const { contatos } = useContatos();
  const fornecedores = contatos.filter((c) => c.tipo === "fornecedor");

  const [activeTab, setActiveTab] = useState("lista");

  const [novaDespesa, setNovaDespesa] = useState({
    id: null as string | null,
    descricao: "",
    valor: "",
    categoria: "",
    data: "",
    tipo: "variavel" as "fixa" | "variavel",
    metodo_pagamento: null as PaymentMethod | null,
    conta_id: null as string | null,
    subcategoria_id: null as string | null,
    centro_custo_id: null as string | null,
    contato_id: null as string | null,
    observacoes: "",
    tags: [] as string[],
  });
  const [tempAttachments, setTempAttachments] = useState<AnexoTransacao[]>([]);
  const [modoEdicao, setModoEdicao] = useState(false);

  const [filtro, setFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const { mutate: categorizarIA } = useCategorizacaoIA();

  const handleDescricaoBlur = () => {
    const desc = novaDespesa.descricao;
    const val = parseFloat(novaDespesa.valor) || 0;
    if (desc.length > 3) {
      categorizarIA({ descricao: desc, valor: val, tipo: "despesa" }, {
        onSuccess: (result) => {
          if (result && result.confianca > 0.85 && result.categoria) {
            const match = categoriasDespesa.find((c) => c.nome.toLowerCase().includes(result.categoria.toLowerCase()));
            if (match) {
              setNovaDespesa((prev) => ({ ...prev, categoria: match.id }));
              toast({ title: `Categorizado com IA: ${match.nome}` });
            }
          }
        },
      });
    }
  };

  const salvarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novaDespesa.descricao || !novaDespesa.valor || !novaDespesa.categoria || !novaDespesa.data) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    const categoria = categoriasDespesa.find((c) => c.id === novaDespesa.categoria || c.nome === novaDespesa.categoria);

    if (modoEdicao && novaDespesa.id) {
      // Atualizar despesa existente
      await updateDespesa(novaDespesa.id, {
        descricao: novaDespesa.descricao,
        valor: parseFloat(novaDespesa.valor),
        categoria_id: categoria?.id,
        data: novaDespesa.data,
        metodo_pagamento: novaDespesa.metodo_pagamento,
        conta_id: novaDespesa.conta_id,
        subcategoria_id: novaDespesa.subcategoria_id,
        centro_custo_id: novaDespesa.centro_custo_id,
        contato_id: novaDespesa.contato_id,
        observacoes: novaDespesa.observacoes || null,
      });

      toast({
        title: "Sucesso!",
        description: "Despesa atualizada com sucesso",
      });
    } else {
      // Criar nova despesa
      await createDespesa({
        descricao: novaDespesa.descricao,
        valor: parseFloat(novaDespesa.valor),
        categoria_id: categoria?.id,
        data: novaDespesa.data,
        metodo_pagamento: novaDespesa.metodo_pagamento,
        conta_id: novaDespesa.conta_id,
        subcategoria_id: novaDespesa.subcategoria_id,
        centro_custo_id: novaDespesa.centro_custo_id,
        contato_id: novaDespesa.contato_id,
        observacoes: novaDespesa.observacoes || null,
      });

      toast({
        title: "Sucesso!",
        description: "Despesa criada com sucesso",
      });
    }

    // Limpar formulário
    setNovaDespesa({
      id: null,
      descricao: "",
      valor: "",
      categoria: "",
      data: "",
      tipo: "variavel",
      metodo_pagamento: null,
      conta_id: null,
      subcategoria_id: null,
      centro_custo_id: null,
      contato_id: null,
      observacoes: "",
      tags: [],
    });
    setTempAttachments([]);
    setModoEdicao(false);
    setActiveTab("lista");
  };

  const handleEditarDespesa = (despesa: { id: string; descricao: string; valor: number; data: string; categoria_id?: string | null; categorias?: { nome: string }; metodo_pagamento?: PaymentMethod | null; conta_id?: string | null; observacoes?: string | null; tags?: Array<string | { id: string; nome: string; cor?: string }> }) => {
    // Preencher formulário com dados da despesa
    setNovaDespesa({
      id: despesa.id,
      descricao: despesa.descricao,
      valor: despesa.valor.toString(),
      categoria: despesa.categoria_id || "",
      data: despesa.data,
      tipo: "variavel",
      metodo_pagamento: despesa.metodo_pagamento || null,
      conta_id: despesa.conta_id || null,
      subcategoria_id: (despesa as { subcategoria_id?: string | null }).subcategoria_id || null,
      centro_custo_id: (despesa as { centro_custo_id?: string | null }).centro_custo_id || null,
      contato_id: (despesa as { contato_id?: string | null }).contato_id || null,
      observacoes: despesa.observacoes || "",
      tags: (despesa.tags ?? []).map((t) => (typeof t === 'string' ? t : t.nome)),
    });
    setModoEdicao(true);
    setActiveTab("adicionar");
  };

  const handleCancelarEdicao = () => {
    setNovaDespesa({
      id: null,
      descricao: "",
      valor: "",
      categoria: "",
      data: "",
      tipo: "variavel",
      metodo_pagamento: null,
      conta_id: null,
      subcategoria_id: null,
      centro_custo_id: null,
      contato_id: null,
      observacoes: "",
      tags: [],
    });
    setTempAttachments([]);
    setModoEdicao(false);
    setActiveTab("lista");
  };

  const handleExcluirDespesa = async (id: string) => {
    await deleteDespesa(id);
  };

  // Dados processados
  const { 
    despesasFiltradas, 
    despesasAgrupadas, 
    totalDespesas, 
    mediaMensal,
    categoriaList,
    dailyData,
    totalFiltrado,
    totalDespesasDeHoje,
    previstoParaPagar,
    metodoList
  } = useMemo(() => {
    const filtradas = despesas
      .filter((despesa) => {
        const matchDescricao = despesa.descricao.toLowerCase().includes(filtro.toLowerCase());
        const matchCategoria = categoriaFiltro === "" || despesa.categorias?.nome === categoriaFiltro;
        return matchDescricao && matchCategoria;
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.data).getTime() - new Date(a.data).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    // Agrupar por data da transação
    const grupos: { [key: string]: typeof filtradas } = {};
    filtradas.forEach((d) => {
      const dataKey = formatarDataRelativa(d.data);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(d);
    });

    const total = despesas.reduce((sum, d) => sum + d.valor, 0);
    const media = despesas.length > 0 ? total / Math.max(1, new Set(despesas.map(d => d.data.substring(0, 7))).size) : 0;

    const totalFiltrado = filtradas.reduce((sum, d) => sum + d.valor, 0);

    // Despesas de Hoje
    const totalDespesasDeHoje = despesas
      .filter((d) => d.data === hojeLocal)
      .reduce((sum, d) => sum + (d.valor || 0), 0);

    // Previsto para pagar (dívidas em aberto no período filtrado)
    const previstoParaPagar = (todasDividas ?? [])
      .filter((d) => d.status !== "quitada")
      .reduce((sum, d) => sum + (d.valor_restante || 0), 0);

    // 1. Distribuição por Categoria
    const cores = [
      "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
      "bg-lime-500", "bg-emerald-500", "bg-cyan-500", "bg-sky-500",
      "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500"
    ];
    const categoriaStats: { [key: string]: { label: string, valor: number, cor: string } } = {};
    let corIndex = 0;

    filtradas.forEach((d) => {
      const catNome = d.categorias?.nome?.trim() || "Sem Categoria";
      if (!categoriaStats[catNome]) {
        categoriaStats[catNome] = {
          label: catNome,
          valor: 0,
          cor: cores[corIndex % cores.length]
        };
        corIndex++;
      }
      categoriaStats[catNome].valor += d.valor;
    });

    const rawCategoriaList = Object.values(categoriaStats)
      .map((item) => {
        const porcentagem = totalFiltrado > 0 ? (item.valor / totalFiltrado) * 100 : 0;
        return { ...item, porcentagem };
      })
      .sort((a, b) => b.valor - a.valor);

    const limit = 5;
    const categoriaList = rawCategoriaList.length > limit 
      ? [
          ...rawCategoriaList.slice(0, limit - 1),
          {
            label: "Outras",
            valor: rawCategoriaList.slice(limit - 1).reduce((sum, c) => sum + c.valor, 0),
            porcentagem: rawCategoriaList.slice(limit - 1).reduce((sum, c) => sum + c.porcentagem, 0),
            cor: "bg-slate-400"
          }
        ]
      : rawCategoriaList;

    // 2. Distribuição por Meio de Pagamento
    const metodoStats = {
      pix: { label: "PIX", valor: 0, cor: "bg-emerald-500" },
      boleto: { label: "BOLETO", valor: 0, cor: "bg-blue-500" },
      credito: { label: "CARTÃO CRÉDITO", valor: 0, cor: "bg-purple-500" },
      debito: { label: "CARTÃO DÉBITO", valor: 0, cor: "bg-cyan-500" },
      dinheiro: { label: "DINHEIRO", valor: 0, cor: "bg-amber-500" },
      outros: { label: "OUTROS", valor: 0, cor: "bg-slate-500" },
    };

    filtradas.forEach((d) => {
      const metodo = String(d.metodo_pagamento ?? "").toLowerCase();
      if (metodo === "pix") {
        metodoStats.pix.valor += d.valor;
      } else if (metodo === "boleto") {
        metodoStats.boleto.valor += d.valor;
      } else if (metodo === "cartao_credito") {
        metodoStats.credito.valor += d.valor;
      } else if (metodo === "cartao_debito") {
        metodoStats.debito.valor += d.valor;
      } else if (metodo === "dinheiro" || metodo === "especie" || metodo === "cash") {
        metodoStats.dinheiro.valor += d.valor;
      } else {
        metodoStats.outros.valor += d.valor;
      }
    });

    const metodoList = Object.values(metodoStats)
      .map((item) => {
        const porcentagem = totalFiltrado > 0 ? (item.valor / totalFiltrado) * 100 : 0;
        return { ...item, porcentagem };
      })
      .sort((a, b) => b.valor - a.valor);

    // 3. Fluxo por dia
    const dailyMap = new Map<string, number>();
    filtradas.forEach((d) => {
      const dateStr = d.data.split("T")[0]; // YYYY-MM-DD
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + d.valor);
    });

    const dailyData = Array.from(dailyMap.entries())
      .map(([date, total]) => {
        const [ano, mes, dia] = date.split("-");
        return {
          dateStr: `${dia}/${mes}`,
          rawDate: date,
          total
        };
      })
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
      .slice(-30);

    return { 
      despesasFiltradas: filtradas, 
      despesasAgrupadas: grupos, 
      totalDespesas: total, 
      mediaMensal: media,
      categoriaList,
      dailyData,
      totalFiltrado,
      totalDespesasDeHoje,
      previstoParaPagar,
      metodoList
    };
  }, [despesas, todasDividas, filtro, categoriaFiltro, hojeLocal]);

  // Agrupar apenas as despesas visíveis para a lista mobile
  const despesasAgrupadasVisiveis = useMemo(() => {
    const grupos: { [key: string]: Despesa[] } = {};
    despesasFiltradas.slice(0, visibleCount).forEach((d) => {
      const dataKey = formatarDataRelativa(d.data);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(d);
    });
    return grupos;
  }, [despesasFiltradas, visibleCount]);

  const limparFiltros = () => {
    setFiltro("");
    setCategoriaFiltro("");
  };

  const temFiltrosAtivos = filtro !== "" || categoriaFiltro !== "";

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-3 shadow-lg shadow-red-500/20">
              <ArrowDownRight className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Despesas</h1>
              <p className="text-muted-foreground">Gerencie seus gastos e despesas</p>
            </div>
          </div>
          <Button onClick={() => setActiveTab("adicionar")} className="bg-red-500 hover:bg-red-600">
            <Plus className="w-4 h-4 mr-2" />
            Nova Despesa
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card: Despesas do Dia */}
          <Card className="border-0 bg-gradient-to-br from-rose-500/10 to-rose-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Despesas do Dia</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalDespesasDeHoje)}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-rose-500/20">
                  <CalendarDays className="w-5 h-5 text-rose-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Valor Pago */}
          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {temFiltrosAtivos ? "Valor Filtrado" : "Valor Pago"}
                  </p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                        temFiltrosAtivos ? totalFiltrado : totalDespesas
                      )}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <DollarSign className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Previsto para Pagar */}
          <Card className="border-0 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Previsto a Pagar</p>
                  {loadingDividas ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(previstoParaPagar)}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <Receipt className="w-5 h-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Média Mensal */}
          <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Média Mensal</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(mediaMensal)}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-orange-500/20">
                  <TrendingDown className="w-5 h-5 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Total Registros */}
          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Registros</p>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{despesas.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Receipt className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Categorias */}
          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Categorias</p>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{categoriasDespesa.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <Tag className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="lista" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
              Lista de Despesas
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
              Adicionar Despesa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Filtro por data */}
                  <DateRangePicker
                    value={dateRange}
                    onChange={setRange}
                    onClear={clearFilter}
                    placeholder="Filtrar por data"
                  />
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Buscar despesas..."
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <select
                    value={categoriaFiltro}
                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Todas as categorias</option>
                    {categoriasDespesa.map((cat) => (
                      <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                    ))}
                  </select>
                  {temFiltrosAtivos && (
                    <Button variant="outline" size="sm" onClick={limparFiltros} className="h-10">
                      <X className="w-4 h-4 mr-1" />
                      Limpar
                    </Button>
                  )}
                </div>
                {temFiltrosAtivos && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                    {filtro && (
                      <Badge variant="secondary" className="text-xs">
                        Busca: {filtro}
                        <button onClick={() => setFiltro("")} className="ml-1 hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                    {categoriaFiltro && (
                      <Badge variant="secondary" className="text-xs">
                        {categoriaFiltro}
                        <button onClick={() => setCategoriaFiltro("")} className="ml-1 hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                      {despesasFiltradas.length} resultado{despesasFiltradas.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance de despesas da operação Dashboard */}
            <Card className="border border-border/50 bg-card overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                  <TrendingDown className="w-4.5 h-4.5 text-red-500" />
                  Análise e distribuição de despesas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Distribuição por Categoria */}
                  <div className="lg:col-span-4 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Distribuição por Categoria</h4>
                      {totalFiltrado === 0 ? (
                        <div className="h-[200px] flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                          Sem despesas no período
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          {categoriaList.slice(0, 5).map((item) => (
                            <div key={item.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs sm:text-sm">
                                <span className="font-medium text-foreground">{item.label}</span>
                                <div className="space-x-2 text-right">
                                  <span className="font-semibold text-foreground">
                                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({item.porcentagem.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${item.cor}`}
                                  style={{ width: `${item.porcentagem}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Distribuição por Meio de Pagamento */}
                  <div className="lg:col-span-4 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Meios de Pagamento</h4>
                      {totalFiltrado === 0 ? (
                        <div className="h-[200px] flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                          Sem transações no período
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          {metodoList.map((item) => (
                            <div key={item.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs sm:text-sm">
                                <span className="font-medium text-foreground">{item.label}</span>
                                <div className="space-x-2 text-right">
                                  <span className="font-semibold text-foreground">
                                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({item.porcentagem.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>
                              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${item.cor}`}
                                  style={{ width: `${item.porcentagem}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gráfico por Dia */}
                  <div className="lg:col-span-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Histórico de Gastos por Dia</h4>
                      <div className="h-[200px] w-full">
                        {totalFiltrado === 0 ? (
                          <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                            Sem dados de gastos no período
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                              <defs>
                                <linearGradient id="colorDespesasDays" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
                              <XAxis
                                dataKey="dateStr"
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => `R$ ${v}`}
                                tickLine={false}
                                axisLine={false}
                                width={55}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "hsl(var(--background))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "8px",
                                  color: "hsl(var(--foreground))",
                                  fontSize: "12px",
                                }}
                                formatter={(value: number) => [
                                  `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}`,
                                  "Despesa",
                                ]}
                                labelStyle={{ fontWeight: "bold" }}
                              />
                              <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#ef4444"
                                fill="url(#colorDespesasDays)"
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumo rápido acima da lista */}
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                {despesasFiltradas.length} despesa{despesasFiltradas.length !== 1 ? "s" : ""} encontrada{despesasFiltradas.length !== 1 ? "s" : ""}
                {totalFiltrado > 0 && (
                  <span className="ml-1 font-semibold text-foreground">
                    · Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalFiltrado)}
                  </span>
                )}
              </p>
            </div>

            {loading ? (
              <Card>
                <CardContent className="p-4 space-y-4">
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
                </CardContent>
              </Card>
            ) : despesasFiltradas.length === 0 ? (
              <div className="text-center py-12 space-y-4 bg-card border border-border rounded-xl">
                <Wallet className="w-12 h-12 mx-auto text-muted-foreground/30" />
                <div>
                  <p className="text-lg font-semibold text-foreground">Nenhuma despesa encontrada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {temFiltrosAtivos 
                      ? "Tente ajustar os filtros de data ou categoria."
                      : "Cadastre sua primeira despesa para começar a acompanhar seus gastos."}
                  </p>
                </div>
                {!temFiltrosAtivos && (
                  <Button onClick={() => setActiveTab("adicionar")} className="bg-red-500 hover:bg-red-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Primeira Despesa
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Lista Desktop */}
                <div className="hidden md:block">
                  <Card>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[420px]">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="font-semibold">Descrição</TableHead>
                              <TableHead className="font-semibold">Categoria</TableHead>
                              <TableHead className="font-semibold">Método</TableHead>
                              <TableHead className="font-semibold">Data</TableHead>
                              <TableHead className="font-semibold text-right">Valor</TableHead>
                              <TableHead className="font-semibold text-center w-24">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {despesasFiltradas.map((despesa) => (
                              <TableRow key={despesa.id} className="group">
                                <TableCell>
                                  <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-red-500/10 shrink-0 mt-0.5">
                                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-medium">{despesa.descricao}</span>
                                      {despesa.observacoes && (
                                        <p className="text-xs text-muted-foreground italic line-clamp-1">{despesa.observacoes}</p>
                                      )}
                                      {despesa.tags && despesa.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {despesa.tags.map((tag) => (
                                            <span
                                              key={tag.id}
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                                              style={{ backgroundColor: tag.cor ? `${tag.cor}20` : '#6b728020', color: tag.cor || '#6b7280' }}
                                            >
                                              {tag.nome}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="font-normal">
                                    {despesa.categorias?.nome || "Sem categoria"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {despesa.metodo_pagamento ? (
                                    <Badge variant="outline" className="font-normal text-xs bg-muted/20 border-muted">
                                      {formatarMetodoPagamento(despesa.metodo_pagamento)}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {formatarData(despesa.data)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-semibold text-red-500">
                                    -R$ {despesa.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditarDespesa(despesa)}
                                      className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Tem certeza que deseja excluir a despesa "{despesa.descricao}"? Esta ação não pode ser desfeita.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleExcluirDespesa(despesa.id)} className="bg-red-500 hover:bg-red-600">
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Lista Mobile - Agrupada por data */}
                <div className="md:hidden">
                  <Card>
                    <CardContent className="p-4">
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-6">
                          {Object.entries(despesasAgrupadasVisiveis).map(([data, items]) => (
                            <div key={data}>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{data}</span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                              <div className="space-y-2">
                                {items.map((despesa) => (
                                  <div key={despesa.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                                    <div className="p-2 rounded-lg bg-red-500/10 shrink-0">
                                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                      <p className="font-medium text-foreground truncate">{despesa.descricao}</p>
                                      {despesa.observacoes && (
                                        <p className="text-xs text-muted-foreground italic line-clamp-2">{despesa.observacoes}</p>
                                      )}
                                      {despesa.tags && despesa.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {despesa.tags.map((tag) => (
                                            <span
                                              key={tag.id}
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                                              style={{ backgroundColor: tag.cor ? `${tag.cor}20` : '#6b728020', color: tag.cor || '#6b7280' }}
                                            >
                                              {tag.nome}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex flex-col gap-2">
                                        <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0 w-fit">
                                          {despesa.categorias?.nome || "Sem categoria"}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">{formatarData(despesa.data)}</span>
                                      </div>
                                      <div className="font-semibold text-red-500">
                                        -R$ {despesa.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEditarDespesa(despesa)}
                                          className="h-11 w-11 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-11 w-11 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Tem certeza que deseja excluir "{despesa.descricao}"?
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleExcluirDespesa(despesa.id)} className="bg-red-500">
                                                Excluir
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        {visibleCount < despesasFiltradas.length && (
                          <Button
                            variant="outline"
                            className="w-full mt-4"
                            onClick={() => setVisibleCount((prev) => prev + 20)}
                          >
                            Carregar mais ({despesasFiltradas.length - visibleCount} restantes)
                          </Button>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}


          </TabsContent>


          <TabsContent value="adicionar">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {modoEdicao ? (
                    <>
                      <Edit className="w-5 h-5 text-blue-500" />
                      Editar Despesa
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 text-red-500" />
                      Nova Despesa
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={salvarDespesa} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="descricao">Descrição *</Label>
                      <Input
                        id="descricao"
                        placeholder="Ex: Aluguel, Supermercado, Conta de Luz..."
                        value={novaDespesa.descricao}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, descricao: e.target.value })}
                        onBlur={handleDescricaoBlur}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="valor">Valor *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <Input
                          id="valor"
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={novaDespesa.valor}
                          onChange={(e) => setNovaDespesa({ ...novaDespesa, valor: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="categoria">Categoria *</Label>
                      <select
                        id="categoria"
                        value={novaDespesa.categoria}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, categoria: e.target.value })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Selecione uma categoria</option>
                        {categoriasDespesa.map((cat) => (
                          <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subcategoria">Subcategoria</Label>
                      <select
                        id="subcategoria"
                        value={novaDespesa.subcategoria_id || ""}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, subcategoria_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Nenhuma</option>
                        {subcategorias
                          .filter((s) => {
                            const catId = categoriasDespesa.find((c) => c.nome === novaDespesa.categoria)?.id;
                            return !catId || !s.categoria_id || s.categoria_id === catId;
                          })
                          .map((s) => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="data">Data *</Label>
                      <Input
                        id="data"
                        type="date"
                        value={novaDespesa.data}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, data: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Tipo de Despesa</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="tipo"
                            value="fixa"
                            checked={novaDespesa.tipo === "fixa"}
                            onChange={(e) => setNovaDespesa({ ...novaDespesa, tipo: e.target.value as "fixa" | "variavel" })}
                            className="w-4 h-4 text-red-500 focus:ring-red-500"
                          />
                          <span className="text-sm">Despesa Fixa</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="tipo"
                            value="variavel"
                            checked={novaDespesa.tipo === "variavel"}
                            onChange={(e) => setNovaDespesa({ ...novaDespesa, tipo: e.target.value as "fixa" | "variavel" })}
                            className="w-4 h-4 text-red-500 focus:ring-red-500"
                          />
                          <span className="text-sm">Despesa Variável</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="metodo_pagamento">Método de Pagamento</Label>
                      <PaymentMethodSelector
                        value={novaDespesa.metodo_pagamento}
                        onChange={(method) => setNovaDespesa({ ...novaDespesa, metodo_pagamento: method })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="conta">Conta</Label>
                      <AccountSelector
                        value={novaDespesa.conta_id}
                        onChange={(accountId) => setNovaDespesa({ ...novaDespesa, conta_id: accountId })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="centro_custo">Centro de Custo</Label>
                      <select
                        id="centro_custo"
                        value={novaDespesa.centro_custo_id || ""}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, centro_custo_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Nenhum</option>
                        {centrosCusto.filter((c) => c.ativo).map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fornecedor">Fornecedor</Label>
                      <select
                        id="fornecedor"
                        value={novaDespesa.contato_id || ""}
                        onChange={(e) => setNovaDespesa({ ...novaDespesa, contato_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Nenhum</option>
                        {fornecedores.map((f) => (
                          <option key={f.id} value={f.id}>{f.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="observacoes">Observações</Label>
                      <Textarea
                        id="observacoes"
                        value={novaDespesa.observacoes}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.length <= 500) {
                            setNovaDespesa({ ...novaDespesa, observacoes: value });
                          }
                        }}
                        placeholder="Adicione observações sobre esta despesa..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {novaDespesa.observacoes.length}/500 caracteres
                      </p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tags">Tags</Label>
                      <TagsInput
                        value={novaDespesa.tags}
                        onChange={(tags) => setNovaDespesa({ ...novaDespesa, tags })}
                        placeholder="Digite uma tag e pressione Enter"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Anexos</Label>
                      <AttachmentUploader
                        transacaoId={novaDespesa.id}
                        transacaoTipo="despesa"
                        attachments={tempAttachments}
                        onUploadSuccess={(anexo) => setTempAttachments(prev => [...prev, anexo])}
                        onDeleteSuccess={(anexoId) => setTempAttachments(prev => prev.filter(a => a.id !== anexoId))}
                      />
                      {!novaDespesa.id && (
                        <p className="text-xs text-muted-foreground">
                          Os anexos serão salvos após criar a despesa
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button type="button" variant="outline" onClick={handleCancelarEdicao}>
                      Cancelar
                    </Button>
                    <Button type="submit" className={modoEdicao ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"}>
                      {modoEdicao ? (
                        <>
                          <Edit className="w-4 h-4 mr-2" />
                          Salvar Alterações
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar Despesa
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Despesas;
