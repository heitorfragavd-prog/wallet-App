import React, { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useValidadeInsumos } from "@/domains/finance/hooks/useValidadeInsumos";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { AlertTriangle, CheckCircle, XCircle, Package, Trash2 } from "lucide-react";
import type { InsumoComValidade, StatusValidade } from "@/domains/finance/types/foodCost";

const STATUS_CONFIG: Record<StatusValidade, { label: string; icon: React.ReactNode; className: string; row: string }> = {
  vencido: {
    label: "Vencido",
    icon: <XCircle className="h-4 w-4" />,
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    row: "border-l-2 border-red-500/50 bg-red-500/5",
  },
  proximo: {
    label: "Próximo do Vencimento",
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    row: "border-l-2 border-amber-500/50 bg-amber-500/5",
  },
  ok: {
    label: "Dentro do Prazo",
    icon: <CheckCircle className="h-4 w-4" />,
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    row: "",
  },
};

const PerdaDialog: React.FC<{ insumo: InsumoComValidade; onRegistrar: (v: any) => Promise<void> }> = ({
  insumo,
  onRegistrar,
}) => {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onRegistrar({
        insumoId: insumo.id,
        descricao: insumo.nome,
        valor: parseFloat(valor.replace(",", ".")) || 0,
      });
      setOpen(false);
    } catch {
      /* toast pelo hook */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" className="h-7 text-xs gap-1">
          <Trash2 className="h-3 w-3" /> Registrar Perda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Perda — {insumo.nome}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Uma despesa de perda será criada e o estoque deste insumo será zerado.
          </p>
          <div className="space-y-2">
            <Label>Valor da perda (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} variant="destructive" className="flex-1">
              {saving ? "Registrando..." : "Confirmar Perda"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

function InsumoRow({ insumo, onRegistrarPerda }: { insumo: InsumoComValidade; onRegistrarPerda: (v: any) => Promise<void> }) {
  const config = STATUS_CONFIG[insumo.status_validade];
  const vencimentoFormatado = insumo.data_validade
    ? new Date(insumo.data_validade + "T00:00:00").toLocaleDateString("pt-BR")
    : "—";
  return (
    <tr className={`hover:bg-muted/20 transition-colors ${config.row}`}>
      <td className="px-4 py-3">
        <p className="font-medium text-sm">{insumo.nome}</p>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{vencimentoFormatado}</td>
      <td className="px-4 py-3 text-sm text-right tabular-nums">
        {insumo.quantidade_estoque != null ? insumo.quantidade_estoque : "—"}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${config.className}`}>
          {config.icon} {config.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {insumo.status_validade !== "ok" && (
          <PerdaDialog insumo={insumo} onRegistrar={onRegistrarPerda} />
        )}
      </td>
    </tr>
  );
}

const ValidadesPage: React.FC = () => {
  const { insumos, vencidos, proximos, ok, loading, registrarPerda } = useValidadeInsumos();
  const [filtro, setFiltro] = useState<StatusValidade | "todos">("todos");

  const filtrados = filtro === "todos" ? insumos : insumos.filter((i) => i.status_validade === filtro);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Controle de Validades</h1>
            <p className="text-sm text-muted-foreground">Monitoramento de insumos e ingredientes</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card
            className={`border-border/40 bg-card/60 backdrop-blur-sm cursor-pointer transition-all ${filtro === "vencido" ? "ring-2 ring-red-500/50" : "hover:border-red-500/30"}`}
            onClick={() => setFiltro(filtro === "vencido" ? "todos" : "vencido")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-red-400">{vencidos.length}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border-border/40 bg-card/60 backdrop-blur-sm cursor-pointer transition-all ${filtro === "proximo" ? "ring-2 ring-amber-500/50" : "hover:border-amber-500/30"}`}
            onClick={() => setFiltro(filtro === "proximo" ? "todos" : "proximo")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-amber-400">{proximos.length}</p>
                <p className="text-xs text-muted-foreground">Próximos</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`border-border/40 bg-card/60 backdrop-blur-sm cursor-pointer transition-all ${filtro === "ok" ? "ring-2 ring-emerald-500/50" : "hover:border-emerald-500/30"}`}
            onClick={() => setFiltro(filtro === "ok" ? "todos" : "ok")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-emerald-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-emerald-400">{ok.length}</p>
                <p className="text-xs text-muted-foreground">OK</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela */}
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {filtro === "todos" ? "Todos os insumos" : STATUS_CONFIG[filtro].label}
            </CardTitle>
            {filtro !== "todos" && (
              <Button size="sm" variant="ghost" onClick={() => setFiltro("todos")}>
                Ver todos
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <Package className="h-10 w-10 opacity-30" />
                <p>Nenhum insumo encontrado</p>
                <p className="text-xs">Cadastre itens no Mercado e defina datas de validade</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Insumo</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Validade</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Estoque</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filtrados.map((insumo) => (
                      <InsumoRow key={insumo.id} insumo={insumo} onRegistrarPerda={registrarPerda} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ValidadesPage;
