import { useMemo } from "react";
import { useReceitas } from "./useReceitas";
import { useTransacoes } from "./useTransacoes";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { useDividas } from "./useDividas";
import { useContasUsuario } from "./useContasUsuario";
import type { TransacaoRecorrente } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// useFluxoCaixaData — motor da tela de Fluxo de Caixa (estilo Falcon, com dados
// reais do Wallet).
//
// REALIZADO:
//   Receitas = consolidação do useReceitas (dinheiro PDV + Divipay LÍQUIDO ao
//   vivo + manuais/Pluggy). Despesas = tabelas despesas/transacoes (workspace).
// PREVISTO:
//   Despesas = transações recorrentes ativas + dívidas pendentes por vencimento.
//   Receitas = transações recorrentes ativas tipo receita.
// SALDOS:
//   saldoInicial = saldo atual das contas de dinheiro − resultado realizado
//   entre o início do período e hoje. Saldo Realizado acumula o realizado;
//   Saldo Previsto acumula realizado até hoje + previsto para o futuro.
// ─────────────────────────────────────────────────────────────────────────────

export type FluxoCaixaModo = "mensal" | "diario";

export interface FluxoCaixaBucket {
  chave: string; // "2026-07" (mensal) ou "2026-07-31" (diario)
  rotulo: string; // "jul" ou "31"
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  futuro: boolean;
  receitaPrevista: number;
  receitaRealizada: number;
  despesaPrevista: number;
  despesaRealizada: number;
  saldoPrevisto: number;
  saldoRealizado: number;
  saldoProjetado?: number | null;
  receitasPorCategoria: Record<string, number>;
  despesasPorCategoria: Record<string, number>;
}

