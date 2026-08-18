import { describe, expect, it } from 'vitest';

import {
  calcularAcertoFolguista,
  calcularAcertoFuncionario,
  calcularCustoColaborador,
  calcularFimExperiencia,
  centavosParaDecimal,
  decimalParaCentavos,
  quintoDiaUtil,
  resolverEstadoContrato,
} from './equipeCalculations';

describe('equipeCalculations', () => {
  it('calcula o quinto dia util ignorando fins de semana e feriados', () => {
    expect(quintoDiaUtil(2026, 8, ['2026-08-07'])).toBe('2026-08-10');
  });

  it('detalha Uber base, passagem e somente a diferenca positiva', () => {
    expect(
      calcularAcertoFuncionario([
        {
          trabalhou: true,
          uberCentavos: 1_392,
          uberBaseCentavos: 1_200,
          passagemCentavos: 625,
          metaCentavos: 15_000,
        },
      ]),
    ).toEqual({
      uberRealCentavos: 1_392,
      uberBaseCentavos: 1_200,
      passagensCentavos: 625,
      diferencaUberCentavos: 192,
      transporteCentavos: 2_017,
      metaCentavos: 15_000,
      totalCentavos: 17_017,
    });
  });

  it('mantem o valor base de Uber quando o gasto real e menor', () => {
    expect(
      calcularAcertoFuncionario([
        {
          trabalhou: true,
          uberCentavos: 900,
          uberBaseCentavos: 1_200,
          passagemCentavos: 625,
          metaCentavos: 0,
        },
      ]),
    ).toEqual({
      uberRealCentavos: 900,
      uberBaseCentavos: 1_200,
      passagensCentavos: 625,
      diferencaUberCentavos: 0,
      transporteCentavos: 1_825,
      metaCentavos: 0,
      totalCentavos: 1_825,
    });
  });

  it('calcula diaria e meta do folguista sem encargos embutidos', () => {
    expect(
      calcularAcertoFolguista([
        { trabalhou: true, diariaCentavos: 10_000, metaCentavos: 2_000 },
        { trabalhou: false, diariaCentavos: 10_000, metaCentavos: 2_000 },
        { trabalhou: true, diariaCentavos: 12_000, metaCentavos: 0 },
      ]),
    ).toEqual({
      diariasCentavos: 22_000,
      metaCentavos: 2_000,
      totalCentavos: 24_000,
      diasTrabalhados: 2,
    });
  });

  it('usa o periodo de experiencia configuravel', () => {
    expect(calcularFimExperiencia('2026-08-01', 45)).toBe('2026-09-15');
  });

  it('resolve experiencia expirada e ativa como prazo indeterminado', () => {
    expect(
      resolverEstadoContrato({
        statusPersistido: 'experiencia',
        dataAdmissao: '2026-02-23',
        diasExperiencia: 90,
        dataReferencia: '2026-08-17',
        dataDemissao: null,
      }),
    ).toMatchObject({ estado: 'indeterminado', diasRestantes: null });
  });

  it('mantem decisao pendente exatamente na data final', () => {
    expect(
      resolverEstadoContrato({
        statusPersistido: 'experiencia',
        dataAdmissao: '2026-08-01',
        diasExperiencia: 45,
        dataReferencia: '2026-09-15',
        dataDemissao: null,
      }).estado,
    ).toBe('decisao');
  });

  it('converte dinheiro para centavos sem erro binario', () => {
    expect(decimalParaCentavos(109.5)).toBe(10_950);
    expect(decimalParaCentavos('12,34')).toBe(1_234);
    expect(centavosParaDecimal(10_950)).toBe(109.5);
  });

  it('calcula funcionario MEI com 3% patronal e 8% de FGTS', () => {
    const result = calcularCustoColaborador({
      tipo: 'funcionario',
      regimeEncargos: 'mei',
      salarioCentavos: 162_100,
      diasTrabalhoMes: 26,
    });

    expect(result).toMatchObject({
      inssEmpresaCentavos: 4_863,
      fgtsCentavos: 12_968,
      decimoTerceiroCentavos: 13_508,
      feriasCentavos: 18_011,
      totalCentavos: 211_450,
      custoDiaCentavos: 8_133,
    });
  });

  it('aplica encargos gerais ao funcionario quando regime e geral', () => {
    const funcionario = calcularCustoColaborador({
      tipo: 'funcionario',
      regimeEncargos: 'geral',
      salarioCentavos: 200_000,
      transporteCentavos: 10_000,
      beneficiosCentavos: 5_000,
      variaveisCentavos: 2_000,
      diasTrabalhoMes: 25,
    });
    const socio = calcularCustoColaborador({
      tipo: 'socio',
      salarioCentavos: 0,
      proLaboreCentavos: 500_000,
      diasTrabalhoMes: 25,
    });
    const folguista = calcularCustoColaborador({
      tipo: 'folguista',
      salarioCentavos: 0,
      variaveisCentavos: 30_000,
      diasTrabalhoMes: 3,
    });

    expect(funcionario.inssEmpresaCentavos).toBe(40_000);
    expect(funcionario.encargosCentavos).toBeGreaterThan(0);
    expect(funcionario.totalCentavos).toBeGreaterThan(217_000);
    expect(socio).toMatchObject({ encargosCentavos: 0, totalCentavos: 500_000 });
    expect(folguista).toMatchObject({ encargosCentavos: 0, totalCentavos: 30_000, custoDiaCentavos: 10_000 });
  });
});

