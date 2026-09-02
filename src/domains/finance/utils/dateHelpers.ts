/**
 * Utilitários de data para o módulo de Relatórios.
 */

/** Formata string ISO para dd/mm/aaaa no fuso America/Sao_Paulo */
export const formatarData = (dataString: string): string => {
  if (!dataString) return "";
  if (dataString.includes("T") || dataString.includes("Z")) {
    try {
      const d = new Date(dataString);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(d);
      }
    } catch {
      // fallback
    }
  }
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
