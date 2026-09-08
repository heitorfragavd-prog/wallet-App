/**
 * Utilitários de data para o módulo Financeiro e Relatórios.
 */

export const TIMEZONE_SP = "America/Sao_Paulo";

const spDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE_SP,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Converte de forma determinística qualquer input (string ISO UTC, Date ou YYYY-MM-DD)
 * para a data local YYYY-MM-DD no fuso America/Sao_Paulo.
 *
 * - Se já for uma string "YYYY-MM-DD" pura, preserva sem deslocamento.
 * - Se contiver horário (ex: Divipay ISO UTC "2026-09-04T02:30:00.000Z"),
 *   converte com precisão para o horário de São Paulo (23:30 de 03/09).
 */
export const formatarDataParaSaoPaulo = (input: string | Date | null | undefined): string => {
  if (!input) return "";

  // Se já for uma string YYYY-MM-DD pura (sem 'T' ou offset), retorna direto para evitar shift
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }

  const dateObj = typeof input === "string" ? new Date(input) : input;
  if (isNaN(dateObj.getTime())) {
    // Fallback: se não for Date válida mas começar com YYYY-MM-DD
    if (typeof input === "string") {
      const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return "";
  }

  return spDateFormatter.format(dateObj);
};

/**
 * Retorna a data atual de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo.
 */
export const getHojeSaoPaulo = (): string => {
  return spDateFormatter.format(new Date());
};

/**
 * Função pura unificada para cálculo de receitas de uma data de referência (padrão: hoje em SP).
 * Normaliza todas as datas via formatarDataParaSaoPaulo e soma os valores.
 */
export const calcularTotalReceitasDoDia = (
  receitas: Array<{ data?: string | null; valor?: number | null }>,
  dataReferencia?: string
): number => {
  if (!Array.isArray(receitas) || receitas.length === 0) return 0;
  const targetDate = dataReferencia ? formatarDataParaSaoPaulo(dataReferencia) : getHojeSaoPaulo();
  if (!targetDate) return 0;

  const total = receitas.reduce((sum, r) => {
    if (!r || r.valor == null || isNaN(Number(r.valor))) return sum;
    const itemDate = formatarDataParaSaoPaulo(r.data);
    if (itemDate === targetDate) {
      return sum + Number(r.valor);
    }
    return sum;
  }, 0);

  return Math.round(total * 100) / 100;
};

/** Formata data para dd/mm/aaaa respeitando o fuso America/Sao_Paulo */
export const formatarData = (dataString: string): string => {
  if (!dataString) return "";
  const spDate = formatarDataParaSaoPaulo(dataString);
  if (!spDate) return "";
  const [ano, mes, dia] = spDate.split("-");
  return `${dia}/${mes}/${ano}`;
};

/** Retorna o primeiro dia da semana atual (domingo) no formato YYYY-MM-DD */
export const getPrimeiroDiaSemana = (): string => {
  const now = new Date();
  const primeiro = new Date(now);
  primeiro.setDate(now.getDate() - now.getDay());
  return `${primeiro.getFullYear()}-${String(primeiro.getMonth() + 1).padStart(2, "0")}-${String(primeiro.getDate()).padStart(2, "0")}`;
};

/** Retorna o primeiro dia do mês atual */
export const getPrimeiroDiaMes = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

/** Retorna o primeiro dia do trimestre atual */
export const getPrimeiroDiaTrimestre = (): string => {
  const now = new Date();
  const mes = Math.floor(now.getMonth() / 3) * 3 + 1;
  return `${now.getFullYear()}-${String(mes).padStart(2, "0")}-01`;
};

/** Retorna o primeiro dia do ano atual */
export const getPrimeiroDiaAno = (): string => `${new Date().getFullYear()}-01-01`;

/** Retorna o primeiro dia do mês anterior */
export const getMesAnterior = (): string => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};
