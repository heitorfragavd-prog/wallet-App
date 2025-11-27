import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
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
  Filter,
  TrendingUp,
  Calendar,
  DollarSign,
  Edit,
  Trash2,
  ArrowUpRight,
  Wallet,
  Tag,
  X,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { EditarReceitaModal } from "@/domains/finance/components/EditarReceitaModal";

interface Receita {
  id: string;
  descricao: string;
  valor: number;
  categoria: string;
  data: string;
  tipo: "fixa" | "variavel";
}

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

const Receitas = () => {
  const { toast } = useToast();
  const { categoriasReceita } = useCategorias();
  const { receitas, loading, createReceita, updateReceita, deleteReceita } = useReceitas();
  const [activeTab, setActiveTab] = useState("lista");

  const [novaReceita, setNovaReceita] = useState({
    descricao: "",
    valor: "",
    categoria: "",
    data: "",
    tipo: "variavel" as "fixa" | "variavel",
  });

  const [filtro, setFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [receitaEditando, setReceitaEditando] = useState<Receita | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);

  const adicionarReceita = async (e: React.FormEvent) => {
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

    await createReceita({
      descricao: novaReceita.descricao,
      valor: parseFloat(novaReceita.valor),
      categoria_id: categoria?.id,
      data: novaReceita.data,
    });

    setNovaReceita({ descricao: "", valor: "", categoria: "", data: "", tipo: "variavel" });
    setActiveTab("lista");
  };

  const handleEditarReceita = (receita: { id: string; descricao: string; valor: number; data: string; categorias?: { nome: string } }) => {
    setReceitaEditando({
      id: receita.id,
      descricao: receita.descricao,
      valor: receita.valor,
      categoria: receita.categorias?.nome || "",
      data: receita.data,
      tipo: "variavel",
    });
    setModalEditarAberto(true);
  };

  const handleSalvarEdicao = async (receitaAtualizada: Receita) => {
    const categoria = categoriasReceita.find((c) => c.nome === receitaAtualizada.categoria);
    await updateReceita(receitaAtualizada.id, {
      descricao: receitaAtualizada.descricao,
      valor: receitaAtualizada.valor,
      categoria_id: categoria?.id,
      data: receitaAtualizada.data,
    });
  };

  const handleExcluirReceita = async (id: string) => {
    await deleteReceita(id);
  };

  // Dados processados
  const { receitasFiltradas, receitasAgrupadas, totalReceitas, mediaMensal } = useMemo(() => {
    const filtradas = receitas
      .filter((receita) => {
        const matchDescricao = receita.descricao.toLowerCase().includes(filtro.toLowerCase());
        const matchCategoria = categoriaFiltro === "" || receita.categorias?.nome === categoriaFiltro;
        return matchDescricao && matchCategoria;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Agrupar por data de cadastro
    const grupos: { [key: string]: typeof filtradas } = {};
    filtradas.forEach((r) => {
      const dataKey = formatarDataRelativa(r.created_at);
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(r);
    });

    const total = receitas.reduce((sum, r) => sum + r.valor, 0);
    const media = receitas.length > 0 ? total / Math.max(1, new Set(receitas.map(r => r.data.substring(0, 7))).size) : 0;

    return { receitasFiltradas: filtradas, receitasAgrupadas: grupos, totalReceitas: total, mediaMensal: media };
  }, [receitas, filtro, categoriaFiltro]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Receitas</p>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      R$ {totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                      R$ {mediaMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                        receitasFiltradas.map((receita) => (
                          <TableRow key={receita.id} className="group">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-500/10">
                                  <ArrowUpRight className="w-4 h-4 text-green-500" />
                                </div>
                                <span className="font-medium">{receita.descricao}</span>
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
                                <div key={receita.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                                  <div className="p-2 rounded-lg bg-green-500/10">
                                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{receita.descricao}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
                                        {receita.categorias?.nome || "Sem categoria"}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">{formatarData(receita.data)}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-green-500 whitespace-nowrap">
                                      +R$ {receita.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </span>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditarReceita(receita)}
                                        className="h-8 w-8 p-0 text-blue-500"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500">
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
                </CardContent>
              </Card>
            </div>
          </TabsContent>


          <TabsContent value="adicionar">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-green-500" />
                  Nova Receita
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={adicionarReceita} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="descricao">Descrição *</Label>
                      <Input
                        id="descricao"
                        placeholder="Ex: Salário, Freelance, Aluguel..."
                        value={novaReceita.descricao}
                        onChange={(e) => setNovaReceita({ ...novaReceita, descricao: e.target.value })}
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
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setActiveTab("lista")}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-green-500 hover:bg-green-600">
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Receita
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Edição */}
        <EditarReceitaModal
          receita={receitaEditando}
          isOpen={modalEditarAberto}
          onClose={() => {
            setModalEditarAberto(false);
            setReceitaEditando(null);
          }}
          onSave={handleSalvarEdicao}
        />
      </div>
    </DashboardLayout>
  );
};

export default Receitas;
