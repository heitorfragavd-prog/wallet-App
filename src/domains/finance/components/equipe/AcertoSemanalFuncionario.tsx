import { useMemo, useState } from "react";
import { CreditCard, FileClock } from "lucide-react";

import {
  calcularAcertoFuncionario,
  centavosParaDecimal,
  decimalParaCentavos,
} from "@/domains/finance/services/equipeCalculations";
import { useEquipeAcertos } from "@/domains/finance/hooks/useEquipeAcertos";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { buildWeek, currentMonday, formatShortDate } from "./weeklyUtils";

type Props = {
  colaboradorId: string;
  colaboradorNome: string;
  valorPassagem?: number;
  uberBase?: number;
  weekStart?: string;
  pixChave?: string | null;
  pixTipo?: string | null;
};

type DayInput = { trabalhou: boolean; uber: number; meta: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AcertoSemanalFuncionario({
  colaboradorId,
  colaboradorNome,
  valorPassagem = 6.25,
  uberBase = 12,
  weekStart,
  pixChave,
  pixTipo = "cpf",
}: Props) {
  const days = useMemo(() => buildWeek(weekStart ?? currentMonday()), [weekStart]);
  const [inputs, setInputs] = useState<DayInput[]>(() =>
    days.map((_, index) => ({
      trabalhou: index < 6,
      uber: uberBase,
      meta: 0,
    }))
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { gerarAcerto } = useEquipeAcertos(colaboradorId);

  const totals = useMemo(
    () =>
      calcularAcertoFuncionario(
        inputs.map((input) => ({
          trabalhou: input.trabalhou,
          uberCentavos: decimalParaCentavos(input.uber),
          uberBaseCentavos: decimalParaCentavos(uberBase),
          passagemCentavos: decimalParaCentavos(valorPassagem),
          metaCentavos: decimalParaCentavos(input.meta),
        }))
      ),
    [inputs, uberBase, valorPassagem]
  );

  const diasTrabalhados = useMemo(
    () => inputs.filter((item) => item.trabalhou).length,
    [inputs]
  );

  const update = (index: number, patch: Partial<DayInput>) => {
    setInputs((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
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
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Não foi possível gerar o acerto."
      );
    }
  };

  const totalFormatado = money.format(centavosParaDecimal(totals.totalCentavos));

  return (
    <Card className="border border-[#1E2942] bg-[#0B132B] text-foreground rounded-2xl shadow-xl overflow-hidden">
      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧮</span>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Acerto Semanal de Transporte
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Uber fixo: R$ {uberBase.toFixed(2)}/dia | Passagem: R$ {valorPassagem.toFixed(2)}/volta | Total dia: R$ {(uberBase + valorPassagem).toFixed(2)}
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-semibold shadow-sm w-fit">
            <span>💸</span>
            <span>PIX: {pixChave || "123.456.789-00"}</span>
          </div>
        </div>

        {/* Tabela de Dias da Semana */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-[#1E2942]/80 text-xs font-semibold text-slate-400">
                <th className="pb-3 px-2">Dia</th>
                <th className="pb-3 px-2 text-center">Foi?</th>
                <th className="pb-3 px-2 text-center">Uber Real</th>
                <th className="pb-3 px-2 text-center">Passagem</th>
                <th className="pb-3 px-2 text-center">Diferença</th>
                <th className="pb-3 px-2 text-center">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2942]/50 text-sm">
              {days.map((day, index) => {
                const input = inputs[index];
                const diferenca = input.trabalhou ? Math.max(0, input.uber - uberBase) : 0;

                return (
                  <tr
                    key={day.date}
                    className={`transition-colors ${
                      input.trabalhou ? "hover:bg-slate-800/30" : "opacity-35 hover:opacity-50"
                    }`}
                  >
                    {/* Dia */}
                    <td className="py-3 px-2">
                      <p className="font-semibold text-white">{day.label}</p>
                      <p className="text-xs text-slate-400">{formatShortDate(day.date)}</p>
                    </td>

                    {/* Foi? */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          id={`worked-${day.date}`}
                          aria-label={`Trabalhou na ${day.label}`}
                          checked={input.trabalhou}
                          onCheckedChange={(checked) =>
                            update(index, { trabalhou: Boolean(checked) })
                          }
                          className="h-5 w-5 rounded-md border-slate-600 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </div>
                    </td>

                    {/* Uber Real */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex justify-center">
                        {input.trabalhou ? (
                          <Input
                            aria-label={`Uber real de ${day.label}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.uber || ""}
                            onChange={(e) =>
                              update(index, { uber: parseFloat(e.target.value) || 0 })
                            }
                            className="h-9 w-24 bg-[#070D1F]/80 border-[#1E2942] text-center font-medium text-white rounded-lg focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>
                    </td>

                    {/* Passagem */}
                    <td className="py-3 px-2 text-center font-medium">
                      {input.trabalhou ? (
                        <span className="text-slate-200">{money.format(valorPassagem)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Diferença */}
                    <td className="py-3 px-2 text-center font-semibold">
                      {input.trabalhou ? (
                        <span className={diferenca > 0 ? "text-amber-400" : "text-emerald-400"}>
                          {money.format(diferenca)}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Meta */}
                    <td className="py-3 px-2 text-center">
                      <div className="flex justify-center">
                        {input.trabalhou ? (
                          <Input
                            aria-label={`Meta de ${day.label}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={input.meta || ""}
                            placeholder="0,00"
                            onChange={(e) =>
                              update(index, { meta: parseFloat(e.target.value) || 0 })
                            }
                            className="h-9 w-24 bg-[#070D1F]/80 border-[#1E2942] text-center font-medium text-white rounded-lg focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 4 Cards de Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="bg-[#0E172F]/70 border border-[#1E2942] rounded-xl p-3.5 space-y-1">
            <p className="text-xs text-slate-400 font-medium">Uber Real Total</p>
            <p className="text-lg font-bold text-white tracking-tight">
              {money.format(centavosParaDecimal(totals.uberRealCentavos))}
            </p>
          </div>
          <div className="bg-[#0E172F]/70 border border-[#1E2942] rounded-xl p-3.5 space-y-1">
            <p className="text-xs text-slate-400 font-medium">Uber Fixo (base)</p>
            <p className="text-lg font-bold text-slate-300 tracking-tight">
              {money.format(centavosParaDecimal(totals.uberBaseCentavos))}
            </p>
          </div>
          <div className="bg-[#0E172F]/70 border border-[#1E2942] rounded-xl p-3.5 space-y-1">
            <p className="text-xs text-slate-400 font-medium">Total Passagem</p>
            <p className="text-lg font-bold text-white tracking-tight">
              {money.format(centavosParaDecimal(totals.passagensCentavos))}
            </p>
          </div>
          <div className="bg-[#0E172F]/70 border border-[#1E2942] rounded-xl p-3.5 space-y-1">
            <p className="text-xs text-slate-400 font-medium">Diferença + Meta</p>
            <p className="text-lg font-bold text-amber-400 tracking-tight">
              {money.format(centavosParaDecimal(totals.diferencaUberCentavos + totals.metaCentavos))}
            </p>
          </div>
        </div>

        {/* Bloco de Destaque - Total a Transferir */}
        <div className="rounded-2xl border border-[#1E2942] bg-[#0E172F]/90 p-5 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1E2942]">
            <div>
              <h4 className="text-sm font-bold text-white">
                Total a transferir na 2ª feira (semana anterior)
              </h4>
              <p className="text-xs font-mono text-emerald-400 mt-0.5">
                Chave PIX: <span className="font-bold">{pixChave || "123.456.789-00"}</span> {pixTipo && `(${pixTipo})`}
              </p>
            </div>
            <span className="text-3xl font-black tracking-tight text-white">
              {totalFormatado}
            </span>
          </div>

          {/* Lista com Emojis */}
          <div className="space-y-2.5 text-xs sm:text-sm font-medium">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>🚗</span> Uber Fixo ({diasTrabalhados} {diasTrabalhados === 1 ? "dia" : "dias"} × R$ {uberBase.toFixed(2)})
              </span>
              <span className="font-bold text-white">
                {money.format(centavosParaDecimal(totals.uberBaseCentavos))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>🚌</span> Passagem ({diasTrabalhados} {diasTrabalhados === 1 ? "dia" : "dias"} × R$ {valorPassagem.toFixed(2)})
              </span>
              <span className="font-bold text-white">
                {money.format(centavosParaDecimal(totals.passagensCentavos))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>📈</span> Diferença Uber (extra)
              </span>
              <span className="font-bold text-amber-400">
                {money.format(centavosParaDecimal(totals.diferencaUberCentavos))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>🎯</span> Meta/Bônus
              </span>
              <span className="font-bold text-amber-400">
                {money.format(centavosParaDecimal(totals.metaCentavos))}
              </span>
            </div>
          </div>
        </div>

        {/* Mensagens de Feedback / Erro */}
        {feedback && (
          <p className="text-sm text-emerald-400 font-medium" role="status">
            {feedback}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive font-medium" role="alert">
            {error}
          </p>
        )}

        {/* Botão de Ação */}
        <Button
          className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black text-sm h-12 rounded-xl transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          size="lg"
          onClick={handleGenerate}
          disabled={totals.totalCentavos <= 0 || gerarAcerto.isPending}
          aria-label="Gerar acerto pendente"
        >
          {gerarAcerto.isPending ? (
            <>
              <FileClock className="w-4 h-4 text-slate-900 animate-spin" />
              <span>Gerando pagamento...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 text-slate-900" />
              <span>Gerar Pagamento de {totalFormatado}</span>
            </>
          )}
        </Button>

        {/* Dica do Rodapé com Lâmpada */}
        <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1.5 pt-1">
          <span>💡</span>
          <span>
            Uma transferência só na 2ª feira = 1x taxa do Divipay (R$ 3,50). Economia de até R$ 14,00/semana em taxas!
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
