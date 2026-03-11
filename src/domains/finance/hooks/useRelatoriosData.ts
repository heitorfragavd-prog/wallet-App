import { useMemo } from "react";
import { addDays, subDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { getPrimeiroDiaMes } from "../utils/dateHelpers";

interface Transacao {
  id: string;
  data: string;
  descricao: string;
  valor: number | string;
  tipo: string;
  categorias?: { nome: string; cor: string; icone?: string } | null;
  conta_id?: string;
}

export interface RelatoriosData {
  chartData: Array<{ periodo: string; receitas: number; despesas: number; saldo: number }>;
  categoryData: Array<{ categoria: string; valor: number; cor: string }>;
  filteredTransactions: Array<{
    id: string;
    data: string;
    descricao: string;
    categoria: string;
    valor: number;
    tipo: string;
  }>;
  totalReceitas: number;
  totalDespesas: number;
  saldoTotal: number;
  receitasMesAnterior: number;
  despesasMesAnterior: number;
  topCategoriasDespesa: Array<{ categoria: string; valor: number; cor: string }>;
  topCategoriasReceita: Array<{ categoria: string; valor: number; cor: string }>;
  mediaReceitaDiaria: number;
  mediaDespesaDiaria: number;
  diasComTransacoes: number;
  maiorReceita: Transacao | undefined;
  maiorDespesa: Transacao | undefined;
}

const EMPTY_DATA: RelatoriosData = {
  chartData: [],
  categoryData: [],
  filteredTransactions: [],
  totalReceitas: 0,
  totalDespesas: 0,
  saldoTotal: 0,
  receitasMesAnterior: 0,
  despesasMesAnterior: 0,
  topCategoriasDespesa: [],
  topCategoriasReceita: [],
  mediaReceitaDiaria: 0,
  mediaDespesaDiaria: 0,
  diasComTransacoes: 0,
  maiorReceita: undefined,
  maiorDespesa: undefined,
};

/**
 * Hook que encapsula toda a lógica de processamento de dados do Relatorios.tsx.
 * Substitui o gigante `useMemo` inline, tornando o componente mais legível e testável.
 */
export function useRelatoriosData(
  transacoes: Transacao[],
  loading: boolean,
  dateRange: DateRange | undefined,
  selectedCategory: string
): RelatoriosData {
  return useMemo(() => {
    if (loading || !transacoes.length) return EMPTY_DATA;

    const dataInicio = dateRange?.from
      ? dateRange.from.toISOString().split("T")[0]
      : getPrimeiroDiaMes();
    const dataFim = dateRange?.to
      ? dateRange.to.toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const filteredByPeriod = transacoes.filter((t) => {
      const dataTransacao = t.data.split("T")[0];
      return dataTransacao >= dataInicio && dataTransacao <= dataFim;
    });

    // ── Período anterior para comparação ─────────────────────────
    let receitasMesAnterior = 0;
    let despesasMesAnterior = 0;

    if (dateRange?.from) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const rangeDuration = dateRange.to
        ? Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay)
        : 30;

      const previousPeriodEnd = subDays(dateRange.from, 1);
      const previousPeriodStart = subDays(previousPeriodEnd, rangeDuration);
      const prevInicio = previousPeriodStart.toISOString().split("T")[0];
      const prevFim = previousPeriodEnd.toISOString().split("T")[0];

      const transacoesPrev = transacoes.filter((t) => {
        const data = t.data.split("T")[0];
        return data >= prevInicio && data <= prevFim;
      });

      receitasMesAnterior = transacoesPrev
        .filter((t) => t.tipo === "receita")
        .reduce((sum, t) => sum + Number(t.valor), 0);
      despesasMesAnterior = transacoesPrev
        .filter((t) => t.tipo === "despesa")
        .reduce((sum, t) => sum + Number(t.valor), 0);
    }

    // ── Totais ───────────────────────────────────────────────────
    const totalReceitas = filteredByPeriod
      .filter((t) => t.tipo === "receita")
      .reduce((sum, t) => sum + Number(t.valor), 0);
    const totalDespesas = filteredByPeriod
      .filter((t) => t.tipo === "despesa")
      .reduce((sum, t) => sum + Number(t.valor), 0);

    // ── Chart data ───────────────────────────────────────────────
    let chartData: RelatoriosData["chartData"] = [];
    const msPerDay = 1000 * 60 * 60 * 24;
    const diasNoRange =
      dateRange?.from && dateRange?.to
        ? Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / msPerDay) + 1
        : dateRange?.from
        ? 1
        : 30;

    if (diasNoRange <= 31) {
      for (let i = 0; i < diasNoRange; i++) {
        const currentDate = dateRange?.from ? addDays(dateRange.from, i) : new Date();
        const dataStr = currentDate.toISOString().split("T")[0];
        const transacoesDia = filteredByPeriod.filter((t) => t.data.split("T")[0] === dataStr);
        const receitas = transacoesDia
          .filter((t) => t.tipo === "receita")
          .reduce((sum, t) => sum + Number(t.valor), 0);
        const despesas = transacoesDia
          .filter((t) => t.tipo === "despesa")
          .reduce((sum, t) => sum + Number(t.valor), 0);
        chartData.push({
          periodo: currentDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          receitas,
          despesas,
          saldo: receitas - despesas,
        });
      }
    } else {
      const mesesMap = new Map<string, { periodo: string; receitas: number; despesas: number; saldo: number }>();
      filteredByPeriod.forEach((t) => {
        const mesAno = new Date(t.data).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        });
        if (!mesesMap.has(mesAno)) {
          mesesMap.set(mesAno, { periodo: mesAno, receitas: 0, despesas: 0, saldo: 0 });
        }
        const entry = mesesMap.get(mesAno)!;
        if (t.tipo === "receita") entry.receitas += Number(t.valor);
        if (t.tipo === "despesa") entry.despesas += Number(t.valor);
        entry.saldo = entry.receitas - entry.despesas;
      });
      chartData = Array.from(mesesMap.values());
    }

    // ── Category data ────────────────────────────────────────────
    const categoryMap = new Map<string, { valor: number; cor: string; tipo: string }>();
    filteredByPeriod.forEach((t) => {
      const key = `${t.categorias?.nome ?? "Sem categoria"}-${t.tipo}`;
      const existing = categoryMap.get(key);
      if (existing) {
        categoryMap.set(key, { ...existing, valor: existing.valor + Number(t.valor) });
      } else {
        categoryMap.set(key, {
          valor: Number(t.valor),
          cor: t.categorias?.cor ?? "#6B7280",
          tipo: t.tipo,
        });
      }
    });

    const categoryData = Array.from(categoryMap.entries())
      .filter(([, v]) => v.tipo === "despesa")
      .map(([k, v]) => ({ categoria: k.split("-")[0], valor: v.valor, cor: v.cor }))
      .sort((a, b) => b.valor - a.valor);

    const topCategoriasDespesa = categoryData;
    const topCategoriasReceita = Array.from(categoryMap.entries())
      .filter(([, v]) => v.tipo === "receita")
      .map(([k, v]) => ({ categoria: k.split("-")[0], valor: v.valor, cor: v.cor }))
      .sort((a, b) => b.valor - a.valor);

    // ── Filtered transactions ────────────────────────────────────
    const filteredTransactions = filteredByPeriod
      .filter((t) => selectedCategory === "todas" || t.tipo === selectedCategory)
      .map((t) => ({
        id: t.id,
        data: t.data,
        descricao: t.descricao,
        categoria: t.categorias?.nome ?? "Sem categoria",
        valor: Number(t.valor),
        tipo: t.tipo,
      }))
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 50);

    // ── Stats extras ─────────────────────────────────────────────
    const diasUnicos = new Set(filteredByPeriod.map((t) => t.data.split("T")[0])).size;
    const maiorReceita = filteredByPeriod
      .filter((t) => t.tipo === "receita")
      .sort((a, b) => Number(b.valor) - Number(a.valor))[0];
    const maiorDespesa = filteredByPeriod
      .filter((t) => t.tipo === "despesa")
      .sort((a, b) => Number(b.valor) - Number(a.valor))[0];

    return {
      chartData,
      categoryData,
      filteredTransactions,
      totalReceitas,
      totalDespesas,
      saldoTotal: totalReceitas - totalDespesas,
      receitasMesAnterior,
      despesasMesAnterior,
      topCategoriasDespesa,
      topCategoriasReceita,
      mediaReceitaDiaria: diasUnicos > 0 ? totalReceitas / diasUnicos : 0,
      mediaDespesaDiaria: diasUnicos > 0 ? totalDespesas / diasUnicos : 0,
      diasComTransacoes: diasUnicos,
      maiorReceita,
      maiorDespesa,
    };
  }, [transacoes, loading, dateRange, selectedCategory]);
}

/**
 * Hook auxiliar para calcular a projeção dos próximos meses com base nas médias do período.
 */
export function useProjecaoMeses(
  totalReceitas: number,
  totalDespesas: number,
  diasNoPeriodo: number
) {
  return useMemo(() => {
    if (diasNoPeriodo === 0 || (totalReceitas === 0 && totalDespesas === 0)) return [];
    const receitaDiaria = totalReceitas / diasNoPeriodo;
    const despesaDiaria = totalDespesas / diasNoPeriodo;
    const today = new Date();
    return [1, 2, 3].map((offset) => {
      const mes = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      const projetadoReceitas = receitaDiaria * diasNoMes;
      const projetadoDespesas = despesaDiaria * diasNoMes;
      return {
        mes: mes.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        receitas: projetadoReceitas,
        despesas: projetadoDespesas,
        saldo: projetadoReceitas - projetadoDespesas,
      };
    });
  }, [totalReceitas, totalDespesas, diasNoPeriodo]);
}
