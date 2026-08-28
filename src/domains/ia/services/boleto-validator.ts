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
  parseBoletoAmount,
  normalizeDate,
  normalizeCpfCnpj,
  reconcileBoleto,
  type ValidatedLinhaDigitavel,
  type ValidatedCodigoBarras,
  type BoletoValidationResult,
} from "../../../../supabase/functions/_shared/ai/boleto-validator";
