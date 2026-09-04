import { describe, expect, it } from 'vitest';

import {
  calcularAcertoFolguista,
  calcularAcertoFuncionario,
  calcularCustoColaborador,
  calcularFimExperiencia,
  centavosParaDecimal,
  dataCivilSaoPaulo,
  decimalParaCentavos,
  quintoDiaUtil,
  resolverEstadoContrato,
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
      uberRealCentavos: 1_500,
      uberBaseCentavos: 1_200,
      passagensCentavos: 625,
      diferencaUberCentavos: 300,
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
      uberRealCentavos: 900,
      uberBaseCentavos: 1_200,
      passagensCentavos: 625,
      diferencaUberCentavos: 0,
      transporteCentavos: 1_825,
      metaCentavos: 0,
      totalCentavos: 1_825,
    });
  });

  it('detalha Uber base, passagem e somente a diferenca positiva', () => {
    expect(calcularAcertoFuncionario([{
      trabalhou: true,
      uberCentavos: 1_392,
      uberBaseCentavos: 1_200,
      passagemCentavos: 625,
      metaCentavos: 15_000,
    }])).toEqual({
      uberRealCentavos: 1_392,
      uberBaseCentavos: 1_200,
      passagensCentavos: 625,
      diferencaUberCentavos: 192,
      transporteCentavos: 2_017,
      metaCentavos: 15_000,
      totalCentavos: 17_017,
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

  it.each([
    ['2026-08-01', 45, '2026-09-15'],
    ['2026-02-23', 90, '2026-05-24'],
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-31', 1, '2027-01-01'],
  ])('exclui o dia inicial e inclui o vencimento em %s + %i dias', (admissao, dias, esperado) => {
    expect(calcularFimExperiencia(admissao, dias)).toBe(esperado);
  });

  it('converte o relogio UTC para a data civil de Sao Paulo', () => {
    expect(dataCivilSaoPaulo(new Date('2026-09-15T01:00:00Z'))).toBe('2026-09-14');
  });

  it('resolve experiencia expirada e ativa como prazo indeterminado', () => {
    expect(resolverEstadoContrato({
      statusPersistido: 'experiencia',
      dataAdmissao: '2026-02-23',
      diasExperiencia: 90,
      dataReferencia: '2026-08-17',
      dataDemissao: null,
    })).toMatchObject({ estado: 'indeterminado', diasRestantes: null });
  });

  it('mantem decisao pendente exatamente na data final', () => {
    expect(resolverEstadoContrato({
      statusPersistido: 'experiencia',
      dataAdmissao: '2026-08-01',
      diasExperiencia: 45,
      dataReferencia: '2026-09-15',
      dataDemissao: null,
    })).toEqual({ estado: 'decisao', diasRestantes: 0, dataFim: '2026-09-15' });
  });

  it('mantem dias restantes positivos durante a experiencia', () => {
    expect(resolverEstadoContrato({
      statusPersistido: 'ativo',
      dataAdmissao: '2026-08-01',
      diasExperiencia: 45,
      dataReferencia: '2026-09-10',
      dataDemissao: null,
    })).toEqual({ estado: 'experiencia', diasRestantes: 5, dataFim: '2026-09-15' });
  });

  it('prioriza demissao ou status inativo no estado contratual', () => {
    expect(resolverEstadoContrato({
      statusPersistido: 'experiencia',
      dataAdmissao: '2026-08-01',
      diasExperiencia: 45,
      dataReferencia: '2026-08-15',
      dataDemissao: '2026-08-14',
    })).toEqual({ estado: 'inativo', diasRestantes: null, dataFim: '2026-09-15' });
    expect(resolverEstadoContrato({
      statusPersistido: 'inativo',
      dataAdmissao: null,
      diasExperiencia: 45,
      dataReferencia: '2026-08-15',
      dataDemissao: null,
    })).toEqual({ estado: 'inativo', diasRestantes: null, dataFim: null });
  });

  it('trata status demitido como inativo mesmo sem data de demissao', () => {
    expect(resolverEstadoContrato({
      statusPersistido: '  DEMITIDO  ',
      dataAdmissao: '2026-08-01',
      diasExperiencia: 45,
      dataReferencia: '2026-08-15',
      dataDemissao: null,
    })).toEqual({ estado: 'inativo', diasRestantes: null, dataFim: '2026-09-15' });
  });

  it.each(['ferias', 'afastado', 'status-desconhecido'])(
    'mantem status %s em contrato vigente sem encerrar ou lancar',
    (statusPersistido) => {
      expect(() => resolverEstadoContrato({
        statusPersistido,
        dataAdmissao: '2026-08-01',
        diasExperiencia: 45,
        dataReferencia: '2026-10-01',
        dataDemissao: null,
      })).not.toThrow();
      expect(resolverEstadoContrato({
        statusPersistido,
        dataAdmissao: '2026-08-01',
        diasExperiencia: 45,
        dataReferencia: '2026-10-01',
        dataDemissao: null,
      })?.estado).toBe('indeterminado');
    },
  );

  it('rejeita datas e periodo invalidos ao resolver o contrato', () => {
    expect(() => resolverEstadoContrato({
      statusPersistido: 'ativo',
      dataAdmissao: '2026-02-30',
      diasExperiencia: 90,
      dataReferencia: '2026-08-17',
      dataDemissao: null,
    })).toThrow(RangeError);
    expect(() => resolverEstadoContrato({
      statusPersistido: 'ativo',
      dataAdmissao: '2026-02-23',
      diasExperiencia: -1,
      dataReferencia: '17/08/2026',
      dataDemissao: null,
    })).toThrow(RangeError);
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

  it('preserva 20% patronal como regime geral padrao', () => {
    expect(calcularCustoColaborador({
      tipo: 'funcionario',
      salarioCentavos: 162_100,
      diasTrabalhoMes: 26,
    }).inssEmpresaCentavos).toBe(32_420);
  });
});
