import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
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
import { NovaMetaModal } from "@/domains/finance/components/NovaMetaModal";
import { EditarMetaModal } from "@/domains/finance/components/EditarMetaModal";
import {
  Plus,
  Target,
  TrendingUp,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  PauseCircle,
  Sparkles,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useMetas } from "@/domains/finance/hooks/useMetas";
import { useCategoriasMetas, CategoriaMeta } from "@/domains/finance/hooks/useCategoriasMetas";
import { Meta } from "@/domains/finance/hooks/useMetas";

interface MetaForm {
  titulo: string;
  tipo: "economia" | "receita" | "despesa" | "investimento";
  valor_alvo: number;
  valor_atual: number;
  data_inicio: string;
  data_limite: string;
  status: "ativa" | "concluida" | "pausada" | "vencida";
  categoria_meta_id?: string;
  descricao?: string;
}

const formatDateForDisplay = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString + "T12:00:00");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const Metas = () => {
  const { toast } = useToast();
  const { metas, createMeta, updateMeta, deleteMeta } = useMetas();
  const {
    categoriasMetas,
    createCategoriaMeta,
    updateCategoriaMeta,
    deleteCategoriaMeta,
  } = useCategoriasMetas();

  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [metaParaEditar, setMetaParaEditar] = useState<Meta | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState("lista");

  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [novaCategoriaCor, setNovaCategoriaCor] = useState("#10B981");
  const [novaCategoriaDescricao, setNovaCategoriaDescricao] = useState("");

  const adicionarMeta = async (novaMeta: MetaForm) => {
    await createMeta(novaMeta);
  };

  const editarMeta = async (metaEditada: Meta) => {
    await updateMeta(metaEditada.id, metaEditada);
  };

  const excluirMeta = async (id: string) => {
    await deleteMeta(id);
  };

  const abrirModalEdicao = (meta: Meta) => {
    setMetaParaEditar(meta);
    setModalEditarAberto(true);
  };

  const limparFiltros = () => {
    setFiltroStatus("todas");
    setFiltroTipo("todos");
    setBusca("");
  };

  const adicionarCategoriaMeta = async () => {
    if (!novaCategoriaNome.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, informe o nome da categoria.",
        variant: "destructive",
      });
      return;
    }

    await createCategoriaMeta({
      nome: novaCategoriaNome,
      cor: novaCategoriaCor,
      descricao: novaCategoriaDescricao,
      ativa: true,
    });

    setNovaCategoriaNome("");
    setNovaCategoriaCor("#10B981");
    setNovaCategoriaDescricao("");
  };

  const cancelarAdicionarCategoria = () => {
    setNovaCategoriaNome("");
    setNovaCategoriaCor("#10B981");
    setNovaCategoriaDescricao("");
    setAbaAtiva("lista");
  };

  const toggleCategoriaMeta = async (id: string) => {
    const categoria = categoriasMetas.find((c) => c.id === id);
    if (categoria) {
      await updateCategoriaMeta(id, { ativa: !categoria.ativa });
    }
  };

  const excluirCategoriaMeta = async (id: string) => {
    await deleteCategoriaMeta(id);
  };

  const handleImportarCategoriasPadrao = async () => {
    type CategoriaMetaPadrao = { nome: string; cor: string; descricao: string };
    const categoriasPadrao: CategoriaMetaPadrao[] = [
      { nome: 'Emergência', cor: '#EF4444', descricao: 'Reserva para emergências e imprevistos' },
      { nome: 'Viagem', cor: '#3B82F6', descricao: 'Economias para viagens e férias' },
      { nome: 'Investimentos', cor: '#10B981', descricao: 'Aportes em investimentos' },
      { nome: 'Casa Própria', cor: '#F59E0B', descricao: 'Economia para compra da casa própria' },
      { nome: 'Educação', cor: '#8B5CF6', descricao: 'Investimento em cursos e formação' },
    ];

    try {
      for (const categoria of categoriasPadrao) {
        await createCategoriaMeta({ ...categoria, ativa: true });
      }
      toast({
        title: "Sucesso!",
        description: "Categorias de metas padrão importadas com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao importar categorias de metas padrão:", error);
      toast({
        title: "Erro",
        description: "Não foi possível importar as categorias de metas padrão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const metasFiltradas = metas.filter((meta) => {
    const matchStatus = filtroStatus === "todas" || meta.status === filtroStatus;
    const matchTipo = filtroTipo === "todos" || meta.tipo === filtroTipo;
    const matchBusca =
      meta.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      (meta.categorias_metas?.nome || "").toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchTipo && matchBusca;
  });

  const calcularProgresso = (valorAtual: number, valorAlvo: number) => {
    return Math.min((valorAtual / valorAlvo) * 100, 100);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ativa":
        return { color: "bg-blue-500", bgLight: "bg-blue-500/10", text: "text-blue-500", icon: Clock };
      case "concluida":
        return { color: "bg-green-500", bgLight: "bg-green-500/10", text: "text-green-500", icon: CheckCircle };
      case "pausada":
        return { color: "bg-yellow-500", bgLight: "bg-yellow-500/10", text: "text-yellow-500", icon: PauseCircle };
      case "vencida":
        return { color: "bg-red-500", bgLight: "bg-red-500/10", text: "text-red-500", icon: AlertCircle };
      default:
        return { color: "bg-gray-500", bgLight: "bg-gray-500/10", text: "text-gray-500", icon: Clock };
    }
  };

  const getTipoConfig = (tipo: string) => {
    switch (tipo) {
      case "economia":
        return { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400" };
      case "receita":
        return { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" };
      case "despesa":
        return { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" };
      case "investimento":
        return { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" };
      default:
        return { bg: "bg-muted", text: "text-foreground" };
    }
  };

  // Estatísticas
  const totalMetas = metas.length;
  const metasAtivas = metas.filter((m) => m.status === "ativa").length;
  const metasConcluidas = metas.filter((m) => m.status === "concluida").length;
  const metasPausadas = metas.filter((m) => m.status === "pausada").length;
  const progressoMedio =
    totalMetas > 0
      ? metas.reduce((acc, meta) => acc + calcularProgresso(meta.valor_atual, meta.valor_alvo), 0) / totalMetas
      : 0;

  const cores = [
    "#10B981", "#3B82F6", "#8B5CF6", "#EF4444", "#F59E0B",
    "#6B7280", "#EC4899", "#14B8A6", "#F97316", "#84CC16",
  ];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-3 shadow-lg shadow-violet-500/20">
                <Target className="w-6 h-6 text-white" />
              </div>
              {metasAtivas > 0 && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-background flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">{metasAtivas > 9 ? "9+" : metasAtivas}</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Metas Financeiras</h1>
              <p className="text-muted-foreground">Defina e acompanhe seus objetivos</p>
            </div>
          </div>
          <NovaMetaModal
            onAdicionarMeta={adicionarMeta}
            categoriasMetas={categoriasMetas.filter((c) => c.ativa) as CategoriaMeta[]}
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total de Metas</p>
                  <p className="text-2xl font-bold text-foreground">{totalMetas}</p>
                </div>
                <div className="p-3 rounded-xl bg-violet-500/20">
                  <Target className="w-5 h-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Metas Ativas</p>
                  <p className="text-2xl font-bold text-blue-500">{metasAtivas}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Concluídas</p>
                  <p className="text-2xl font-bold text-green-500">{metasConcluidas}</p>
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5">
            <CardContent className="p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Progresso Médio</p>
                  <div className="p-2 rounded-xl bg-orange-500/20">
                    <TrendingUp className="w-4 h-4 text-orange-500" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-orange-500">{progressoMedio.toFixed(0)}%</span>
                </div>
                <Progress value={progressoMedio} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="grid grid-cols-3 w-full sm:w-auto bg-muted/50">
              <TabsTrigger value="lista" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
                Metas
              </TabsTrigger>
              <TabsTrigger value="progresso" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
                Progresso
              </TabsTrigger>
              <TabsTrigger value="categorias" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
                Categorias
              </TabsTrigger>
            </TabsList>

            {/* Filtros compactos */}
            {abaAtiva !== "categorias" && (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar metas..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <select
                  title="Filtrar por status"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  className="h-9 px-3 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="todas">Todos Status</option>
                  <option value="ativa">Ativas</option>
                  <option value="concluida">Concluídas</option>
                  <option value="pausada">Pausadas</option>
                  <option value="vencida">Vencidas</option>
                </select>
                <select
                  title="Filtrar por tipo"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="h-9 px-3 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="todos">Todos Tipos</option>
                  <option value="economia">Economia</option>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                  <option value="investimento">Investimento</option>
                </select>
                {(filtroStatus !== "todas" || filtroTipo !== "todos" || busca) && (
                  <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-9">
                    <Filter className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Tab Lista */}
          <TabsContent value="lista" className="space-y-4">
            {metasFiltradas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Target className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground text-center">
                    {metas.length === 0 ? "Nenhuma meta cadastrada" : "Nenhuma meta encontrada com os filtros aplicados"}
                  </p>
                  {metas.length === 0 && (
                    <p className="text-sm text-muted-foreground mt-1">Crie sua primeira meta para começar</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {metasFiltradas.map((meta) => {
                  const progresso = calcularProgresso(meta.valor_atual, meta.valor_alvo);
                  const statusConfig = getStatusConfig(meta.status);
                  const tipoConfig = getTipoConfig(meta.tipo);
                  const StatusIcon = statusConfig.icon;

                  return (
                    <Card
                      key={meta.id}
                      className="group relative overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-violet-500/30"
                    >
                      <CardContent className="p-5">
                        <div className="space-y-4">
                          {/* Header do Card */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground truncate">{meta.titulo}</h3>
                              <p className="text-sm text-muted-foreground truncate">
                                {meta.categorias_metas?.nome || "Sem categoria"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => abrirModalEdicao(meta)}
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
                                    <AlertDialogTitle>Excluir Meta</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir a meta "{meta.titulo}"? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => excluirMeta(meta.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>

                          {/* Badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${tipoConfig.bg} ${tipoConfig.text} border-0`}>
                              {meta.tipo}
                            </Badge>
                            <Badge className={`${statusConfig.bgLight} ${statusConfig.text} border-0`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {meta.status}
                            </Badge>
                          </div>

                          {/* Progresso */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                R$ {meta.valor_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="font-medium text-violet-500">{progresso.toFixed(0)}%</span>
                            </div>
                            <Progress value={progresso} className="h-2 bg-violet-500/20" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Meta: R$ {meta.valor_alvo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              <span>Prazo: {formatDateForDisplay(meta.data_limite)}</span>
                            </div>
                          </div>

                          {/* Indicador de progresso completo */}
                          {progresso >= 100 && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10">
                              <Sparkles className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-600 dark:text-green-400 font-medium">Meta alcançada!</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Progresso */}
          <TabsContent value="progresso" className="space-y-4">
            {metasFiltradas.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Nenhuma meta para exibir progresso</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {metasFiltradas.map((meta) => {
                  const progresso = calcularProgresso(meta.valor_atual, meta.valor_alvo);
                  const statusConfig = getStatusConfig(meta.status);
                  const tipoConfig = getTipoConfig(meta.tipo);
                  const faltante = meta.valor_alvo - meta.valor_atual;

                  return (
                    <Card key={meta.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg">{meta.titulo}</CardTitle>
                            <CardDescription>{meta.categorias_metas?.nome || "Sem categoria"}</CardDescription>
                          </div>
                          <Badge className={`${tipoConfig.bg} ${tipoConfig.text} border-0`}>{meta.tipo}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Barra de progresso grande */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Progresso</span>
                            <span className={`text-lg font-bold ${progresso >= 100 ? "text-green-500" : "text-violet-500"}`}>
                              {progresso.toFixed(1)}%
                            </span>
                          </div>
                          <div className="relative">
                            <Progress value={progresso} className="h-3 bg-violet-500/20" />
                            {progresso >= 100 && (
                              <Sparkles className="absolute -right-1 -top-1 w-5 h-5 text-yellow-500" />
                            )}
                          </div>
                        </div>

                        {/* Valores */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Atual</p>
                            <p className="text-sm font-semibold text-foreground">
                              R$ {meta.valor_atual.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-violet-500/10 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Meta</p>
                            <p className="text-sm font-semibold text-violet-500">
                              R$ {meta.valor_alvo.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/50 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Faltam</p>
                            <p className={`text-sm font-semibold ${faltante <= 0 ? "text-green-500" : "text-foreground"}`}>
                              R$ {Math.max(0, faltante).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                            </p>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                          <Badge className={`${statusConfig.bgLight} ${statusConfig.text} border-0`}>
                            {meta.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Prazo: {formatDateForDisplay(meta.data_limite)}
                          </span>
                        </div>

                        {meta.descricao && (
                          <p className="text-sm text-muted-foreground italic">{meta.descricao}</p>
                        )}
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
            <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-purple-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-violet-500/20">
                    <Plus className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Nova Categoria</CardTitle>
                    <CardDescription>Crie categorias personalizadas para suas metas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="categoriaNome" className="text-sm">Nome *</Label>
                    <Input
                      id="categoriaNome"
                      placeholder="Ex: Casa Própria, Carro..."
                      value={novaCategoriaNome}
                      onChange={(e) => setNovaCategoriaNome(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Cor</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        title="Selecionar cor"
                        value={novaCategoriaCor}
                        onChange={(e) => setNovaCategoriaCor(e.target.value)}
                        className="w-9 h-9 border border-border rounded-md cursor-pointer"
                      />
                      <div className="flex flex-wrap gap-1">
                        {cores.map((cor) => (
                          <button
                            key={cor}
                            type="button"
                            title={`Cor ${cor}`}
                            onClick={() => setNovaCategoriaCor(cor)}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${
                              novaCategoriaCor === cor ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground"
                            }`}
                            style={{ backgroundColor: cor }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoriaDescricao" className="text-sm">Descrição</Label>
                    <Input
                      id="categoriaDescricao"
                      placeholder="Descrição opcional..."
                      value={novaCategoriaDescricao}
                      onChange={(e) => setNovaCategoriaDescricao(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button onClick={adicionarCategoriaMeta} className="bg-violet-500 hover:bg-violet-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                  <Button variant="outline" onClick={handleImportarCategoriasPadrao}>
                    <Download className="w-4 h-4 mr-2" />
                    Importar Padrão
                  </Button>
                  {(novaCategoriaNome || novaCategoriaDescricao) && (
                    <Button variant="ghost" onClick={cancelarAdicionarCategoria}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Lista de categorias */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-violet-500" />
                  <CardTitle className="text-lg">Categorias ({categoriasMetas.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {categoriasMetas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Target className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma categoria cadastrada</p>
                    <p className="text-xs mt-1">Crie uma categoria ou importe as padrão</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoriasMetas.map((categoria) => (
                      <div
                        key={categoria.id}
                        className={`group relative p-4 rounded-xl border transition-all hover:shadow-md ${
                          categoria.ativa ? "bg-background hover:border-violet-500/30" : "bg-muted/30 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-4 h-4 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
                              style={{ backgroundColor: categoria.cor, ringColor: categoria.cor }}
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
                              onClick={() => toggleCategoriaMeta(categoria.id)}
                              className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {categoria.ativa ? "Desativar" : "Ativar"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir a categoria "{categoria.nome}"? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => excluirCategoriaMeta(categoria.id)}
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
                          <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                            Inativa
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Edição */}
        <EditarMetaModal
          meta={metaParaEditar}
          open={modalEditarAberto}
          onOpenChange={setModalEditarAberto}
          onEditarMeta={editarMeta}
        />
      </div>
    </DashboardLayout>
  );
};

export default Metas;
