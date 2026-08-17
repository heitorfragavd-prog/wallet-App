type SummaryLine = { label: string; value: number; tone?: "default" | "accent" };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function SettlementSummary({ lines, total }: { lines: SummaryLine[]; total: number }) {
  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Resumo do acerto">
      <div className="space-y-2">
        {lines.map((line) => (
          <div className="flex items-center justify-between gap-4 text-sm" key={line.label}>
            <span className="text-muted-foreground">{line.label}</span>
            <span className={line.tone === "accent" ? "font-semibold text-amber-400" : "font-medium"}>
              {money.format(line.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-primary/20 pt-4">
        <span className="font-semibold">Total da obrigação</span>
        <span className="text-2xl font-bold text-primary">{money.format(total)}</span>
      </div>
    </section>
  );
}
