import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useSubcategorias, Subcategoria } from "@/domains/finance/hooks/useSubcategorias";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { ListTree, Plus, Pencil, Trash2 } from "lucide-react";

const CORES = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

const Subcategorias = () => {
  const { subcategorias, loading, createSubcategoria, updateSubcategoria, deleteSubcategoria } = useSubcategorias();
  const { categorias } = useCategorias();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Subcategoria | null>(null);
  const [form, setForm] = useState({ nome: "", categoria_id: "", cor: CORES[0] });
  const [saving, setSaving] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ nome: "", categoria_id: "", cor: CORES[0] });
    setDialogOpen(true);
  };

  const abrirEdicao = (s: Subcategoria) => {
    setEditando(s);
    setForm({ nome: s.nome, categoria_id: s.categoria_id || "", cor: s.cor || CORES[0] });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      if (editando) {
        await updateSubcategoria({ id: editando.id, nome: form.nome.trim(), categoria_id: form.categoria_id || null, cor: form.cor });
      } else {
        await createSubcategoria({ nome: form.nome.trim(), categoria_id: form.categoria_id || null, cor: form.cor, ativo: true });
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
            <ListTree className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Subcategorias</h1>
              <p className="text-sm text-muted-foreground">Organize suas categorias em subdivisões</p>
            </div>
          </div>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Subcategoria
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : subcategorias.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Nenhuma subcategoria cadastrada. Clique em "Nova Subcategoria" para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {subcategorias.map((s) => (
              <Card key={s.id} className="border-l-4" style={{ borderLeftColor: s.cor }}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{s.nome}</p>
                    <p className="text-xs text-muted-foreground">{s.categorias?.nome || "Sem categoria"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={s.ativo ? "default" : "secondary"}>{s.ativo ? "Ativa" : "Inativa"}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => abrirEdicao(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteSubcategoria(s.id)}>
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
              <DialogTitle>{editando ? "Editar Subcategoria" : "Nova Subcategoria"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Bebidas" required />
              </div>
              <div className="space-y-2">
                <Label>Categoria Pai</Label>
                <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap">
                  {CORES.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setForm({ ...form, cor })}
                      className={`w-8 h-8 rounded-full border-2 ${form.cor === cor ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando..." : editando ? "Salvar alterações" : "Criar Subcategoria"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Subcategorias;
