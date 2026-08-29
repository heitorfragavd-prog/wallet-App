import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Edit,
  Trash2,
  Plus,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Download,
  ShoppingCart,
  Package,
  AlertTriangle,
  CheckCircle,
  Wallet,
  Tag,
} from "lucide-react";
import { NovoItemMercadoModal } from "@/domains/market/components/NovoItemMercadoModal";
import { EditarItemMercadoModal } from "@/domains/market/components/EditarItemMercadoModal";
import { NovaCategoriaModal } from "@/domains/finance/components/NovaCategoriaModal";
import { EditarCategoriaModal } from "@/domains/finance/components/EditarCategoriaModal";
import { EditarOrcamentoModal } from "@/domains/finance/components/EditarOrcamentoModal";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useCategoriasMercado, CategoriaMercado } from "@/domains/market/hooks/useCategoriasMercado";
import { useItensMercado, ItemMercado } from "@/domains/market/hooks/useItensMercado";
import { useOrcamentosMercado } from "@/domains/finance/hooks/useOrcamentosMercado";

interface ItemMercadoForm {
  descricao: string;
  categoria_mercado_id?: string;
  unidade_medida: string;
  quantidade_atual: number;
  quantidade_ideal: number;
  preco_atual: number;
}

interface CategoriaMercadoForm {
  nome: string;
  descricao?: string;
  cor: string;
  ativa: boolean;
}

