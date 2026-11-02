/**
 * ceoDateRanges.ts
 *
 * Utilitário canônico de cálculo de períodos e intervalos temporais para o módulo CEO.
 * Garante fuso horário estrito 'America/Sao_Paulo', correspondência exata de períodos
 * anteriores equivalentes e integridade nas viradas de mês, ano e anos bissextos.
 */

import {
  getSaoPauloParts,
  getSaoPauloDateString,
} from "../services/CeoFinancialMetricsService";

export interface CeoPeriodRange {
  periodo: string;
  inicioStr: string; // YYYY-MM-DD
  fimStr: string; // YYYY-MM-DD
  inicioAntStr: string; // YYYY-MM-DD
  fimAntStr: string; // YYYY-MM-DD
  rotulo: string;
  rotuloAnterior: string;
  diasNoPeriodo: number;
}

/**
 * Retorna os limites canônicos de datas para o período selecionado e seu correspondente anterior.
 */
export function getCeoPeriodRange(
  periodo: string,
  referenceDate: Date = new Date()
): CeoPeriodRange {
  const parts = getSaoPauloParts(referenceDate);
  const ano = parts.year;
  const mes = parts.month;
  const dia = parts.day;
  const hojeStr = parts.dateString;

  // Meio-dia UTC da data de referência para evitar qualquer drift de fuso
  const noonMs = Date.UTC(ano, mes - 1, dia, 12, 0, 0);

  if (periodo === "este_mes") {
    const mesPad = String(mes).padStart(2, "0");
    const inicioStr = `${ano}-${mesPad}-01`;
    const fimStr = hojeStr;

    // Período anterior equivalente: dia 1 até Math.min(dia, totalDiasMesAnt) do mês anterior
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const mesAntPad = String(mesAnt).padStart(2, "0");

    // Dias no mês anterior (anoAnt, mesAnt, 0)
    const diasNoMesAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
    const diaAntEquivalente = Math.min(dia, diasNoMesAnt);
    const diaAntPad = String(diaAntEquivalente).padStart(2, "0");

    const inicioAntStr = `${anoAnt}-${mesAntPad}-01`;
    const fimAntStr = `${anoAnt}-${mesAntPad}-${diaAntPad}`;

    return {
      periodo,
      inicioStr,
      fimStr,
      inicioAntStr,
      fimAntStr,
      rotulo: `Este mês (${dia} ${dia === 1 ? "dia" : "dias"})`,
      rotuloAnterior: `Mês anterior equivalente (${diaAntEquivalente} ${diaAntEquivalente === 1 ? "dia" : "dias"})`,
      diasNoPeriodo: dia,
    };
  }

  if (periodo === "ultimos_7_dias") {
    const inicioDate = new Date(noonMs - 6 * 86400000);
    const inicioStr = getSaoPauloDateString(inicioDate);
    const fimStr = hojeStr;

    // 7 dias anteriores contíguos (D-13 até D-7)
    const fimAntDate = new Date(noonMs - 7 * 86400000);
    const inicioAntDate = new Date(noonMs - 13 * 86400000);

    const inicioAntStr = getSaoPauloDateString(inicioAntDate);
    const fimAntStr = getSaoPauloDateString(fimAntDate);

    return {
      periodo,
      inicioStr,
      fimStr,
      inicioAntStr,
      fimAntStr,
      rotulo: "Últimos 7 dias",
      rotuloAnterior: "7 dias anteriores",
      diasNoPeriodo: 7,
    };
  }

  if (periodo === "mes_anterior") {
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const mesAntPad = String(mesAnt).padStart(2, "0");
    const diasNoMesAnt = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();

    const inicioStr = `${anoAnt}-${mesAntPad}-01`;
    const fimStr = `${anoAnt}-${mesAntPad}-${String(diasNoMesAnt).padStart(2, "0")}`;

    // 2 meses atrás completo
    const mesAnt2 = mesAnt === 1 ? 12 : mesAnt - 1;
    const anoAnt2 = mesAnt === 1 ? anoAnt - 1 : anoAnt;
    const mesAnt2Pad = String(mesAnt2).padStart(2, "0");
    const diasNoMesAnt2 = new Date(Date.UTC(anoAnt2, mesAnt2, 0)).getUTCDate();

    const inicioAntStr = `${anoAnt2}-${mesAnt2Pad}-01`;
    const fimAntStr = `${anoAnt2}-${mesAnt2Pad}-${String(diasNoMesAnt2).padStart(2, "0")}`;

    return {
      periodo,
      inicioStr,
      fimStr,
      inicioAntStr,
      fimAntStr,
      rotulo: `Mês anterior completo (${diasNoMesAnt} dias)`,
      rotuloAnterior: `2 meses anteriores (${diasNoMesAnt2} dias)`,
      diasNoPeriodo: diasNoMesAnt,
    };
  }

  // Padrão: 'ultimos_30_dias'
  const inicioDate = new Date(noonMs - 29 * 86400000);
  const inicioStr = getSaoPauloDateString(inicioDate);
  const fimStr = hojeStr;

  // 30 dias anteriores contíguos (D-59 até D-30)
  const fimAntDate = new Date(noonMs - 30 * 86400000);
  const inicioAntDate = new Date(noonMs - 59 * 86400000);

  const inicioAntStr = getSaoPauloDateString(inicioAntDate);
  const fimAntStr = getSaoPauloDateString(fimAntDate);

  return {
    periodo: "ultimos_30_dias",
    inicioStr,
    fimStr,
    inicioAntStr,
    fimAntStr,
    rotulo: "Últimos 30 dias",
    rotuloAnterior: "30 dias anteriores",
    diasNoPeriodo: 30,
  };
}
