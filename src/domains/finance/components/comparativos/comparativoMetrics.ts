import type { ComparativoMes } from "@/domains/finance/hooks/useComparativoPeriodos";

export function buildMonthlyPresentation(data: ComparativoMes[], now = new Date()) {
  const current = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  return data.map((item) => ({
    ...item,
    resultado: item.receitas - item.despesas,
    parcial: item.mes === current,
  }));
}

export function summarizeMonthly(data: ComparativoMes[]) {
  if (data.length === 0) {
    return { mediaReceitas: null, mediaDespesas: null, mediaResultado: null, melhorResultado: null, melhorMes: null };
  }
  const presented = buildMonthlyPresentation(data);
  const best = presented.reduce((current, item) => item.resultado > current.resultado ? item : current);
  return {
    mediaReceitas: data.reduce((sum, item) => sum + item.receitas, 0) / data.length,
    mediaDespesas: data.reduce((sum, item) => sum + item.despesas, 0) / data.length,
    mediaResultado: presented.reduce((sum, item) => sum + item.resultado, 0) / data.length,
    melhorResultado: best.resultado,
    melhorMes: best.mes,
  };
}
