export type TipoColaborador = 'funcionario' | 'socio' | 'folguista';

export type RegimeEncargos = 'mei' | 'geral';

export type EstadoContrato =
  | { estado: 'experiencia'; diasRestantes: number; dataFim: string }
  | { estado: 'decisao'; diasRestantes: 0; dataFim: string }
  | { estado: 'indeterminado'; diasRestantes: null; dataFim: string | null }
  | { estado: 'inativo'; diasRestantes: null; dataFim: string | null };

export type EstadoContratoInput = {
  statusPersistido?: string | null;
  dataAdmissao?: string | null;
  diasExperiencia?: number | null;
  dataReferencia?: string | null;
  dataDemissao?: string | null;
};

export type DiaAcertoFuncionario = {
  trabalhou: boolean;
  uberCentavos: number;
  uberBaseCentavos: number;
  passagemCentavos: number;
  metaCentavos: number;
};


export type DiaSemanaAtualAntecipacao = {
  data: string;
  label: string;
  previsaoTrabalho: boolean;
  uberFixoCentavos?: number;
  passagemCentavos?: number;
};

export type DiaSemanaAnteriorAjuste = {
  data: string;
  label: string;
  recebeuAntecipacao: boolean;
  uberAntecipadoCentavos?: number;
  uberRealCentavos: number;
  metaCentavos?: number;
};

export type AcertoSemanalTransporteInput = {
  semanaAtual: DiaSemanaAtualAntecipacao[];
  semanaAnterior: DiaSemanaAnteriorAjuste[];
  valorPassagemPadraoCentavos?: number;
  uberBasePadraoCentavos?: number;
};

export type DiferencaDiariaUber = {
  data: string;
  label: string;
  recebeuAntecipacao: boolean;
  uberAntecipadoCentavos: number;
  uberRealCentavos: number;
  diferencaCentavos: number;
};

export type AcertoSemanalTransporteCalculado = {
  // Seção A: Transporte antecipado — semana atual
  diasPrevistosAtual: number;
  uberAntecipadoCentavos: number;
  passagensAntecipadasCentavos: number;
  totalAntecipacaoCentavos: number;

  // Seção B: Ajuste de Uber — semana anterior
  diasComAntecipacaoAnterior: number;
  uberAntecipadoTotalAnteriorCentavos: number;
  uberRealTotalAnteriorCentavos: number;
  diferencasDiarias: DiferencaDiariaUber[];
  saldoAjusteUberCentavos: number;
  totalMetasCentavos: number;

  // Seção C: Total a transferir
  totalTransferenciaCentavos: number;
};

export type DiaAcertoFolguista = {
  trabalhou: boolean;
  diariaCentavos: number;
  metaCentavos: number;
};

export type CustoColaboradorInput = {
  tipo: TipoColaborador;
  regimeEncargos?: RegimeEncargos;
  salarioCentavos: number;
  proLaboreCentavos?: number;
  transporteCentavos?: number;
  beneficiosCentavos?: number;
  variaveisCentavos?: number;
  diasTrabalhoMes: number;
};

export type CustoColaborador = {
  salarioCentavos: number;
  proLaboreCentavos: number;
  inssEmpresaCentavos: number;
  fgtsCentavos: number;
  decimoTerceiroCentavos: number;
  feriasCentavos: number;
  encargosCentavos: number;
  transporteCentavos: number;
  beneficiosCentavos: number;
  variaveisCentavos: number;
  totalCentavos: number;
  custoDiaCentavos: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const CLOSED_CONTRACT_STATUSES = new Set(['demitido', 'inativo']);

function isoDate(year: number, monthIndex: number, day: number): string {
  return [year, monthIndex + 1, day]
    .map((value, index) => (index === 0 ? String(value).padStart(4, '0') : String(value).padStart(2, '0')))
    .join('-');
}

function positiveInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`${fieldName} invalida`);

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    throw new RangeError(`${fieldName} invalida`);
  }

  return date;
}

export function dataCivilSaoPaulo(clock: Date): string {
  if (!(clock instanceof Date) || !Number.isFinite(clock.getTime())) {
    throw new RangeError('Relogio invalido');
  }

  const parts = new Intl.DateTimeFormat('pt-BR-u-ca-gregory-nu-latn', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(clock);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) throw new RangeError('Relogio invalido');

  return `${year}-${month}-${day}`;
}

export function quintoDiaUtil(year: number, month: number, holidays: string[] = []): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Ano ou mes invalido');
  }

  const holidaySet = new Set(holidays);
  const monthIndex = month - 1;
  const totalDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let businessDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const current = new Date(Date.UTC(year, monthIndex, day));
    const weekDay = current.getUTCDay();
    const currentIso = isoDate(year, monthIndex, day);

    if (weekDay !== 0 && weekDay !== 6 && !holidaySet.has(currentIso)) {
      businessDays += 1;
      if (businessDays === 5) return currentIso;
    }
  }

  throw new RangeError('Mes sem cinco dias uteis');
}

