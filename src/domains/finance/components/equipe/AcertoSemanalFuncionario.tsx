import { useMemo, useState } from "react";
import { Bus, FileClock } from "lucide-react";

import { calcularAcertoFuncionario, centavosParaDecimal, decimalParaCentavos } from "@/domains/finance/services/equipeCalculations";
import { useEquipeAcertos } from "@/domains/finance/hooks/useEquipeAcertos";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { SettlementSummary } from "./SettlementSummary";
import { WeekGrid } from "./WeekGrid";
import { buildWeek, currentMonday } from "./weeklyUtils";

type Props = {
  colaboradorId: string;
  colaboradorNome: string;
  valorPassagem?: number;
  uberBase?: number;
  weekStart?: string;
};

type DayInput = { trabalhou: boolean; uber: number; meta: number };

export function AcertoSemanalFuncionario({
  colaboradorId,
  colaboradorNome,
  valorPassagem = 6.25,
  uberBase = 12,
  weekStart,
}: Props) {
  const days = useMemo(() => buildWeek(weekStart ?? currentMonday()), [weekStart]);
  const [inputs, setInputs] = useState<DayInput[]>(() => days.map((_, index) => ({
    trabalhou: index < 6,
    uber: uberBase,
    meta: 0,
  })));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { gerarAcerto } = useEquipeAcertos(colaboradorId);

  const totals = useMemo(() => calcularAcertoFuncionario(inputs.map((input) => ({
    trabalhou: input.trabalhou,
    uberCentavos: decimalParaCentavos(input.uber),
    uberBaseCentavos: decimalParaCentavos(uberBase),
    passagemCentavos: decimalParaCentavos(valorPassagem),
    metaCentavos: decimalParaCentavos(input.meta),
  }))), [inputs, uberBase, valorPassagem]);

  const update = (index: number, patch: Partial<DayInput>) => {
    setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setFeedback(null);
  };

  const handleGenerate = async () => {
    setError(null);
    setFeedback(null);
    const itens = [];
    if (totals.transporteCentavos > 0) {
      itens.push({
        natureza: "transporte" as const,
        descricao: `Transporte semanal de ${colaboradorNome}`,
        valor: centavosParaDecimal(totals.transporteCentavos),
      });
    }
    if (totals.metaCentavos > 0) {
      itens.push({
        natureza: "meta" as const,
        descricao: `Metas da semana de ${colaboradorNome}`,
        valor: centavosParaDecimal(totals.metaCentavos),
      });
    }

    try {
      await gerarAcerto.mutateAsync({
        colaboradorId,
        periodoInicio: days[0].date,
        periodoFim: days[6].date,
        itens,
      });
      setFeedback("Acerto pendente criado. Revise e confirme o pagamento quando estiver pronto.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Não foi possível gerar o acerto.");
    }
  };

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Bus className="h-5 w-5 text-sky-400" />Acerto semanal de transporte</CardTitle>
        <p className="text-sm text-muted-foreground">Transporte e metas ficam separados no relatório, dentro de uma única obrigação.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <WeekGrid
            days={days}
            worked={inputs.map((item) => item.trabalhou)}
            onWorkedChange={(index, value) => update(index, { trabalhou: value })}
            renderFields={(day, index, disabled) => (
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-muted-foreground">Uber real
                  <Input aria-label={`Uber real de ${day.label}`} type="number" min="0" step="0.01" disabled={disabled} value={inputs[index].uber} onChange={(event) => update(index, { uber: Number(event.target.value) })} />
                </label>
                <div className="text-xs text-muted-foreground">Passagem<p className="mt-2 font-semibold text-foreground">R$ {valorPassagem.toFixed(2).replace(".", ",")}</p></div>
                <label className="text-xs text-muted-foreground">Meta
                  <Input aria-label={`Meta de ${day.label}`} type="number" min="0" step="0.01" disabled={disabled} value={inputs[index].meta || ""} onChange={(event) => update(index, { meta: Number(event.target.value) })} />
                </label>
              </div>
            )}
          />
        </div>
        <SettlementSummary
          lines={[
            { label: "Transporte", value: centavosParaDecimal(totals.transporteCentavos) },
            { label: "Metas", value: centavosParaDecimal(totals.metaCentavos), tone: "accent" },
          ]}
          total={centavosParaDecimal(totals.totalCentavos)}
        />
        {feedback && <p className="text-sm text-emerald-400" role="status">{feedback}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button className="w-full" size="lg" onClick={handleGenerate} disabled={totals.totalCentavos <= 0 || gerarAcerto.isPending}>
          <FileClock className="mr-2 h-4 w-4" />{gerarAcerto.isPending ? "Gerando…" : "Gerar acerto pendente"}
        </Button>
      </CardContent>
    </Card>
  );
}
