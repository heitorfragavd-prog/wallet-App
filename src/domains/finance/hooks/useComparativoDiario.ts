import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { fetchReceitas } from "@/domains/finance/hooks/useReceitas";
import { supabase } from "@/integrations/supabase/client";

export interface DailyPoint {
  dia: number; // 1..31
  labelDia: string; // "Dia 01"
  receitaReal: number | null; // null para dias futuros
  receitaMedia: number;
  despesaReal: number | null;
  despesaMedia: number;
  saldoReal: number | null;
  saldoMedio: number;
}

export interface ComparativoDiarioCards {
  diaSelecionado: number;
  maxDiaDisponivel: number;
  receitaAtual: number;
  receitaMedia: number;
  receitaDiffRs: number;
  receitaDiffPct: number;
  despesaAtual: number;
  despesaMedia: number;
  despesaDiffRs: number;
  despesaDiffPct: number;
  saldoAtual: number;
  saldoMedio: number;
  saldoDiffRs: number;
  saldoDiffPct: number;
}

export interface ComparativoDiarioInsight {
  status: "positivo" | "alerta" | "neutro";
  mensagem: string;
}

export interface UseComparativoDiarioParams {
  monthsCount?: number; // 3, 6 ou 12
  selectedDay?: number; // 1 a maxDia
}

interface RawFinancialItem {
  data: string;
  valor: number;
  tipo: "receita" | "despesa";
}

const PAGE_SIZE = 1000;

async function fetchAllQueryRows<T>(buildQuery: () => any): Promise<T[]> {
  const all: T[] = [];
  try {
    for (let offset = 0; offset < 50000; offset += PAGE_SIZE) {
      const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        throw new Error(error.message);
      }
      const rows = (data as T[]) ?? [];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error("Não foi possível carregar os dados do comparativo diário");
  }
  return all;
}

