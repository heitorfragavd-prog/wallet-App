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
}

export function useColaboradorCalculos(
  colaborador: Colaborador | null,
  custos: ColaboradorCusto[],
  presencas: ColaboradorPresenca[],
  mesRef?: string
): CalculosColaborador {
  return useMemo(() => {
    if (!colaborador) return {
      salarioBruto: 0, inssEmpresa: 0, fgts: 0, decimoTerceiroProvisao: 0,
      feriasProvisao: 0, multaFgtsRescisao: 0, valeTransporte: 0, valeTransporteBase: 0,
      valeTransporteAcertos: 0, valeTransporteDiario: 0, diasUteisMes: 26,
      valeRefeicao: 0, outrosBeneficios: 0, custosVariaveis: 0, custoRealMensal: 0,
      custoPorDia: 0, custoPorHora: 0, reservaRescisao: 0, custoSeAssinarCarteira: 0,
      diasTrabalhados: 0, diasFaltas: 0, diasAtrasos: 0, percentualFaltas: 0,
      diasParaFimExperiencia: null,
    };

    // Calcular dias úteis do mês (Segunda a Sábado: getDay() !== 0)
    const refDateStr = mesRef || new Date().toISOString().slice(0, 7);
    const [anoStr, mesStr] = refDateStr.split("-");
    const ano = Number(anoStr) || new Date().getFullYear();
    const mesIdx = (Number(mesStr) || (new Date().getMonth() + 1)) - 1;
    const totalDiasNoMes = new Date(ano, mesIdx + 1, 0).getDate();

    let diasUteis = 0;
    for (let day = 1; day <= totalDiasNoMes; day++) {
      const dayOfWeek = new Date(ano, mesIdx, day).getDay();
      if (dayOfWeek !== 0) { // Exclui apenas Domingo (0), conta Seg-Sáb
        diasUteis++;
      }
    }

    const salario = Number(colaborador.salario_bruto) || 0;
    const vtFixo = Number(colaborador.vale_transporte) || 0;
    const vtDiario = Number(colaborador.vale_transporte_diario) || 0;

    // Base do VT: ou VT Mensal Fixo ou (VT Diário × Dias Úteis)
    const vtBase = vtFixo > 0 ? vtFixo : vtDiario * diasUteis;

    // Somar acertos semanais reais lançados em custos
    const tiposAcertoTransporte = ["acerto_transporte", "passagem_semanal", "uber_semanal", "transporte_diferenca"];
    const vtAcertos = custos
      .filter(c => tiposAcertoTransporte.includes(c.tipo))
      .reduce((s, c) => s + Number(c.valor), 0);

    // Vale Transporte Total = Base + Acertos
    const vtTotal = vtBase + vtAcertos;

    const vr = Number(colaborador.vale_refeicao) || 0;
    const outros = Number(colaborador.outros_beneficios) || 0;
    const isSocio = colaborador.tipo === "socio";
    const isFolguista = colaborador.tipo === "folguista";
    const temEncargos = !isSocio && !isFolguista; // só funcionário tem encargos

    // SÓCIOS e FOLGUISTAS: não têm encargos trabalhistas
    // FUNCIONÁRIOS: têm INSS, FGTS, 13º, férias
    const inssEmpresa = temEncargos ? salario * 0.20 : 0;
    const fgts = temEncargos ? salario * 0.08 : 0;
    const decimoTerceiroProvisao = temEncargos ? salario / 12 : 0;
    const feriasProvisao = temEncargos ? (salario / 12) * 1.3333 : 0;

    // Custos variáveis do mês (excluindo os acertos de transporte já somados no VT Total)
    const custosVariaveisNaoTransporte = custos
      .filter(c => !tiposAcertoTransporte.includes(c.tipo))
      .reduce((s, c) => s + Number(c.valor), 0);

    const custosVariaveisTotal = custos.reduce((s, c) => s + Number(c.valor), 0);

    // Custo real mensal = Salário + Encargos + VT Total + VR + Outros + Custos Variáveis Outros
    const custoRealMensal = salario + inssEmpresa + fgts + decimoTerceiroProvisao + feriasProvisao + vtTotal + vr + outros + custosVariaveisNaoTransporte;

    // Custo por dia e por hora (considerando 6 dias de trabalho por semana)
    const custoPorDia = custoRealMensal / (diasUteis || 26);
    const custoPorHora = colaborador.carga_horaria_semanal > 0 ? custoPorDia / (colaborador.carga_horaria_semanal / 6) : 0;

    // Reserva para rescisão (SÓ para funcionários)
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

    // Presenças
    const diasTrabalhados = presencas.filter(p => p.presente).length;
    const diasFaltas = presencas.filter(p => !p.presente).length;
    const diasAtrasos = presencas.filter(p => p.atraso_minutos > 0).length;
    const percentualFaltas = presencas.length > 0 ? (diasFaltas / presencas.length) * 100 : 0;

    // Fim de experiência (só para funcionários)
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
      multaFgtsRescisao, valeTransporte: vtTotal, valeTransporteBase: vtBase,
      valeTransporteAcertos: vtAcertos, valeTransporteDiario: vtDiario,
      diasUteisMes: diasUteis, valeRefeicao: vr, outrosBeneficios: outros,
      custosVariaveis: custosVariaveisTotal, custoRealMensal, custoPorDia, custoPorHora,
      reservaRescisao, custoSeAssinarCarteira, diasTrabalhados, diasFaltas, diasAtrasos,
      percentualFaltas, diasParaFimExperiencia,
    };
  }, [colaborador, custos, presencas, mesRef]);
}
