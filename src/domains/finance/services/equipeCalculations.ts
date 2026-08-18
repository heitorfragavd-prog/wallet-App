export type TipoColaborador = 'funcionario' | 'socio' | 'folguista';
export type RegimeEncargos = 'mei' | 'geral';

export type EstadoContrato =
  | { estado: 'experiencia'; diasRestantes: number; dataFim: string }
  | { estado: 'decisao'; diasRestantes: 0; dataFim: string }
  | { estado: 'indeterminado'; diasRestantes: null; dataFim: string | null }
  | { estado: 'inativo'; diasRestantes: null; dataFim: string | null };

export type DiaAcertoFuncionario = {
  trabalhou: boolean;
  uberCentavos: number;
  uberBaseCentavos: number;
  passagemCentavos: number;
  metaCentavos: number;
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

function isoDate(year: number, monthIndex: number, day: number): string {
  return [year, monthIndex + 1, day]
    .map((value, index) => (index === 0 ? String(value).padStart(4, '0') : String(value).padStart(2, '0')))
    .join('-');
}

function positiveInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
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
  const match = ISO_DATE.exec(admissionDate);
  if (!match || !Number.isInteger(experienceDays) || experienceDays < 0) {
    throw new RangeError('Data de admissao ou periodo de experiencia invalido');
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    throw new RangeError('Data de admissao invalida');
  }

  date.setUTCDate(date.getUTCDate() + experienceDays);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export type ResolverEstadoContratoInput = {
  statusPersistido?: string | null;
  dataAdmissao?: string | null;
  diasExperiencia?: number | null;
  dataReferencia?: string | null;
  dataDemissao?: string | null;
};

export function resolverEstadoContrato(input: ResolverEstadoContratoInput): EstadoContrato {
  if (input.dataDemissao || input.statusPersistido === 'inativo') {
    return { estado: 'inativo', diasRestantes: null, dataFim: input.dataDemissao ?? null };
  }

  if (!input.dataAdmissao) {
    return { estado: 'indeterminado', diasRestantes: null, dataFim: null };
  }

  const dataFim = calcularFimExperiencia(input.dataAdmissao, input.diasExperiencia ?? 90);
  const ref = input.dataReferencia ?? new Date().toISOString().slice(0, 10);

  if (input.statusPersistido !== 'experiencia') {
    return { estado: 'indeterminado', diasRestantes: null, dataFim };
  }

  const endUtc = Date.parse(`${dataFim}T00:00:00Z`);
  const [refY, refM, refD] = ref.slice(0, 10).split('-').map(Number);
  const refUtc = Date.UTC(refY, refM - 1, refD);
  const diasRestantes = Math.ceil((endUtc - refUtc) / 86_400_000);

  if (diasRestantes < 0) {
    return { estado: 'indeterminado', diasRestantes: null, dataFim };
  }

  if (diasRestantes === 0) {
    return { estado: 'decisao', diasRestantes: 0, dataFim };
  }

  return { estado: 'experiencia', diasRestantes, dataFim };
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

      total.uberRealCentavos += uberReal;
      total.uberBaseCentavos += uberBase;
      total.passagensCentavos += passagem;
      total.diferencaUberCentavos += diferenca;
      total.transporteCentavos += uberBase + passagem + diferenca;
      total.metaCentavos += meta;
      total.totalCentavos += uberBase + passagem + diferenca + meta;
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