export interface FluxoCaixaData {
  buckets: FluxoCaixaBucket[];
  categoriasReceita: string[];
  categoriasDespesa: string[];
  saldoInicial: number;
  saldoContasHoje: number;
  totalReceitaRealizada: number;
  totalReceitaPrevista: number;
  totalDespesaRealizada: number;
  totalDespesaPrevista: number;
  saldoFinalPrevisto: number;
  loading: boolean;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Data local YYYY-MM-DD (sem surpresas de fuso)
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

// Verifica se uma transação recorrente ocorre numa data específica
function recorrenteOcorreEm(rec: TransacaoRecorrente, dia: Date, diaStr: string): boolean {
  if (!rec.ativo) return false;
  const inicio = (rec.data_inicio || "").split("T")[0];
  if (inicio && diaStr < inicio) return false;
  const fim = rec.data_fim ? rec.data_fim.split("T")[0] : null;
  if (fim && diaStr > fim) return false;

  switch (rec.recorrencia) {
    case "diaria":
      return true;
    case "semanal":
      return rec.dia_semana != null && dia.getDay() === rec.dia_semana;
    case "mensal": {
      const diaExec = Math.min(rec.dia_execucao ?? 1, ultimoDiaDoMes(dia.getFullYear(), dia.getMonth()));
      return dia.getDate() === diaExec;
    }
    case "anual": {
      const d0 = new Date(`${inicio}T12:00:00`);
      return dia.getDate() === d0.getDate() && dia.getMonth() === d0.getMonth();
    }
    default:
      return false;
  }
}

export function useFluxoCaixaData(modo: FluxoCaixaModo, ano: number, mes: number = 0): FluxoCaixaData {
  // ── Período ──────────────────────────────────────────────────────────────
  const { dataInicio, dataFim } = useMemo(() => {
    if (modo === "mensal") {
      return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    }
    const ultimo = ultimoDiaDoMes(ano, mes);
    return {
      dataInicio: `${ano}-${String(mes + 1).padStart(2, "0")}-01`,
      dataFim: `${ano}-${String(mes + 1).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`,
    };
  }, [modo, ano, mes]);

  // ── Fontes de dados ──────────────────────────────────────────────────────
  // O realizado vai SEMPRE até hoje (mesmo vendo um período passado), porque o
  // saldo inicial = saldo atual das contas − resultado entre o início e hoje.
  const hojeStr = fmtLocal(new Date());
  const fimConsulta = dataFim >= hojeStr ? dataFim : hojeStr;

  const { receitas, loading: loadingReceitas } = useReceitas({ startDate: dataInicio, endDate: fimConsulta });
  const { transacoes, loading: loadingTransacoes } = useTransacoes({ startDate: dataInicio, endDate: fimConsulta });
  const { recorrentes, loading: loadingRecorrentes } = useRecurringTransactions();
  const { dividas, loading: loadingDividas } = useDividas({});
  const { contas, loading: loadingContas } = useContasUsuario();

  const loading =
    loadingReceitas || loadingTransacoes || loadingRecorrentes || loadingDividas || loadingContas;

  return useMemo(() => {
    const vazio: FluxoCaixaData = {
      buckets: [],
      categoriasReceita: [],
      categoriasDespesa: [],
      saldoInicial: 0,
      saldoContasHoje: 0,
      totalReceitaRealizada: 0,
      totalReceitaPrevista: 0,
      totalDespesaRealizada: 0,
      totalDespesaPrevista: 0,
      saldoFinalPrevisto: 0,
      loading,
    };
    if (loading) return vazio;

    const hoje = fmtLocal(new Date());

    // ── Realizado ──────────────────────────────────────────────────────────
    const receitasReal = (receitas ?? []).map((r) => ({
      data: String(r.data).split("T")[0],
      valor: Number(r.valor || 0),
      categoria: r.categorias?.nome || "Sem categoria",
    }));
    const despesasReal = (transacoes ?? [])
      .filter((t) => t.tipo === "despesa")
      .map((t) => ({
        data: String(t.data).split("T")[0],
        valor: Number(t.valor || 0),
        categoria: t.categorias?.nome || "Sem categoria",
      }));

    // ── Previsto: enumera ocorrências dia a dia no período ─────────────────
    const previstoPorDia = new Map<string, { receita: number; despesa: number }>();
    const addPrev = (dia: string, tipo: "receita" | "despesa", valor: number) => {
      const entry = previstoPorDia.get(dia) ?? { receita: 0, despesa: 0 };
      entry[tipo] += valor;
      previstoPorDia.set(dia, entry);
    };

    const primeiroDia = new Date(`${dataInicio}T12:00:00`);
    const ultimoDia = new Date(`${dataFim}T12:00:00`);
    for (const rec of recorrentes ?? []) {
      for (let d = new Date(primeiroDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
        const diaStr = fmtLocal(d);
        if (recorrenteOcorreEm(rec, d, diaStr)) {
          addPrev(diaStr, rec.tipo_transacao, Number(rec.valor || 0));
        }
      }
    }
    for (const divida of dividas ?? []) {
      if (divida.status === "quitada") continue;
      const venc = String(divida.data_vencimento || "").split("T")[0];
      if (venc && venc >= dataInicio && venc <= dataFim) {
        addPrev(venc, "despesa", Number(divida.valor_restante || divida.valor_total || 0));
      }
    }

    // ── Saldo inicial: saldo real das contas − resultado desde o início ────
    const saldoContasHoje = (contas ?? [])
      .filter((c) => c.tipo !== "cartao_credito")
      .reduce((s, c) => s + (Number(c.saldo_atual) || 0), 0);

    const netRealizadoAteHoje = (ate: string) => {
      let net = 0;
      for (const r of receitasReal) if (r.data <= ate) net += r.valor;
      for (const d of despesasReal) if (d.data <= ate) net -= d.valor;
      return net;
    };
    const saldoInicial = saldoContasHoje - netRealizadoAteHoje(hoje);

    // ── Buckets (meses do ano ou dias do mês) ──────────────────────────────
    const buckets: FluxoCaixaBucket[] = [];
    const qtd = modo === "mensal" ? 12 : ultimoDiaDoMes(ano, mes);

    for (let i = 0; i < qtd; i++) {
      let bInicio: string;
      let bFim: string;
      let chave: string;
      let rotulo: string;
      if (modo === "mensal") {
        bInicio = `${ano}-${String(i + 1).padStart(2, "0")}-01`;
        bFim = `${ano}-${String(i + 1).padStart(2, "0")}-${String(ultimoDiaDoMes(ano, i)).padStart(2, "0")}`;
        chave = `${ano}-${String(i + 1).padStart(2, "0")}`;
        rotulo = MESES_CURTOS[i];
      } else {
        const diaStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
        bInicio = diaStr;
        bFim = diaStr;
        chave = diaStr;
        rotulo = String(i + 1);
      }

      let receitaRealizada = 0;
      let despesaRealizada = 0;
      const receitasPorCategoria: Record<string, number> = {};
      const despesasPorCategoria: Record<string, number> = {};

      for (const r of receitasReal) {
        if (r.data >= bInicio && r.data <= bFim) {
          receitaRealizada += r.valor;
          receitasPorCategoria[r.categoria] = (receitasPorCategoria[r.categoria] ?? 0) + r.valor;
        }
      }
      for (const d of despesasReal) {
        if (d.data >= bInicio && d.data <= bFim) {
          despesaRealizada += d.valor;
          despesasPorCategoria[d.categoria] = (despesasPorCategoria[d.categoria] ?? 0) + d.valor;
        }
      }

      let receitaPrevista = 0;
      let despesaPrevista = 0;
      for (const [dia, vals] of previstoPorDia) {
        if (dia >= bInicio && dia <= bFim) {
          receitaPrevista += vals.receita;
          despesaPrevista += vals.despesa;
        }
      }

      buckets.push({
        chave,
        rotulo,
        dataInicio: bInicio,
        dataFim: bFim,
        futuro: bInicio > hoje,
        receitaPrevista,
        receitaRealizada,
        despesaPrevista,
        despesaRealizada,
        saldoPrevisto: 0, // preenchido abaixo
        saldoRealizado: 0,
        receitasPorCategoria,
        despesasPorCategoria,
      });
    }

    // ── Saldos acumulados ──────────────────────────────────────────────────
    let acumReal = saldoInicial;
    let acumPrev = saldoInicial;
    for (const b of buckets) {
      // Realizado: só conta o que aconteceu até hoje
      const fimEfetivo = b.dataFim <= hoje ? b.dataFim : hoje;
      if (b.dataInicio <= fimEfetivo) {
        acumReal += b.receitaRealizada - b.despesaRealizada;
        acumPrev += b.receitaRealizada - b.despesaRealizada;
      }
      // Previsto: para datas futuras, soma o planejado
      if (b.dataFim > hoje) {
        acumPrev += b.receitaPrevista - b.despesaPrevista;
      }
      b.saldoRealizado = parseFloat(acumReal.toFixed(2));
      b.saldoPrevisto = parseFloat(acumPrev.toFixed(2));
    }

    // Projeção: 15 dias após o último bucket real
    const ultimoBucket = buckets[buckets.length - 1];
    const projecao: FluxoCaixaBucket[] = [];
    if (ultimoBucket) {
      const saldoBase = ultimoBucket.saldoRealizado;
      const mediaReceita = buckets.slice(-15).reduce((s, b) => s + (b.receitaRealizada || 0), 0) / Math.min(buckets.length, 15);
      
      for (let i = 1; i <= 15; i++) {
        const data = new Date();
        data.setDate(data.getDate() + i);
        const dataStr = data.toISOString().split("T")[0];
        
        // Recorrentes diárias
        const recDiarias = recorrentes?.filter(r => r.ativo && r.tipo_transacao === "despesa").reduce((s, r) => {
          const v = Number(r.valor);
          return s + (r.recorrencia === "diaria" ? v : r.recorrencia === "semanal" ? v/7 : r.recorrencia === "mensal" ? v/30 : v/365);
        }, 0) || 0;
        
        // Dívidas a vencer neste dia
        const divDia = dividas?.filter(d => d.status !== "quitada" && d.data_vencimento === dataStr).reduce((s, d) => {
          return s + (d.parcelas > 1 ? Number(d.valor_total) / d.parcelas : Number(d.valor_restante));
        }, 0) || 0;
        
        projecao.push({
          chave: `proj-${dataStr}`,
          rotulo: `${String(data.getDate()).padStart(2,"0")}/${String(data.getMonth()+1).padStart(2,"0")}`,
          dataInicio: dataStr,
          dataFim: dataStr,
          futuro: true,
          receitaPrevista: 0,
          receitaRealizada: 0,
          despesaPrevista: 0,
          despesaRealizada: 0,
          saldoPrevisto: parseFloat((saldoBase + (mediaReceita * i) - (recDiarias * i) - divDia).toFixed(2)),
          saldoRealizado: 0,
          saldoProjetado: parseFloat((saldoBase + (mediaReceita * i) - (recDiarias * i) - divDia).toFixed(2)),
          receitasPorCategoria: {},
          despesasPorCategoria: {},
        });
      }
    }

    const chartData = [...buckets, ...projecao];

    const categoriasReceita = Array.from(
      new Set(buckets.flatMap((b) => Object.keys(b.receitasPorCategoria)))
    ).sort();
    const categoriasDespesa = Array.from(
      new Set(buckets.flatMap((b) => Object.keys(b.despesasPorCategoria)))
    ).sort();

    return {
      buckets: chartData,
      categoriasReceita,
      categoriasDespesa,
      saldoInicial: parseFloat(saldoInicial.toFixed(2)),
      saldoContasHoje: parseFloat(saldoContasHoje.toFixed(2)),
      totalReceitaRealizada: buckets.reduce((s, b) => s + b.receitaRealizada, 0),
      totalReceitaPrevista: buckets.reduce((s, b) => s + b.receitaPrevista, 0),
      totalDespesaRealizada: buckets.reduce((s, b) => s + b.despesaRealizada, 0),
      totalDespesaPrevista: buckets.reduce((s, b) => s + b.despesaPrevista, 0),
      saldoFinalPrevisto: buckets[buckets.length - 1]?.saldoPrevisto ?? saldoInicial,
      loading,
    };
  }, [
    receitas,
    transacoes,
    recorrentes,
    dividas,
    contas,
    loading,
    modo,
    ano,
    mes,
    dataInicio,
    dataFim,
  ]);
}
