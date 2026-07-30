import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, formatISO } from "date-fns";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { logger } from "@/core/logging/LoggerService";
import type { DivipayBalance, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_DASHBOARD_QUERY_KEY = ["divipay-dashboard"] as const;

export interface DivipayDashboardFilters {
  initialDate?: string;
  finalDate?: string;
  type?: string | null;
  status?: string | null;
}

export interface DivipayDailyChartPoint {
  date: string;
  totalAmount: number;
  count: number;
}

export interface DivipayDashboardResult {
  balances: DivipayBalance[];
  entradas: number;
  saidas: number;
  transacoes: DivipayTransacao[];
  movements: DivipayMovement[];
  chartData: DivipayDailyChartPoint[];
  cobrancasSummary: {
    finalizadas: number;
    pendentes: number;
    canceladas: number;
    devolucoes: number;
  };
  vendasSummary: {
    valorEmVendas: number;
    valorBloqueado: number;
    liquidoClientes: number;
    totalVendas: number;
    finalizadas: number;
    canceladas: number;
  };
  metodosPagamento: {
    cartaoCredito: number;
    cartaoDebito: number;
    voucher: number;
    pix: number;
    boleto: number;
  };
  connected: boolean;
  connectionError: string | null;
}


function getDefaultDateRange(): { initialDate: string; finalDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return {
    initialDate: `${year}-${month}-01`,
    finalDate: `${year}-${month}-31`,
  };
}


export function useDivipayDashboard(filters?: DivipayDashboardFilters) {
  const defaultDates = getDefaultDateRange();
  const initialDate = filters?.initialDate || defaultDates.initialDate;
  const finalDate = filters?.finalDate || defaultDates.finalDate;
  const type = filters?.type || null;

  return useQuery<DivipayDashboardResult>({
    queryKey: [...DIVIPAY_DASHBOARD_QUERY_KEY, { initialDate, finalDate, type }],
    queryFn: async () => {
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

      let movements: DivipayMovement[] = [];
      try {
        let cursor: string | null | undefined = undefined;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 30; // Garante ate 6.000 movimentacoes no periodo

        const initialDateQuery = initialDate.includes("T") ? initialDate : `${initialDate}T00:00:00`;
        const finalDateQuery = finalDate.includes("T") ? finalDate : `${finalDate}T23:59:59`;

        while (hasMore && pageCount < maxPages) {
          const response = await divipayService.listMovements({
            initialDate: initialDateQuery,
            finalDate: finalDateQuery,
            type: type && type !== "all" ? type : undefined,
            cursor,
            limit: 200,
          });
          const newItems = response.items ?? [];
          movements = [...movements, ...newItems];
          hasMore = response.hasMore === true && !!response.nextCursor && newItems.length > 0;
          cursor = response.nextCursor;
          pageCount += 1;
        }
      } catch (err: unknown) {
        logger.error("useDivipayDashboard", "Erro ao buscar movimentações da Divipay API", { error: err instanceof Error ? err.message : String(err) });
      }

      let transacoes: DivipayTransacao[] = [];
      try {
        transacoes = await divipayService.getTransacoes({
          startDate: `${initialDate}T00:00:00.000Z`,
          endDate: `${finalDate}T23:59:59.999Z`,
        });
      } catch (err: unknown) {
        logger.error("useDivipayDashboard", "Erro ao buscar transações locais", { error: err instanceof Error ? err.message : String(err) });
      }

      // Cálculo de resumos baseados nos dados retornados pela API Divipay (movements) + local fallback (transacoes)
      let totalFinalizadasVal = 0;
      let totalPendentesVal = 0;
      let totalCanceladasVal = 0;
      let totalDevolucoesVal = 0;

      let valorEmVendas = 0;
      let liquidoClientes = 0;
      let totalVendasCount = 0;
      let finalizadasCount = 0;
      let canceladasCount = 0;

      let countCredit = 0;
      let countDebit = 0;
      let countVoucher = 0;
      let countPix = 0;
      let countBoleto = 0;

      if (movements.length > 0) {
        movements.forEach((m) => {
          const isCashIn = m.type === "CASH_IN" || m.type === "PIX_IN" || m.type === "CREDIT_CARD" || m.type === "DEBIT_CARD" || m.type === "PIX" || m.type === "TICKET";
          const st = String(m.status).toUpperCase();

          if (isCashIn) {
            totalVendasCount += 1;
            valorEmVendas += Number(m.amount || 0);
            liquidoClientes += Number(m.amountLiquid || m.amount || 0);

            if (["PAID", "CONFIRMED", "APPROVED", "FINISHED", "COMPLETED"].includes(st)) {
              finalizadasCount += 1;
              totalFinalizadasVal += Number(m.amount || 0);
            } else if (["PENDING", "PROCESSING"].includes(st)) {
              totalPendentesVal += Number(m.amount || 0);
            } else if (["CANCELED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(st)) {
              canceladasCount += 1;
              totalCanceladasVal += Number(m.amount || 0);
            } else if (["REFUNDED", "REVERSED"].includes(st)) {
              totalDevolucoesVal += Number(m.amount || 0);
            }

            // Meios de pagamento
            const tp = String(m.type).toUpperCase();
            if (tp.includes("CREDIT")) countCredit += 1;
            else if (tp.includes("DEBIT")) countDebit += 1;
            else if (tp.includes("VOUCHER")) countVoucher += 1;
            else if (tp.includes("PIX")) countPix += 1;
            else if (tp.includes("BOLETO") || tp.includes("TICKET")) countBoleto += 1;
            else countPix += 1; // Default Pix para entradas Divipay se não especificado
          }
        });
      } else {
        // Fallback local se a API de movimentações não retornar itens no período
        transacoes.forEach((t) => {
          if (t.type === "CASH_IN") {
            totalVendasCount += 1;
            const amt = Number(t.amount || 0);
            valorEmVendas += amt;
            liquidoClientes += amt;
            if (t.status === "PAID" || t.status === "FINISHED") {
              finalizadasCount += 1;
              totalFinalizadasVal += amt;
            } else if (t.status === "PENDING") {
              totalPendentesVal += amt;
            } else if (t.status === "CANCELED" || t.status === "CANCELLED") {
              canceladasCount += 1;
              totalCanceladasVal += amt;
            }
            countPix += 1;
          }
        });
      }

      // Agrupamento diário para o gráfico de Vendas no Mês
      const dailyMap: Record<string, { totalAmount: number; count: number }> = {};
      movements.forEach((m) => {
        if (!m.date) return;
        const dayStr = m.date.split("T")[0]; // YYYY-MM-DD
        const dayFormatted = dayStr.split("-").slice(1).reverse().join("/"); // MM/DD -> DD/MM
        if (!dailyMap[dayFormatted]) {
          dailyMap[dayFormatted] = { totalAmount: 0, count: 0 };
        }
        dailyMap[dayFormatted].totalAmount += Number(m.amount || 0);
        dailyMap[dayFormatted].count += 1;
      });

      const chartData: DivipayDailyChartPoint[] = Object.entries(dailyMap).map(([date, val]) => ({
        date,
        totalAmount: val.totalAmount,
        count: val.count,
      })).sort((a, b) => a.date.localeCompare(b.date));

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
        movements,
        chartData,
        cobrancasSummary: {
          finalizadas: totalFinalizadasVal,
          pendentes: totalPendentesVal,
          canceladas: totalCanceladasVal,
          devolucoes: totalDevolucoesVal,
        },
        vendasSummary: {
          valorEmVendas,
          valorBloqueado: 0,
          liquidoClientes,
          totalVendas: totalVendasCount,
          finalizadas: finalizadasCount,
          canceladas: canceladasCount,
        },
        metodosPagamento: {
          cartaoCredito: countCredit,
          cartaoDebito: countDebit,
          voucher: countVoucher,
          pix: countPix,
          boleto: countBoleto,
        },
        connected,
        connectionError,
      };
    },
    staleTime: 1000 * 60,
  });
}

