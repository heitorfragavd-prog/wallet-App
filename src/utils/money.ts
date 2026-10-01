/**
 * Utilitários monetários com aritmética inteira exata em centavos.
 * Tolerância zero para imprecisão de ponto flutuante (IEEE 754).
 */

export type RoundingMode = 'half-up' | 'bankers';

/**
 * Converte valor decimal em string ou number para centavos inteiros (bigint).
 * Ex: 10.50 -> 1050n, "123.45" -> 12345n, -5.20 -> -520n.
 */
export function toCents(amount: number | string): bigint {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new TypeError(`Valor monetário inválido: ${amount}`);
    }
    // Normalização com string fixada para evitar artefatos de float
    const fixedStr = amount.toFixed(4);
    return parseDecimalStringToCents(fixedStr);
  }

  if (typeof amount === 'string') {
    const cleaned = amount.trim().replace(/\s/g, '').replace('R$', '');
    // Suporte tanto para "1234,56" quanto "1234.56"
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    if (normalized === '' || isNaN(Number(normalized))) {
      throw new TypeError(`String monetária inválida: "${amount}"`);
    }
    return parseDecimalStringToCents(Number(normalized).toFixed(4));
  }

  throw new TypeError(`Tipo inválido para valor monetário: ${typeof amount}`);
}

function parseDecimalStringToCents(str: string): bigint {
  const isNegative = str.startsWith('-');
  const unsignedStr = isNegative ? str.slice(1) : str;
  const [intPart, decPart = ''] = unsignedStr.split('.');
  const paddedDec = (decPart + '0000').slice(0, 4);
  const cents = BigInt(intPart) * 100n + BigInt(paddedDec.slice(0, 2));
  const subCents = Number(paddedDec.slice(2, 4));

  // Arredondamento padrão half-up na 3ª/4ª casa decimal
  let finalCents = cents;
  if (subCents >= 50) {
    finalCents += 1n;
  }
  return isNegative ? -finalCents : finalCents;
}

/**
 * Converte centavos inteiros (bigint ou number) para string formatada em reais ("10,50").
 */
export function centsToFormattedReal(cents: bigint | number): string {
  const c = BigInt(cents);
  const isNegative = c < 0n;
  const absC = isNegative ? -c : c;
  const intVal = absC / 100n;
  const decVal = absC % 100n;
  const decStr = decVal.toString().padStart(2, '0');
  const sign = isNegative ? '-' : '';
  return `${sign}${intVal.toString()},${decStr}`;
}

/**
 * Converte centavos inteiros para number decimal float (apenas para exibição legada se necessário).
 */
export function centsToDecimalNumber(cents: bigint | number): number {
  return Number(cents) / 100;
}

/**
 * Aplica taxa em pontos-base (basis points: 1 bp = 0.01% = 0.0001, 100 bp = 1%) ou taxa percentual
 * usando arredondamento formal (half-up ou banker's rounding).
 * 
 * @param amountCents Montante base em centavos
 * @param rateBps Taxa em basis points (ex: 250n para 2.50%)
 * @param rounding Modo de arredondamento ('half-up' ou 'bankers')
 */
export function calculateRateCents(
  amountCents: bigint,
  rateBps: bigint,
  rounding: RoundingMode = 'half-up'
): bigint {
  if (rateBps < 0n) {
    throw new RangeError('Taxa percentual não pode ser negativa');
  }

  // Produto: amountCents * rateBps. Divisor: 10000n (porque 10000 bps = 100%)
  const product = amountCents * rateBps;
  const divisor = 10000n;

  const quotient = product / divisor;
  const remainder = product % divisor;

  if (remainder === 0n) {
    return quotient;
  }

  const absRemainder = remainder < 0n ? -remainder : remainder;
  const half = divisor / 2n; // 5000n

  if (rounding === 'half-up') {
    if (absRemainder >= half) {
      return product > 0n ? quotient + 1n : quotient - 1n;
    }
    return quotient;
  }

  // Banker's rounding (round half to even)
  if (absRemainder > half) {
    return product > 0n ? quotient + 1n : quotient - 1n;
  } else if (absRemainder === half) {
    // Se o quociente for ímpar, arredonda para o par mais próximo
    const isEven = quotient % 2n === 0n;
    if (!isEven) {
      return product > 0n ? quotient + 1n : quotient - 1n;
    }
  }

  return quotient;
}

/**
 * Divide um montante total em centavos pelo número de parcelas,
 * distribuindo os centavos residuais nas primeiras parcelas (sem perda de centavos).
 */
export function splitCentsInstallments(totalCents: bigint, count: number): bigint[] {
  if (count <= 0) {
    throw new RangeError('Número de parcelas deve ser maior que zero');
  }
  const n = BigInt(count);
  const base = totalCents / n;
  const remainder = totalCents % n;

  const result: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const extra = BigInt(i) < remainder ? 1n : 0n;
    result.push(base + extra);
  }
  return result;
}

