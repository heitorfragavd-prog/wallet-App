import { useMemo } from 'react';

import {
  calcularCustoColaborador,
  centavosParaDecimal,
  decimalParaCentavos,
  EstadoContrato,
  RegimeEncargos,
  resolverEstadoContrato,
} from '../services/equipeCalculations';
import { Colaborador } from './useColaboradores';
import { ColaboradorCusto } from './useColaboradorCustos';
import { ColaboradorPresenca } from './useColaboradorPresencas';

export interface CalculosColaborador {
  salarioBruto: number;
  inssEmpresa: number;
  fgts: number;
  decimoTerceiroProvisao: number;
  feriasProvisao: number;
  multaFgtsRescisao: number;
  valeTransporte: number;
  valeTransporteBase: number;
  valeTransporteAcertos: number;
  valeTransporteDiario: number;
  diasUteisMes: number;
  valeRefeicao: number;
  outrosBeneficios: number;
  custosVariaveis: number;
  custoRealMensal: number;
  custoPorDia: number;
  custoPorHora: number;
  reservaRescisao: number;
  custoSeAssinarCarteira: number;
  diasTrabalhados: number;
  diasFaltas: number;
  diasAtrasos: number;
  percentualFaltas: number;
  diasParaFimExperiencia: number | null;
  estadoContrato: EstadoContrato;
}

const EMPTY_CALCULATIONS: CalculosColaborador = {
  salarioBruto: 0,
  inssEmpresa: 0,
  fgts: 0,
  decimoTerceiroProvisao: 0,
  feriasProvisao: 0,
  multaFgtsRescisao: 0,
  valeTransporte: 0,
  valeTransporteBase: 0,
  valeTransporteAcertos: 0,
  valeTransporteDiario: 0,
  diasUteisMes: 26,
  valeRefeicao: 0,
  outrosBeneficios: 0,
  custosVariaveis: 0,
  custoRealMensal: 0,
  custoPorDia: 0,
  custoPorHora: 0,
  reservaRescisao: 0,
  custoSeAssinarCarteira: 0,
  diasTrabalhados: 0,
  diasFaltas: 0,
  diasAtrasos: 0,
  percentualFaltas: 0,
  diasParaFimExperiencia: null,
  estadoContrato: { estado: 'inativo', diasRestantes: null, dataFim: null },
};

const TRANSPORT_COST_TYPES = new Set([
  'acerto_transporte',
  'passagem_semanal',
  'uber_semanal',
  'transporte_diferenca',
]);

function workDaysInMonth(reference: string): number {
  const [yearText, monthText] = reference.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const totalDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let workDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    if (new Date(Date.UTC(year, monthIndex, day)).getUTCDay() !== 0) workDays += 1;
  }

  return workDays || 26;
}

