import { AlertTriangle, CalendarDays, ChevronRight, Pencil, WalletCards } from "lucide-react";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import { calcularCustoColaborador, calcularFimExperiencia, centavosParaDecimal, decimalParaCentavos } from "@/domains/finance/services/equipeCalculations";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const typeLabels = { socio: "Sócio", funcionario: "Funcionário", folguista: "Folguista" } as const;

export function colaboradorMonthlyCost(colaborador: Colaborador): number {
  const salary = Number(colaborador.salario_bruto) || 0;
  const result = calcularCustoColaborador({
    tipo: colaborador.tipo,
    salarioCentavos: decimalParaCentavos(salary),
    proLaboreCentavos: decimalParaCentavos(colaborador.valor_pro_labore || salary),
    transporteCentavos: decimalParaCentavos(Number(colaborador.vale_transporte) || 0),
    beneficiosCentavos: decimalParaCentavos((Number(colaborador.vale_refeicao) || 0) + (Number(colaborador.outros_beneficios) || 0)),
    diasTrabalhoMes: 26,
  });
  return centavosParaDecimal(result.totalCentavos);
}

function experienceMessage(colaborador: Colaborador): string | null {
  if (colaborador.tipo !== "funcionario" || colaborador.status !== "experiencia" || !colaborador.data_admissao) return null;
  const end = calcularFimExperiencia(colaborador.data_admissao, colaborador.dias_experiencia || 90);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.max(0, Math.ceil((endTime - today) / 86_400_000));
  if (days > 15) return null;
  return `Experiência termina em ${days} dia${days === 1 ? "" : "s"}`;
}

export function ColaboradorCard({ colaborador, onOpen, onEdit }: { colaborador: Colaborador; onOpen: () => void; onEdit: () => void }) {
  const experience = experienceMessage(colaborador);
  const cost = colaboradorMonthlyCost(colaborador);
  const principal = colaborador.tipo === "folguista"
    ? `Diária ${money.format(Number(colaborador.valor_diaria) || 0)}`
    : colaborador.tipo === "socio"
      ? `Pró-labore ${money.format(Number(colaborador.valor_pro_labore) || Number(colaborador.salario_bruto) || 0)}`
      : `Salário ${money.format(Number(colaborador.salario_bruto) || 0)}`;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}
      className="group relative cursor-pointer overflow-hidden border-border/50 bg-card/70 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="h-1 bg-gradient-to-r from-primary/80 via-sky-400/60 to-transparent" />
      <CardContent className="p-4">
        <Button
          aria-label={`Editar ${colaborador.nome}`}
          variant="ghost"
          size="icon"
          className="absolute right-2 top-3 h-8 w-8 opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(event) => { event.stopPropagation(); onEdit(); }}
        ><Pencil className="h-4 w-4" /></Button>

        <div className="flex items-start gap-3 pr-8">
          <Avatar className="h-14 w-14 border border-border/70">
            <AvatarImage src={colaborador.foto_url || undefined} className="object-cover" style={{ objectPosition: colaborador.foto_posicao || "50% 15%" }} />
            <AvatarFallback className="bg-primary/15 font-bold text-primary">{colaborador.nome.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{colaborador.nome}</p>
            <p className="truncate text-sm text-muted-foreground">{colaborador.cargo || "Cargo não informado"}</p>
            <Badge variant="outline" className="mt-2">{typeLabels[colaborador.tipo]}</Badge>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Configuração</p><p className="mt-1 truncate font-medium">{principal}</p></div>
          <div><p className="text-xs text-muted-foreground">Custo estimado</p><p data-testid={`custo-${colaborador.id}`} className="mt-1 truncate font-semibold text-emerald-400">{money.format(cost)}</p></div>
        </div>

        <div className="mt-3 space-y-2">
          {!colaborador.pix_chave && <p className="flex items-center gap-2 text-xs text-amber-400"><WalletCards className="h-3.5 w-3.5" />Pix pendente</p>}
          {experience && <p className="flex items-center gap-2 text-xs text-violet-400"><CalendarDays className="h-3.5 w-3.5" />{experience}</p>}
          {!colaborador.cpf && colaborador.tipo === "funcionario" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Dados pessoais incompletos</p>}
        </div>

        <div className="mt-4 flex items-center justify-end text-xs font-medium text-primary">Abrir perfil <ChevronRight className="ml-1 h-4 w-4" /></div>
      </CardContent>
    </Card>
  );
}
