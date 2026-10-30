/**
 * Re-export dos validadores determinísticos de boleto para uso no frontend da Wallet IA.
 */

export {
  cleanDigits,
  calcularModulo10,
  calcularModulo11Boleto,
  calcularModulo11Arrecadacao,
  fatorVencimentoParaData,
  validateLinhaDigitavel,
  validateCodigoBarras,
  barcodeToLinhaDigitavel,
  parseBoletoAmount,
  normalizeDate,
  isValidCalendarDate,
  isLeapYear,
  getDaysInMonth,
  parseNum,
  parseDate,
  normalizeCpfCnpj,
  reconcileBoleto,
  type ValidatedLinhaDigitavel,
  type ValidatedCodigoBarras,
  type BoletoValidationResult,
  type BoletoValidationEvidence,
} from "../../../../supabase/functions/_shared/ai/boleto-validator";
