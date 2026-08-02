import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useTransferencias } from "@/domains/finance/hooks/useTransferencias";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Transferencias = () => {
  const { transferencias, loading, createTransferencia, deleteTransferencia } = useTransferencias();
  const { contas } = useContasUsuario();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    conta_origem_id: "",
    conta_destino_id: "",
    valor: "",
    data: new Date().toISOString().split("T")[0],
    descricao: "",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(form.valor.replace(",", "."));
    if (!valor || valor <= 0) return;
    if (form.conta_origem_id === form.conta_destino_id) return;
    setSaving(true);
    try {
      await createTransferencia({
        conta_origem_id: form.conta_origem_id,
        conta_destino_id: form.conta_destino_id,
        valor,
        data: form.data,
        descricao: form.descricao || null,
        observacoes: form.observacoes || null,
      });
      setDialogOpen(false);
      setForm({ conta_origem_id: "", conta_destino_id: "", valor: "", data: new Date().toISOString().split("T")[0], descricao: "", observacoes: "" });
    } catch {
      /* toast pelo hook */
    } finally {
      setSaving(false);
    }
  };

  const mesmaConta = form.conta_origem_id && form.conta_origem_id === form.conta_destino_id;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Transferências</h1>
              <p className="text-sm text-muted-foreground">Mova dinheiro entre suas contas</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Transferência
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : transferencias.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Nenhuma transferência registrada.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {transferencias.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <ArrowRightLeft className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t.conta_origem?.nome || "Conta"} → {t.conta_destino?.nome || "Conta"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${t.data}T12:00:00`).toLocaleDateString("pt-BR")}
                        {t.descricao ? ` • ${t.descricao}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-foreground">{formatBRL(Number(t.valor))}</p>
                    <Button size="icon" variant="ghost" onClick={() => deleteTransferencia(t.id)}>
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
              <DialogTitle>Nova Transferência</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Conta de Origem *</Label>
                <Select value={form.conta_origem_id} onValueChange={(v) => setForm({ ...form, conta_origem_id: v })}>
                  <SelectTrigger><SelectValue placeholder="De onde sai o dinheiro" /></SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conta de Destino *</Label>
                <Select value={form.conta_destino_id} onValueChange={(v) => setForm({ ...form, conta_destino_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Para onde vai o dinheiro" /></SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mesmaConta && (
                  <p className="text-xs text-destructive">A conta de origem não pode ser igual à de destino.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Reserva para fornecedor" />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={saving || !!mesmaConta || !form.conta_origem_id || !form.conta_destino_id}>
                {saving ? "Transferindo..." : "Confirmar Transferência"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Transferencias;
