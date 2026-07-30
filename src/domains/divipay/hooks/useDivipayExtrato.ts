import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { logger } from "@/core/logging/LoggerService";
import { useToast } from "@/shared/hooks/use-toast";
import type { DivipayMovement, ListMovementsParams } from "@/domains/divipay/types";

export const DIVIPAY_EXTRATO_QUERY_KEY = ["divipay-extrato"] as const;

export interface DivipayExtratoFilters {
  initialDate: string;
  finalDate: string;
  status?: string | null;
  type?: string | null;
}

export function useDivipayExtrato() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<DivipayExtratoFilters>(() => {
    const today = new Date().toISOString().split("T")[0];
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      initialDate: start.toISOString().split("T")[0],
      finalDate: today,
    };
  });

  const { data, isLoading: loading, error } = useQuery({
    queryKey: [...DIVIPAY_EXTRATO_QUERY_KEY, filters],
    queryFn: async () => {
      const params: ListMovementsParams = {
        initialDate: filters.initialDate,
        finalDate: filters.finalDate,
        status: filters.status,
        type: filters.type,
        limit: 100,
      };
      logger.info("useDivipayExtrato", "Buscando movimentações Divipay", params);
      return divipayService.listMovements(params);
    },
    enabled: Boolean(filters.initialDate && filters.finalDate),
    staleTime: 1000 * 60,
  });

  const exportCsv = (items: DivipayMovement[]) => {
    if (!items.length) {
      toast({ title: "Aviso", description: "Nenhuma movimentação para exportar." });
      return;
    }

    const headers = ["Data", "Código", "Tipo", "Status", "Valor", "Valor Líquido", "Taxas", "Pagador"];
    const rows = items.map((m) => [
      m.date,
      m.transactionCode,
      m.type,
      m.status,
      String(m.amount).replace(".", ","),
      String(m.amountLiquid).replace(".", ","),
      String(m.taxes).replace(".", ","),
      m.payerName ?? "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `divipay-extrato-${filters.initialDate}-${filters.finalDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Exportação concluída", description: `CSV com ${items.length} movimentações baixado.` });
  };

  return {
    movements: data?.items ?? [],
    nextCursor: data?.nextCursor ?? null,
    hasMore: data?.hasMore ?? false,
    loading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    filters,
    setFilters,
    exportCsv,
  };
}
