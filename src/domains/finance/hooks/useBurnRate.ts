import { useMemo } from "react";
import { useTransacoes } from "./useTransacoes";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { useContasUsuario } from "./useContasUsuario";

export function useBurnRate() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = new Date(ano, hoje.getMonth() + 1, 0).toISOString().split("T")[0];

  const { transacoes } = useTransacoes({ startDate: inicioMes, endDate: fimMes });
  const { dividas } = useDividas();
  const { recorrentes } = useRecurringTransactions();
  const { contas } = useContasUsuario();

  return useMemo(() => {
    const despesas = transacoes.filter(t => t.tipo === "despesa").reduce((s, t) => s + Number(t.valor), 0);
    const parcelas = dividas
      .filter(d => d.status !== "quitada" && d.data_vencimento >= inicioMes && d.data_vencimento <= fimMes)
      .reduce((s, d) => s + (d.parcelas > 1 ? Number(d.valor_total) / d.parcelas : Number(d.valor_restante)), 0);
    const recorrentesMes = recorrentes.filter(r => r.ativo && r.tipo_transacao === "despesa").reduce((s, r) => s + Number(r.valor), 0);

    const totalSaidas = despesas + parcelas + recorrentesMes;
    const burnRate = totalSaidas / 30;
    const saldoAtual = (contas ?? []).filter(c => c.tipo !== "cartao_credito").reduce((s, c) => s + Number(c.saldo_atual ?? (c as any).saldo ?? 0), 0);
    const runway = burnRate > 0 ? saldoAtual / burnRate : 999;

    return { burnRate, runway, saldoAtual };
  }, [transacoes, dividas, recorrentes, contas, inicioMes, fimMes]);
}
