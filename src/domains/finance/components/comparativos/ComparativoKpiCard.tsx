import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

type Tone = "green" | "red" | "blue" | "amber";
const tones: Record<Tone, string> = { green: "text-emerald-400", red: "text-rose-400", blue: "text-blue-400", amber: "text-amber-400" };

export function ComparativoKpiCard({ label, value, detail, tone = "blue", loading = false, unavailable = false }: {
  label: string; value: number | null; detail?: string; tone?: Tone; loading?: boolean; unavailable?: boolean;
}) {
  return <Card className="rounded-2xl border-blue-500/20 bg-gradient-to-br from-card to-blue-950/10">
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-28" /> : unavailable || value === null
        ? <p className="mt-2 text-sm font-semibold text-muted-foreground">Dados indisponíveis</p>
        : <p className={`mt-2 text-xl font-extrabold ${tones[tone]}`}>{formatCurrency(value)}</p>}
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </CardContent>
  </Card>;
}
