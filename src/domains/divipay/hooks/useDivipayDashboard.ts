import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, formatISO } from "date-fns";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { logger } from "@/core/logging/LoggerService";
import type { DivipayBalance, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_DASHBOARD_QUERY_KEY = ["divipay-dashboard"] as const;

export interface DivipayDashboardResult {
  balances: DivipayBalance[];
  entradas: number;
  saidas: number;
  transacoes: DivipayTransacao[];
  connected: boolean;
  connectionError: string | null;
}

function getMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return {
    startDate: formatISO(start, { representation: "date" }),
    endDate: formatISO(end, { representation: "date" }),
  };
}

export function useDivipayDashboard() {
  return useQuery<DivipayDashboardResult>({
    queryKey: DIVIPAY_DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const { startDate, endDate } = getMonthRange();
      let balances: DivipayBalance[] = [];
      let connected = false;
      let connectionError: string | null = null;

      try {
        balances = await divipayService.getBalance();
        connected = balances.length > 0;
      } catch (err: unknown) {
        connectionError = err instanceof Error ? err.message : "Erro ao conectar com a API Divipay";
        logger.error("useDivipayDashboard", "Erro ao buscar saldo", { error: connectionError });
      }

      let transacoes: DivipayTransacao[] = [];
      try {
        transacoes = await divipayService.getTransacoes({
          startDate: `${startDate}T00:00:00.000Z`,
          endDate: `${endDate}T23:59:59.999Z`,
        });
      } catch (err: unknown) {
        logger.error("useDivipayDashboard", "Erro ao buscar transações locais", { error: err instanceof Error ? err.message : String(err) });
      }

      const entradas = transacoes
        .filter((t) => t.type === "CASH_IN")
        .reduce((acc, t) => acc + Number(t.amount), 0);
      const saidas = transacoes
        .filter((t) => t.type === "CASH_OUT")
        .reduce((acc, t) => acc + Number(t.amount), 0);

      return {
        balances,
        entradas,
        saidas,
        transacoes,
        connected,
        connectionError,
      };
    },
    staleTime: 1000 * 60,
  });
}
