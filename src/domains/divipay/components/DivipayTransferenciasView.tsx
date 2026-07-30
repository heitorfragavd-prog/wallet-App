import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { SaquesFiltrosSheet, type SaquesFilterValues } from "./SaquesFiltrosSheet";
import { VerificarSaqueModal, type SaqueDetails } from "./VerificarSaqueModal";
import { formatCurrency } from "@/lib/utils";
import { Eye, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export function DivipayTransferenciasView() {
  const { transferencias, loading } = useDivipayTransferencias();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [inspectingSaque, setInspectingSaque] = useState<SaqueDetails | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState(false);

  const handleInspect = (item: any) => {
    setInspectingSaque({
      ...item,
      cliente: "49.683.323 Heitor Fraga de Oliveira",
      documentoCliente: "49.683.323/0001-16",
      chavePix: "23890726000142",
      idPagamento: "E81014060202607291908QDYvmCy218a",
      pagoEm: "29/07/2026 16:09:22",
    });
    setIsInspectOpen(true);
  };


  // Estado dos Filtros
  const [filters, setFilters] = useState<SaquesFilterValues>({
    searchQuery: "",
    status: "ALL",
    startDate: "2026-07-01T00:00",
    endDate: "2026-07-31T23:59",
  });

  // Paginacao (Exibir 20, 50, 100, 250, 500)
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);



  const rawList = useMemo(() => {
    return transferencias.map((t) => {
      const meta = (t.metadata ?? {}) as {
        payerName?: string | null;
        document?: string | null;
        tax?: number;
        lote?: string | null;
        paymentType?: string;
      };
      const isBoleto =
        meta.paymentType === "BILLET" ||
        String(t.description || "").toLowerCase().includes("boleto");
      return {
        id: t.id,
        name: meta.payerName || t.recipient_key || "---",
        document: meta.document || "---",
        description: t.description || (isBoleto ? "Pagamento de boleto..." : "Saque Pix"),
        type: isBoleto ? "Boleto" : "Pix (DICT)",
        amount: Number(t.amount || 0),
        tax: Number(meta.tax ?? 0),
        status: String(t.status || "PENDING").toUpperCase(),
        lote: meta.lote || "---",
      };
    });
  }, [transferencias]);

  // Aplicar Filtros
  const filteredList = useMemo(() => {
    return rawList.filter((item) => {
      // Busca por palavras-chave
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchDoc = item.document.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        if (!matchName && !matchDoc && !matchDesc) return false;
      }

      // Filtro de Status
      if (filters.status !== "ALL") {
        if (item.status !== filters.status) return false;
      }

      return true;
    });
  }, [rawList, filters]);

  // Cálculo de Paginação
  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage, itemsPerPage]);

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedList.map((t) => t.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const totalSelected = rawList
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(true)}
            className="text-xs gap-2 rounded-xl border-border/60 hover:border-amber-500/40"
          >
            <Filter className="w-3.5 h-3.5 text-amber-500" /> Filtros
          </Button>
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
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={selectedIds.length === paginatedList.length && paginatedList.length > 0}
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
                  {paginatedList.map((t) => {
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleInspect(t)}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-amber-500/10 hover:text-amber-500"
                            title="Verificar Saque"
                          >
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

          {/* Rodapé de Paginação estilo DiviPay Oficial (<< < > >> Página 1 de 4 | Exibir 20 v) */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 p-4 border-t border-border/40 text-xs">
            {/* Controles de Navegação de Páginas */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-lg border-border/60"
                title="Primeira página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-lg border-border/60"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-lg border-border/60"
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-lg border-border/60"
                title="Última página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Contador de Página */}
            <span className="text-xs text-muted-foreground font-medium">
              Página <strong className="text-foreground font-bold">{currentPage}</strong> de <strong className="text-foreground font-bold">{totalPages}</strong>
            </span>

            {/* Select do tamanho da página (Exibir 20, 50, 100, 250, 500) */}
            <div className="flex items-center gap-2">
              <Select
                value={String(itemsPerPage)}
                onValueChange={(val) => {
                  setItemsPerPage(Number(val));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 text-xs w-[120px] rounded-lg border-border/60 bg-background">
                  <SelectValue placeholder="Exibir 20" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="20">Exibir 20</SelectItem>
                  <SelectItem value="50">Exibir 50</SelectItem>
                  <SelectItem value="100">Exibir 100</SelectItem>
                  <SelectItem value="250">Exibir 250</SelectItem>
                  <SelectItem value="500">Exibir 500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drawer Lateral de Filtros */}
      <SaquesFiltrosSheet
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        filters={filters}
        onApplyFilters={setFilters}
        onClearFilters={() =>
          setFilters({
            searchQuery: "",
            status: "ALL",
            startDate: "2026-07-01T00:00",
            endDate: "2026-07-31T23:59",
          })
        }
      />

      {/* Modal Verificar Saque */}
      <VerificarSaqueModal
        open={isInspectOpen}
        onOpenChange={setIsInspectOpen}
        saque={inspectingSaque}
      />
    </div>
  );
}

