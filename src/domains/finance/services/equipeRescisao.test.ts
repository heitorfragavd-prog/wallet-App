import { describe, expect, it } from 'vitest';

import {
  calcularAvos,
  calcularRescisao,
} from './equipeRescisao';

describe('equipeRescisao', () => {
  const base = {
    dataAdmissao: '2026-02-23',
    dataDesligamento: '2026-08-17',
    salarioCentavos: 162_100,
    aviso: 'indenizado' as const,
    saldoFgtsCentavos: null,
    fgtsHistoricoEstimadoCentavos: 129_708,
    feriasVencidasPeriodos: 0,
    mediasRemuneratoriasCentavos: 0,
    descontosCentavos: 0,
  };

  it('estima sem justa causa com aviso, proporcionais e multa de 40%', () => {
    const result = calcularRescisao({ ...base, motivo: 'sem_justa_causa' });
    expect(result.avisoPrevioCentavos).toBe(162_100);
    expect(result.percentualMultaFgts).toBe(0.4);
    expect(result.fonteSaldoFgts).toBe('estimada');
    expect(result.totalEmpresaCentavos).toBeGreaterThan(0);
    expect(result.multaFgtsCentavos).toBe(Math.round(129_708 * 0.4));
  });

  it('usa metade do aviso e multa de 20% no acordo', () => {
    const result = calcularRescisao({ ...base, motivo: 'acordo' });
    expect(result.avisoPrevioCentavos).toBe(81_050);
    expect(result.percentualMultaFgts).toBe(0.2);
    expect(result.multaFgtsCentavos).toBe(Math.round(129_708 * 0.2));
  });

  it('nao aplica multa no pedido e permite desconto de aviso', () => {
    const result = calcularRescisao({ ...base, motivo: 'pedido_demissao', aviso: 'nao_cumprido' });
    expect(result.multaFgtsCentavos).toBe(0);
    expect(result.descontoAvisoCentavos).toBe(162_100);
  });

  it('conta avo somente quando o mes tem pelo menos quinze dias computaveis', () => {
    expect(calcularAvos('2026-08-01', '2026-08-14')).toBe(0);
    expect(calcularAvos('2026-08-01', '2026-08-15')).toBe(1);
  });

  it('prefere o saldo de FGTS confirmado', () => {
    const result = calcularRescisao({ ...base, motivo: 'sem_justa_causa', saldoFgtsCentavos: 150_000 });
    expect(result.fonteSaldoFgts).toBe('confirmada');
    expect(result.multaFgtsCentavos).toBe(60_000);
  });

  it('informa quitacao em dez dias corridos', () => {
    expect(calcularRescisao({ ...base, motivo: 'sem_justa_causa' }).dataLimitePagamento).toBe('2026-08-27');
  });
});
