import { useMemo } from "react";
import { useTransacoes } from "./useTransacoes";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";

const DESPESAS_FIXAS = ["Aluguel", "Salarios", "Folha", "Internet", "Luz", "Agua", "Telefone", "Condominio", "IPTU", "Seguro", "Contador", "Marketing"];

export function usePontoEquilibrio() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = new Date(ano, hoje.getMonth() + 1, 0).toISOString().split("T")[0];
  const hojeStr = hoje.toISOString().split("T")[0];

  const { transacoes } = useTransacoes({ startDate: inicioMes, endDate: fimMes });
  const { dividas } = useDividas();
  const { recorrentes } = useRecurringTransactions();

  return useMemo(() => {
    const fixas = transacoes
      .filter(t => t.tipo === "despesa" && DESPESAS_FIXAS.includes(t.categorias?.nome || ""))
      .reduce((s, t) => s + Number(t.valor), 0);

    const parcelas = dividas
      .filter(d => d.status !== "quitada" && d.data_vencimento >= inicioMes && d.data_vencimento <= fimMes)
      .reduce((s, d) => s + (d.parcelas > 1 ? Number(d.valor_total) / d.parcelas : Number(d.valor_restante)), 0);

    const recorrentesMes = recorrentes
      .filter(r => r.ativo && r.tipo_transacao === "despesa")
      .reduce((s, r) => s + Number(r.valor), 0);

    const diasUteis = 26;
    const taxaCMV = 0.30;
    const custoFixoDiario = (fixas + parcelas + recorrentesMes) / diasUteis;
    const pontoEquilibrio = custoFixoDiario / (1 - taxaCMV);

    const vendasHoje = transacoes
      .filter(t => t.tipo === "receita" && t.data.split("T")[0] === hojeStr)
      .reduce((s, t) => s + Number(t.valor), 0);

    const percentual = pontoEquilibrio > 0 ? (vendasHoje / pontoEquilibrio) * 100 : 0;

    return { pontoEquilibrio, vendasHoje, percentual, custoFixoDiario };
  }, [transacoes, dividas, recorrentes, hojeStr, inicioMes, fimMes]);
}