const Mercado = () => {
  const { toast } = useToast();
  const { categoriasDespesa } = useCategorias();
  const { categoriasMercado, createCategoriaMercado, updateCategoriaMercado, deleteCategoriaMercado } = useCategoriasMercado();
  const { itensMercado, createItemMercado, updateItemMercado, deleteItemMercado } = useItensMercado();
  const { orcamentosMercado, createOrcamentoMercado, updateOrcamentoMercado, getOrcamentoAtivo } = useOrcamentosMercado();

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filterEyemobileOnly, setFilterEyemobileOnly] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState<ItemMercado | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [categoriaParaEditar, setCategoriaParaEditar] = useState<CategoriaMercado | null>(null);
  const [modalEditarCategoriaAberto, setModalEditarCategoriaAberto] = useState(false);
  const [orcamentoMensal, setOrcamentoMensal] = useState(0);
  const [estimativaGastos, setEstimativaGastos] = useState(0);
  const [categoriaOrcamento, setCategoriaOrcamento] = useState("");
  const [modalOrcamentoAberto, setModalOrcamentoAberto] = useState(false);

  useEffect(() => {
    if (orcamentosMercado.length > 0) {
      const orcamentoAtivo = orcamentosMercado[0];
      if (orcamentoAtivo) {
        setOrcamentoMensal(orcamentoAtivo.valor_orcamento);
        setEstimativaGastos(orcamentoAtivo.estimativa_gastos);
        const categoria = categoriasDespesa.find((cat) => cat.id === orcamentoAtivo.categoria_despesa);
        setCategoriaOrcamento(categoria ? categoria.nome : orcamentoAtivo.categoria_despesa);
      }
    }
  }, [orcamentosMercado, categoriasDespesa]);

  const handleImportarCategoriasPadrao = async () => {
    const categoriasPadrao = [
      { nome: 'Alimentação Básica', descricao: 'Itens essenciais de alimentação', cor: '#10B981' },
      { nome: 'Limpeza', descricao: 'Produtos de limpeza e higiene', cor: '#3B82F6' },
      { nome: 'Higiene Pessoal', descricao: 'Produtos de cuidado pessoal', cor: '#8B5CF6' },
      { nome: 'Bebidas', descricao: 'Bebidas em geral', cor: '#F59E0B' },
      { nome: 'Carnes e Proteínas', descricao: 'Carnes, peixes e proteínas', cor: '#EF4444' },
      { nome: 'Laticínios', descricao: 'Leite, queijos e derivados', cor: '#06B6D4' },
      { nome: 'Frutas e Verduras', descricao: 'Hortifruti em geral', cor: '#84CC16' },
    ];
    try {
      for (const categoria of categoriasPadrao) {
        await createCategoriaMercado({ ...categoria, ativa: true });
      }
      toast({ title: "Sucesso!", description: "Categorias de mercado padrão importadas." });
    } catch (_error) {
      toast({ title: "Erro", description: "Não foi possível importar as categorias.", variant: "destructive" });
    }
  };

  // Estatísticas
  const stats = useMemo(() => {
    const totalItens = itensMercado.length;
    const itensEstoqueAdequado = itensMercado.filter((i) => i.status === "estoque_adequado").length;
    const itensEstoqueBaixo = itensMercado.filter((i) => i.status === "estoque_baixo" || i.status === "sem_estoque").length;
    const gastosItensLista = itensMercado.reduce((total, item) => total + item.preco_atual * item.quantidade_atual, 0);
    const saldoDisponivel = orcamentoMensal - gastosItensLista;
    const percentualGasto = orcamentoMensal > 0 ? (gastosItensLista / orcamentoMensal) * 100 : 0;
    const orcamentoExcedido = gastosItensLista > orcamentoMensal;

    return { totalItens, itensEstoqueAdequado, itensEstoqueBaixo, gastosItensLista, saldoDisponivel, percentualGasto, orcamentoExcedido, estimativaGastos };
  }, [itensMercado, orcamentoMensal, estimativaGastos]);

  const categoriasAtivas = categoriasMercado.filter((cat) => cat.ativa);

  const itemsFiltrados = itensMercado.filter((item) => {
    const matchCategoria = selectedCategory === "all" || item.categorias_mercado?.nome === selectedCategory;
    const matchDescricao = item.descricao.toLowerCase().includes(filtroDescricao.toLowerCase());
    const matchEyemobile = !filterEyemobileOnly || (item as any).origem === "eyemobile";
    return matchCategoria && matchDescricao && matchEyemobile;
  });

  const limparFiltros = () => {
    setSelectedCategory("all");
    setFiltroDescricao("");
    setFilterEyemobileOnly(false);
  };

  const handleAdicionarItem = async (novoItem: ItemMercadoForm) => {
    await createItemMercado(novoItem);
  };

  const handleEditarItem = async (itemEditado: ItemMercado) => {
    await updateItemMercado(itemEditado.id, itemEditado);
  };

  const handleExcluirItem = async (id: string) => {
    await deleteItemMercado(id);
  };

  const handleAdicionarCategoria = async (novaCategoria: CategoriaMercadoForm) => {
    await createCategoriaMercado(novaCategoria);
  };

  const handleEditarCategoria = async (categoriaEditada: CategoriaMercado) => {
    await updateCategoriaMercado(categoriaEditada.id, categoriaEditada);
  };

  const handleExcluirCategoria = async (id: string) => {
    await deleteCategoriaMercado(id);
  };

  const abrirModalEdicao = (item: ItemMercado) => {
    setItemParaEditar(item);
    setModalEditarAberto(true);
  };

  const abrirModalEdicaoCategoria = (categoria: CategoriaMercado) => {
    setCategoriaParaEditar(categoria);
    setModalEditarCategoriaAberto(true);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "estoque_adequado":
        return { color: "bg-green-500", bgLight: "bg-green-500/10", text: "text-green-600 dark:text-green-400", label: "Adequado" };
      case "estoque_medio":
        return { color: "bg-yellow-500", bgLight: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", label: "Médio" };
      case "estoque_baixo":
        return { color: "bg-red-500", bgLight: "bg-red-500/10", text: "text-red-600 dark:text-red-400", label: "Baixo" };
      case "sem_estoque":
        return { color: "bg-gray-500", bgLight: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", label: "Sem estoque" };
      default:
        return { color: "bg-gray-500", bgLight: "bg-gray-500/10", text: "text-gray-600", label: status };
    }
  };

  const handleSalvarOrcamento = async (novoOrcamento: number, novaEstimativa: number, categoriaSelecionada: string) => {
    const mesAtual = new Date().toISOString().slice(0, 7) + "-01";
    const orcamentoExistente = getOrcamentoAtivo(categoriaSelecionada);

    if (orcamentoExistente) {
      await updateOrcamentoMercado(orcamentoExistente.id, {
        valor_orcamento: novoOrcamento,
        estimativa_gastos: novaEstimativa,
        categoria_despesa: categoriaSelecionada,
      });
    } else {
      await createOrcamentoMercado({
        categoria_despesa: categoriaSelecionada,
        valor_orcamento: novoOrcamento,
        estimativa_gastos: novaEstimativa,
        mes_referencia: mesAtual,
        ativo: true,
      });
    }

    setOrcamentoMensal(novoOrcamento);
    setEstimativaGastos(novaEstimativa);
    setCategoriaOrcamento(categoriaSelecionada);
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-3 shadow-lg shadow-emerald-500/20">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              {stats.itensEstoqueBaixo > 0 && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-background flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">{stats.itensEstoqueBaixo > 9 ? "9+" : stats.itensEstoqueBaixo}</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Mercado</h1>
              <p className="text-muted-foreground">Gerencie seu estoque e lista de compras</p>
            </div>
          </div>
          <NovoItemMercadoModal
            trigger={
              <Button className="bg-emerald-500 hover:bg-emerald-600">
                <Plus className="w-4 h-4 mr-2" />
                Novo Item
              </Button>
            }
          />
        </div>

        {/* Alerta de Orçamento Excedido */}
        {stats.orcamentoExcedido && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-red-600 dark:text-red-400">Orçamento Excedido!</p>
                <p className="text-sm text-muted-foreground">
                  Você ultrapassou o orçamento em R$ {Math.abs(stats.saldoDisponivel).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Orçamento */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setModalOrcamentoAberto(true)}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Orçamento Mensal</p>
                <div className="p-2 rounded-xl bg-emerald-500/20">
                  <Wallet className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-500">
                R$ {orcamentoMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{categoriaOrcamento || "Clique para configurar"}</p>
            </CardContent>
          </Card>

          {/* Gastos */}
          <Card className={`relative overflow-hidden border-0 ${stats.orcamentoExcedido ? "bg-gradient-to-br from-red-500/10 to-red-500/5" : "bg-gradient-to-br from-purple-500/10 to-purple-500/5"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Gastos Atuais</p>
                <div className={`p-2 rounded-xl ${stats.orcamentoExcedido ? "bg-red-500/20" : "bg-purple-500/20"}`}>
                  <TrendingDown className={`w-4 h-4 ${stats.orcamentoExcedido ? "text-red-500" : "text-purple-500"}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${stats.orcamentoExcedido ? "text-red-500" : "text-purple-500"}`}>
                R$ {stats.gastosItensLista.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <Progress value={Math.min(stats.percentualGasto, 100)} className="h-1.5 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{stats.percentualGasto.toFixed(0)}% do orçamento</p>
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card className={`relative overflow-hidden border-0 ${stats.saldoDisponivel >= 0 ? "bg-gradient-to-br from-blue-500/10 to-blue-500/5" : "bg-gradient-to-br from-orange-500/10 to-orange-500/5"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Saldo Disponível</p>
                <div className={`p-2 rounded-xl ${stats.saldoDisponivel >= 0 ? "bg-blue-500/20" : "bg-orange-500/20"}`}>
                  {stats.saldoDisponivel >= 0 ? <TrendingUp className="w-4 h-4 text-blue-500" /> : <TrendingDown className="w-4 h-4 text-orange-500" />}
                </div>
              </div>
              <p className={`text-2xl font-bold ${stats.saldoDisponivel >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                R$ {Math.abs(stats.saldoDisponivel).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{stats.saldoDisponivel >= 0 ? "Disponível para compras" : "Acima do orçamento"}</p>
            </CardContent>
          </Card>

          {/* Total Itens */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Total de Itens</p>
                <div className="p-2 rounded-xl bg-cyan-500/20">
                  <Package className="w-4 h-4 text-cyan-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-cyan-500">{stats.totalItens}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-0 text-xs">{stats.itensEstoqueAdequado} ok</Badge>
                {stats.itensEstoqueBaixo > 0 && (
                  <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-0 text-xs">{stats.itensEstoqueBaixo} baixo</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="itens" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="grid grid-cols-2 w-full sm:w-auto bg-muted/50">
              <TabsTrigger value="itens" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                <Package className="w-4 h-4 mr-2" />
                Itens
              </TabsTrigger>
              <TabsTrigger value="categorias" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                <Tag className="w-4 h-4 mr-2" />
                Categorias
              </TabsTrigger>
            </TabsList>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar itens..."
                  value={filtroDescricao}
                  onChange={(e) => setFiltroDescricao(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categoriasAtivas.map((cat) => (
                    <SelectItem key={cat.id} value={cat.nome}>{cat.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={filterEyemobileOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterEyemobileOnly(!filterEyemobileOnly)}
                className={`h-9 text-xs flex items-center gap-1.5 ${filterEyemobileOnly ? "bg-orange-500 hover:bg-orange-600 text-white border-0" : "border-dashed hover:text-orange-500"}`}
              >
                <Package className="w-3.5 h-3.5" />
                PDV Eyemobile
              </Button>
              {(selectedCategory !== "all" || filtroDescricao || filterEyemobileOnly) && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-9">
                  <Filter className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Tab Itens */}
          <TabsContent value="itens" className="space-y-4">
            {/* Legenda de Status */}
            <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Adequado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span className="text-xs text-muted-foreground">Médio</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">Baixo</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                <span className="text-xs text-muted-foreground">Sem estoque</span>
              </div>
            </div>

            {/* Lista de Itens */}
            {itemsFiltrados.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">
                    {itensMercado.length === 0 ? "Nenhum item cadastrado" : "Nenhum item encontrado"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {itemsFiltrados.map((item) => {
                  const statusConfig = getStatusConfig(item.status);
                  const percentualEstoque = item.quantidade_ideal > 0 ? (item.quantidade_atual / item.quantidade_ideal) * 100 : 0;

                  return (
                    <Card key={item.id} className="group relative overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-emerald-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{item.descricao}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {item.categorias_mercado?.nome || "Sem categoria"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirModalEdicao(item)}
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Item</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir "{item.descricao}"? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleExcluirItem(item.id)} className="bg-red-600 hover:bg-red-700">
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <Badge className={`${statusConfig.bgLight} ${statusConfig.text} border-0`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.color} mr-1.5`} />
                            {statusConfig.label}
                          </Badge>
                          {(item as any).origem === 'eyemobile' && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 text-xs font-semibold">
                              PDV Eyemobile
                            </Badge>
                          )}
                        </div>

                        {/* Progresso do Estoque */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Estoque</span>
                            <span className="font-medium">{item.quantidade_atual} / {item.quantidade_ideal} {item.unidade_medida}</span>
                          </div>
                          <Progress value={Math.min(percentualEstoque, 100)} className="h-1.5" />
                          {(item as any).observacao && (
                            <p className="text-xs text-muted-foreground italic mt-1.5">
                              {(item as any).observacao}
                            </p>
                          )}
                        </div>

                        {/* Preço */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                          <span className="text-sm text-muted-foreground">Preço de Custo</span>
                          <span className="font-semibold text-emerald-500">
                            R$ {item.preco_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Categorias */}
          <TabsContent value="categorias" className="space-y-4">
            {/* Card para adicionar categoria */}
            <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <Tag className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Categorias de Mercado</CardTitle>
                      <p className="text-sm text-muted-foreground">{categoriasMercado.length} categorias cadastradas</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleImportarCategoriasPadrao}>
                      <Download className="w-4 h-4 mr-2" />
                      Importar Padrão
                    </Button>
                    <NovaCategoriaModal
                      trigger={
                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600">
                          <Plus className="w-4 h-4 mr-2" />
                          Nova
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Lista de Categorias */}
            {categoriasMercado.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Tag className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Nenhuma categoria cadastrada</p>
                  <p className="text-sm text-muted-foreground mt-1">Crie uma categoria ou importe as padrão</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoriasMercado.map((categoria) => (
                  <Card
                    key={categoria.id}
                    className={`group relative overflow-hidden transition-all hover:shadow-md ${
                      categoria.ativa ? "hover:border-emerald-500/30" : "opacity-60"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
                            style={{ backgroundColor: categoria.cor }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{categoria.nome}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {categoria.descricao || "Sem descrição"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => abrirModalEdicaoCategoria(categoria)}
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:bg-blue-500/10"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a categoria "{categoria.nome}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleExcluirCategoria(categoria.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {!categoria.ativa && (
                        <Badge variant="secondary" className="mt-2 text-xs">Inativa</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Modais */}
        <EditarItemMercadoModal
          item={itemParaEditar}
          open={modalEditarAberto}
          onOpenChange={setModalEditarAberto}
          onEditarItem={handleEditarItem}
        />

        <EditarCategoriaModal
          categoria={categoriaParaEditar}
          open={modalEditarCategoriaAberto}
          onOpenChange={setModalEditarCategoriaAberto}
        />

        <EditarOrcamentoModal
          open={modalOrcamentoAberto}
          onOpenChange={setModalOrcamentoAberto}
          orcamentoAtual={orcamentoMensal}
          estimativaAtual={estimativaGastos > 0 ? estimativaGastos : stats.gastosItensLista}
          categoriaAtual={categoriaOrcamento}
          onSalvarOrcamento={handleSalvarOrcamento}
        />
      </div>
    </DashboardLayout>
  );
};

export default Mercado;
