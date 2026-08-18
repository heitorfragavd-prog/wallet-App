import { quintoDiaUtil, type TipoColaborador } from "./equipeCalculations";

type VencimentoInput = {
  tipo: TipoColaborador;
  competencia: string;
  diaPagamento?: number | null;
  feriados?: string[];
};

export function vencimentoObrigacaoMensal({
  tipo,
  competencia,
  diaPagamento,
  feriados = [],
}: VencimentoInput): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(competencia);
  if (!match) throw new RangeError("Competência inválida");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (tipo === "funcionario") return quintoDiaUtil(year, month, feriados);

  if (tipo !== "socio") throw new RangeError("Folguista não possui obrigação mensal fixa");
  if (!Number.isInteger(diaPagamento) || Number(diaPagamento) < 1 || Number(diaPagamento) > 28) {
    throw new RangeError("Dia de pagamento deve estar entre 1 e 28");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(diaPagamento).padStart(2, "0")}`;
}
