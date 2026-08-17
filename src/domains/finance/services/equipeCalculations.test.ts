import { describe, expect, it } from 'vitest';

import {
  calcularAcertoFolguista,
  calcularAcertoFuncionario,
  calcularCustoColaborador,
  calcularFimExperiencia,
  centavosParaDecimal,
  decimalParaCentavos,
  quintoDiaUtil,
} from './equipeCalculations';

describe('equipeCalculations', () => {
  it('calcula o quinto dia util ignorando fins de semana e feriados', () => {
    expect(quintoDiaUtil(2026, 8, ['2026-08-07'])).toBe('2026-08-10');
  });

  it('agrupa Uber e passagem em transporte e mantem meta separada', () => {
    const resultado = calcularAcertoFuncionario([
      {
        trabalhou: true,
        uberCentavos: 1_500,
        uberBaseCentavos: 1_200,
        passagemCentavos: 625,
        metaCentavos: 2_000,
      },
      {
        trabalhou: false,
        uberCentavos: 9_999,
        uberBaseCentavos: 1_200,
        passagemCentavos: 625,
        metaCentavos: 9_999,
      },
    ]);

    expect(resultado).toEqual({
      transporteCentavos: 2_125,
      metaCentavos: 2_000,
      totalCentavos: 4_125,
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

  it('converte dinheiro para centavos sem erro binario', () => {
    expect(decimalParaCentavos(109.5)).toBe(10_950);
    expect(decimalParaCentavos('12,34')).toBe(1_234);
    expect(centavosParaDecimal(10_950)).toBe(109.5);
  });

  it('aplica encargos somente ao funcionario fixo', () => {
    const funcionario = calcularCustoColaborador({
      tipo: 'funcionario',
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

    expect(funcionario.encargosCentavos).toBeGreaterThan(0);
    expect(funcionario.totalCentavos).toBeGreaterThan(217_000);
    expect(socio).toMatchObject({ encargosCentavos: 0, totalCentavos: 500_000 });
    expect(folguista).toMatchObject({ encargosCentavos: 0, totalCentavos: 30_000, custoDiaCentavos: 10_000 });
  });
});