export function useColaboradorCalculos(
  colaborador: Colaborador | null,
  custos: ColaboradorCusto[],
  presencas: ColaboradorPresenca[],
  mesRef?: string,
  regimeEncargos: RegimeEncargos = 'geral',
): CalculosColaborador {
  return useMemo(() => {
    if (!colaborador) return EMPTY_CALCULATIONS;

    const currentReference = mesRef || new Date().toISOString().slice(0, 7);
    const diasUteisMes = workDaysInMonth(currentReference);
    const isSocio = colaborador.tipo === 'socio';
    const isFolguista = colaborador.tipo === 'folguista';
    const isFuncionario = colaborador.tipo === 'funcionario';

    const salarioBruto = Number(colaborador.salario_bruto) || 0;
    const valeTransporteFixo = Number(colaborador.vale_transporte) || 0;
    const valeTransporteDiario = Number(colaborador.vale_transporte_diario) || 0;
    const valeTransporteBase = isSocio || isFolguista
      ? 0
      : (valeTransporteFixo > 0 ? valeTransporteFixo : valeTransporteDiario * diasUteisMes);

    const valeTransporteAcertos = custos
      .filter((custo) => TRANSPORT_COST_TYPES.has(custo.tipo))
      .reduce((total, custo) => total + (Number(custo.valor) || 0), 0);
    const valeTransporte = valeTransporteBase + valeTransporteAcertos;
    const valeRefeicao = Number(colaborador.vale_refeicao) || 0;
    const outrosBeneficios = Number(colaborador.outros_beneficios) || 0;
    const custosVariaveis = custos.reduce((total, custo) => total + (Number(custo.valor) || 0), 0);
    const custosVariaveisNaoTransporte = custos
      .filter((custo) => !TRANSPORT_COST_TYPES.has(custo.tipo))
      .reduce((total, custo) => total + (Number(custo.valor) || 0), 0);
    const diasFolguista = Math.max(1, new Set(custos.map((custo) => custo.data)).size);

    const custo = calcularCustoColaborador({
      tipo: colaborador.tipo,
      regimeEncargos,
      salarioCentavos: decimalParaCentavos(salarioBruto),
      proLaboreCentavos: decimalParaCentavos(colaborador.valor_pro_labore || salarioBruto),
      transporteCentavos: decimalParaCentavos(valeTransporte),
      beneficiosCentavos: decimalParaCentavos(valeRefeicao + outrosBeneficios),
      variaveisCentavos: decimalParaCentavos(
        isFuncionario ? custosVariaveisNaoTransporte : custosVariaveis,
      ),
      diasTrabalhoMes: isFolguista ? diasFolguista : diasUteisMes,
    });

    const inssEmpresa = centavosParaDecimal(custo.inssEmpresaCentavos);
    const fgts = centavosParaDecimal(custo.fgtsCentavos);
    const decimoTerceiroProvisao = centavosParaDecimal(custo.decimoTerceiroCentavos);
    const feriasProvisao = centavosParaDecimal(custo.feriasCentavos);
    const custoRealMensal = centavosParaDecimal(custo.totalCentavos);
    const diariaConfigurada = Number(colaborador.valor_diaria) || 0;
    const custoPorDia = isFolguista && diariaConfigurada > 0
      ? diariaConfigurada
      : centavosParaDecimal(custo.custoDiaCentavos);
    const horasPorDia = colaborador.carga_horaria_semanal > 0
      ? colaborador.carga_horaria_semanal / 6
      : 0;
    const custoPorHora = horasPorDia > 0 ? custoPorDia / horasPorDia : 0;

    let reservaRescisao = 0;
    let multaFgtsRescisao = 0;
    let custoSeAssinarCarteira = 0;
    if (isFuncionario) {
      const mesesTrabalhados = colaborador.data_admissao
        ? Math.max(
          1,
          Math.floor(
            (Date.now() - Date.parse(`${colaborador.data_admissao}T00:00:00`))
            / (30 * 86_400_000),
          ),
        )
        : 1;
      const fgtsAcumulado = fgts * mesesTrabalhados;
      multaFgtsRescisao = fgtsAcumulado * 0.4;
      reservaRescisao = fgtsAcumulado
        + multaFgtsRescisao
        + salarioBruto
        + feriasProvisao * mesesTrabalhados
        + decimoTerceiroProvisao * mesesTrabalhados;
      custoSeAssinarCarteira = salarioBruto
        + inssEmpresa
        + fgts
        + decimoTerceiroProvisao
        + feriasProvisao;
    }

    const diasTrabalhados = presencas.filter((presenca) => presenca.presente).length;
    const diasFaltas = presencas.filter((presenca) => !presenca.presente).length;
    const diasAtrasos = presencas.filter((presenca) => presenca.atraso_minutos > 0).length;
    const percentualFaltas = presencas.length > 0 ? (diasFaltas / presencas.length) * 100 : 0;

    const estadoContrato = resolverEstadoContrato({
      statusPersistido: colaborador.status,
      dataAdmissao: colaborador.data_admissao,
      diasExperiencia: colaborador.dias_experiencia,
      dataDemissao: colaborador.data_demissao,
    });

    const diasParaFimExperiencia = estadoContrato.estado === 'experiencia'
      ? estadoContrato.diasRestantes
      : null;

    return {
      salarioBruto,
      inssEmpresa,
      fgts,
      decimoTerceiroProvisao,
      feriasProvisao,
      multaFgtsRescisao,
      valeTransporte,
      valeTransporteBase,
      valeTransporteAcertos,
      valeTransporteDiario,
      diasUteisMes,
      valeRefeicao,
      outrosBeneficios,
      custosVariaveis,
      custoRealMensal,
      custoPorDia,
      custoPorHora,
      reservaRescisao,
      custoSeAssinarCarteira,
      diasTrabalhados,
      diasFaltas,
      diasAtrasos,
      percentualFaltas,
      diasParaFimExperiencia,
      estadoContrato,
    };
  }, [colaborador, custos, presencas, mesRef, regimeEncargos]);
}
