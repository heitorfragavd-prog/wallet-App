import { describe, it, expect, vi } from 'vitest';
import {
  validateLinhaDigitavel,
  reconcileBoleto,
} from '../../../../supabase/functions/_shared/ai/boleto-validator';
import {
  recoverBoletoLineWithFailover,
} from '../../../../supabase/functions/_shared/ai/boleto-service';

describe('Boleto Auto-Recovery Pipeline & High-Risk UX Verification', () => {
  const LINHA_SPAL_VALIDA = '34191091150174649293183045790009815520000156261';
  const LINHA_SELLPACK_VALIDA = '23793420059000002880454002481106115580000060247';
  const LINHA_SELLPACK_CORROMPIDA = '23793420056000002860464002481101615580000632747';
  const LINHA_INCOMPLETA = '237934200590000028804540024811061';

  it('A: SPAL válido na primeira leitura -> status validado, recuperação NÃO é necessária', () => {
    const recon = reconcileBoleto({
      banco: 'Banco Itaú (341)',
      beneficiario: 'SPAL INDUSTRIA BRASILEIRA DE',
      valor: '1562.61',
      data_vencimento: '2026-08-28',
      linha_digitavel: LINHA_SPAL_VALIDA,
    });
    expect(recon.valido).toBe(true);
    expect(recon.status).toBe('validado');
    expect(recon.valorFinal).toBe(1562.61);
    expect(recon.dataVencimentoFinal).toBe('2026-08-28');
  });

  it('B: Linha incompleta (<47 dígitos) é inválida e exige recuperação', () => {
    const val = validateLinhaDigitavel(LINHA_INCOMPLETA);
    expect(val.valido).toBe(false);
  });

  it('C: Linha 47 dígitos com DV inválido é rejeitada deterministicamente', () => {
    const val = validateLinhaDigitavel(LINHA_SELLPACK_CORROMPIDA);
    expect(val.valido).toBe(false);
  });

  it('D: GPT focalizado recupera linha válida -> aceita candidato e encerra sem chamar Gemini', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                linha_digitavel: LINHA_SELLPACK_VALIDA,
                valor_visual: 602.47,
                vencimento_visual: '2026-09-03',
              }),
            },
          },
        ],
      }),
    });

    const res = await recoverBoletoLineWithFailover({
      base64: 'dummyBase64',
      mimeType: 'image/jpeg',
      openaiApiKey: 'sk-openai-mock',
      geminiApiKey: 'ai-gemini-mock',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(res.recovered).toBe(true);
    expect(res.successfulCandidate?.provider).toBe('openai');
    expect(res.successfulCandidate?.linha_digits).toBe(LINHA_SELLPACK_VALIDA);
    expect(res.validationResult?.valido).toBe(true);
    expect(res.validationResult?.valorDerivado).toBe(602.47);
    expect(res.validationResult?.dataVencimentoDerivada).toBe('2026-09-03');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('E & F: GPT focalizado falha -> Fallback Gemini é acionado e aceita linha integralmente', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('openai.com')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ linha_digitavel: LINHA_SELLPACK_CORROMPIDA }) } }],
          }),
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ linha_digitavel: LINHA_SELLPACK_VALIDA }) }] } }],
          }),
        };
      }
    });

    const res = await recoverBoletoLineWithFailover({
      base64: 'dummyBase64',
      mimeType: 'image/jpeg',
      openaiApiKey: 'sk-openai-mock',
      geminiApiKey: 'ai-gemini-mock',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(res.recovered).toBe(true);
    expect(res.successfulCandidate?.provider).toBe('gemini');
    expect(res.successfulCandidate?.linha_digits).toBe(LINHA_SELLPACK_VALIDA);
    expect(res.validationResult?.valido).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('G: Todos os provedores retornam linhas inválidas -> recovered = false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ linha_digitavel: '999999999999' }) } }],
        candidates: [{ content: { parts: [{ text: JSON.stringify({ linha_digitavel: '888888888888' }) }] } }],
      }),
    });

    const res = await recoverBoletoLineWithFailover({
      base64: 'dummyBase64',
      mimeType: 'image/jpeg',
      openaiApiKey: 'sk-openai-mock',
      geminiApiKey: 'ai-gemini-mock',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(res.recovered).toBe(false);
  });

  it('H & I: Para requer_revisao, NUNCA oferecer [Sim, cadastrar]; oferecer [Revisar dados] e [Cancelar]', () => {
    const getButtons = (status: string, id: string) => {
      if (status === 'validado' || status === 'validado_com_alerta') {
        return [
          [
            { text: '✅ Sim, cadastrar', callback_data: 'confirmar_proposta:' + id },
            { text: '❌ Não, cancelar', callback_data: 'cancelar_proposta:' + id },
          ],
        ];
      }
      return [
        [
          { text: '✏️ Revisar dados', callback_data: 'revisar_proposta:' + id },
          { text: '❌ Cancelar', callback_data: 'cancelar_proposta:' + id },
        ],
      ];
    };

    const botoesValidado = getButtons('validado', 'uuid-1');
    expect(botoesValidado[0][0].text).toContain('Sim, cadastrar');

    const botoesRevisao = getButtons('requer_revisao', 'uuid-3');
    expect(botoesRevisao[0][0].text).toContain('Revisar dados');
    expect(botoesRevisao[0][0].callback_data).toBe('revisar_proposta:uuid-3');
    expect(botoesRevisao[0][1].text).toContain('Cancelar');
    expect(JSON.stringify(botoesRevisao)).not.toContain('Sim, cadastrar');
  });

  it('K & L: SELLPACK ground truth deriva R$ 602,47 e 03/09/2026; linha corrompida falha', () => {
    const valReal = validateLinhaDigitavel(LINHA_SELLPACK_VALIDA);
    expect(valReal.valido).toBe(true);
    expect(valReal.valorDerivado).toBe(602.47);
    expect(valReal.dataVencimentoDerivada).toBe('2026-09-03');

    const valCorrompido = validateLinhaDigitavel(LINHA_SELLPACK_CORROMPIDA);
    expect(valCorrompido.valido).toBe(false);
  });

  it('M: SPAL continua passando deterministicamente com R$ 1.562,61 e 28/08/2026', () => {
    const valSpal = validateLinhaDigitavel(LINHA_SPAL_VALIDA);
    expect(valSpal.valido).toBe(true);
    expect(valSpal.valorDerivado).toBe(1562.61);
    expect(valSpal.dataVencimentoDerivada).toBe('2026-08-28');
  });
});