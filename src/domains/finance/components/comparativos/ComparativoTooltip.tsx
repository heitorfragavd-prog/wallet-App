import { formatCurrency } from "@/lib/utils";

export function ComparativoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-blue-500/30 bg-zinc-950/95 p-3 text-xs shadow-2xl">
    <p className="mb-2 font-bold text-zinc-100">{label}</p>
    {payload.filter((item: any) => item.value !== null).map((item: any) => <p key={item.dataKey} style={{ color: item.color }}>
      {item.name}: {formatCurrency(Number(item.value))}
    </p>)}
  </div>;
}
