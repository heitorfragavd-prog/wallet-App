import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";

import type { PendenciaItemExplicacao } from "@/domains/finance/hooks/useEquipeResumo";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value: string | null): string {
  if (!value) return "Sem vencimento";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

const tipoLabels: Record<string, string> = {
  semanal_funcionario: "Acerto semanal de transporte / metas",
  semanal_folguista: "Acerto semanal de diárias",
  salario: "Salário mensal",
  pro_labore: "Pró-labore mensal",
  adiantamento: "Adiantamento",
  bonificacao: "Bonificação",
  outro: "Outro",
};

type Props = {
  custoMensal: number;
  totalPagoNoMes?: number;
  pagosNoMes?: number;
  totalPendente: number;
  pendentes: number;
  obrigacoesVencidas?: number;
  totalVencido?: number;
  proximoVencimento: string | null;
  experiencias?: number;
  explicacaoPendencias?: PendenciaItemExplicacao[];
  mesLabel?: string;
};

export function EquipeSummaryCards({
  custoMensal,
  totalPagoNoMes = 0,
  pagosNoMes = 0,
  totalPendente,
  pendentes,
  obrigacoesVencidas = 0,
  totalVencido = 0,
  proximoVencimento,
  experiencias = 0,
  explicacaoPendencias = [],
  mesLabel,
}: Props) {
  const [showPendingDialog, setShowPendingDialog] = useState(false);

  const cards = [
    {
      label: "Custo mensal estimado",
      value: money.format(custoMensal),
      detail: "Folha base cadastrada",
      icon: CircleDollarSign,
      tone: "text-slate-200 bg-slate-500/10",
      action: null,
    },
    {
      label: mesLabel ? `Pago no mês (${mesLabel})` : "Pago no mês",
      value: money.format(totalPagoNoMes),
      detail: `${pagosNoMes} quitação(ões) confirmada(s)`,
      icon: CheckCircle2,
      tone: "text-emerald-400 bg-emerald-500/10",
      action: null,
    },
    {
      label: "Obrigações pendentes",
      value: money.format(totalPendente),
      detail: `${pendentes} obrigação(ões) aberta(s)`,
      icon: Clock3,
      tone: "text-amber-400 bg-amber-500/10",
      action: explicacaoPendencias.length > 0 ? () => setShowPendingDialog(true) : null,
    },
    obrigacoesVencidas > 0
      ? {
          label: "Obrigações vencidas",
          value: `${obrigacoesVencidas} vencida(s)`,
          detail: `Total: ${money.format(totalVencido)} · Próx: ${formatDate(proximoVencimento)}`,
          icon: AlertTriangle,
          tone: "text-rose-400 bg-rose-500/10",
          action: null,
        }
      : {
          label: "Próximo vencimento",
          value: formatDate(proximoVencimento),
          detail: "Nenhuma obrigação atrasada",
          icon: CalendarClock,
          tone: "text-sky-400 bg-sky-500/10",
          action: null,
        },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, tone, action }) => (
          <Card
            className={`overflow-hidden border-border/50 bg-card/70 shadow-sm transition-all ${
              action ? "cursor-pointer hover:border-amber-500/40 hover:bg-card/90" : ""
            }`}
            key={label}
            onClick={action ?? undefined}
          >
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  {action && (
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
                  )}
                </div>
                <p className="mt-2 truncate text-xl font-bold text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal de Detalhamento das Obrigações Pendentes */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-5 w-5 text-amber-400" />
              Composição das Obrigações Pendentes ({money.format(totalPendente)})
            </DialogTitle>
            <DialogDescription>
              Transparência completa sobre cada valor que compõe o saldo pendente da equipe:
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 divide-y divide-border/40 rounded-xl border border-border/50 bg-muted/10">
            {explicacaoPendencias.map((item) => (
              <div key={item.acertoId} className="flex items-center justify-between p-3 text-sm">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="font-semibold text-foreground">{item.colaboradorNome}</p>
                  <p className="text-xs text-muted-foreground">
                    {tipoLabels[item.tipo] || item.tipo} · Vence em {formatDate(item.vencimento)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-400">{money.format(item.valor)}</p>
                  <p className="text-[11px] text-muted-foreground">Pendente</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
            <span>Valores gerados pelas regras trabalhistas ou escalas semanais.</span>
            <Button size="sm" variant="outline" onClick={() => setShowPendingDialog(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
