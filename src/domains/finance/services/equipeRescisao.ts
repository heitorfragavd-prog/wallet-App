export type MotivoRescisao = 'sem_justa_causa' | 'acordo' | 'pedido_demissao';
export type TipoAviso = 'indenizado' | 'trabalhado' | 'dispensado' | 'nao_cumprido';

export type RescisaoInput = {
  motivo: MotivoRescisao;
  dataAdmissao: string;
  dataDesligamento: string;
  salarioCentavos: number;
  aviso: TipoAviso;
  saldoFgtsCentavos: number | null;
  fgtsHistoricoEstimadoCentavos: number;
  feriasVencidasPeriodos: number;
  mediasRemuneratoriasCentavos: number;
  descontosCentavos: number;
};

export type RescisaoResultado = {
  saldoSalarioCentavos: number;
  avisoPrevioCentavos: number;
  descontoAvisoCentavos: number;
  decimoTerceiroCentavos: number;
  feriasVencidasCentavos: number;
  feriasProporcionaisComTercoCentavos: number;
  fgtsRescisorioCentavos: number;
  multaFgtsCentavos: number;
  percentualMultaFgts: 0 | 0.2 | 0.4;
  fonteSaldoFgts: 'estimada' | 'confirmada';
  totalEmpresaCentavos: number;
  totalLiquidoEstimadoCentavos: number;
  dataLimitePagamento: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(str: string): Date {
  const match = ISO_DATE.exec(str);
  if (!match) throw new RangeError(`Data invalida: ${str}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y)
    || date.getUTCMonth() !== Number(m) - 1
    || date.getUTCDate() !== Number(d)
  ) {
    throw new RangeError(`Data invalida: ${str}`);
  }
  return date;
}

function formatIsoDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calcularAvos(dataInicioStr: string, dataFimStr: string): number {
  const start = parseIsoDate(dataInicioStr);
  const end = parseIsoDate(dataFimStr);

  if (end < start) return 0;

  let avos = 0;
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endLimit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (current <= endLimit) {
    const y = current.getUTCFullYear();
    const m = current.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    const monthStart = (y === start.getUTCFullYear() && m === start.getUTCMonth())
      ? start.getUTCDate()
      : 1;

    const monthEnd = (y === end.getUTCFullYear() && m === end.getUTCMonth())
      ? end.getUTCDate()
      : lastDayOfMonth;

    const days = Math.max(0, monthEnd - monthStart + 1);
    if (days >= 15) {
      avos += 1;
    }

    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return Math.min(12, avos);
}

export function calcularRescisao(input: RescisaoInput): RescisaoResultado {
  const {
    motivo,
    dataAdmissao,
    dataDesligamento,
    salarioCentavos,
    aviso,
    saldoFgtsCentavos,
    fgtsHistoricoEstimadoCentavos,
    feriasVencidasPeriodos,
    mediasRemuneratoriasCentavos,
    descontosCentavos,
  } = input;

  if (
    salarioCentavos < 0
    || (saldoFgtsCentavos !== null && saldoFgtsCentavos < 0)
    || fgtsHistoricoEstimadoCentavos < 0
    || feriasVencidasPeriodos < 0
    || mediasRemuneratoriasCentavos < 0
    || descontosCentavos < 0
  ) {
    throw new RangeError('Valores monetarios ou periodos nao podem ser negativos');
  }

  const dtAdmissao = parseIsoDate(dataAdmissao);
  const dtDesligamento = parseIsoDate(dataDesligamento);

  if (dtDesligamento < dtAdmissao) {
    throw new RangeError('Data de desligamento anterior a admissao');
  }

  const salarioBase = salarioCentavos + mediasRemuneratoriasCentavos;
  const diaDoDesligamento = dtDesligamento.getUTCDate();
  const saldoSalarioCentavos = Math.round((salarioBase / 30) * diaDoDesligamento);

  // Anos completos de serviço
  let anosCompletos = dtDesligamento.getUTCFullYear() - dtAdmissao.getUTCFullYear();
  const mesAniv = dtAdmissao.getUTCMonth();
  const diaAniv = dtAdmissao.getUTCDate();
  if (
    dtDesligamento.getUTCMonth() < mesAniv
    || (dtDesligamento.getUTCMonth() === mesAniv && dtDesligamento.getUTCDate() < diaAniv)
  ) {
    anosCompletos -= 1;
  }
  anosCompletos = Math.max(0, anosCompletos);

  // Lei 12.506/2011: 30 dias + 3 dias por ano completo de serviço até o máximo de 90 dias
  const diasAviso = Math.min(90, 30 + Math.max(0, anosCompletos - 1) * 3);
  const avisoIntegral = Math.round((salarioBase / 30) * diasAviso);

  const avisoPrevioCentavos = motivo === 'acordo'
    ? Math.round(avisoIntegral / 2)
    : motivo === 'sem_justa_causa' && aviso === 'indenizado'
      ? avisoIntegral
      : 0;

  const descontoAvisoCentavos = motivo === 'pedido_demissao' && aviso === 'nao_cumprido'
    ? avisoIntegral
    : 0;

  // Projeção de data para aviso prévio indenizado
  const dtProjetada = new Date(dtDesligamento.getTime());
  if (aviso === 'indenizado' && (motivo === 'sem_justa_causa' || motivo === 'acordo')) {
    dtProjetada.setUTCDate(dtProjetada.getUTCDate() + diasAviso);
  }
  const dataFimProjetada = formatIsoDate(dtProjetada);

  // 13º proporcional
  const inicioAno13 = formatIsoDate(new Date(Date.UTC(dtProjetada.getUTCFullYear(), 0, 1)));
  const dataInicio13 = dataAdmissao > inicioAno13 ? dataAdmissao : inicioAno13;
  const avos13 = motivo === 'pedido_demissao' && aviso === 'nao_cumprido'
    ? calcularAvos(dataInicio13, dataDesligamento)
    : calcularAvos(dataInicio13, dataFimProjetada);
  const decimoTerceiroCentavos = Math.round((salarioBase / 12) * avos13);

  // Férias proporcionais + 1/3
  const ultimoAniversario = new Date(Date.UTC(dtAdmissao.getUTCFullYear() + anosCompletos, dtAdmissao.getUTCMonth(), dtAdmissao.getUTCDate()));
  const dataInicioAquisitivo = formatIsoDate(ultimoAniversario);
  const avosFerias = motivo === 'pedido_demissao' && aviso === 'nao_cumprido'
    ? calcularAvos(dataInicioAquisitivo, dataDesligamento)
    : calcularAvos(dataInicioAquisitivo, dataFimProjetada);

  const feriasProporcionaisBase = Math.round((salarioBase / 12) * avosFerias);
  const feriasProporcionaisComTercoCentavos = feriasProporcionaisBase + Math.round(feriasProporcionaisBase / 3);

  // Férias vencidas + 1/3
  const feriasVencidasCentavos = Math.round(feriasVencidasPeriodos * salarioBase * (4 / 3));

  // Multa FGTS
  const percentualMultaFgts: 0 | 0.2 | 0.4 = motivo === 'sem_justa_causa'
    ? 0.4
    : motivo === 'acordo'
      ? 0.2
      : 0;

  const baseMulta = saldoFgtsCentavos !== null ? saldoFgtsCentavos : fgtsHistoricoEstimadoCentavos;
  const multaFgtsCentavos = Math.round(baseMulta * percentualMultaFgts);
  const fonteSaldoFgts: 'estimada' | 'confirmada' = saldoFgtsCentavos !== null ? 'confirmada' : 'estimada';

  // FGTS rescisório sobre verbas de direito
  const fgtsRescisorioCentavos = Math.round((saldoSalarioCentavos + avisoPrevioCentavos + decimoTerceiroCentavos) * 0.08);

  // Totais
  const totalLiquidoEstimadoCentavos = Math.max(
    0,
    saldoSalarioCentavos
      + avisoPrevioCentavos
      + decimoTerceiroCentavos
      + feriasVencidasCentavos
      + feriasProporcionaisComTercoCentavos
      - descontoAvisoCentavos
      - descontosCentavos,
  );

  const totalEmpresaCentavos = totalLiquidoEstimadoCentavos + fgtsRescisorioCentavos + multaFgtsCentavos;

  // Prazo de 10 dias corridos para pagamento (art. 477 § 6º CLT)
  const dtLimite = new Date(dtDesligamento.getTime());
  dtLimite.setUTCDate(dtLimite.getUTCDate() + 10);
  const dataLimitePagamento = formatIsoDate(dtLimite);

  return {
    saldoSalarioCentavos,
    avisoPrevioCentavos,
    descontoAvisoCentavos,
    decimoTerceiroCentavos,
    feriasVencidasCentavos,
    feriasProporcionaisComTercoCentavos,
    fgtsRescisorioCentavos,
    multaFgtsCentavos,
    percentualMultaFgts,
    fonteSaldoFgts,
    totalEmpresaCentavos,
    totalLiquidoEstimadoCentavos,
    dataLimitePagamento,
  };
}
