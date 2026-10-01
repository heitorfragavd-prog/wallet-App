import { describe, it, expect } from 'vitest';
import {
  toCents,
  centsToFormattedReal,
  centsToDecimalNumber,
  calculateRateCents,
  splitCentsInstallments
} from '../utils/money';

describe('money.ts - Utilitários monetários de precisão exata em centavos', () => {
  it('converte number e string para centavos inteiros (bigint)', () => {
    expect(toCents(10.50)).toBe(1050n);
    expect(toCents('123.45')).toBe(12345n);
    expect(toCents('R$ 1.234,56')).toBe(123456n);
    expect(toCents(-5.20)).toBe(-520n);
  });

  it('converte centavos para formato real em string', () => {
    expect(centsToFormattedReal(1050n)).toBe('10,50');
    expect(centsToFormattedReal(123456n)).toBe('1234,56');
    expect(centsToFormattedReal(-520n)).toBe('-5,20');
  });

  it('converte centavos para decimal float', () => {
    expect(centsToDecimalNumber(1050n)).toBe(10.5);
  });

  it('calcula taxa em basis points (MDR) com arredondamento formal', () => {
    // R$ 100,00 (10000n) com taxa de 2.50% (250 bps) = R$ 2,50 (250n)
    expect(calculateRateCents(10000n, 250n)).toBe(250n);
    // R$ 10,00 (1000n) com taxa de 1.99% (199 bps) = 19.9 cents -> 20 cents
    expect(calculateRateCents(1000n, 199n)).toBe(20n);
  });

  it('faz divisão exata de parcelas sem perda de centavos residuais', () => {
    // R$ 100,00 em 3x: 33,34 + 33,33 + 33,33 = 100,00
    const installments = splitCentsInstallments(10000n, 3);
    expect(installments).toEqual([3334n, 3333n, 3333n]);
    const sum = installments.reduce((acc, curr) => acc + curr, 0n);
    expect(sum).toBe(10000n);
  });
});
