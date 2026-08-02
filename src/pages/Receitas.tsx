import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import {
  Plus,
  Search,
  TrendingUp,
  DollarSign,
  Edit,
  Trash2,
  ArrowUpRight,
  Wallet,
  Tag,
  X,
  CalendarDays,
  Smartphone,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Ticket,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
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

// Mapa de método de pagamento → rótulo e ícone (reutiliza os do PaymentMethodSelector)
const PAYMENT_METHOD_INFO: Record<string, { label: string; icon: typeof Smartphone }> = {
  pix: { label: "PIX", icon: Smartphone },
  cartao_credito: { label: "Cartão de Crédito", icon: CreditCard },
  cartao_debito: { label: "Cartão de Débito", icon: CreditCard },
  boleto: { label: "Boleto", icon: Banknote },
  dinheiro: { label: "Dinheiro", icon: Wallet },
  transferencia: { label: "Transferência", icon: ArrowRightLeft },
  voucher: { label: "Voucher", icon: Ticket },
};

const getPaymentMethodInfo = (method: string | null | undefined) => {
  if (!method) return null;
  return PAYMENT_METHOD_INFO[method] || null;
};

const Receitas = () => {
  const { toast } = useToast();
  const { categoriasReceita } = useCategorias();

  // ── Filtro de data
  const { dateRange, setRange, clearFilter } = useDateRangeFilter({ defaultPeriod: 'today' });

  const { receitas, loading, createReceita, updateReceita, deleteReceita, getReceitaTags } = useReceitas({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // v3.1: subcategorias, centros de custo e clientes
  const { subcategorias } = useSubcategorias();
  const { centrosCusto } = useCentrosCusto();
  const { contatos } = useContatos();
  const clientes = contatos.filter((c) => c.tipo === "cliente");

  const [activeTab, setActiveTab] = useState("lista");

  const [novaReceita, setNovaReceita] = useState({
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
  const { mutate: categorizarIA } = useCategorizacaoIA();

  const handleDescricaoBlur = () => {
    const desc = novaReceita.descricao;
    const val = parseFloat(novaReceita.valor) || 0;
    if (desc.length > 3) {
      categorizarIA({ descricao: desc, valor: val, tipo: "receita" }, {
        onSuccess: (result) => {
          if (result && result.confianca > 0.85 && result.categoria) {
            const match = categorias.find((c) => c.nome.toLowerCase().includes(result.categoria.toLowerCase()));
            if (match) {
              setNovaReceita((prev) => ({ ...prev, categoria: match.id }));
              toast({ title: `Categorizado com IA: ${match.nome}` });
            }
          }
        },
      });
    }
  };
  const [visibleCount, setVisibleCount] = useState(100);

  const salvarReceita = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novaReceita.descricao || !novaReceita.valor || !novaReceita.categoria || !novaReceita.data) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    const categoria = categoriasReceita.find((c) => c.nome === novaReceita.categoria);

    if (modoEdicao && novaReceita.id) {
      // Atualizar receita existente
      await updateReceita(novaReceita.id, {
        descricao: novaReceita.descricao,
        valor: parseFloat(novaReceita.valor),
        categoria_id: categoria?.id,
        data: novaReceita.data,
        metodo_pagamento: novaReceita.metodo_pagamento,
        conta_id: novaReceita.conta_id,
        subcategoria_id: novaReceita.subcategoria_id,
        centro_custo_id: novaReceita.centro_custo_id,
        contato_id: novaReceita.contato_id,
        observacoes: novaReceita.observacoes || null,
      });

      toast({
        title: "Sucesso!",
        description: "Receita atualizada com sucesso",
      });
    } else {
      // Criar nova receita
      await createReceita({
        descricao: novaReceita.descricao,
        valor: parseFloat(novaReceita.valor),
        categoria_id: categoria?.id,
        data: novaReceita.data,
        metodo_pagamento: novaReceita.metodo_pagamento,
        conta_id: novaReceita.conta_id,
        subcategoria_id: novaReceita.subcategoria_id,
        centro_custo_id: novaReceita.centro_custo_id,
        contato_id: novaReceita.contato_id,
        observacoes: novaReceita.observacoes || null,
      });

      toast({
        title: "Sucesso!",
        description: "Receita criada com sucesso",
      });
    }

    // Limpar formulário
    setNovaReceita({
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

  const handleEditarReceita = async (receita: { id: string; descricao: string; valor: number; data: string; categorias?: { nome: string }; metodo_pagamento?: PaymentMethod | null; conta_id?: string | null; observacoes?: string | null; tags?: Array<string | { id: string; nome: string; cor?: string }> }) => {
    // Load tags lazily (not included in the list fetch for performance)
    let tags: string[] = [];
    try {
      tags = await getReceitaTags(receita.id);
    } catch {
      tags = [];
    }
    // Preencher formulário com dados da receita
    setNovaReceita({
      id: receita.id,
      descricao: receita.descricao,
      valor: receita.valor.toString(),
      categoria: receita.categorias?.nome || "",
      data: receita.data,
      tipo: "variavel",
      metodo_pagamento: receita.metodo_pagamento || null,
      conta_id: receita.conta_id || null,
      subcategoria_id: (receita as { subcategoria_id?: string | null }).subcategoria_id || null,
      centro_custo_id: (receita as { centro_custo_id?: string | null }).centro_custo_id || null,
      contato_id: (receita as { contato_id?: string | null }).contato_id || null,
      observacoes: receita.observacoes || "",
      tags,
    });
    setModoEdicao(true);
    setActiveTab("adicionar");
  };

  const handleCancelarEdicao = () => {
    setNovaReceita({
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

  const handleExcluirReceita = async (id: string) => {
    await deleteReceita(id);
  };

  // Dados processados
  const { 
    receitasFiltradas, 
    receitasAgrupadas, 
    totalReceitas, 
    mediaMensal, 
    totalReceitasDoDia,
    metodoList,
    hourlyData,
    totalFiltrado 
  } = useMemo(() => {
    const filtradas = receitas
      .filter((receita) => {
        const matchDescricao = receita.descricao.toLowerCase().includes(filtro.toLowerCase());
        const matchCategoria = categoriaFiltro === "" || receita.categorias?.nome === categoriaFiltro;
        return matchDescricao && matchCategoria;
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.data).getTime() - new Date(a.data).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    // Agrupar por data da transação (apenas para os itens visíveis no mobile)
    const grupos: { [key: string]: typeof filtradas } = {};
    filtradas.slice(0, visibleCount).forEach((r) => {
      const dataKey = formatarDataRelativa(r.data);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(r);
    });

    const total = receitas.reduce((sum, r) => sum + r.valor, 0);
    const media = receitas.length > 0 ? total / Math.max(1, new Set(receitas.map(r => r.data.substring(0, 7))).size) : 0;

    // Receitas do dia (comparação por data local, ignorando fuso horário)
    // O Supabase retorna a data como YYYY-MM-DD; new Date('YYYY-MM-DD') vira
    // UTC meia-noite, o que no Brasil (GMT-3) desloca um dia. Compensamos
    // usando meio-dia local (igual a formatarDataRelativa) antes de comparar.
    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);
    const hojeStr = hoje.toISOString().split("T")[0]; // YYYY-MM-DD local
    const receitasDoDia = receitas.filter((r) => {
      const dataStr = new Date(r.data.split("T")[0] + "T12:00:00").toISOString().split("T")[0];
      return dataStr === hojeStr;
    });
    const totalReceitasDoDia = receitasDoDia.reduce((sum, r) => sum + r.valor, 0);

    // 1. Meios de Pagamento breakdown (using filtered revenues)
    const totalFiltrado = filtradas.reduce((sum, r) => sum + r.valor, 0);
    const metodoStats = {
      debito: { label: "DÉBITO", valor: 0, cor: "bg-blue-500", textCor: "text-blue-500" },
      pix: { label: "PIX", valor: 0, cor: "bg-emerald-500", textCor: "text-emerald-500" },
      dinheiro: { label: "DINHEIRO", valor: 0, cor: "bg-amber-500", textCor: "text-amber-500" },
      credito: { label: "CRÉDITO", valor: 0, cor: "bg-purple-500", textCor: "text-purple-500" },
      outros: { label: "OUTROS", valor: 0, cor: "bg-slate-500", textCor: "text-slate-500" },
    };

    filtradas.forEach((r) => {
      const metodo = r.metodo_pagamento;
      if (metodo === "cartao_debito") {
        metodoStats.debito.valor += r.valor;
      } else if (metodo === "pix") {
        metodoStats.pix.valor += r.valor;
      } else if (metodo === "dinheiro") {
        metodoStats.dinheiro.valor += r.valor;
      } else if (metodo === "cartao_credito") {
        metodoStats.credito.valor += r.valor;
      } else {
        metodoStats.outros.valor += r.valor;
      }
    });

    const metodoList = Object.values(metodoStats)
      .map((item) => {
        const porcentagem = totalFiltrado > 0 ? (item.valor / totalFiltrado) * 100 : 0;
        return {
          ...item,
          porcentagem,
        };
      })
      .sort((a, b) => b.valor - a.valor);

    // 2. Fluxo por hora (5h às 23h)
    const hourlyData = Array.from({ length: 19 }, (_, i) => {
      const h = i + 5;
      return {
        hour: `${String(h).padStart(2, "0")}h`,
        total: 0,
      };
    });

    filtradas.forEach((r) => {
      if (r.created_at) {
        const isIntegrated = r.observacoes?.includes("Integrado via Eyemobile API");
        const date = new Date(r.created_at);
        const hour = isIntegrated ? date.getUTCHours() : date.getHours();

        if (hour >= 5 && hour <= 23) {
          const index = hour - 5;
          if (hourlyData[index]) {
            hourlyData[index].total += r.valor;
          }
        }
      } else if (r.data) {
        const date = new Date(r.data.split("T")[0] + "T12:00:00");
        const hour = date.getHours();
        if (hour >= 5 && hour <= 23) {
          const index = hour - 5;
          if (hourlyData[index]) {
            hourlyData[index].total += r.valor;
          }
        }
      }
    });

    return {
      receitasFiltradas: filtradas,
      receitasAgrupadas: grupos,
      totalReceitas: total,
      mediaMensal: media,
      totalReceitasDoDia,
      metodoList,
      hourlyData,
      totalFiltrado,
    };
  }, [receitas, filtro, categoriaFiltro, visibleCount]);

  const limparFiltros = () => {
    setFiltro("");
    setCategoriaFiltro("");
    setVisibleCount(100);
  };

  const temFiltrosAtivos = filtro !== "" || categoriaFiltro !== "";

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-3 shadow-lg shadow-green-500/20">
              <ArrowUpRight className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Receitas</h1>
              <p className="text-muted-foreground">Gerencie suas fontes de renda</p>
            </div>
          </div>
          <Button onClick={() => setActiveTab("adicionar")} className="bg-green-500 hover:bg-green-600">
            <Plus className="w-4 h-4 mr-2" />
            Nova Receita
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-0 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Receitas do Dia</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalReceitasDoDia.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/20">
                  <CalendarDays className="w-5 h-5 text-cyan-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Receitas</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <DollarSign className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Média Mensal</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {mediaMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Registros</p>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{receitas.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Wallet className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Categorias</p>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{categoriasReceita.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-orange-500/20">
                  <Tag className="w-5 h-5 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="lista" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Lista de Receitas
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
              Adicionar Receita
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
                      placeholder="Buscar receitas..."
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <select
                    value={categoriaFiltro}
                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Todas as categorias</option>
                    {categoriasReceita.map((cat) => (
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
                      {receitasFiltradas.length} resultado{receitasFiltradas.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance de receita da operação Dashboard */}
            <Card className="border border-border/50 bg-card overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                  <TrendingUp className="w-4.5 h-4.5 text-green-500" />
                  Performance de receita da operação
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Métodos de Pagamento */}
                  <div className="lg:col-span-5 space-y-4">
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
                                    R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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

                  {/* Gráfico por Hora */}
                  <div className="lg:col-span-7 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Fluxo de Receita por Hora</h4>
                      <div className="h-[200px] w-full">
                        {totalFiltrado === 0 ? (
                          <div className="h-full flex items-center justify-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                            Sem dados de fluxo horário no período
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorReceitasHours" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
                              <XAxis
                                dataKey="hour"
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
                                  `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                                  "Receita",
                                ]}
                                labelStyle={{ fontWeight: "bold" }}
                              />
                              <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#22c55e"
                                fill="url(#colorReceitasHours)"
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

            {/* Lista Desktop */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-semibold">Descrição</TableHead>
                        <TableHead className="font-semibold">Categoria</TableHead>
                        <TableHead className="font-semibold">Data</TableHead>
                        <TableHead className="font-semibold">Método</TableHead>
                        <TableHead className="font-semibold text-right">Valor</TableHead>
                        <TableHead className="font-semibold text-center w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-16 mx-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : receitasFiltradas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            Nenhuma receita encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        receitasFiltradas.slice(0, visibleCount).map((receita) => (
                          <TableRow key={receita.id} className="group">
                            <TableCell>
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-green-500/10 shrink-0 mt-0.5">
                                  <ArrowUpRight className="w-4 h-4 text-green-500" />
                                </div>
                                <div className="space-y-1">
                                  <span className="font-medium">{receita.descricao}</span>
                                  {receita.observacoes && (
                                    <p className="text-xs text-muted-foreground italic line-clamp-1">{receita.observacoes}</p>
                                  )}
                                  {receita.tags && receita.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {receita.tags.map((tag) => (
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
                                {receita.categorias?.nome || "Sem categoria"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatarData(receita.data)}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const info = getPaymentMethodInfo(receita.metodo_pagamento);
                                if (!info) {
                                  return <span className="text-xs text-muted-foreground/60">—</span>;
                                }
                                const Icon = info.icon;
                                return (
                                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Icon className="w-4 h-4" />
                                    {info.label}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold text-green-500">
                                +R$ {receita.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditarReceita(receita)}
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
                                        Tem certeza que deseja excluir a receita "{receita.descricao}"? Esta ação não pode ser desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleExcluirReceita(receita.id)} className="bg-red-500 hover:bg-red-600">
                                        Excluir
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {receitasFiltradas.length > visibleCount && (
                    <div className="flex justify-center p-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((prev) => prev + 200)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Carregar mais (exibindo {visibleCount} de {receitasFiltradas.length})
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Lista Mobile - Agrupada por data */}
            <div className="md:hidden">
              <Card>
                <CardContent className="p-4">
                  <ScrollArea className="h-[500px]">
                    {loading ? (
                      <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
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
                    ) : Object.keys(receitasAgrupadas).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Wallet className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Nenhuma receita encontrada</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {Object.entries(receitasAgrupadas).map(([data, items]) => (
                          <div key={data}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{data}</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                            <div className="space-y-2">
                              {items.map((receita) => (
                                <div key={receita.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                                  <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
                                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <p className="font-medium text-foreground truncate">{receita.descricao}</p>
                                    {receita.observacoes && (
                                      <p className="text-xs text-muted-foreground italic line-clamp-2">{receita.observacoes}</p>
                                    )}
                                    {receita.tags && receita.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {receita.tags.map((tag) => (
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
                                        {receita.categorias?.nome || "Sem categoria"}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">{formatarData(receita.data)}</span>
                                      {getPaymentMethodInfo(receita.metodo_pagamento) && (() => {
                                        const pmInfo = getPaymentMethodInfo(receita.metodo_pagamento)!;
                                        const PmIcon = pmInfo.icon;
                                        return (
                                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground w-fit">
                                            <PmIcon className="w-3.5 h-3.5" />
                                            {pmInfo.label}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <div className="font-semibold text-green-500">
                                      +R$ {receita.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditarReceita(receita)}
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
                                              Tem certeza que deseja excluir "{receita.descricao}"?
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleExcluirReceita(receita.id)} className="bg-red-500">
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
                    )}
                  </ScrollArea>
                  {receitasFiltradas.length > visibleCount && (
                    <div className="flex justify-center pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((prev) => prev + 200)}
                        className="w-full text-xs text-muted-foreground hover:text-foreground"
                      >
                        Carregar mais (exibindo {visibleCount} de {receitasFiltradas.length})
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>


          <TabsContent value="adicionar">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {modoEdicao ? (
                    <>
                      <Edit className="w-5 h-5 text-blue-500" />
                      Editar Receita
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 text-green-500" />
                      Nova Receita
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={salvarReceita} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="descricao">Descrição *</Label>
                      <Input
                        id="descricao"
                        placeholder="Ex: Salário, Projeto Freelance, Venda..."
                        value={novaReceita.descricao}
                        onChange={(e) => setNovaReceita({ ...novaReceita, descricao: e.target.value })}
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
                          value={novaReceita.valor}
                          onChange={(e) => setNovaReceita({ ...novaReceita, valor: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="categoria">Categoria *</Label>
                      <select
                        id="categoria"
                        value={novaReceita.categoria}
                        onChange={(e) => setNovaReceita({ ...novaReceita, categoria: e.target.value })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Selecione uma categoria</option>
                        {categoriasReceita.map((cat) => (
                          <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subcategoria">Subcategoria</Label>
                      <select
                        id="subcategoria"
                        value={novaReceita.subcategoria_id || ""}
                        onChange={(e) => setNovaReceita({ ...novaReceita, subcategoria_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Nenhuma</option>
                        {subcategorias
                          .filter((s) => {
                            const catId = categoriasReceita.find((c) => c.nome === novaReceita.categoria)?.id;
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
                        value={novaReceita.data}
                        onChange={(e) => setNovaReceita({ ...novaReceita, data: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Tipo de Receita</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="tipo"
                            value="fixa"
                            checked={novaReceita.tipo === "fixa"}
                            onChange={(e) => setNovaReceita({ ...novaReceita, tipo: e.target.value as "fixa" | "variavel" })}
                            className="w-4 h-4 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm">Receita Fixa</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="tipo"
                            value="variavel"
                            checked={novaReceita.tipo === "variavel"}
                            onChange={(e) => setNovaReceita({ ...novaReceita, tipo: e.target.value as "fixa" | "variavel" })}
                            className="w-4 h-4 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm">Receita Variável</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="metodo_pagamento">Método de Pagamento</Label>
                      <PaymentMethodSelector
                        value={novaReceita.metodo_pagamento}
                        onChange={(method) => setNovaReceita({ ...novaReceita, metodo_pagamento: method })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="conta">Conta</Label>
                      <AccountSelector
                        value={novaReceita.conta_id}
                        onChange={(accountId) => setNovaReceita({ ...novaReceita, conta_id: accountId })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="centro_custo">Centro de Custo</Label>
                      <select
                        id="centro_custo"
                        value={novaReceita.centro_custo_id || ""}
                        onChange={(e) => setNovaReceita({ ...novaReceita, centro_custo_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Nenhum</option>
                        {centrosCusto.filter((c) => c.ativo).map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cliente">Cliente</Label>
                      <select
                        id="cliente"
                        value={novaReceita.contato_id || ""}
                        onChange={(e) => setNovaReceita({ ...novaReceita, contato_id: e.target.value || null })}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Nenhum</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="observacoes">Observações</Label>
                      <Textarea
                        id="observacoes"
                        value={novaReceita.observacoes}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.length <= 500) {
                            setNovaReceita({ ...novaReceita, observacoes: value });
                          }
                        }}
                        placeholder="Adicione observações sobre esta receita..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {novaReceita.observacoes.length}/500 caracteres
                      </p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tags">Tags</Label>
                      <TagsInput
                        value={novaReceita.tags}
                        onChange={(tags) => setNovaReceita({ ...novaReceita, tags })}
                        placeholder="Digite uma tag e pressione Enter"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Anexos</Label>
                      <AttachmentUploader
                        transacaoId={novaReceita.id}
                        transacaoTipo="receita"
                        attachments={tempAttachments}
                        onUploadSuccess={(anexo) => setTempAttachments(prev => [...prev, anexo])}
                        onDeleteSuccess={(anexoId) => setTempAttachments(prev => prev.filter(a => a.id !== anexoId))}
                      />
                      {!novaReceita.id && (
                        <p className="text-xs text-muted-foreground">
                          Os anexos serão salvos após criar a receita
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button type="button" variant="outline" onClick={handleCancelarEdicao}>
                      Cancelar
                    </Button>
                    <Button type="submit" className={modoEdicao ? "bg-blue-500 hover:bg-blue-600" : "bg-green-500 hover:bg-green-600"}>
                      {modoEdicao ? (
                        <>
                          <Edit className="w-4 h-4 mr-2" />
                          Salvar Alterações
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar Receita
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

export default Receitas;
