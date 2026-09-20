import { useMemo } from "react";
import { useDespesas } from "./useDespesas";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { useContasUsuario } from "./useContasUsuario";
import { getHojeSaoPaulo } from "../utils/dateHelpers";

export function useBurnRate() {
  const hojeStr = getHojeSaoPaulo();
  const [ano, mes] = hojeStr.split("-");
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = new Date(Number(ano), Number(mes), 0).toISOString().split("T")[0];
  const diasNoMes = new Date(Number(ano), Number(mes), 0).getDate();

  // Despesas consolidadas do mês atual (saques Divipay + despesas locais pagas)
  const { despesas: despesasMes } = useDespesas({ startDate: inicioMes, endDate: fimMes });
  const { dividas } = useDividas();
  const { recorrentes } = useRecurringTransactions();
  const { contas } = useContasUsuario();

  return useMemo(() => {
    // Despesas do mês atual consolidadas
    const despesas = despesasMes
      .filter(d => d.status === "pago")
      .reduce((s, d) => s + Number(d.valor || 0), 0);

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
  }, [despesasMes, dividas, recorrentes, contas, diasNoMes, inicioMes, fimMes]);
}
