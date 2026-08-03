import { useMemo } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { calcularPeriodoFatura, PeriodoFaturaInfo } from "./useFaturasCartao";
import { useDespesas, Despesa } from "./useDespesas";

export interface ComprasFaturaResult {
  despesas: Despesa[];
  fatura: null;
  periodo: PeriodoFaturaInfo;
  totalFatura: number;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Hook que filtra despesas já carregadas pelo useDespesas
 * para exibir somente as que pertencem à fatura de um mês/ano específico.
 *
 * Funciona sem precisar da tabela faturas_cartao — usa apenas o mês
 * e o período de fechamento do cartão para filtrar no frontend.
 */
export const useComprasFatura = ({
  cartaoId,
  mesFatura,
  anoFatura,
  cartaoInfo,
}: {
  cartaoId?: string | null;
  mesFatura: number;
  anoFatura: number;
  cartaoInfo?: { dia_fechamento?: number | null; dia_vencimento?: number | null } | null;
}): ComprasFaturaResult => {
  const periodo = calcularPeriodoFatura(cartaoInfo || {}, mesFatura, anoFatura);
  const { despesas: todasDespesas, loading, refetch } = useDespesas();

  const despesasFiltradas = useMemo(() => {
    if (!cartaoId || !todasDespesas) return [];

    const mesKey = `${anoFatura}-${String(mesFatura).padStart(2, "0")}`;

    return todasDespesas.filter((d: any) => {
      // Deve pertencer a este cartão (por conta_id ou método cartão_crédito)
      const pertenceCartao =
        d.conta_id === cartaoId ||
        (d.metodo_pagamento === "cartao_credito" && !d.conta_id);
      if (!pertenceCartao) return false;

      // Dentro do período de fechamento (data_inicio a data_fechamento)
      if (d.data >= periodo.data_inicio && d.data <= periodo.data_fechamento) return true;
      // Ou com data no mês da fatura (ex: 2026-07-xx) — fallback p/ importações com alocarNoMesFatura
      if (String(d.data).startsWith(mesKey)) return true;

      return false;
    });
  }, [cartaoId, todasDespesas, mesFatura, anoFatura, periodo.data_inicio, periodo.data_fechamento]);

  const totalFatura = despesasFiltradas.reduce((acc, d) => acc + (Number(d.valor) || 0), 0);

  return {
    despesas: despesasFiltradas,
    fatura: null,
    periodo,
    totalFatura,
    isLoading: loading,
    refetch,
  };
};
