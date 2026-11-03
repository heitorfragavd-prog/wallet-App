import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useContatos, Contato } from "@/domains/finance/hooks/useContatos";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Users, Plus, Phone, Mail, CalendarClock, Pencil, Trash2, Search, Filter } from "lucide-react";
import { FornecedorCard } from "@/domains/finance/components/fornecedores/FornecedorCard";
import { FornecedorFormDialog } from "@/domains/finance/components/fornecedores/FornecedorFormDialog";
import { FornecedorFichaFinanceiraModal } from "@/domains/finance/components/fornecedores/FornecedorFichaFinanceiraModal";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";

const Fornecedores = () => {
  const { contatos, loading, createContato, updateContato, deleteContato } = useContatos();
  const { categorias } = useCategorias();
  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  const [tab, setTab] = useState<"fornecedor" | "cliente">("fornecedor");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Contato | null>(null);

  const [fichaModalOpen, setFichaModalOpen] = useState(false);
  const [fornecedorFicha, setFornecedorFicha] = useState<Contato | null>(null);

  // Filtros de busca para fornecedores
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");

  const abrirNovo = (tipo: "fornecedor" | "cliente") => {
    setEditando(null);
    setFormDialogOpen(true);
  };

  const abrirEdicao = (c: Contato) => {
    setEditando(c);
    setFormDialogOpen(true);
  };

  const abrirFicha = (c: Contato) => {
    setFornecedorFicha(c);
    setFichaModalOpen(true);
  };

  const handleSave = async (payload: any) => {
    if (editando) {
      await updateContato({ id: editando.id, ...payload });
    } else {
      await createContato(payload);
    }
  };

  const fornecedoresFiltrados = contatos
    .filter((c) => c.tipo === "fornecedor")
    .filter((c) => {
      if (filtroStatus === "ativos" && c.ativo === false) return false;
      if (filtroStatus === "inativos" && c.ativo !== false) return false;
      if (filtroCategoria && c.categoria_padrao_id !== filtroCategoria) return false;
      if (busca.trim()) {
        const termo = busca.toLowerCase();
        const matchNome = c.nome.toLowerCase().includes(termo);
        const matchFantasia = c.nome_fantasia?.toLowerCase().includes(termo);
        const matchDoc = c.cnpj_cpf?.toLowerCase().includes(termo);
        const matchPix = c.pix_chave?.toLowerCase().includes(termo);
        const matchContato = c.contato_nome?.toLowerCase().includes(termo);
        if (!matchNome && !matchFantasia && !matchDoc && !matchPix && !matchContato) return false;
      }
      return true;
    });

  const clientes = contatos.filter((c) => c.tipo === "cliente");

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header da Página */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fornecedores & Clientes</h1>
              <p className="text-sm text-muted-foreground">
                Gestão cadastral, conciliação de Pix e boletos e ficha financeira auditada
              </p>
            </div>
          </div>
          <Button onClick={() => abrirNovo(tab)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Novo {tab === "fornecedor" ? "Fornecedor" : "Cliente"}
          </Button>
        </div>

        {/* Abas Principais */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "fornecedor" | "cliente")}>
          <TabsList>
            <TabsTrigger value="fornecedor">
              Fornecedores ({contatos.filter((c) => c.tipo === "fornecedor").length})
            </TabsTrigger>
            <TabsTrigger value="cliente">
              Clientes ({clientes.length})
            </TabsTrigger>
          </TabsList>

          {/* ABA FORNECEDORES */}
          <TabsContent value="fornecedor" className="space-y-4 pt-2">
            {/* Barra de Filtros e Busca */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border/60">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CNPJ ou Pix..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground shadow-sm"
                >
                  <option value="">Todas as Categorias</option>
                  {categoriasDespesa.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>

                <div className="flex rounded-md border border-border p-0.5 bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setFiltroStatus("todos")}
                    className={`px-2.5 py-1 text-xs rounded ${filtroStatus === "todos" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroStatus("ativos")}
                    className={`px-2.5 py-1 text-xs rounded ${filtroStatus === "ativos" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    Ativos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroStatus("inativos")}
                    className={`px-2.5 py-1 text-xs rounded ${filtroStatus === "inativos" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    Inativos
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground py-8 text-center text-xs">Carregando fornecedores...</p>
            ) : fornecedoresFiltrados.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground space-y-2">
                  <p className="text-sm">Nenhum fornecedor encontrado.</p>
                  <p className="text-xs">Cadastre seus parceiros para conciliar automaticamente pagamentos Pix e boletos do Divipay.</p>
                  <Button size="sm" variant="outline" onClick={() => abrirNovo("fornecedor")} className="mt-2">
                    Cadastrar Primeiro Fornecedor
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                {fornecedoresFiltrados.map((f) => (
                  <FornecedorCard
                    key={f.id}
                    fornecedor={f}
                    onEditar={abrirEdicao}
                    onExcluir={deleteContato}
                    onAbrirFicha={abrirFicha}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA CLIENTES */}
          <TabsContent value="cliente" className="space-y-4 pt-2">
            {loading ? (
              <p className="text-muted-foreground py-8 text-center text-xs">Carregando clientes...</p>
            ) : clientes.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Nenhum cliente cadastrado.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {clientes.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground text-sm">{c.nome}</p>
                        <Badge variant="outline">Cliente</Badge>
                      </div>
                      {c.cnpj_cpf && <p className="text-muted-foreground font-mono">{c.cnpj_cpf}</p>}
                      {c.telefone && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.telefone}
                        </p>
                      )}
                      {c.email && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {c.email}
                        </p>
                      )}
                      <p className="text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> Prazo: {c.prazo_pagamento_dias ?? 30} dias
                      </p>
                      <div className="flex justify-end gap-1 pt-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteContato(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Modal de Ficha Financeira do Fornecedor (ETAPA 5) */}
        <FornecedorFichaFinanceiraModal
          fornecedor={fornecedorFicha}
          open={fichaModalOpen}
          onOpenChange={setFichaModalOpen}
          onEditar={(forn) => {
            setFichaModalOpen(false);
            abrirEdicao(forn);
          }}
        />

        {/* Dialog de Cadastro / Edição com Identificadores Bancários (ETAPA 2) */}
        <FornecedorFormDialog
          open={formDialogOpen}
          onOpenChange={setFormDialogOpen}
          fornecedor={editando}
          onSave={handleSave}
        />
      </div>
    </DashboardLayout>
  );
};

export default Fornecedores;
