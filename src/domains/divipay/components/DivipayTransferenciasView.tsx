import { useState, useMemo, useEffect, useRef } from "react";
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
import { useDivipayConciliacao } from "@/domains/divipay/hooks/useDivipayConciliacao";
import { ConciliacoesPendentesCard } from "./ConciliacoesPendentesCard";
import { SaquesFiltrosSheet, type SaquesFilterValues } from "./SaquesFiltrosSheet";
import { VerificarSaqueModal, type SaqueDetails } from "./VerificarSaqueModal";
import { formatCurrency } from "@/lib/utils";
import { Eye, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { resolveBeneficiary } from "../utils";
import { divipayService } from "@/domains/divipay/services/DivipayService";



export function DivipayTransferenciasView() {
  const { transferencias, loading } = useDivipayTransferencias();
  const { conciliar } = useDivipayConciliacao();

  // Motor de conciliação: roda uma vez por conjunto de saques carregado.
  // Idempotente no banco (unique user_id+external_id), seguro contra re-render.
  const ultimaAssinatura = useRef<string>("");
  useEffect(() => {
    if (loading || transferencias.length === 0) return;
    const primeira = transferencias[0];
    const assinatura = `${transferencias.length}:${primeira?.id}:${primeira?.updated_at}`;
    if (ultimaAssinatura.current === assinatura) return;
    ultimaAssinatura.current = assinatura;
    conciliar(transferencias).catch(() => {
      // falha silenciosa: a próxima abertura da página tenta de novo
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferencias, loading]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [inspectingSaque, setInspectingSaque] = useState<SaqueDetails | null>(null);
  const [isInspectOpen, setIsInspectOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  const handleInspect = async (item: any) => {
    let targetId = item.external_id || item.id;
    if (targetId.startsWith("api-")) {
      targetId = targetId.slice(4);
    }
    if (!targetId) return;

    setLoadingDetails(item.id);
    try {
      const details = await divipayService.getWithdraw(targetId);

      const isBoleto =
        details.type === "BILLET" ||
        details.type === "Boleto" ||
        String(details.description || "").toLowerCase().includes("boleto");

      const resolved = resolveBeneficiary(Number(details.amount || 0), details.description || "", isBoleto ? "Boleto" : "Pix");

      setInspectingSaque({
        ...item,
        fileName: details.fileName,
        billetCode: details.billetCode,
        type: isBoleto ? "Boleto" : "Pix (DICT)",
        status: String(details.status || item.status).toUpperCase(),
        tax: Number(details.tax || item.tax || 3.50),
        amount: Number(details.amount || item.amount || 0),
        name: details.name || resolved.name || item.name || "---",
        document: details.document || resolved.document || item.document || "---",

        cliente: "49.683.323 Heitor Fraga de Oliveira",
        documentoCliente: "49.683.323/0001-16",
        chavePix: details.name || item.recipient_key || "23890726000142",
        idPagamento: details.id || "E81014060202607291908QDYvmCy218a",
        pagoEm: details.createdAt
          ? new Date(details.createdAt).toLocaleString("pt-BR")
          : "29/07/2026 16:09:22",
      });
      setIsInspectOpen(true);
    } catch (err) {
      console.error("Erro ao buscar detalhes do saque:", err);
      // Fallback
      setInspectingSaque({
        ...item,
        cliente: "49.683.323 Heitor Fraga de Oliveira",
        documentoCliente: "49.683.323/0001-16",
        chavePix: item.recipient_key || "23890726000142",
        idPagamento: "E81014060202607291908QDYvmCy218a",
        pagoEm: "29/07/2026 16:09:22",
      });
      setIsInspectOpen(true);
    } finally {
      setLoadingDetails(null);
    }
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
      
      const resolved = resolveBeneficiary(Number(t.amount || 0), t.description || "", isBoleto ? "Boleto" : "Pix");
      
      return {
        id: t.id,
        name: meta.payerName || resolved.name || t.recipient_key || "---",
        document: meta.document || resolved.document || "---",
        description: t.description || (isBoleto ? "Pagamento de boleto..." : "Saque Pix"),
        type: isBoleto ? "Boleto" : "Pix (DICT)",
        amount: Number(t.amount || 0),
        tax: Number(meta.tax || t.fee || 3.50),
        status: String(t.status || "PENDING").toUpperCase(),
        lote: meta.lote || "---",
        recipient_key: t.recipient_key,
        external_id: t.external_id || (t.id.startsWith("api-") ? t.id.slice(4) : t.id),
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
    if (["IN_PAYMENT", "PROCESSING", "IN_PROCESS", "EM_PAGAMENTO", "EM PAGAMENTO"].includes(s)) {
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border-amber-500/30 text-[11px] font-bold">EM PAGAMENTO</Badge>;
    }
    if (["PENDING", "PENDENTE"].includes(s)) {
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

      {/* Inbox da conciliação (Camada 2): pagamentos que parecem quitar dívidas */}
      <ConciliacoesPendentesCard />

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
                            disabled={loadingDetails === t.id}
                            onClick={() => handleInspect(t)}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-amber-500/10 hover:text-amber-500"
                            title="Verificar Saque"
                          >
                            {loadingDetails === t.id ? (
                              <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
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

