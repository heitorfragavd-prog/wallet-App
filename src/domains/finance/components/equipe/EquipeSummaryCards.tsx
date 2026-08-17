import { CalendarClock, CircleDollarSign, Clock3, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value: string | null): string {
  if (!value) return "Sem vencimento";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

type Props = {
  custoMensal: number;
  totalPendente: number;
  pendentes: number;
  proximoVencimento: string | null;
  experiencias: number;
};

export function EquipeSummaryCards({ custoMensal, totalPendente, pendentes, proximoVencimento, experiencias }: Props) {
  const cards = [
    { label: "Custo mensal da equipe", value: money.format(custoMensal), detail: "Estimativa unificada", icon: CircleDollarSign, tone: "text-emerald-400 bg-emerald-500/10" },
    { label: "Pagamentos pendentes", value: money.format(totalPendente), detail: `${pendentes} obrigação(ões)`, icon: Clock3, tone: "text-amber-400 bg-amber-500/10" },
    { label: "Próximo vencimento", value: formatDate(proximoVencimento), detail: "Acerto mais próximo", icon: CalendarClock, tone: "text-sky-400 bg-sky-500/10" },
    { label: "Experiência em atenção", value: String(experiencias), detail: "Até 15 dias do fim", icon: ShieldAlert, tone: "text-violet-400 bg-violet-500/10" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, detail, icon: Icon, tone }) => (
        <Card className="overflow-hidden border-border/50 bg-card/70 shadow-sm" key={label}>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 truncate text-xl font-bold text-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
