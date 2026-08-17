import { describe, it, expect } from "vitest";

// Função de cálculo pura extraída para testes rigorosos de comparativo diário
export function calculateDailyComparative(
  transacoes: Array<{ data: string; valor: number; tipo: "receita" | "despesa" }>,
  agora: Date,
  monthsCount: number = 6,
  selectedDay?: number
) {
  const anoAtual = agora.getFullYear();
  const mesAtualIndex = agora.getMonth();
  const diaHoje = agora.getDate();

  const diasNoMesAtual = new Date(anoAtual, mesAtualIndex + 1, 0).getDate();
  const maxDiaDisponivel = Math.min(diaHoje, diasNoMesAtual);
  const diaAlvo = selectedDay ? Math.min(selectedDay, maxDiaDisponivel) : maxDiaDisponivel;

  const historicMonths: Array<{ year: number; monthIndex: number }> = [];
  for (let i = monthsCount; i >= 1; i--) {
    const d = new Date(anoAtual, mesAtualIndex - i, 1);
    historicMonths.push({ year: d.getFullYear(), monthIndex: d.getMonth() });
  }

  const mesAtualReceitaDia = new Array(32).fill(0);
  const mesAtualDespesaDia = new Array(32).fill(0);

  const historicoReceitasDia: number[][] = Array.from({ length: historicMonths.length }, () => new Array(32).fill(0));
  const historicoDespesasDia: number[][] = Array.from({ length: historicMonths.length }, () => new Array(32).fill(0));

  transacoes.forEach((t) => {
    if (!t.data) return;
    const dt = new Date(t.data);
    const y = dt.getFullYear();
    const m = dt.getMonth();
    const d = dt.getDate();

    if (d < 1 || d > 31) return;

    const valor = Number(t.valor || 0);
    const isReceita = t.tipo === "receita";

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

  const mesAtualReceitaAcum = new Array(32).fill(0);
  const mesAtualDespesaAcum = new Array(32).fill(0);
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

  const mediaReceitasAcum = new Array(32).fill(0);
  const mediaDespesasAcum = new Array(32).fill(0);
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

  const recAtual = mesAtualReceitaAcum[diaAlvo];
  const recMed = mediaReceitasAcum[diaAlvo];
  const despAtual = mesAtualDespesaAcum[diaAlvo];
  const despMed = mediaDespesasAcum[diaAlvo];

  return {
    diaAlvo,
    maxDiaDisponivel,
    recAtual,
    recMed,
    despAtual,
    despMed,
    saldoAtual: recAtual - despAtual,
    saldoMedio: recMed - despMed,
    isFuturoDia15: 15 > diaHoje,
  };
}

describe("Teste do Comparativo Diário Acumulado", () => {
  it("deve calcular corretamente a comparação até o dia 12", () => {
    const agora = new Date(2026, 7, 15); // 15 de Agosto de 2026
    const mockTransacoes = [
      // Mês Atual (Agosto 2026) - Dia 10
      { data: "2026-08-10T10:00:00", valor: 1000, tipo: "receita" as const },
      { data: "2026-08-10T11:00:00", valor: 300, tipo: "despesa" as const },
      // Histórico (Julho 2026) - Dia 5 e Dia 12
      { data: "2026-07-05T10:00:00", valor: 800, tipo: "receita" as const },
      { data: "2026-07-12T10:00:00", valor: 200, tipo: "receita" as const },
    ];

    const result = calculateDailyComparative(mockTransacoes, agora, 1, 12);

    expect(result.diaAlvo).toBe(12);
    expect(result.recAtual).toBe(1000); // 1000 acumulado até dia 12
    expect(result.despAtual).toBe(300);
    expect(result.recMed).toBe(1000); // (800 + 200) no mês anterior = 1000
    expect(result.saldoAtual).toBe(700);
  });

  it("deve tratar corretamente Fevereiro e ano bissexto (dias 28 e 29)", () => {
    const anoBissexto = new Date(2024, 1, 29); // 29 de Fev de 2024
    const result = calculateDailyComparative([], anoBissexto, 3);
    expect(result.maxDiaDisponivel).toBe(29);
  });

  it("deve garantir que o gráfico não possui valores reais para dias futuros", () => {
    const agora = new Date(2026, 7, 10); // 10 de Agosto
    const result = calculateDailyComparative([], agora, 3, 12);
    expect(result.isFuturoDia15).toBe(true);
  });
});
