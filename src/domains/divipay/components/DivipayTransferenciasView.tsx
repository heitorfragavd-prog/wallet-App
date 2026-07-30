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

  // Lista oficial fornecida pela Divipay expandida em 4 paginas (80 itens de 20 por pagina)
  const mockSaques = useMemo(() => [
    // PAGINA 1 (Itens 1-20)
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

    // PAGINA 2 (Itens 21-40)
    { id: "s21", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "Fornecimento bebidas", type: "Pix (DICT)", amount: 2450.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s22", name: "---", document: "11.222.333/0001-44", description: "Pagamento de boleto...", type: "Boleto", amount: 1120.50, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s23", name: "GERSON DOS SANTOS PINTO", document: "---", description: "gerson salgados", type: "Pix (DICT)", amount: 890.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s24", name: "Kenia Keylla Vieira Costa", document: "---", description: "comissao kenia", type: "Pix (DICT)", amount: 1500.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s25", name: "---", document: "44.555.666/0001-77", description: "Pagamento de boleto...", type: "Boleto", amount: 3450.90, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s26", name: "Shuellen Pereira Santos", document: "---", description: "reembolso viagem", type: "Pix (DICT)", amount: 430.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s27", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "diaria folguista", type: "Pix (DICT)", amount: 250.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s28", name: "VICTOR RAFAEL DA PAIXAO FARIA", document: "---", description: "diaria victor", type: "Pix (DICT)", amount: 180.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s29", name: "Geovanna Cardoso Moreira", document: "---", description: "passagem geovanna", type: "Pix (DICT)", amount: 95.50, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s30", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "compra estoque", type: "Pix (DICT)", amount: 3200.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s31", name: "---", document: "88.999.000/0001-11", description: "Pagamento de boleto...", type: "Boleto", amount: 980.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s32", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "adiantamento viviane", type: "Pix (DICT)", amount: 750.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s33", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "compra insumos", type: "Pix (DICT)", amount: 1890.40, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s34", name: "---", document: "22.333.444/0001-55", description: "Pagamento de boleto...", type: "Boleto", amount: 620.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s35", name: "GERSON DOS SANTOS PINTO", document: "---", description: "lote salgados", type: "Pix (DICT)", amount: 2100.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s36", name: "Kenia Keylla Vieira Costa", document: "---", description: "acerto final", type: "Pix (DICT)", amount: 2300.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s37", name: "Shuellen Pereira Santos", document: "---", description: "passagem extra", type: "Pix (DICT)", amount: 120.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s38", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "extra semana", type: "Pix (DICT)", amount: 300.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s39", name: "---", document: "77.888.999/0001-22", description: "Pagamento de boleto...", type: "Boleto", amount: 1450.80, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s40", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "restituicao perobas", type: "Pix (DICT)", amount: 890.00, tax: 3.50, status: "FINALIZADO", lote: "---" },

    // PAGINA 3 (Itens 41-60)
    { id: "s41", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "lote 04 carvalho", type: "Pix (DICT)", amount: 3100.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s42", name: "---", document: "33.444.555/0001-66", description: "Pagamento de boleto...", type: "Boleto", amount: 780.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s43", name: "GERSON DOS SANTOS PINTO", document: "---", description: "salgados semana 3", type: "Pix (DICT)", amount: 1650.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s44", name: "Kenia Keylla Vieira Costa", document: "---", description: "kenia vendas", type: "Pix (DICT)", amount: 1850.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s45", name: "VICTOR RAFAEL DA PAIXAO FARIA", document: "---", description: "victor extra", type: "Pix (DICT)", amount: 140.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s46", name: "Geovanna Cardoso Moreira", document: "---", description: "geovanna ajuda", type: "Pix (DICT)", amount: 110.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s47", name: "---", document: "55.666.777/0001-88", description: "Pagamento de boleto...", type: "Boleto", amount: 2890.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s48", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "pagamento quinzenal", type: "Pix (DICT)", amount: 1250.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s49", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "perobas bebidas", type: "Pix (DICT)", amount: 4100.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s50", name: "Shuellen Pereira Santos", document: "---", description: "shuellen meta", type: "Pix (DICT)", amount: 340.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s51", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "luiz apoio", type: "Pix (DICT)", amount: 210.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s52", name: "---", document: "99.000.111/0001-33", description: "Pagamento de boleto...", type: "Boleto", amount: 530.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s53", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "carvalho dias pix", type: "Pix (DICT)", amount: 2750.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s54", name: "GERSON DOS SANTOS PINTO", document: "---", description: "gerson fornecimento", type: "Pix (DICT)", amount: 1430.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s55", name: "Kenia Keylla Vieira Costa", document: "---", description: "kenia acerto", type: "Pix (DICT)", amount: 980.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s56", name: "---", document: "12.345.678/0001-99", description: "Pagamento de boleto...", type: "Boleto", amount: 1670.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s57", name: "VICTOR RAFAEL DA PAIXAO FARIA", document: "---", description: "victor comissao", type: "Pix (DICT)", amount: 220.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s58", name: "Geovanna Cardoso Moreira", document: "---", description: "geovanna saldo", type: "Pix (DICT)", amount: 130.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s59", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "viviane fechamento", type: "Pix (DICT)", amount: 880.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s60", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "perobas saldo", type: "Pix (DICT)", amount: 1950.00, tax: 3.50, status: "FINALIZADO", lote: "---" },

    // PAGINA 4 (Itens 61-80)
    { id: "s61", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "compra geral", type: "Pix (DICT)", amount: 4500.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s62", name: "---", document: "44.333.222/0001-11", description: "Pagamento de boleto...", type: "Boleto", amount: 920.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s63", name: "GERSON DOS SANTOS PINTO", document: "---", description: "gerson semanal", type: "Pix (DICT)", amount: 1200.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s64", name: "Kenia Keylla Vieira Costa", document: "---", description: "kenia bonus", type: "Pix (DICT)", amount: 3100.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s65", name: "Shuellen Pereira Santos", document: "---", description: "shuellen bonus", type: "Pix (DICT)", amount: 450.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s66", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "luiz diaria", type: "Pix (DICT)", amount: 280.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s67", name: "---", document: "88.777.666/0001-55", description: "Pagamento de boleto...", type: "Boleto", amount: 1340.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s68", name: "VICTOR RAFAEL DA PAIXAO FARIA", document: "---", description: "victor saldo", type: "Pix (DICT)", amount: 160.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s69", name: "Geovanna Cardoso Moreira", document: "---", description: "geovanna transporte", type: "Pix (DICT)", amount: 75.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s70", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "viviane transporte", type: "Pix (DICT)", amount: 450.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s71", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "perobas insumos", type: "Pix (DICT)", amount: 2600.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s72", name: "---", document: "66.555.444/0001-33", description: "Pagamento de boleto...", type: "Boleto", amount: 890.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s73", name: "COMERCIAL CARVALHO DIAS LTDA", document: "---", description: "carvalho dias faturamento", type: "Pix (DICT)", amount: 5200.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s74", name: "GERSON DOS SANTOS PINTO", document: "---", description: "gerson salgados final", type: "Pix (DICT)", amount: 1800.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s75", name: "Kenia Keylla Vieira Costa", document: "---", description: "kenia encerramento", type: "Pix (DICT)", amount: 2900.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s76", name: "Shuellen Pereira Santos", document: "---", description: "shuellen encerramento", type: "Pix (DICT)", amount: 510.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s77", name: "LUIZ FELLIPE SANTOS DE ASSIS", document: "---", description: "luiz encerramento", type: "Pix (DICT)", amount: 320.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s78", name: "---", document: "22.111.000/0001-88", description: "Pagamento de boleto...", type: "Boleto", amount: 2150.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s79", name: "Viviane Cristina Teotonio Siqueira", document: "---", description: "viviane pagamento final", type: "Pix (DICT)", amount: 1100.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
    { id: "s80", name: "DISTRIBUIDORA PEROBAS LTDA", document: "---", description: "perobas lote final", type: "Pix (DICT)", amount: 3800.00, tax: 3.50, status: "FINALIZADO", lote: "---" },
  ], []);


  const rawList = useMemo(() => {
    return transferencias.length > 0
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
  }, [transferencias, mockSaques]);

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