export function useComparativoDiario({ monthsCount = 6, selectedDay }: UseComparativoDiarioParams = {}) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["comparativo_diario_oficial", workspaceId, monthsCount, selectedDay],
    queryFn: async () => {
      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtualIndex = agora.getMonth(); // 0..11
      const diaHoje = agora.getDate();

      const diasNoMesAtual = new Date(anoAtual, mesAtualIndex + 1, 0).getDate();
      const maxDiaDisponivel = Math.min(diaHoje, diasNoMesAtual);
      const diaAlvo = selectedDay ? Math.min(selectedDay, maxDiaDisponivel) : maxDiaDisponivel;

      // 1. Identificar intervalo de meses anteriores para a média histórica (ex: últimos N meses completos)
      const historicMonths: Array<{ year: number; monthIndex: number }> = [];
      for (let i = monthsCount; i >= 1; i--) {
        const d = new Date(anoAtual, mesAtualIndex - i, 1);
        historicMonths.push({ year: d.getFullYear(), monthIndex: d.getMonth() });
      }

      // Definir datas do range total (de início dos meses históricos até o fim do mês atual)
      const dataInicioJanela = new Date(anoAtual, mesAtualIndex - monthsCount, 1);
      const startStr = `${dataInicioJanela.getFullYear()}-${String(dataInicioJanela.getMonth() + 1).padStart(2, "0")}-01`;
      const endStr = `${anoAtual}-${String(mesAtualIndex + 1).padStart(2, "0")}-${String(diasNoMesAtual).padStart(2, "0")}`;

      // 2. Buscar Receitas usando o mesmo motor de useReceitas (com regime = "liquido")
      const receitasConsolidadas = await fetchReceitas(
        { startDate: startStr, endDate: endStr, regime: "liquido" },
        {},
        workspaceId
      );

      // 3. Buscar Despesas usando a mesma consulta padrão da tela Despesas
      const applyWorkspaceFilter = (q: any) => {
        let query = q;
        if (workspaceId) {
          query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
        }
        return query.gte("data", startStr).lte("data", `${endStr}T23:59:59`);
      };

      const [despesasRows, transacoesDespesasRows] = await Promise.all([
        fetchAllQueryRows<any>(() => applyWorkspaceFilter(supabase.from("despesas").select("data, valor"))),
        fetchAllQueryRows<any>(() => applyWorkspaceFilter(supabase.from("transacoes").select("data, valor").eq("tipo", "despesa"))),
      ]);

      const items: RawFinancialItem[] = [];

      receitasConsolidadas.forEach((r) => {
        items.push({
          data: r.data,
          valor: Number(r.valor || 0),
          tipo: "receita",
        });
      });

      despesasRows.forEach((d) => {
        items.push({
          data: d.data,
          valor: Number(d.valor || 0),
          tipo: "despesa",
        });
      });

      transacoesDespesasRows.forEach((d) => {
        items.push({
          data: d.data,
          valor: Number(d.valor || 0),
          tipo: "despesa",
        });
      });

      // 4. Matrizes de acumulação diária (dias 1 a 31)
      const mesAtualReceitaDia: number[] = new Array(32).fill(0);
      const mesAtualDespesaDia: number[] = new Array(32).fill(0);

      const historicoReceitasDia: number[][] = Array.from({ length: historicMonths.length }, () => new Array(32).fill(0));
      const historicoDespesasDia: number[][] = Array.from({ length: historicMonths.length }, () => new Array(32).fill(0));

      items.forEach((item) => {
        if (!item.data) return;
        const dateStr = item.data.includes("T") ? item.data.split("T")[0] : item.data;
        const parts = dateStr.split("-");
        if (parts.length < 3) return;

        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1; // 0..11
        const d = Number(parts[2]);

        if (d < 1 || d > 31) return;

        const valor = item.valor;
        const isReceita = item.tipo === "receita";

        if (y === anoAtual && m === mesAtualIndex) {
          if (isReceita) mesAtualReceitaDia[d] += valor;
          else mesAtualDespesaDia[d] += valor;
        } else {
          const hIdx = historicMonths.findIndex((hm) => hm.year === y && hm.monthIndex === m);
          if (hIdx !== -1) {
            if (isReceita) historicoReceitasDia[hIdx][d] += valor;
            else historicoDespesasDia[hIdx][d] += valor;
          }
        }
      });

      // 5. Calcular Acumulados
      const mesAtualReceitaAcum: number[] = new Array(32).fill(0);
      const mesAtualDespesaAcum: number[] = new Array(32).fill(0);
      let runRec = 0;
      let runDesp = 0;

      for (let d = 1; d <= 31; d++) {
        runRec += mesAtualReceitaDia[d];
        runDesp += mesAtualDespesaDia[d];
        mesAtualReceitaAcum[d] = runRec;
        mesAtualDespesaAcum[d] = runDesp;
      }

      const historicoReceitasAcum: number[][] = historicMonths.map(() => new Array(32).fill(0));
      const historicoDespesasAcum: number[][] = historicMonths.map(() => new Array(32).fill(0));

      historicMonths.forEach((_, hIdx) => {
        let hRec = 0;
        let hDesp = 0;
        for (let d = 1; d <= 31; d++) {
          hRec += historicoReceitasDia[hIdx][d];
          hDesp += historicoDespesasDia[hIdx][d];
          historicoReceitasAcum[hIdx][d] = hRec;
          historicoDespesasAcum[hIdx][d] = hDesp;
        }
      });

      // 6. Médias Históricas por dia
      const mediaReceitasAcum: number[] = new Array(32).fill(0);
      const mediaDespesasAcum: number[] = new Array(32).fill(0);
      const numHist = historicMonths.length || 1;

      for (let d = 1; d <= 31; d++) {
        let sumRec = 0;
        let sumDesp = 0;
        for (let hIdx = 0; hIdx < numHist; hIdx++) {
          sumRec += historicoReceitasAcum[hIdx][d];
          sumDesp += historicoDespesasAcum[hIdx][d];
        }
        mediaReceitasAcum[d] = sumRec / numHist;
        mediaDespesasAcum[d] = sumDesp / numHist;
      }

      // 7. Gráfico Diário de Séries Acumuladas (1 a 31)
      const chartData: DailyPoint[] = [];
      for (let d = 1; d <= 31; d++) {
        const isFuturo = d > diaHoje || d > diasNoMesAtual;
        const recReal = isFuturo ? null : mesAtualReceitaAcum[d];
        const despReal = isFuturo ? null : mesAtualDespesaAcum[d];
        const saldoRealVal = isFuturo ? null : (recReal! - despReal!);

        chartData.push({
          dia: d,
          labelDia: `Dia ${String(d).padStart(2, "0")}`,
          receitaReal: recReal,
          receitaMedia: mediaReceitasAcum[d],
          despesaReal: despReal,
          despesaMedia: mediaDespesasAcum[d],
          saldoReal: saldoRealVal,
          saldoMedio: mediaReceitasAcum[d] - mediaDespesasAcum[d],
        });
      }

      // 8. Cards até o dia selecionado
      const recAtual = mesAtualReceitaAcum[diaAlvo];
      const recMed = mediaReceitasAcum[diaAlvo];
      const recDiff = recAtual - recMed;
      const recPct = recMed > 0 ? (recDiff / recMed) * 100 : recAtual > 0 ? 100 : 0;

      const despAtual = mesAtualDespesaAcum[diaAlvo];
      const despMed = mediaDespesasAcum[diaAlvo];
      const despDiff = despAtual - despMed;
      const despPct = despMed > 0 ? (despDiff / despMed) * 100 : despAtual > 0 ? 100 : 0;

      const saldoAtualVal = recAtual - despAtual;
      const saldoMedVal = recMed - despMed;
      const saldoDiff = saldoAtualVal - saldoMedVal;
      const saldoPct = Math.abs(saldoMedVal) > 0 ? (saldoDiff / Math.abs(saldoMedVal)) * 100 : saldoAtualVal > 0 ? 100 : 0;

      const cards: ComparativoDiarioCards = {
        diaSelecionado: diaAlvo,
        maxDiaDisponivel,
        receitaAtual: recAtual,
        receitaMedia: recMed,
        receitaDiffRs: recDiff,
        receitaDiffPct: recPct,
        despesaAtual: despAtual,
        despesaMedia: despMed,
        despesaDiffRs: despDiff,
        despesaDiffPct: despPct,
        saldoAtual: saldoAtualVal,
        saldoMedio: saldoMedVal,
        saldoDiffRs: saldoDiff,
        saldoDiffPct: saldoPct,
      };

      // 9. Insight Inteligente
      const fmtRs = (val: number) =>
        `R$ ${Math.abs(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const recStatusText = recDiff >= 0 ? `${fmtRs(recDiff)} acima` : `${fmtRs(recDiff)} abaixo`;
      const despStatusText = despDiff >= 0 ? `${fmtRs(despDiff)} acima` : `${fmtRs(despDiff)} abaixo`;
      const saldoStatusText = saldoDiff >= 0 ? `${fmtRs(saldoDiff)} melhor` : `${fmtRs(saldoDiff)} abaixo`;

      const statusInsight: "positivo" | "alerta" | "neutro" =
        saldoDiff >= 0 ? "positivo" : "alerta";

      const mensagemInsight = `Até o dia ${diaAlvo}, sua receita está ${recStatusText} da média. As despesas estão ${despStatusText}, e o saldo está ${saldoStatusText} que o habitual.`;

      return {
        chartData,
        cards,
        insight: {
          status: statusInsight,
          mensagem: mensagemInsight,
        },
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}


