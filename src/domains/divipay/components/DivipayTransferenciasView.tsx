import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { NovaTransferenciaModal } from "./NovaTransferenciaModal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Eye, Filter, ArrowUpRight, DollarSign, ArrowDownLeft } from "lucide-react";

export function DivipayTransferenciasView() {
  const { transferencias, loading } = useDivipayTransferencias();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelectAll = () => {
    if (selectedIds.length === transferencias.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transferencias.map((t) => t.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const totalSelected = transferencias
    .filter((t) => selectedIds.includes(t.id))
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);

  const getStatusBadge = (status: string) => {
    const s = String(status).toUpperCase();
    if (["COMPLETED", "PAID", "CONFIRMED", "FINALIZADO", "APPROVED", "FINISHED"].includes(s)) {
      return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30 text-[11px] font-bold">FINALIZADO</Badge>;
    }
    if (["PENDING", "PROCESSING"].includes(s)) {
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/30 text-[11px] font-bold">PENDENTE</Badge>;
    }
    return <Badge variant="outline" className="text-[11px] font-bold">{s}</Badge>;
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header & Ações Principais */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Saques</h2>
          <p className="text-xs text-muted-foreground">Gerencie seus pagamentos, saques em lote e transferências Pix</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-2 rounded-xl border-border/60">
            <Filter className="w-3.5 h-3.5 text-amber-500" /> Filtros
          </Button>
          <NovaTransferenciaModal />
        </div>
      </div>

      {/* Card Principal de Tabela com Layout Divipay Oficial */}
      <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden bg-card/90 backdrop-blur-sm">
        <CardHeader className="p-4 border-b border-border/40 bg-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Total selecionado</span>
              <span className="text-lg font-extrabold text-foreground tracking-tight">{formatCurrency(totalSelected)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : transferencias.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                <ArrowUpRight className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">Nenhum saque realizado</p>
              <p className="text-xs text-muted-foreground">Clique em "Solicitar Saque" para transferir valores via Pix.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={selectedIds.length === transferencias.length && transferencias.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>NOME</TableHead>
                    <TableHead>DOCUMENTO</TableHead>
                    <TableHead>DESCRIÇÃO</TableHead>
                    <TableHead>TIPO</TableHead>
                    <TableHead>VALOR DO SAQUE</TableHead>
                    <TableHead>TAXA</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead>LOTE</TableHead>
                    <TableHead className="text-right">AÇÕES</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {transferencias.map((t) => {
                    const isSelected = selectedIds.includes(t.id);
                    const isBoleto = String(t.description || "").toLowerCase().includes("boleto");
                    const tipoLabel = isBoleto ? "Boleto" : "Pix (DICT)";

                    return (
                      <TableRow key={t.id} className={isSelected ? "bg-amber-500/5" : undefined}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {t.recipient_key || t.description || "COMERCIAL CARVALHO DIAS LTDA"}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {t.recipient_key ? "---" : "31.908.617/0001-33"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {t.description || "Pagamento de boleto..."}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{tipoLabel}</TableCell>
                        <TableCell className="font-bold text-foreground">
                          {formatCurrency(Number(t.amount || 0))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatCurrency(3.5)}</TableCell>
                        <TableCell>{getStatusBadge(t.status)}</TableCell>
                        <TableCell className="text-muted-foreground">---</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

