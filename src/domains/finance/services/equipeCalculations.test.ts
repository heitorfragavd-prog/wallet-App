import { describe, expect, it } from 'vitest';

import {
  calcularAcertoFolguista,
  calcularAcertoFuncionario,
  calcularAcertoSemanalTransporte,
  calcularCustoColaborador,
  calcularFimExperiencia,
  centavosParaDecimal,
  dataCivilSaoPaulo,
  decimalParaCentavos,
  quintoDiaUtil,
  resolverEstadoContrato,
} from './equipeCalculations';

describe('equipeCalculations', () => {
  describe('quintoDiaUtil (CLT art. 459 e IN SRT 01/1989)', () => {
    it('calcula o quinto dia util incluindo sabado na contagem (regra CLT)', () => {
      // Dezembro/2026: 01(ter), 02(qua), 03(qui), 04(sex), 05(sab) -> 5º dia util = 05/12/2026
      expect(quintoDiaUtil(2026, 12)).toBe('2026-12-05');
    });

    it('antecipa para a sexta-feira anterior quando cai no sabado e anteciparSeSabado=true', () => {
      // Dezembro/2026: 5º dia util e sabado 05/12/2026, antecipa para sexta 04/12/2026
      expect(quintoDiaUtil(2026, 12, [], { anteciparSeSabado: true })).toBe('2026-12-04');
    });

    it('calcula o quinto dia util em mes com feriado nacional (ex: Novembro/2026 com 02/11 Finados)', () => {
      // Novembro/2026: 01(domingo), 02(feriado Finados), 03(ter-1), 04(qua-2), 05(qui-3), 06(sex-4), 07(sab-5)
      expect(quintoDiaUtil(2026, 11, ['2026-11-02'])).toBe('2026-11-07');
    });

    it('permite modo legado desconsiderando sabados quando incluirSabado=false', () => {
      expect(quintoDiaUtil(2026, 8, ['2026-08-07'], { incluirSabado: false })).toBe('2026-08-10');
    });
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

  describe('calcularAcertoSemanalTransporte (Regra de Negocio Oficial)', () => {
    const semanaAtualPadrao = [
      { data: '2026-11-02', label: 'Segunda', previsaoTrabalho: true },
      { data: '2026-11-03', label: 'Terça', previsaoTrabalho: true },
      { data: '2026-11-04', label: 'Quarta', previsaoTrabalho: true },
      { data: '2026-11-05', label: 'Quinta', previsaoTrabalho: true },
      { data: '2026-11-06', label: 'Sexta', previsaoTrabalho: true },
      { data: '2026-11-07', label: 'Sábado', previsaoTrabalho: true },
      { data: '2026-11-08', label: 'Domingo', previsaoTrabalho: false },
    ];

    it('Cenário 1: Seis dias de antecipação: R$ 109,50', () => {
      const semanaAnteriorSemDiferenca = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior: semanaAnteriorSemDiferenca,
      });

      expect(res.diasPrevistosAtual).toBe(6);
      expect(res.uberAntecipadoCentavos).toBe(7200); // 6 * 12,00
      expect(res.passagensAntecipadasCentavos).toBe(3750); // 6 * 6,25
      expect(res.totalAntecipacaoCentavos).toBe(10950); // R$ 109,50
      expect(res.saldoAjusteUberCentavos).toBe(0);
      expect(res.totalTransferenciaCentavos).toBe(10950); // R$ 109,50
    });

    it('Cenário 2: Uber anterior de R$ 11,98 em um dia e R$ 12,00 nos demais: R$ 109,48', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1198 }, // -0.02
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.totalAntecipacaoCentavos).toBe(10950);
      expect(res.saldoAjusteUberCentavos).toBe(-2); // -R$ 0,02
      expect(res.totalTransferenciaCentavos).toBe(10948); // R$ 109,48
      expect(centavosParaDecimal(res.totalTransferenciaCentavos)).toBe(109.48);
    });

    it('Cenário 3: Uber anterior de R$ 15,00 em um dia e R$ 12,00 nos demais: R$ 112,50', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1500 }, // +3.00
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.totalAntecipacaoCentavos).toBe(10950);
      expect(res.saldoAjusteUberCentavos).toBe(300); // +R$ 3,00
      expect(res.totalTransferenciaCentavos).toBe(11250); // R$ 112,50
      expect(centavosParaDecimal(res.totalTransferenciaCentavos)).toBe(112.5);
    });

    it('Cenário 4: Vários ajustes positivos e negativos na mesma semana', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1500 }, // +3.00
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1198 }, // -0.02
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1150 }, // -0.50
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 }, // 0
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1400 }, // +2.00
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1000 }, // -2.00
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      // Saldo esperado: +3.00 - 0.02 - 0.50 + 0 + 2.00 - 2.00 = +2.48 (+248 centavos)
      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.saldoAjusteUberCentavos).toBe(248);
      expect(res.totalTransferenciaCentavos).toBe(10950 + 248); // 11198 = R$ 111,98
      expect(centavosParaDecimal(res.totalTransferenciaCentavos)).toBe(111.98);
    });

    it('Cenário 5: Ausência de trabalho e dias sem direito à antecipação não criam diferença artificial', () => {
      const semanaAtual = [
        { data: '2026-11-02', label: 'Segunda', previsaoTrabalho: true },
        { data: '2026-11-03', label: 'Terça', previsaoTrabalho: true },
        { data: '2026-11-04', label: 'Quarta', previsaoTrabalho: false }, // folga planejada
        { data: '2026-11-05', label: 'Quinta', previsaoTrabalho: true },
        { data: '2026-11-06', label: 'Sexta', previsaoTrabalho: true },
        { data: '2026-11-07', label: 'Sábado', previsaoTrabalho: false }, // folga planejada
        { data: '2026-11-08', label: 'Domingo', previsaoTrabalho: false },
      ]; // 4 dias previstos = 4 * 18,25 = 73,00

      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: false, uberRealCentavos: 0 }, // não recebeu, diferença = 0
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: false, uberRealCentavos: 0 }, // não recebeu, diferença = 0
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({ semanaAtual, semanaAnterior });
      expect(res.diasPrevistosAtual).toBe(4);
      expect(res.totalAntecipacaoCentavos).toBe(7300); // 4 * 1825 = 73,00
      expect(res.saldoAjusteUberCentavos).toBe(0);
      expect(res.totalTransferenciaCentavos).toBe(7300);
    });

    it('Cenário 6: Semana anterior sem histórico ou vazia', () => {
      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior: [],
      });

      expect(res.diasPrevistosAtual).toBe(6);
      expect(res.totalAntecipacaoCentavos).toBe(10950);
      expect(res.saldoAjusteUberCentavos).toBe(0);
      expect(res.totalTransferenciaCentavos).toBe(10950);
    });

    it('inclui metas/bônus sem alterar critérios de transporte', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 1200, metaCentavos: 2000 },
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200, metaCentavos: 1500 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.totalAntecipacaoCentavos).toBe(10950);
      expect(res.totalMetasCentavos).toBe(3500); // R$ 35,00
      expect(res.totalTransferenciaCentavos).toBe(10950 + 3500); // R$ 144,50
    });

    it('Cenário 7: Reembolso de gasto elegível realizado do próprio bolso (sem antecipação prévia)', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: false, uberRealCentavos: 1500 }, // não recebeu, gastou R$ 15,00 -> reembolso +15,00
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.totalAntecipacaoCentavos).toBe(10950); // 6 dias x 18,25
      expect(res.saldoAjusteUberCentavos).toBe(1500); // +15,00 de reembolso
      expect(res.totalTransferenciaCentavos).toBe(10950 + 1500); // R$ 124,50
      expect(res.diferencasDiarias[0]).toMatchObject({
        recebeuAntecipacao: false,
        uberAntecipadoCentavos: 0,
        uberRealCentavos: 1500,
        diferencaCentavos: 1500,
        informado: true,
      });
    });

    it('Cenário 8: Dia sem gasto de Uber (recebeu R$ 12,00 antecipado mas gastou R$ 0,00 -> desconta R$ 12,00)', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: 0 }, // recebeu 12, gastou 0 -> desconta -12,00
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-30', label: 'Sexta', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-10-31', label: 'Sábado', recebeuAntecipacao: true, uberRealCentavos: 1200 },
        { data: '2026-11-01', label: 'Domingo', recebeuAntecipacao: false, uberRealCentavos: 0 },
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.totalAntecipacaoCentavos).toBe(10950);
      expect(res.saldoAjusteUberCentavos).toBe(-1200); // -R$ 12,00
      expect(res.totalTransferenciaCentavos).toBe(10950 - 1200); // R$ 97,50
      expect(res.diferencasDiarias[0]).toMatchObject({
        recebeuAntecipacao: true,
        uberAntecipadoCentavos: 1200,
        uberRealCentavos: 0,
        diferencaCentavos: -1200,
        informado: true,
      });
    });

    it('Cenário 9: Diferencia explicitamente gasto não informado (null/undefined) de R$ 0,00', () => {
      const semanaAnterior = [
        { data: '2026-10-26', label: 'Segunda', recebeuAntecipacao: true, uberRealCentavos: null }, // ainda não informado
        { data: '2026-10-27', label: 'Terça', recebeuAntecipacao: true, uberRealCentavos: undefined }, // ainda não informado
        { data: '2026-10-28', label: 'Quarta', recebeuAntecipacao: true, uberRealCentavos: 0 }, // explicitamente 0 -> desconta
        { data: '2026-10-29', label: 'Quinta', recebeuAntecipacao: false, uberRealCentavos: null }, // não recebeu e não informado -> sem diferença
      ];

      const res = calcularAcertoSemanalTransporte({
        semanaAtual: semanaAtualPadrao,
        semanaAnterior,
      });

      expect(res.diferencasDiarias[0].informado).toBe(false);
      expect(res.diferencasDiarias[0].diferencaCentavos).toBe(0);
      expect(res.diferencasDiarias[1].informado).toBe(false);
      expect(res.diferencasDiarias[1].diferencaCentavos).toBe(0);

      expect(res.diferencasDiarias[2].informado).toBe(true);
      expect(res.diferencasDiarias[2].diferencaCentavos).toBe(-1200);

      expect(res.diferencasDiarias[3].informado).toBe(false);
      expect(res.diferencasDiarias[3].diferencaCentavos).toBe(0);
    });
  });
});
