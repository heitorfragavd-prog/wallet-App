import { describe, it, expect } from 'vitest';
import {
  validateLinhaDigitavel,
  reconcileBoleto,
  calcularModulo10,
  calcularModulo11Boleto,
} from '../../../../supabase/functions/_shared/ai/boleto-validator.ts';

describe('SELLPACK Boleto Deterministic Ground Truth & FEBRABAN Validation', () => {
  const LINHA_SELLPACK_REAL = '23793420059000002880454002481106115580000060247';
  const LINHA_SELLPACK_CORROMPIDA_OCR = '23793420056000002860464002481101615580000632747';

  it('1. Linha SELLPACK Real possui exatamente 47 dígitos', () => {
    expect(LINHA_SELLPACK_REAL.length).toBe(47);
  });

  it('2. Valida DV do Campo 1 (Módulo 10)', () => {
    const campo1 = LINHA_SELLPACK_REAL.substring(0, 9);
    const dv1 = parseInt(LINHA_SELLPACK_REAL[9], 10);
    expect(calcularModulo10(campo1)).toBe(5);
    expect(dv1).toBe(5);
  });

  it('3. Valida DV do Campo 2 (Módulo 10)', () => {
    const campo2 = LINHA_SELLPACK_REAL.substring(10, 20);
    const dv2 = parseInt(LINHA_SELLPACK_REAL[20], 10);
    expect(calcularModulo10(campo2)).toBe(4);
    expect(dv2).toBe(4);
  });

  it('4. Valida DV do Campo 3 (Módulo 10)', () => {
    const campo3 = LINHA_SELLPACK_REAL.substring(21, 31);
    const dv3 = parseInt(LINHA_SELLPACK_REAL[31], 10);
    expect(calcularModulo10(campo3)).toBe(6);
    expect(dv3).toBe(6);
  });

  it('5. Valida DV Geral do Código de Barras (Módulo 11)', () => {
    const dvGeralInformado = parseInt(LINHA_SELLPACK_REAL[32], 10);
    const codigoSemDv = '2379' + '15580000060247' + '3420090000028805400248110';
    expect(calcularModulo11Boleto(codigoSemDv)).toBe(1);
    expect(dvGeralInformado).toBe(1);
  });

  it('6. validateLinhaDigitavel valida 100% a linha SELLPACK e deriva R$ 602,47 e 03/09/2026', () => {
    const res = validateLinhaDigitavel(LINHA_SELLPACK_REAL);
    expect(res.valido).toBe(true);
    expect(res.bancoCodigo).toBe('237');
    expect(res.valorDerivado).toBe(602.47);
    expect(res.dataVencimentoDerivada).toBe('2026-09-03');
    expect(res.evidence.length_valid).toBe(true);
    expect(res.evidence.dv_campo_1_valid).toBe(true);
    expect(res.evidence.dv_campo_2_valid).toBe(true);
    expect(res.evidence.dv_campo_3_valid).toBe(true);
    expect(res.evidence.dv_geral_valid).toBe(true);
    expect(res.evidence.linha_matematicamente_valida).toBe(true);
    expect(res.erros).toHaveLength(0);
  });

  it('7. reconcileBoleto com Linha SELLPACK Real assume R$ 602,47 e 03/09/2026 como autoridade', () => {
    const recon = reconcileBoleto({
      banco: 'Bradesco S.A. (237)',
      beneficiario: 'SELLPACK DISTRIBUIDORA LTDA - MG',
      valor: '6327.47',
      data_vencimento: '20/08/2026',
      linha_digitavel: LINHA_SELLPACK_REAL,
    });
    expect(recon.valido).toBe(true);
    expect(recon.status).toBe('validado_com_alerta');
    expect(recon.valorFinal).toBe(602.47);
    expect(recon.dataVencimentoFinal).toBe('2026-09-03');
    expect(recon.valorSource).toBe('febraban_linha');
    expect(recon.vencimentoSource).toBe('febraban_linha');
  });

  it('8. Rejeita a linha corrompida do OCR inicial e protege contra R$ 6.327,47', () => {
    const resCorrompida = validateLinhaDigitavel(LINHA_SELLPACK_CORROMPIDA_OCR);
    expect(resCorrompida.valido).toBe(false);
    expect(resCorrompida.evidence.linha_matematicamente_valida).toBe(false);
  });
});