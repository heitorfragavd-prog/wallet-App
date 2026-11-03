import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  History,
  Pencil,
  WalletCards,
} from "lucide-react";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import {
  calcularCustoColaborador,
  centavosParaDecimal,
  decimalParaCentavos,
  type RegimeEncargos,
  resolverEstadoContrato,
} from "@/domains/finance/services/equipeCalculations";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const typeLabels = { socio: "Sócio", funcionario: "Funcionário", folguista: "Folguista" } as const;

export type ColaboradorMonthlySummary = {
  totalPagoNoMes: number;
  qtdPagosNoMes: number;
  totalPendenteCompetencia: number;
  qtdPendentesCompetencia: number;
  ultimoPagamento?: {
    valor: number;
    data: string;
    origem: string;
  } | null;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function colaboradorMonthlyCost(
  colaborador: Colaborador,
  regimeEncargos: RegimeEncargos = "geral"
): number {
  const salary = Number(colaborador.salario_bruto) || 0;
  const result = calcularCustoColaborador({
    tipo: colaborador.tipo,
    regimeEncargos,
    salarioCentavos: decimalParaCentavos(salary),
    proLaboreCentavos: decimalParaCentavos(colaborador.valor_pro_labore || salary),
    transporteCentavos: decimalParaCentavos(Number(colaborador.vale_transporte) || 0),
    beneficiosCentavos: decimalParaCentavos(
      (Number(colaborador.vale_refeicao) || 0) + (Number(colaborador.outros_beneficios) || 0)
    ),
    diasTrabalhoMes: 26,
  });
  return centavosParaDecimal(result.totalCentavos);
}

function experienceMessage(colaborador: Colaborador): string | null {
  if (colaborador.tipo !== "funcionario" || !colaborador.data_admissao) return null;
  const estado = resolverEstadoContrato({
    statusPersistido: colaborador.status,
    dataAdmissao: colaborador.data_admissao,
    diasExperiencia: colaborador.dias_experiencia || 90,
  });
  if (estado.estado === "experiencia" && estado.diasRestantes <= 15) {
    return `Experiência termina em ${estado.diasRestantes} dia${estado.diasRestantes === 1 ? "" : "s"}`;
  }
  if (estado.estado === "decisao") {
    return "Decisão de experiência hoje";
  }
  return null;
}

export function ColaboradorCard({
  colaborador,
  regimeEncargos = "geral",
  monthlySummary,
  onOpen,
  onEdit,
  onViewHistory,
}: {
  colaborador: Colaborador;
  regimeEncargos?: RegimeEncargos;
  monthlySummary?: ColaboradorMonthlySummary;
  onOpen: () => void;
  onEdit: () => void;
  onViewHistory?: () => void;
}) {
  const experience = experienceMessage(colaborador);
  const cost = colaboradorMonthlyCost(colaborador, regimeEncargos);
  const principal =
    colaborador.tipo === "folguista"
      ? `Diária ${money.format(Number(colaborador.valor_diaria) || 0)}`
      : colaborador.tipo === "socio"
      ? `Pró-labore ${money.format(
          Number(colaborador.valor_pro_labore) || Number(colaborador.salario_bruto) || 0
        )}`
      : `Salário ${money.format(Number(colaborador.salario_bruto) || 0)}`;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="group relative cursor-pointer overflow-hidden border-border/50 bg-card/70 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="h-1 bg-gradient-to-r from-primary/80 via-sky-400/60 to-transparent" />
      <CardContent className="p-4">
        <Button
          aria-label={`Editar ${colaborador.nome}`}
          variant="ghost"
          size="icon"
          className="absolute right-2 top-3 h-8 w-8 opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>

        <div className="flex items-start gap-3 pr-8">
          <Avatar className="h-14 w-14 border border-border/70">
            <AvatarImage
              src={colaborador.foto_url || undefined}
              className="object-cover"
              style={{ objectPosition: colaborador.foto_posicao || "50% 15%" }}
            />
            <AvatarFallback className="bg-primary/15 font-bold text-primary">
              {colaborador.nome
                .split(" ")
                .map((name) => name[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{colaborador.nome}</p>
            <p className="truncate text-sm text-muted-foreground">
              {colaborador.cargo || "Cargo não informado"}
            </p>
            <Badge variant="outline" className="mt-2">
              {typeLabels[colaborador.tipo]}
            </Badge>
          </div>
        </div>

        {/* Remuneração configurada e Custo Estimado */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Configuração</p>
            <p className="mt-1 truncate font-medium">{principal}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Custo estimado</p>
            <p
              data-testid={`custo-${colaborador.id}`}
              className="mt-1 truncate font-semibold text-emerald-400"
            >
              {money.format(cost)}
            </p>
          </div>
        </div>

        {/* Dados financeiros do mês selecionado */}
        {monthlySummary && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-background/50 p-2.5 text-xs">
            <div>
              <p className="text-muted-foreground">Pago no mês</p>
              <p className="mt-0.5 font-bold text-emerald-400">
                {money.format(monthlySummary.totalPagoNoMes)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {monthlySummary.qtdPagosNoMes} quitação(ões)
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Pendente competência</p>
              <p
                className={`mt-0.5 font-bold ${
                  monthlySummary.totalPendenteCompetencia > 0
                    ? "text-amber-400"
                    : "text-muted-foreground"
                }`}
              >
                {money.format(monthlySummary.totalPendenteCompetencia)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {monthlySummary.totalPendenteCompetencia > 0
                  ? `${monthlySummary.qtdPendentesCompetencia} obrigação(ões)`
                  : "Em dia"}
              </p>
            </div>
          </div>
        )}

        {/* Último pagamento realizado */}
        {monthlySummary?.ultimoPagamento && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <span>Último pagamento:</span>
            <span className="font-medium text-foreground">
              {money.format(monthlySummary.ultimoPagamento.valor)} em{" "}
              {formatDate(monthlySummary.ultimoPagamento.data)}
            </span>
          </div>
        )}

        {/* Avisos de cadastro e chave Pix - independente do financeiro */}
        <div className="mt-3 space-y-1.5">
          {!colaborador.pix_chave ? (
            <p className="flex items-center gap-2 text-xs text-amber-400">
              <WalletCards className="h-3.5 w-3.5 shrink-0" />
              <span>
                Chave Pix não cadastrada{" "}
                <span className="text-[11px] text-muted-foreground">(complete o perfil)</span>
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-emerald-400/90">
              <WalletCards className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-[11px] truncate">Pix cadastrado</span>
            </p>
          )}

          {experience && (
            <p className="flex items-center gap-2 text-xs text-violet-400">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {experience}
            </p>
          )}

          {!colaborador.cpf && colaborador.tipo === "funcionario" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Dados pessoais incompletos
            </p>
          )}
        </div>

        {/* Rodapé com link para histórico detalhado */}
        <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-3 text-xs">
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory?.();
            }}
          >
            <History className="h-3.5 w-3.5" />
            <span>Ver histórico</span>
          </button>

          <span className="flex items-center font-medium text-primary group-hover:underline">
            Abrir perfil <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
