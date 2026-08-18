export function validateCpfCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 11) {
    // Validação de CPF
    if (/^(\d)\1{10}$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(digits.charAt(i), 10) * (10 - i);
    }
    let rest = 11 - (sum % 11);
    let digit1 = rest === 10 || rest === 11 ? 0 : rest;
    if (digit1 !== parseInt(digits.charAt(9), 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(digits.charAt(i), 10) * (11 - i);
    }
    rest = 11 - (sum % 11);
    let digit2 = rest === 10 || rest === 11 ? 0 : rest;
    return digit2 === parseInt(digits.charAt(10), 10);
  }

  if (digits.length === 14) {
    // Validação de CNPJ
    if (/^(\d)\1{13}$/.test(digits)) return false;

    let size = 12;
    let numbers = digits.substring(0, size);
    const checkDigits = digits.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(checkDigits.charAt(0), 10)) return false;

    size = 13;
    numbers = digits.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(checkDigits.charAt(1), 10);
  }

  return false;
}

export function validateLinhaDigitavel(linha: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  const digits = linha.replace(/\D/g, "");
  // Boletos bancários têm 47 dígitos, tributos/concessionárias têm 48 dígitos
  if (digits.length === 47 || digits.length === 48) {
    return { valid: true, normalized: digits };
  }
  return {
    valid: false,
    error: `Linha digitável deve ter 47 ou 48 dígitos (encontrados ${digits.length}).`,
  };
}

export function validateNotaFiscalItemsSum(
  itens: Array<{ valor_total: number }>,
  valorTotal?: number,
): { valid: boolean; calculatedSum: number; diff: number } {
  const calculatedSum = itens.reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  const roundedSum = Math.round(calculatedSum * 100) / 100;
  const target = Math.round(Number(valorTotal || 0) * 100) / 100;

  const diff = Math.abs(Math.round((target - roundedSum) * 100) / 100);
  const valid = diff < 0.02; // tolerância de centavos

  return {
    valid,
    calculatedSum: roundedSum,
    diff,
  };
}

export function validateIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
