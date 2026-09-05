/**
 * Utilitários de data para o módulo de Relatórios.
 */

/** Formata string ISO para dd/mm/aaaa */
export const formatarData = (dataString: string): string => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
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

/**
 * Converte qualquer valor de data/timestamp para YYYY-MM-DD no fuso de São Paulo (America/Sao_Paulo).
 *
 * Regras:
 * 1. Se o valor já for apenas data ("YYYY-MM-DD"), preserva e valida sem conversão via Date()
 *    (evita que new Date("YYYY-MM-DD") seja interpretado como UTC 00:00 e recue 1 dia em UTC-3).
 * 2. Se for timestamp ISO (ex: "2026-09-04T02:30:00.000Z"), converte para America/Sao_Paulo.
 *    Exemplo: 2026-09-04T02:30:00.000Z -> 2026-09-03 (23:30 em SP).
 * 3. Trata valores inválidos, nulos ou vazios retornando string vazia ("") sem lançar exceção.
 * 4. Suporta objetos Date válidos.
 */
export const formatarDataParaSaoPaulo = (input: string | Date | null | undefined): string => {
  if (!input) return "";

  // Se já for uma string no formato puro YYYY-MM-DD, preserva sem alterar
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [yearStr, monthStr, dayStr] = trimmed.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return trimmed;
      }
    }
  }

  try {
    const date = typeof input === "string" ? new Date(input) : input;
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "";
    }

    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
};

/**
 * Retorna a data atual (Hoje) no formato YYYY-MM-DD no fuso de São Paulo (America/Sao_Paulo).
 */
export const getHojeSaoPaulo = (): string => {
  return formatarDataParaSaoPaulo(new Date());
};
