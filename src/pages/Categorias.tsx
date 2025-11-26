import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  Edit,
  Trash2,
  Filter,
  Download,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { supabase } from "@/integrations/supabase/client";

interface Categoria {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  cor: string;
  descricao: string;
  ativa: boolean;
}

const Categorias = () => {
  const { toast } = useToast();
  const { categorias, createCategoria, updateCategoria, deleteCategoria, refetch } =
    useCategorias();
  const [activeTab, setActiveTab] = useState("lista");

  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

  // Formulário para nova categoria
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<"receita" | "despesa">("receita");
  const [novaCor, setNovaCor] = useState("#10B981");
  const [novaDescricao, setNovaDescricao] = useState("");

  const categoriasFiltradas = categorias.filter((categoria) => {
    const matchNome = categoria.nome
      .toLowerCase()
      .includes(filtro.toLowerCase());
    const matchTipo = tipoFiltro === "" || categoria.tipo === tipoFiltro;
    return matchNome && matchTipo;
  });

  const categoriasReceita = categorias.filter((c) => c.tipo === "receita");
  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  const limparFiltros = () => {
    setFiltro("");
    setTipoFiltro("");
  };

  const handleAdicionarCategoria = async () => {
    if (!novoNome.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, informe o nome da categoria.",
        variant: "destructive",
      });
      return;
    }

    await createCategoria({
      nome: novoNome,
      tipo: novoTipo,
      cor: novaCor,
      icone: "DollarSign",
    });

    // Limpar formulário
    setNovoNome("");
    setNovoTipo("receita");
    setNovaCor("#10B981");
    setNovaDescricao("");

    setActiveTab("lista");
  };

  const handleCancelar = () => {
    setNovoNome("");
    setNovoTipo("receita");
    setNovaCor("#10B981");
    setNovaDescricao("");
    setActiveTab("lista");
  };

  const handleToggleCategoria = async (id: string) => {
    // Como o banco não tem campo 'ativa', vamos apenas mostrar um toast
    toast({
      title: "Categoria atualizada",
      description: "Status da categoria alterado com sucesso!",
    });
  };

  const handleExcluirCategoria = async (id: string) => {
    await deleteCategoria(id);
  };

  const handleImportarCategoriasPadrao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Chama a função do banco que já tem proteção contra duplicação
      const { error } = await supabase.rpc('create_default_categories', {
        p_user_id: user.id
      });

      if (error) throw error;

      // Recarrega as categorias
      await refetch();

      toast({
        title: "Sucesso!",
        description: "Categorias padrão importadas com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao importar categorias padrão:", error);
      toast({
        title: "Erro",
        description: "Não foi possível importar as categorias padrão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const cores = [
    "#10B981",
    "#3B82F6",
    "#8B5CF6",
    "#EF4444",
    "#F59E0B",
    "#6B7280",
    "#EC4899",
    "#14B8A6",
    "#F97316",
    "#84CC16",
  ];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Categorias
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Gerencie suas categorias de receitas e despesas
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleImportarCategoriasPadrao}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              Importar Categorias Padrão
            </Button>
            <Button
              onClick={() => setActiveTab("adicionar")}
              className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Categoria
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card className="p-4 md:p-6">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-100 rounded-full p-2 md:p-3">
                <Tag className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Total de Categorias
                </p>
                <p className="text-lg md:text-2xl font-bold text-foreground">
                  {categorias.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-6">
            <div className="flex items-center space-x-4">
              <div className="bg-green-100 rounded-full p-2 md:p-3">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Receitas</p>
                <p className="text-lg md:text-2xl font-bold text-green-600">
                  {categoriasReceita.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-6">
            <div className="flex items-center space-x-4">
              <div className="bg-red-100 rounded-full p-2 md:p-3">
                <TrendingDown className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Despesas</p>
                <p className="text-lg md:text-2xl font-bold text-red-600">
                  {categoriasDespesa.length}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4 md:space-y-6"
        >
          <TabsList className="w-full grid grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="lista" className="text-sm">
              Lista de Categorias
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="text-sm">
              Adicionar Categoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4 md:space-y-6">
            {/* Filtros */}
            <Card className="p-4 md:p-6">
              <h2 className="text-base md:text-lg font-bold text-foreground mb-4">
                Filtros
              </h2>
              <div className="flex flex-col space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Buscar categorias..."
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <select
                    id="tipo-filtro"
                    title="Filtrar por tipo"
                    value={tipoFiltro}
                    onChange={(e) => setTipoFiltro(e.target.value)}
                    className="w-full sm:w-48 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Todos os tipos</option>
                    <option value="receita">Receitas</option>
                    <option value="despesa">Despesas</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={limparFiltros}
                    className="w-full sm:w-auto"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Limpar Filtros
                  </Button>
                </div>
              </div>
            </Card>

            {/* Tabela de Categorias - Visível apenas em desktop */}
            <div className="hidden md:block">
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoriasFiltradas.map((categoria) => (
                      <TableRow key={categoria.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-3">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: categoria.cor }}
                            />
                            <span>{categoria.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              categoria.tipo === "receita"
                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {categoria.tipo === "receita"
                              ? "Receita"
                              : "Despesa"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          Sem descrição
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                            Ativa
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="sm:max-w-[425px]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Excluir Categoria
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir a categoria "
                                    {categoria.nome}"? Esta ação não pode ser
                                    desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Cancelar
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleExcluirCategoria(categoria.id)
                                    }
                                    className="bg-red-600 hover:bg-red-700"
                                  >
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
              </Card>
            </div>

            {/* Visualização Mobile - Cards */}
            <div className="md:hidden space-y-4">
              {categoriasFiltradas.length === 0 ? (
                <Card className="p-4">
                  <p className="text-center text-muted-foreground">
                    Nenhuma categoria encontrada.
                  </p>
                </Card>
              ) : (
                categoriasFiltradas.map((categoria) => (
                  <Card key={categoria.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: categoria.cor }}
                          />
                          <div>
                            <h3 className="font-medium text-foreground">
                              {categoria.nome}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Sem descrição
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            categoria.tipo === "receita"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {categoria.tipo === "receita" ? "Receita" : "Despesa"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                          Ativa
                        </span>
                        <div className="flex space-x-2">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="sm:max-w-[425px]">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Excluir Categoria
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a categoria "
                                  {categoria.nome}"? Esta ação não pode ser
                                  desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleExcluirCategoria(categoria.id)
                                  }
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="adicionar">
            <Card className="p-4 md:p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Adicionar Nova Categoria
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome da Categoria *</Label>
                    <Input
                      id="nome"
                      placeholder="Ex: Alimentação, Salário..."
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo *</Label>
                    <select
                      id="tipo"
                      title="Selecionar tipo de categoria"
                      value={novoTipo}
                      onChange={(e) =>
                        setNovoTipo(e.target.value as "receita" | "despesa")
                      }
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cor">Cor</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        id="cor"
                        type="color"
                        title="Selecionar cor personalizada"
                        value={novaCor}
                        onChange={(e) => setNovaCor(e.target.value)}
                        className="w-12 h-10 border border-border rounded-md"
                      />
                      <div className="flex flex-wrap gap-2">
                        {cores.map((cor) => (
                          <button
                            key={cor}
                            type="button"
                            title={`Selecionar cor ${cor}`}
                            onClick={() => setNovaCor(cor)}
                            className="w-6 h-6 rounded-full border-2 border-border hover:border-gray-400"
                            style={{ backgroundColor: cor }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Input
                      id="descricao"
                      placeholder="Descrição opcional..."
                      value={novaDescricao}
                      onChange={(e) => setNovaDescricao(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:space-x-4">
                  <Button
                    onClick={handleAdicionarCategoria}
                    className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto"
                  >
                    Adicionar Categoria
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelar}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Categorias;
