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
  const diasNoMes = new Date(ano, hoje.getMonth() + 1, 0).getDate();

  // CORRECAO: passar filtro de data para useTransacoes — so busca do mes atual
  const { transacoes } = useTransacoes({ startDate: inicioMes, endDate: fimMes });
  const { dividas } = useDividas();
  const { recorrentes } = useRecurringTransactions();
  const { contas } = useContasUsuario();

  return useMemo(() => {
    // Despesas do mes atual (JA filtradas pelo useTransacoes)
    const despesas = transacoes.filter(t => t.tipo === "despesa").reduce((s, t) => s + Number(t.valor), 0);

    // Parcelas de dívidas a vencer no mes
    const parcelas = dividas
      .filter(d => d.status !== "quitada" && d.data_vencimento >= inicioMes && d.data_vencimento <= fimMes)
      .reduce((s, d) => s + (d.parcelas > 1 ? Number(d.valor_total) / d.parcelas : Number(d.valor_restante)), 0);

    // Recorrentes do mes
    const recorrentesMes = recorrentes
      .filter(r => r.ativo && r.tipo_transacao === "despesa")
      .reduce((s, r) => s + Number(r.valor), 0);

    // Total de saidas do mes
    const totalSaidas = despesas + parcelas + recorrentesMes;
    const burnRate = totalSaidas / diasNoMes;

    // Saldo atual das contas (exclui cartao de credito)
    const saldoAtual = (contas ?? [])
      .filter(c => c.tipo !== "cartao_credito")
      .reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0);

    const runway = burnRate > 0 ? saldoAtual / burnRate : 999;

    return { burnRate, runway, saldoAtual };
  }, [transacoes, dividas, recorrentes, contas, inicioMes, fimMes, diasNoMes]);
}
