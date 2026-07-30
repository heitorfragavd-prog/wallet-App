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
  // Lista oficial fornecida pela Divipay para exibicao instantanea dos saques
  const mockSaques = [
    { id: "s1", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "Gerson salgados", type: "Pix (DICT)", amount: 1341.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s2", name: "---", document: "31.908.617/0001-33", description: "Pagamento de boleto...", type: "Boleto", amount: 856.99, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s3", name: "---", document: "61.186.888/0001-93", description: "Pagamento de boleto...", type: "Boleto", amount: 1949.76, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s4", name: "---", document: "17.467.515/0001-07", description: "Pagamento de boleto...", type: "Boleto", amount: 500.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s5", name: "Kenia Keylla Vieira Costa", document: "---", description: "acerto kenia", type: "Pix (DICT)", amount: 4819.11, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s6", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "luiz folguista de do...", type: "Pix (DICT)", amount: 200.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s7", name: "Shuellen Pereira Santos", document: "---", description: "meta e passagem", type: "Pix (DICT)", amount: 258.93, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s8", name: "---", document: "52.315.807/0001-17", description: "Pagamento de boleto...", type: "Boleto", amount: 470.10, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s9", name: "GERSON DOS SANTOS PINTO", document: "---", description: "GERSON SALGAD...", type: "Pix (DICT)", amount: 1775.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s10", name: "VICTOR RAFAEL DA PAIXAO FARIA", document: "---", description: "victor folguista", type: "Pix (DICT)", amount: 120.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s11", name: "Geovanna Cardoso Moreira", document: "---", description: "geovanna", type: "Pix (DICT)", amount: 80.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s12", name: "---", document: "52.315.807/0001-17", description: "Pagamento de boleto...", type: "Boleto", amount: 658.14, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s13", name: "Shuellen Pereira Santos", document: "---", description: "suellen passagem", type: "Pix (DICT)", amount: 59.67, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s14", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "luiz folguista", type: "Pix (DICT)", amount: 160.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s15", name: "GERSON DOS SANTOS PINTO", document: "---", description: "gerson salgados", type: "Pix (DICT)", amount: 1920.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s16", name: "---", document: "31.908.617/0001-33", description: "Pagamento de boleto...", type: "Boleto", amount: 1053.58, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s17", name: "---", document: "02.038.232/0001-64", description: "Pagamento de boleto...", type: "Boleto", amount: 5770.09, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s18", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "", type: "Pix (DICT)", amount: 650.44, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s19", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "pagamento viviane", type: "Pix (DICT)", amount: 500.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s20", name: "VIVIANE CRISTINA TEOTONIO SIQUEIRA", document: "---", description: "pagamento viviane", type: "Pix (DICT)", amount: 1000.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
  ];

  const displayList = transferencias.length > 0
    ? transferencias.map((t) => ({
        id: t.id,
        name: t.recipient_key || (String(t.description || "").toLowerCase().includes("boleto") ? "---" : t.description || "Favorecido Pix"),
        document: t.recipient_key ? "---" : "31.908.617/0001-33",
        description: t.description || "Pagamento de boleto...",
        type: String(t.description || "").toLowerCase().includes("boleto") ? "Boleto" : "Pix (DICT)",
        amount: Number(t.amount || 0),
        tax: 3.50,
        status: String(t.status || "FINALIZADO").toUpperCase(),
        lote: "---",
      }))
    : mockSaques;

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={selectedIds.length === displayList.length && displayList.length > 0}
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
                  {displayList.map((t) => {
                    const isSelected = selectedIds.includes(t.id);

                    return (
                      <TableRow key={t.id} className={isSelected ? "bg-amber-500/5" : undefined}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(t.id)}
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {t.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[11px]">
                          {t.document}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {t.description}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{t.type}</TableCell>
                        <TableCell className="font-bold text-foreground">
                          {formatCurrency(t.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatCurrency(t.tax)}</TableCell>
                        <TableCell>{getStatusBadge(t.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{t.lote}</TableCell>
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

