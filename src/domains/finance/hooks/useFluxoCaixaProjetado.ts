import { useMemo } from "react";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface FluxoCaixaPoint {
  data: string; // ISO YYYY-MM-DD
  dataFormatada: string; // DD/MM
  saldoProjetado: number;
  receitasProjetadas: number;
  despesasProjetadas: number;
  dividasProjetadas: number;
}

export const useFluxoCaixaProjetado = (diasProjecao: number = 30) => {
  const { transacoes, loading: loadingTransacoes } = useTransacoes();
  const { dividas, loading: loadingDividas } = useDividas();
  const { activeWorkspace } = useWorkspace();

  const dataProjecao = useMemo(() => {
    if (loadingTransacoes || loadingDividas) return [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 1. Saldo atual até a data de hoje
    let saldoAtual = 0;
    transacoes.forEach((t) => {
      const dataT = new Date(t.data + "T00:00:00");
      if (dataT <= hoje) {
        if (t.tipo === "receita") saldoAtual += Number(t.valor || 0);
        if (t.tipo === "despesa") saldoAtual -= Number(t.valor || 0);
      }
    });

    // Subtrai dívidas já pagas até hoje se não estiverem em transações
    dividas.forEach((d) => {
      const dataD = new Date(d.data_vencimento + "T00:00:00");
      if (dataD <= hoje && d.status === "quitada") {
        // Já contabilizado ou pago
      }
    });

    // 2. Construir mapa de eventos futuros pelos próximos N dias
    const pontos: FluxoCaixaPoint[] = [];
    let saldoAcumulado = saldoAtual;

    for (let i = 0; i <= diasProjecao; i++) {
      const diaCorrente = new Date(hoje);
      diaCorrente.setDate(hoje.getDate() + i);

      const strDia = diaCorrente.toISOString().split("T")[0];
      const diaNum = String(diaCorrente.getDate()).padStart(2, "0");
      const mesNum = String(diaCorrente.getMonth() + 1).padStart(2, "0");
      const dataFormatada = `${diaNum}/${mesNum}`;

      let receitasDoDia = 0;
      let despesasDoDia = 0;
      let dividasDoDia = 0;

      // Se for o dia 0 (hoje), consideramos o saldo já existente
      if (i > 0) {
        // Soma receitas e despesas futuras para este dia específico
        transacoes.forEach((t) => {
          if (t.data === strDia) {
            if (t.tipo === "receita") receitasDoDia += Number(t.valor || 0);
            if (t.tipo === "despesa") despesasDoDia += Number(t.valor || 0);
          }
        });

        // Soma dívidas a vencer neste dia que não estejam quitadas
        dividas.forEach((d) => {
          if (d.data_vencimento === strDia && d.status !== "quitada") {
            dividasDoDia += Number(d.valor_restante || d.valor_total || 0);
          }
        });

        // Atualiza o saldo acumulado
        saldoAcumulado = saldoAcumulado + receitasDoDia - despesasDoDia - dividasDoDia;
      }

      pontos.push({
        data: strDia,
        dataFormatada,
        saldoProjetado: parseFloat(saldoAcumulado.toFixed(2)),
        receitasProjetadas: parseFloat(receitasDoDia.toFixed(2)),
        despesasProjetadas: parseFloat(despesasDoDia.toFixed(2)),
        dividasProjetadas: parseFloat(dividasDoDia.toFixed(2)),
      });
    }

    return pontos;
  }, [transacoes, dividas, diasProjecao, loadingTransacoes, loadingDividas]);

  return {
    pontos: dataProjecao,
    saldoInicial: dataProjecao[0]?.saldoProjetado || 0,
    saldoFinal: dataProjecao[dataProjecao.length - 1]?.saldoProjetado || 0,
    loading: loadingTransacoes || loadingDividas,
  };
};
