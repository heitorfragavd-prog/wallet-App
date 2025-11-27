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
  Search,
  Plus,
  Tag,
  TrendingUp,
  TrendingDown,
  Trash2,
  X,
  Download,
  Palette,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { supabase } from "@/integrations/supabase/client";

const Categorias = () => {
  const { toast } = useToast();
  const { categorias, loading, createCategoria, deleteCategoria, refetch } = useCategorias();
  const [activeTab, setActiveTab] = useState("lista");

  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  // Formulário para nova categoria
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"receita" | "despesa">("receita");
  const [novaCor, setNovaCor] = useState("#10B981");
  const [novaDescricao, setNovaDescricao] = useState("");

  // Dados processados
  const { categoriasFiltradas, categoriasReceita, categoriasDespesa } = useMemo(() => {
    const filtradas = categorias
      .filter((c) => {
        const matchNome = c.nome.toLowerCase().includes(filtro.toLowerCase());
        const matchTipo = tipoFiltro === "" || c.tipo === tipoFiltro;
        return matchNome && matchTipo;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      categoriasFiltradas: filtradas,
      categoriasReceita: categorias.filter((c) => c.tipo === "receita"),
      categoriasDespesa: categorias.filter((c) => c.tipo === "despesa"),
    };
  }, [categorias, filtro, tipoFiltro]);

  const limparFiltros = () => {
    setFiltro("");
    setTipoFiltro("");
  };

  const temFiltrosAtivos = filtro !== "" || tipoFiltro !== "";

  const handleAdicionarCategoria = async () => {
    if (!novoNome.trim()) {
      toast({ title: "Erro", description: "Por favor, informe o nome da categoria.", variant: "destructive" });
      return;
    }

    await createCategoria({ nome: novoNome, tipo: novoTipo, cor: novaCor, icone: "DollarSign" });
    setNovoNome(""); setNovoTipo("receita"); setNovaCor("#10B981"); setNovaDescricao("");
    setActiveTab("lista");
  };

  const handleCancelar = () => {
    setNovoNome(""); setNovoTipo("receita"); setNovaCor("#10B981"); setNovaDescricao("");
    setActiveTab("lista");
  };

  const handleExcluirCategoria = async (id: string) => { await deleteCategoria(id); };

  const handleImportarCategoriasPadrao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.rpc('create_default_categories', { p_user_id: user.id });
      if (error) throw error;
      await refetch();
      toast({ title: "Sucesso!", description: "Categorias padrão importadas com sucesso." });
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível importar as categorias padrão.", variant: "destructive" });
    }
  };

  const cores = ["#10B981", "#3B82F6", "#8B5CF6", "#EF4444", "#F59E0B", "#6B7280", "#EC4899", "#14B8A6", "#F97316", "#84CC16"];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-3 shadow-lg shadow-indigo-500/20">
              <Tag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
              <p className="text-muted-foreground">Gerencie suas categorias de receitas e despesas</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleImportarCategoriasPadrao} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Importar Padrão
            </Button>
            <Button onClick={() => setActiveTab("adicionar")} className="bg-indigo-500 hover:bg-indigo-600">
              <Plus className="w-4 h-4 mr-2" />
              Nova Categoria
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-foreground">{categorias.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/20">
                  <Tag className="w-5 h-5 text-indigo-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Receitas</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-green-500">{categoriasReceita.length}</p>
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
                  <p className="text-sm text-muted-foreground">Despesas</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-red-500">{categoriasDespesa.length}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="lista" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
              Lista de Categorias
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
              Adicionar Categoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input placeholder="Buscar categorias..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="pl-10" />
                  </div>
                  <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
                    className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Todos os tipos</option>
                    <option value="receita">Receitas</option>
                    <option value="despesa">Despesas</option>
                  </select>
                  {temFiltrosAtivos && (
                    <Button variant="outline" size="sm" onClick={limparFiltros} className="h-10">
                      <X className="w-4 h-4 mr-1" />Limpar
                    </Button>
                  )}
                </div>
                {temFiltrosAtivos && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                    {filtro && <Badge variant="secondary" className="text-xs">Busca: {filtro}<button onClick={() => setFiltro("")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button></Badge>}
                    {tipoFiltro && <Badge variant="secondary" className="text-xs">{tipoFiltro === "receita" ? "Receitas" : "Despesas"}<button onClick={() => setTipoFiltro("")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button></Badge>}
                    <span className="text-xs text-muted-foreground ml-2">{categoriasFiltradas.length} resultado{categoriasFiltradas.length !== 1 ? "s" : ""}</span>
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
                        <TableHead className="font-semibold">Categoria</TableHead>
                        <TableHead className="font-semibold">Tipo</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold text-center w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-8 mx-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : categoriasFiltradas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            <Tag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            Nenhuma categoria encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        categoriasFiltradas.map((categoria) => (
                          <TableRow key={categoria.id} className="group">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${categoria.cor}20` }}>
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categoria.cor }} />
                                </div>
                                <span className="font-medium">{categoria.nome}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${categoria.tipo === "receita" ? "bg-green-500/20 text-green-600 hover:bg-green-500/30" : "bg-red-500/20 text-red-600 hover:bg-red-500/30"} border-0`}>
                                {categoria.tipo === "receita" ? "Receita" : "Despesa"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-green-500/20 text-green-600 border-0 hover:bg-green-500/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Ativa
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                      <AlertDialogDescription>Tem certeza que deseja excluir a categoria "{categoria.nome}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleExcluirCategoria(categoria.id)} className="bg-red-500 hover:bg-red-600">Excluir</AlertDialogAction>
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

            {/* Lista Mobile */}
            <div className="md:hidden">
              <Card>
                <CardContent className="p-4">
                  <ScrollArea className="h-[500px]">
                    {loading ? (
                      <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="p-4 rounded-xl border border-border">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Skeleton className="w-8 h-8 rounded-lg" />
                                <Skeleton className="h-5 w-24" />
                              </div>
                              <Skeleton className="h-5 w-16" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : categoriasFiltradas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Tag className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Nenhuma categoria encontrada</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {categoriasFiltradas.map((categoria) => (
                          <div key={categoria.id} className="p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${categoria.cor}20` }}>
                                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: categoria.cor }} />
                                </div>
                                <div>
                                  <p className="font-medium">{categoria.nome}</p>
                                  <Badge className={`${categoria.tipo === "receita" ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"} border-0 text-xs mt-1`}>
                                    {categoria.tipo === "receita" ? "Receita" : "Despesa"}
                                  </Badge>
                                </div>
                              </div>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                    <AlertDialogDescription>Tem certeza que deseja excluir "{categoria.nome}"?</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleExcluirCategoria(categoria.id)} className="bg-red-500">Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
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
                  <Plus className="w-5 h-5 text-indigo-500" />
                  Nova Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome da Categoria *</Label>
                      <Input id="nome" placeholder="Ex: Alimentação, Salário..." value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tipo">Tipo *</Label>
                      <select id="tipo" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as "receita" | "despesa")}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="receita">Receita</option>
                        <option value="despesa">Despesa</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        Cor da Categoria
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl border-2 border-border flex items-center justify-center" style={{ backgroundColor: `${novaCor}20` }}>
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: novaCor }} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {cores.map((cor) => (
                            <button key={cor} type="button" onClick={() => setNovaCor(cor)}
                              className={`w-8 h-8 rounded-lg transition-all ${novaCor === cor ? "ring-2 ring-offset-2 ring-indigo-500" : "hover:scale-110"}`}
                              style={{ backgroundColor: cor }} />
                          ))}
                          <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border-0" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="descricao">Descrição (opcional)</Label>
                      <Input id="descricao" placeholder="Descrição opcional..." value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button variant="outline" onClick={handleCancelar}>Cancelar</Button>
                    <Button onClick={handleAdicionarCategoria} className="bg-indigo-500 hover:bg-indigo-600">
                      <Plus className="w-4 h-4 mr-2" />Adicionar Categoria
                    </Button>
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

export default Categorias;
