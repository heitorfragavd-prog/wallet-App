/**
 * Utilitários para detecção e proteção contra anomalias de sequência temporal
 * e dados arquivados na API Eyemobile sem dependência de anos fixos no código.
 */

/** Converte timestamp ISO para string yyyy-MM-dd no fuso America/Sao_Paulo */
export function toSaoPauloDateString(isoTimestamp: string): string {
  if (!isoTimestamp) return "";
  try {
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) return isoTimestamp.split("T")[0];
    const sp = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const y = sp.getFullYear();
    const m = String(sp.getMonth() + 1).padStart(2, "0");
    const d = String(sp.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return isoTimestamp.split("T")[0];
  }
}

/**
 * Detecta se uma transação no stream sequencial representa um retrocesso
 * temporal abrupto (ex: salto de meses/anos para trás no passado), indicando
 * que a esteira contemporânea terminou e cruzou para uma cauda arquivada antiga.
 *
 * Em uma operação contínua, mesmo durante a virada do ano (31/12 -> 01/01),
 * o tempo sempre avança (diffDays <= 0).
 */
export function isAbruptStreamRewind(
  currentTimestamp: string,
  lastValidTimestamp?: string,
  maxAllowedRewindDays: number = 30
): boolean {
  if (!lastValidTimestamp || !currentTimestamp) return false;
  const tCurr = new Date(currentTimestamp).getTime();
  const tLast = new Date(lastValidTimestamp).getTime();
  if (isNaN(tCurr) || isNaN(tLast)) return false;

  const diffDays = (tLast - tCurr) / (1000 * 60 * 60 * 24);
  return diffDays > maxAllowedRewindDays;
}

/**
 * Na busca binária de offsets por data, detecta se um offset atingiu
 * uma cauda arquivada antiga (ex: dados legados de anos anteriores que foram
 * colocados após o fluxo ativo), em vez de uma transação contemporânea.
 *
 * Funciona de forma agnóstica a anos (funciona em 2026, 2027, 2028+).
 */
export function isArchivedTailTransaction(
  currentTimestamp: string,
  targetStartDate: string,
  maxAllowedPastDays: number = 90
): boolean {
  if (!currentTimestamp || !targetStartDate) return false;
  const tCurr = new Date(currentTimestamp).getTime();
  const tTarget = new Date(targetStartDate).getTime();
  if (isNaN(tCurr) || isNaN(tTarget)) return false;

  const diffDays = (tTarget - tCurr) / (1000 * 60 * 60 * 24);
  return diffDays > maxAllowedPastDays;
}

export interface EyemobileSaleStatusLike {
  cancelled?: boolean | number | null;
  completed?: boolean | number | null;
}

/**
 * Retorna true quando a transação está cancelada ou não completada.
 */
export function isCancelledOrIncompleteSale(sale: EyemobileSaleStatusLike | null | undefined): boolean {
  if (!sale) return true;
  return Boolean(sale.cancelled) || !Boolean(sale.completed);
}

/**
 * Na API Eyemobile /transactions, as vendas válidas são servidas primeiro em ordem
 * cronológica, seguidas por uma cauda inteira de transações canceladas/incompletas
 * (com datas que regridem e sobem até os dias atuais).
 * Uma página inteiramente composta por itens cancelados/incompletos indica que
 * o offset entrou na cauda arquivada de canceladas.
 */
export function isCancelledTailPage(
  sales: EyemobileSaleStatusLike[] | null | undefined
): boolean {
  if (!Array.isArray(sales) || sales.length === 0) return false;
  return sales.every((s) => isCancelledOrIncompleteSale(s));
}
