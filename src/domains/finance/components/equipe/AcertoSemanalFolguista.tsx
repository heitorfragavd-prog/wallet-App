import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileClock } from "lucide-react";

import { useEquipeAcertos, type AcertoItemInput } from "@/domains/finance/hooks/useEquipeAcertos";
import { useFolguistaEscalas } from "@/domains/finance/hooks/useFolguistaEscalas";
import { calcularAcertoFolguista, centavosParaDecimal, decimalParaCentavos } from "@/domains/finance/services/equipeCalculations";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { SettlementSummary } from "./SettlementSummary";
import { WeekGrid } from "./WeekGrid";
import { buildWeek, currentMonday } from "./weeklyUtils";

type Props = {
  colaboradorId: string;
  colaboradorNome: string;
  valorDiaria?: number;
  weekStart?: string;
};

type DayInput = { trabalhou: boolean; diaria: number; meta: number };

export function AcertoSemanalFolguista({
  colaboradorId,
  colaboradorNome,
  valorDiaria = 100,
  weekStart,
}: Props) {
  const days = useMemo(() => buildWeek(weekStart ?? currentMonday()), [weekStart]);
  const monthRef = days[0].date.slice(0, 7);
  const { data: escalas = [], addEscala } = useFolguistaEscalas(colaboradorId, monthRef);
  const { gerarAcerto } = useEquipeAcertos(colaboradorId);
  const [inputs, setInputs] = useState<DayInput[]>(() => days.map(() => ({ trabalhou: false, diaria: valorDiaria, meta: 0 })));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (escalas.length === 0) return;
    setInputs((current) => current.map((input, index) => {
      const escala = escalas.find((item) => item.data === days[index].date && item.status !== "cancelada");
      return escala ? {
        trabalhou: true,
        diaria: Number(escala.valor_diaria),
        meta: escala.bateu_meta ? Number(escala.valor_meta) : 0,
      } : input;
    }));
  }, [days, escalas]);

  const totals = useMemo(() => calcularAcertoFolguista(inputs.map((input) => ({
    trabalhou: input.trabalhou,
    diariaCentavos: decimalParaCentavos(input.diaria),
    metaCentavos: decimalParaCentavos(input.meta),
  }))), [inputs]);

  const update = (index: number, patch: Partial<DayInput>) => {
    setInputs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setFeedback(null);
  };

  const handleGenerate = async () => {
    setError(null);
    setFeedback(null);
    try {
      const itens: AcertoItemInput[] = [];
      let totalMeta = 0;

      for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        if (!input.trabalhou) continue;

        const existing = escalas.find((item) => item.data === days[index].date && item.status !== "cancelada");
        const escalaId = existing?.id ?? await addEscala.mutateAsync({
          colaborador_id: colaboradorId,
          data: days[index].date,
          turno: "integral",
          valor_diaria: input.diaria,
          bateu_meta: input.meta > 0,
          valor_meta: input.meta,
          observacao: `Acerto semanal de ${colaboradorNome}`,
        });

        itens.push({
          natureza: "diaria",
          descricao: `Diária de ${days[index].label} (${days[index].date})`,
          valor: input.diaria,
          escala_id: escalaId,
        });
        totalMeta += input.meta;
      }

      if (totalMeta > 0) {
        itens.push({
          natureza: "meta",
          descricao: `Metas da semana de ${colaboradorNome}`,
          valor: totalMeta,
        });
      }

      await gerarAcerto.mutateAsync({
        colaboradorId,
        periodoInicio: days[0].date,
        periodoFim: days[6].date,
        itens,
      });
      setFeedback("Acerto pendente criado. O pagamento ainda precisa ser revisado e confirmado.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Não foi possível gerar o acerto.");
    }
  };

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-cyan-400" />Acerto semanal do folguista</CardTitle>
        <p className="text-sm text-muted-foreground">Cada diária fica ligada à escala correspondente. Metas aparecem separadas no relatório.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <WeekGrid
            days={days}
            worked={inputs.map((item) => item.trabalhou)}
            onWorkedChange={(index, value) => update(index, { trabalhou: value })}
            renderFields={(day, index, disabled) => (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">Diária
                  <Input aria-label={`Diária de ${day.label}`} type="number" min="0" step="0.01" disabled={disabled} value={inputs[index].diaria} onChange={(event) => update(index, { diaria: Number(event.target.value) })} />
                </label>
                <label className="text-xs text-muted-foreground">Meta
                  <Input aria-label={`Meta de ${day.label}`} type="number" min="0" step="0.01" disabled={disabled} value={inputs[index].meta || ""} onChange={(event) => update(index, { meta: Number(event.target.value) })} />
                </label>
              </div>
            )}
          />
        </div>
        <SettlementSummary
          lines={[
            { label: `Diárias (${totals.diasTrabalhados} dias)`, value: centavosParaDecimal(totals.diariasCentavos) },
            { label: "Metas", value: centavosParaDecimal(totals.metaCentavos), tone: "accent" },
          ]}
          total={centavosParaDecimal(totals.totalCentavos)}
        />
        {feedback && <p className="text-sm text-emerald-400" role="status">{feedback}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button className="w-full" size="lg" onClick={handleGenerate} disabled={totals.totalCentavos <= 0 || addEscala.isPending || gerarAcerto.isPending}>
          <FileClock className="mr-2 h-4 w-4" />{addEscala.isPending || gerarAcerto.isPending ? "Gerando…" : "Gerar acerto pendente"}
        </Button>
      </CardContent>
    </Card>
  );
}
