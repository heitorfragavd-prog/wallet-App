/**
 * escalaDateUtils.ts
 *
 * Utilitários determinísticos para manipulação de datas de escalas e fins de semana,
 * respeitando rigorosamente o fuso horário 'America/Sao_Paulo'.
 */

export interface NextWeekendInfo {
  sabado: string; // YYYY-MM-DD
  domingo: string; // YYYY-MM-DD
  sabadoFormatado: string; // ex: "21/11" ou "Sábado, 21/11"
  domingoFormatado: string; // ex: "22/11" ou "Domingo, 22/11"
  sabadoExtenso: string; // ex: "21 de novembro"
  domingoExtenso: string; // ex: "22 de novembro"
}

/**
 * Converte qualquer objeto Date para as partes componentes no fuso America/Sao_Paulo
 */
export function getSaoPauloDateParts(date: Date = new Date()): {
  year: number;
  month: number; // 1 a 12
  day: number; // 1 a 31
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  hours: number;
  minutes: number;
  dateString: string; // YYYY-MM-DD
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  const hours = parseInt(partMap.hour, 10);
  const minutes = parseInt(partMap.minute, 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[partMap.weekday] ?? 0;

  const monthPad = String(month).padStart(2, "0");
  const dayPad = String(day).padStart(2, "0");
  const dateString = `${year}-${monthPad}-${dayPad}`;

  return { year, month, day, dayOfWeek, hours, minutes, dateString };
}

/**
 * Cria uma data no meio-dia UTC a partir de string 'YYYY-MM-DD' para evitar desvios de fuso
 */
export function createNoonDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Retorna as datas do próximo sábado e domingo a partir de uma data de referência
 */
export function getNextWeekendDates(referenceDate: Date = new Date()): NextWeekendInfo {
  const spParts = getSaoPauloDateParts(referenceDate);
  const dow = spParts.dayOfWeek; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab

  let daysToSaturday = 0;
  if (dow === 6) {
    // Hoje é sábado: o fim de semana é hoje e amanhã
    daysToSaturday = 0;
  } else if (dow === 0) {
    // Hoje é domingo: o fim de semana analisado é ontem (sábado) e hoje (domingo)
    daysToSaturday = -1;
  } else {
    // Segunda (1) a Sexta (5): o próximo sábado é no sábado desta semana
    daysToSaturday = 6 - dow;
  }

  const baseNoon = createNoonDate(spParts.dateString);

  // Sábado
  const sabadoNoon = new Date(baseNoon.getTime() + daysToSaturday * 86400000);
  const sabYear = sabadoNoon.getUTCFullYear();
  const sabMonth = String(sabadoNoon.getUTCMonth() + 1).padStart(2, "0");
  const sabDay = String(sabadoNoon.getUTCDate()).padStart(2, "0");
  const sabadoStr = `${sabYear}-${sabMonth}-${sabDay}`;

  // Domingo
  const domingoNoon = new Date(sabadoNoon.getTime() + 86400000);
  const domYear = domingoNoon.getUTCFullYear();
  const domMonth = String(domingoNoon.getUTCMonth() + 1).padStart(2, "0");
  const domDay = String(domingoNoon.getUTCDate()).padStart(2, "0");
  const domingoStr = `${domYear}-${domMonth}-${domDay}`;

  const mesesExtenso = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  const sabExtenso = `${sabDay} de ${mesesExtenso[parseInt(sabMonth, 10) - 1]}`;
  const domExtenso = `${domDay} de ${mesesExtenso[parseInt(domMonth, 10) - 1]}`;

  return {
    sabado: sabadoStr,
    domingo: domingoStr,
    sabadoFormatado: `${sabDay}/${sabMonth}`,
    domingoFormatado: `${domDay}/${domMonth}`,
    sabadoExtenso: sabExtenso,
    domingoExtenso: domExtenso,
  };
}

/**
 * Retorna true se hoje for segunda-feira em São Paulo
 */
export function isMondayInSaoPaulo(referenceDate: Date = new Date()): boolean {
  const parts = getSaoPauloDateParts(referenceDate);
  return parts.dayOfWeek === 1;
}

/**
 * Retorna true se hoje for sexta-feira em São Paulo
 */
export function isFridayInSaoPaulo(referenceDate: Date = new Date()): boolean {
  const parts = getSaoPauloDateParts(referenceDate);
  return parts.dayOfWeek === 5;
}

/**
 * Formata 'YYYY-MM-DD' para 'DD/MM/YYYY'
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr || !dateStr.includes("-")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
