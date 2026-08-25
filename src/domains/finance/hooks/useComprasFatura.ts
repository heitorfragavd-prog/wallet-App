import { useMemo } from "react";
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

    const mesRefEsperado = `${anoFatura}-${String(mesFatura).padStart(2, "0")}`;

    return todasDespesas.filter((d: any) => {
      // 1. Deve ser despesa com valor positivo
      if (d.tipo && d.tipo !== "despesa") return false;
      if (Number(d.valor) <= 0) return false;

      // 2. Deve pertencer ESTRITAMENTE a este cartão (por cartao_id ou conta_id)
      const pertenceCartao = d.cartao_id === cartaoId || d.conta_id === cartaoId;

      if (!pertenceCartao) return false;

      // 3. Se tiver mes_referencia (ex: "2026-08"), confere com anoFatura e mesFatura da fatura visualizada
      if (d.mes_referencia) {
        return d.mes_referencia === mesRefEsperado;
      }

      // 4. Filtro por período de datas fallback
      return d.data > periodo.data_inicio && d.data <= periodo.data_fechamento;
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
