export interface EquipePaymentMovement {
  pix: string | null | undefined;
  valorCentavos: number;
  data: string;
  favorecidoNome?: string | null;
}

export interface EquipePaymentCandidate {
  id: string;
  pix: string | null | undefined;
  valorCentavos: number;
  vencimento: string;
  status: string;
  favorecidoNome?: string | null;
}

export type EquipePaymentMatch =
  | { kind: "none" }
  | { kind: "matched"; acertoId: string }
  | { kind: "ambiguous"; acertoIds: string[] };

const ELIGIBLE_STATUSES = new Set(["pendente", "processando"]);
const DAY_IN_MS = 86_400_000;

export function normalizePixKey(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toUtcDay(value: string): number | null {
  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return null;

  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return timestamp;
}

function isWithinSevenDays(a: string, b: string): boolean {
  const dayA = toUtcDay(a);
  const dayB = toUtcDay(b);
  return dayA !== null && dayB !== null && Math.abs(dayA - dayB) <= 7 * DAY_IN_MS;
}

export function matchEquipePayment(
  movimento: EquipePaymentMovement,
  candidatos: EquipePaymentCandidate[],
): EquipePaymentMatch {
  const pix = normalizePixKey(movimento.pix);
  if (!pix || !Number.isSafeInteger(movimento.valorCentavos) || movimento.valorCentavos <= 0) {
    return { kind: "none" };
  }

  const exact = candidatos
    .filter((candidate) => ELIGIBLE_STATUSES.has(candidate.status.toLowerCase()))
    .filter((candidate) => normalizePixKey(candidate.pix) === pix)
    .filter((candidate) => candidate.valorCentavos === movimento.valorCentavos)
    .filter((candidate) => isWithinSevenDays(candidate.vencimento, movimento.data));

  if (exact.length === 0) return { kind: "none" };
  if (exact.length === 1) return { kind: "matched", acertoId: exact[0].id };
  return { kind: "ambiguous", acertoIds: exact.map((candidate) => candidate.id) };
}