export function calcularFimExperiencia(admissionDate: string, experienceDays = 90): string {
  if (!Number.isInteger(experienceDays) || experienceDays < 0) {
    throw new RangeError('Data de admissao ou periodo de experiencia invalido');
  }

  const date = parseIsoDate(admissionDate, 'Data de admissao');
  // Prazo civil: exclui a admissao e inclui o vencimento (CC, art. 132).
  date.setUTCDate(date.getUTCDate() + experienceDays);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function resolverEstadoContrato(input: EstadoContratoInput): EstadoContrato | null {
  const statusPersistido = input.statusPersistido?.trim().toLowerCase() || 'ativo';
  const dataRef = input.dataReferencia || dataCivilSaoPaulo(new Date());
  const referenceDate = parseIsoDate(dataRef, 'Data de referencia');
  const diasExp = input.diasExperiencia ?? 90;
  if (!Number.isInteger(diasExp) || diasExp < 0) {
    throw new RangeError('Periodo de experiencia invalido');
  }
  if (input.dataDemissao) parseIsoDate(input.dataDemissao, 'Data de demissao');

  const dataFim = input.dataAdmissao
    ? calcularFimExperiencia(input.dataAdmissao, diasExp)
    : null;

  if (input.dataDemissao || CLOSED_CONTRACT_STATUSES.has(statusPersistido)) {
    return { estado: 'inativo', diasRestantes: null, dataFim };
  }
  if (!dataFim) return null;

  const endDate = parseIsoDate(dataFim, 'Data final da experiencia');
  const diasRestantes = Math.round((endDate.getTime() - referenceDate.getTime()) / MILLISECONDS_PER_DAY);

  if (diasRestantes > 0) return { estado: 'experiencia', diasRestantes, dataFim };
  if (diasRestantes === 0) return { estado: 'decisao', diasRestantes: 0, dataFim };
  return { estado: 'indeterminado', diasRestantes: null, dataFim };
}

export function calcularAcertoFuncionario(dias: DiaAcertoFuncionario[]) {
  return dias.reduce(
    (total, dia) => {
      if (!dia.trabalhou) return total;

      const uberReal = positiveInteger(dia.uberCentavos);
      const uberBase = positiveInteger(dia.uberBaseCentavos);
      const passagem = positiveInteger(dia.passagemCentavos);
      const meta = positiveInteger(dia.metaCentavos);
      const diferenca = Math.max(0, uberReal - uberBase);
      const transporte = uberBase + passagem + diferenca;

      total.uberRealCentavos += uberReal;
      total.uberBaseCentavos += uberBase;
      total.passagensCentavos += passagem;
      total.diferencaUberCentavos += diferenca;
      total.transporteCentavos += transporte;
      total.metaCentavos += meta;
      total.totalCentavos += transporte + meta;
      return total;
    },
    {
      uberRealCentavos: 0,
      uberBaseCentavos: 0,
      passagensCentavos: 0,
      diferencaUberCentavos: 0,
      transporteCentavos: 0,
      metaCentavos: 0,
      totalCentavos: 0,
    },
  );
}


export function calcularAcertoSemanalTransporte(
  input: AcertoSemanalTransporteInput,
): AcertoSemanalTransporteCalculado {
  const uberFixoPadrao = input.uberBasePadraoCentavos ?? 1200; // R$ 12,00
  const passagemPadrao = input.valorPassagemPadraoCentavos ?? 625; // R$ 6,25

  // Seção A: Semana Atual (Antecipação)
  let diasPrevistosAtual = 0;
  let uberAntecipadoCentavos = 0;
  let passagensAntecipadasCentavos = 0;

  for (const dia of input.semanaAtual) {
    if (dia.previsaoTrabalho) {
      diasPrevistosAtual += 1;
      const uber = dia.uberFixoCentavos ?? uberFixoPadrao;
      const passagem = dia.passagemCentavos ?? passagemPadrao;
      uberAntecipadoCentavos += uber;
      passagensAntecipadasCentavos += passagem;
    }
  }

  const totalAntecipacaoCentavos = uberAntecipadoCentavos + passagensAntecipadasCentavos;

  // Seção B: Semana Anterior (Ajuste do Uber utilizado)
  let diasComAntecipacaoAnterior = 0;
  let uberAntecipadoTotalAnteriorCentavos = 0;
  let uberRealTotalAnteriorCentavos = 0;
  let saldoAjusteUberCentavos = 0;
  let totalMetasCentavos = 0;

  const diferencasDiarias: DiferencaDiariaUber[] = input.semanaAnterior.map((dia) => {
    const uberReal = Math.round(Number(dia.uberRealCentavos) || 0);
    const meta = Math.round(Number(dia.metaCentavos) || 0);
    totalMetasCentavos += meta;

    if (dia.recebeuAntecipacao) {
      diasComAntecipacaoAnterior += 1;
      const uberAntecipado = Math.round(dia.uberAntecipadoCentavos ?? uberFixoPadrao);
      const diferenca = uberReal - uberAntecipado;

      uberAntecipadoTotalAnteriorCentavos += uberAntecipado;
      uberRealTotalAnteriorCentavos += uberReal;
      saldoAjusteUberCentavos += diferenca;

      return {
        data: dia.data,
        label: dia.label,
        recebeuAntecipacao: true,
        uberAntecipadoCentavos: uberAntecipado,
        uberRealCentavos: uberReal,
        diferencaCentavos: diferenca,
      };
    }

    return {
      data: dia.data,
      label: dia.label,
      recebeuAntecipacao: false,
      uberAntecipadoCentavos: 0,
      uberRealCentavos: uberReal,
      diferencaCentavos: 0,
    };
  });

  // Seção C: Total a transferir
  const totalTransferenciaCentavos = totalAntecipacaoCentavos + saldoAjusteUberCentavos + totalMetasCentavos;

  return {
    diasPrevistosAtual,
    uberAntecipadoCentavos,
    passagensAntecipadasCentavos,
    totalAntecipacaoCentavos,

    diasComAntecipacaoAnterior,
    uberAntecipadoTotalAnteriorCentavos,
    uberRealTotalAnteriorCentavos,
    diferencasDiarias,
    saldoAjusteUberCentavos,
    totalMetasCentavos,

    totalTransferenciaCentavos,
  };
}

export function calcularAcertoFolguista(dias: DiaAcertoFolguista[]) {
  return dias.reduce(
    (total, dia) => {
      if (!dia.trabalhou) return total;

      const diaria = positiveInteger(dia.diariaCentavos);
      const meta = positiveInteger(dia.metaCentavos);
      total.diariasCentavos += diaria;
      total.metaCentavos += meta;
      total.totalCentavos += diaria + meta;
      total.diasTrabalhados += 1;
      return total;
    },
    { diariasCentavos: 0, metaCentavos: 0, totalCentavos: 0, diasTrabalhados: 0 },
  );
}

export function calcularCustoColaborador(input: CustoColaboradorInput): CustoColaborador {
  const salario = positiveInteger(input.salarioCentavos);
  const proLabore = positiveInteger(input.proLaboreCentavos ?? 0);
  const transporte = positiveInteger(input.transporteCentavos ?? 0);
  const beneficios = positiveInteger(input.beneficiosCentavos ?? 0);
  const variaveis = positiveInteger(input.variaveisCentavos ?? 0);
  const dias = positiveInteger(input.diasTrabalhoMes);
  const hasLaborCharges = input.tipo === 'funcionario';

  const aliquotaInss = input.regimeEncargos === 'mei' ? 0.03 : 0.2;
  const inssEmpresa = hasLaborCharges ? Math.round(salario * aliquotaInss) : 0;
  const fgts = hasLaborCharges ? Math.round(salario * 0.08) : 0;
  const decimoTerceiro = hasLaborCharges ? Math.round(salario / 12) : 0;
  const ferias = hasLaborCharges ? Math.round((salario / 12) * (4 / 3)) : 0;
  const encargos = inssEmpresa + fgts + decimoTerceiro + ferias;

  let total = 0;
  if (input.tipo === 'funcionario') {
    total = salario + encargos + transporte + beneficios + variaveis;
  } else if (input.tipo === 'socio') {
    total = (proLabore || salario) + variaveis;
  } else {
    total = variaveis;
  }

  return {
    salarioCentavos: salario,
    proLaboreCentavos: proLabore,
    inssEmpresaCentavos: inssEmpresa,
    fgtsCentavos: fgts,
    decimoTerceiroCentavos: decimoTerceiro,
    feriasCentavos: ferias,
    encargosCentavos: encargos,
    transporteCentavos: transporte,
    beneficiosCentavos: beneficios,
    variaveisCentavos: variaveis,
    totalCentavos: total,
    custoDiaCentavos: dias > 0 ? Math.round(total / dias) : 0,
  };
}

export function decimalParaCentavos(value: number | string): number {
  const normalized = typeof value === 'string'
    ? (value.includes(',')
      ? value.trim().replace(/\./g, '').replace(',', '.')
      : value.trim())
    : value;
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);

  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100);
}

export function centavosParaDecimal(value: number): number {
  return Number.isFinite(value) ? Math.round(value) / 100 : 0;
}
