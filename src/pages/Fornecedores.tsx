import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useContatos, Contato } from "@/domains/finance/hooks/useContatos";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Users, Plus, Pencil, Trash2, Phone, Mail, CalendarClock } from "lucide-react";

const Fornecedores = () => {
  const { contatos, loading, createContato, updateContato, deleteContato } = useContatos();
  const [tab, setTab] = useState<"fornecedor" | "cliente">("fornecedor");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Contato | null>(null);
  const [form, setForm] = useState({
    tipo: "fornecedor" as "fornecedor" | "cliente",
    nome: "",
    cnpj_cpf: "",
    telefone: "",
    email: "",
    endereco: "",
    contato_nome: "",
    prazo_pagamento_dias: "30",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  const abrirNovo = (tipo: "fornecedor" | "cliente") => {
    setEditando(null);
    setForm({ tipo, nome: "", cnpj_cpf: "", telefone: "", email: "", endereco: "", contato_nome: "", prazo_pagamento_dias: "30", observacoes: "" });
    setDialogOpen(true);
  };

  const abrirEdicao = (c: Contato) => {
    setEditando(c);
    setForm({
      tipo: c.tipo,
      nome: c.nome,
      cnpj_cpf: c.cnpj_cpf || "",
      telefone: c.telefone || "",
      email: c.email || "",
      endereco: c.endereco || "",
      contato_nome: c.contato_nome || "",
      prazo_pagamento_dias: String(c.prazo_pagamento_dias ?? 30),
      observacoes: c.observacoes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        nome: form.nome.trim(),
        cnpj_cpf: form.cnpj_cpf || null,
        telefone: form.telefone || null,
        email: form.email || null,
        endereco: form.endereco || null,
        contato_nome: form.contato_nome || null,
        prazo_pagamento_dias: parseInt(form.prazo_pagamento_dias, 10) || 30,
        observacoes: form.observacoes || null,
      };
      if (editando) {
        await updateContato({ id: editando.id, ...payload });
      } else {
        await createContato(payload);
      }
      setDialogOpen(false);
    } catch {
      /* toast pelo hook */
    } finally {
      setSaving(false);
    }
  };

  const renderLista = (tipo: "fornecedor" | "cliente") => {
    const lista = contatos.filter((c) => c.tipo === tipo);
    if (lista.length === 0) {
      return (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Nenhum {tipo === "fornecedor" ? "fornecedor" : "cliente"} cadastrado.
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {lista.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">{c.nome}</p>
                <Badge variant="outline">{tipo === "fornecedor" ? "Fornecedor" : "Cliente"}</Badge>
              </div>
              {c.cnpj_cpf && <p className="text-xs text-muted-foreground">{c.cnpj_cpf}</p>}
              {c.telefone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {c.telefone}
                </p>
              )}
              {c.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {c.email}
                </p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Prazo: {c.prazo_pagamento_dias ?? 30} dias
              </p>
              <div className="flex justify-end gap-1 pt-1">
                <Button size="icon" variant="ghost" onClick={() => abrirEdicao(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteContato(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fornecedores & Clientes</h1>
              <p className="text-sm text-muted-foreground">CRM básico dos seus parceiros de negócio</p>
            </div>
          </div>
          <Button onClick={() => abrirNovo(tab)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Contato
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "fornecedor" | "cliente")}>
          <TabsList>
            <TabsTrigger value="fornecedor">Fornecedores</TabsTrigger>
            <TabsTrigger value="cliente">Clientes</TabsTrigger>
          </TabsList>
          {loading ? (
            <p className="text-muted-foreground pt-4">Carregando...</p>
          ) : (
            <>
              <TabsContent value="fornecedor" className="pt-4">{renderLista("fornecedor")}</TabsContent>
              <TabsContent value="cliente" className="pt-4">{renderLista("cliente")}</TabsContent>
            </>
          )}
        </Tabs>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Contato" : "Novo Contato"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Tabs value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "fornecedor" | "cliente" })}>
                  <TabsList className="w-full">
                    <TabsTrigger value="fornecedor" className="flex-1">Fornecedor</TabsTrigger>
                    <TabsTrigger value="cliente" className="flex-1">Cliente</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CNPJ / CPF</Label>
                  <Input value={form.cnpj_cpf} onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Prazo pagamento (dias)</Label>
                  <Input type="number" min="0" value={form.prazo_pagamento_dias} onChange={(e) => setForm({ ...form, prazo_pagamento_dias: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Pessoa de contato</Label>
                <Input value={form.contato_nome} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando..." : editando ? "Salvar alterações" : "Criar Contato"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Fornecedores;
