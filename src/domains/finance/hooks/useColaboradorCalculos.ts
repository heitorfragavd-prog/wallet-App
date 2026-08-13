import { useMemo } from "react";
import { Colaborador } from "./useColaboradores";
import { ColaboradorCusto } from "./useColaboradorCustos";
import { ColaboradorPresenca } from "./useColaboradorPresencas";

export interface CalculosColaborador {
  salarioBruto: number;
  inssEmpresa: number;
  fgts: number;
  decimoTerceiroProvisao: number;
  feriasProvisao: number;
  multaFgtsRescisao: number;
  valeTransporte: number;
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
}

export function useColaboradorCalculos(
  colaborador: Colaborador | null,
  custos: ColaboradorCusto[],
  presencas: ColaboradorPresenca[]
): CalculosColaborador {
  return useMemo(() => {
    if (!colaborador) return {
      salarioBruto: 0, inssEmpresa: 0, fgts: 0, decimoTerceiroProvisao: 0,
      feriasProvisao: 0, multaFgtsRescisao: 0, valeTransporte: 0, valeRefeicao: 0,
      outrosBeneficios: 0, custosVariaveis: 0, custoRealMensal: 0, custoPorDia: 0,
      custoPorHora: 0, reservaRescisao: 0, custoSeAssinarCarteira: 0,
      diasTrabalhados: 0, diasFaltas: 0, diasAtrasos: 0, percentualFaltas: 0,
      diasParaFimExperiencia: null,
    };

    const salario = Number(colaborador.salario_bruto) || 0;
    const vt = Number(colaborador.vale_transporte) || 0;
    const vr = Number(colaborador.vale_refeicao) || 0;
    const outros = Number(colaborador.outros_beneficios) || 0;
    const isSocio = colaborador.tipo === "socio";
    const isFolguista = colaborador.tipo === "folguista";
    const temEncargos = !isSocio && !isFolguista; // so funcionario tem encargos

    // SOCIOS e FOLGUISTAS: nao tem encargos trabalhistas
    // FUNCIONARIOS: tem INSS, FGTS, 13o, ferias
    const inssEmpresa = temEncargos ? salario * 0.20 : 0;
    const fgts = temEncargos ? salario * 0.08 : 0;
    const decimoTerceiroProvisao = temEncargos ? salario / 12 : 0;
    const feriasProvisao = temEncargos ? (salario / 12) * 1.3333 : 0;

    // Custos variaveis do mes (vale, adiantamento, etc.)
    const custosVariaveis = custos.reduce((s, c) => s + Number(c.valor), 0);

    // Custo real mensal
    const custoRealMensal = salario + inssEmpresa + fgts + decimoTerceiroProvisao + feriasProvisao + vt + vr + outros + custosVariaveis;

    // Dias uteis do mes (simplificado: 26)
    const diasUteis = 26;
    const custoPorDia = custoRealMensal / diasUteis;
    const custoPorHora = colaborador.carga_horaria_semanal > 0 ? custoPorDia / (colaborador.carga_horaria_semanal / 5) : 0;

    // Reserva para rescisao (SO para funcionarios)
    let reservaRescisao = 0;
    let multaFgtsRescisao = 0;
    let custoSeAssinarCarteira = 0;

    if (temEncargos) {
      const mesesTrabalhados = colaborador.data_admissao 
        ? Math.max(1, Math.floor((new Date().getTime() - new Date(colaborador.data_admissao).getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : 1;
      const fgtsAcumulado = fgts * mesesTrabalhados;
      multaFgtsRescisao = fgtsAcumulado * 0.40;
      const avisoPrevio = salario;
      const feriasVencidas = feriasProvisao * mesesTrabalhados;
      const decimoVencido = decimoTerceiroProvisao * mesesTrabalhados;
      reservaRescisao = fgtsAcumulado + multaFgtsRescisao + avisoPrevio + feriasVencidas + decimoVencido;
      custoSeAssinarCarteira = salario + inssEmpresa + fgts + decimoTerceiroProvisao + feriasProvisao;
    }

    // Presencas
    const diasTrabalhados = presencas.filter(p => p.presente).length;
    const diasFaltas = presencas.filter(p => !p.presente).length;
    const diasAtrasos = presencas.filter(p => p.atraso_minutos > 0).length;
    const percentualFaltas = presencas.length > 0 ? (diasFaltas / presencas.length) * 100 : 0;

    // Fim de experiencia (so para funcionarios)
    let diasParaFimExperiencia: number | null = null;
    if (temEncargos && colaborador.status === "experiencia" && colaborador.data_admissao) {
      const adm = new Date(colaborador.data_admissao);
      const fimExp = new Date(adm);
      fimExp.setDate(adm.getDate() + (colaborador.dias_experiencia || 90));
      const hoje = new Date();
      diasParaFimExperiencia = Math.max(0, Math.ceil((fimExp.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return {
      salarioBruto: salario, inssEmpresa, fgts, decimoTerceiroProvisao, feriasProvisao,
      multaFgtsRescisao, valeTransporte: vt, valeRefeicao: vr, outrosBeneficios: outros,
      custosVariaveis, custoRealMensal, custoPorDia, custoPorHora, reservaRescisao,
      custoSeAssinarCarteira, diasTrabalhados, diasFaltas, diasAtrasos, percentualFaltas,
      diasParaFimExperiencia,
    };
  }, [colaborador, custos, presencas]);
}
