import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useCentrosCusto, CentroCusto } from "@/domains/finance/hooks/useCentrosCusto";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Building, Plus, Pencil, Trash2 } from "lucide-react";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CentrosCusto = () => {
  const { centrosCusto, loading, createCentroCusto, updateCentroCusto, deleteCentroCusto } = useCentrosCusto();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<CentroCusto | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", responsavel: "", orcamento_mensal: "" });
  const [saving, setSaving] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ nome: "", descricao: "", responsavel: "", orcamento_mensal: "" });
    setDialogOpen(true);
  };

  const abrirEdicao = (c: CentroCusto) => {
    setEditando(c);
    setForm({
      nome: c.nome,
      descricao: c.descricao || "",
      responsavel: c.responsavel || "",
      orcamento_mensal: c.orcamento_mensal ? String(c.orcamento_mensal).replace(".", ",") : "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao || null,
        responsavel: form.responsavel || null,
        orcamento_mensal: form.orcamento_mensal ? parseFloat(form.orcamento_mensal.replace(",", ".")) : null,
      };
      if (editando) {
        await updateCentroCusto({ id: editando.id, ...payload });
      } else {
        await createCentroCusto({ ...payload, ativo: true });
      }
      setDialogOpen(false);
    } catch {
      /* toast pelo hook */
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Centros de Custo</h1>
              <p className="text-sm text-muted-foreground">Agrupe receitas e despesas por área do negócio</p>
            </div>
          </div>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Centro de Custo
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : centrosCusto.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Nenhum centro de custo cadastrado.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {centrosCusto.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{c.nome}</p>
                    <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </div>
                  {c.descricao && <p className="text-xs text-muted-foreground">{c.descricao}</p>}
                  {c.responsavel && <p className="text-xs text-muted-foreground">Responsável: {c.responsavel}</p>}
                  {c.orcamento_mensal != null && (
                    <p className="text-sm font-medium text-primary">Orçamento: {formatBRL(Number(c.orcamento_mensal))}/mês</p>
                  )}
                  <div className="flex justify-end gap-1 pt-1">
                    <Button size="icon" variant="ghost" onClick={() => abrirEdicao(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteCentroCusto(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Centro de Custo" : "Novo Centro de Custo"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Cozinha, Salão, Delivery" required />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Orçamento mensal (R$)</Label>
                  <Input inputMode="decimal" placeholder="0,00" value={form.orcamento_mensal} onChange={(e) => setForm({ ...form, orcamento_mensal: e.target.value })} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando..." : editando ? "Salvar alterações" : "Criar Centro de Custo"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default CentrosCusto;
