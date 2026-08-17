export type WeekDay = {
  label: string;
  shortLabel: string;
  date: string;
};

const DAY_NAMES = [
  ["Segunda", "Seg"],
  ["Terça", "Ter"],
  ["Quarta", "Qua"],
  ["Quinta", "Qui"],
  ["Sexta", "Sex"],
  ["Sábado", "Sáb"],
  ["Domingo", "Dom"],
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function currentMonday(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekDay = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() + (weekDay === 0 ? -6 : 1 - weekDay));
  return isoDate(utc);
}

export function buildWeek(start: string): WeekDay[] {
  const monday = new Date(`${start}T00:00:00.000Z`);
  if (Number.isNaN(monday.getTime()) || monday.getUTCDay() !== 1) {
    throw new RangeError("A semana deve começar em uma segunda-feira válida");
  }

  return DAY_NAMES.map(([label, shortLabel], index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return { label, shortLabel, date: isoDate(date) };
  });
}

export function formatShortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}
