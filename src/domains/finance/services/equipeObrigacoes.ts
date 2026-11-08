import { quintoDiaUtil, type QuintoDiaUtilOptions, type TipoColaborador } from "./equipeCalculations";

export type VencimentoInput = {
  tipo: TipoColaborador;
  competencia: string;
  diaPagamento?: number | null;
  feriados?: string[];
  incluirSabado?: boolean;
  anteciparSeSabado?: boolean;
};

export function vencimentoObrigacaoMensal({
  tipo,
  competencia,
  diaPagamento,
  feriados = [],
  incluirSabado,
  anteciparSeSabado,
}: VencimentoInput): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(competencia);
  if (!match) throw new RangeError("Competência inválida");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (tipo === "funcionario") {
    const opts: QuintoDiaUtilOptions = {};
    if (incluirSabado !== undefined) opts.incluirSabado = incluirSabado;
    if (anteciparSeSabado !== undefined) opts.anteciparSeSabado = anteciparSeSabado;
    return quintoDiaUtil(year, month, feriados, opts);
  }

  if (tipo !== "socio") throw new RangeError("Folguista não possui obrigação mensal fixa");
  if (!Number.isInteger(diaPagamento) || Number(diaPagamento) < 1 || Number(diaPagamento) > 28) {
    throw new RangeError("Dia de pagamento deve estar entre 1 e 28");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(diaPagamento).padStart(2, "0")}`;
}
