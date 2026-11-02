import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FileClock,
  Info,
  Lock,
} from "lucide-react";

import {
  calcularAcertoSemanalTransporte,
  centavosParaDecimal,
  decimalParaCentavos,
} from "@/domains/finance/services/equipeCalculations";
import { useEquipeAcertos } from "@/domains/finance/hooks/useEquipeAcertos";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  buildWeek,
  currentMonday,
  formatPeriodLabel,
  formatShortDate,
  previousMonday,
} from "./weeklyUtils";

type Props = {
  colaboradorId: string;
  colaboradorNome: string;
  valorPassagem?: number;
  uberBase?: number;
  weekStart?: string;
  previousWeekStart?: string;
  pixChave?: string | null;
  pixTipo?: string | null;
};

type DiaAtualInput = {
  previsaoTrabalho: boolean;
  uberFixo: number;
  passagem: number;
};

type DiaAnteriorInput = {
  recebeuAntecipacao: boolean;
  uberAntecipado: number;
  uberReal: number;
  meta: number;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AcertoSemanalFuncionario({
  colaboradorId,
  colaboradorNome,
  valorPassagem = 6.25,
  uberBase = 12,
  weekStart,
  previousWeekStart,
  pixChave,
  pixTipo = "cpf",
}: Props) {
  // Semana Atual (Segunda a Domingo)
  const mondayAtual = weekStart ?? currentMonday();
  const daysAtual = useMemo(() => buildWeek(mondayAtual), [mondayAtual]);

  // Semana Anterior (Segunda a Domingo da semana passada)
  const mondayAnterior = previousWeekStart ?? previousMonday(mondayAtual);
  const daysAnterior = useMemo(() => buildWeek(mondayAnterior), [mondayAnterior]);

  // Períodos formatados
  const periodoAtualLabel = useMemo(
    () => formatPeriodLabel(daysAtual[0].date, daysAtual[6].date),
    [daysAtual]
  );
  const periodoAnteriorLabel = useMemo(
    () => formatPeriodLabel(daysAnterior[0].date, daysAnterior[6].date),
    [daysAnterior]
  );

  // Estado da Semana Atual (Antecipação: Seg a Sáb previstos por padrão)
  const [inputsAtual, setInputsAtual] = useState<DiaAtualInput[]>(() =>
    daysAtual.map((_, index) => ({
      previsaoTrabalho: index < 6,
      uberFixo: uberBase,
      passagem: valorPassagem,
    }))
  );

  // Estado da Semana Anterior (Ajuste: Seg a Sáb receberam antecipação por padrão, Uber real = 12,00 inicial)
  const [inputsAnterior, setInputsAnterior] = useState<DiaAnteriorInput[]>(() =>
    daysAnterior.map((_, index) => ({
      recebeuAntecipacao: index < 6,
      uberAntecipado: uberBase,
      uberReal: uberBase,
      meta: 0,
    }))
  );

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: acertos, gerarAcerto } = useEquipeAcertos(colaboradorId);

  // Verifica se já existe acerto para a semana atual
  const acertoAtual = useMemo(() => {
    if (!acertos || !Array.isArray(acertos)) return null;
    return acertos.find((a) => a.periodo_inicio === daysAtual[0].date);
  }, [acertos, daysAtual]);

  const isJaPago = acertoAtual?.status === "pago";
  const isPendenteExistente = acertoAtual?.status === "pendente";

  // Cálculo canônico unificado
  const calculo = useMemo(() => {
    return calcularAcertoSemanalTransporte({
      semanaAtual: inputsAtual.map((item, idx) => ({
        data: daysAtual[idx].date,
        label: daysAtual[idx].label,
        previsaoTrabalho: item.previsaoTrabalho,
        uberFixoCentavos: decimalParaCentavos(item.uberFixo),
        passagemCentavos: decimalParaCentavos(item.passagem),
      })),
      semanaAnterior: inputsAnterior.map((item, idx) => ({
        data: daysAnterior[idx].date,
        label: daysAnterior[idx].label,
        recebeuAntecipacao: item.recebeuAntecipacao,
        uberAntecipadoCentavos: decimalParaCentavos(item.uberAntecipado),
        uberRealCentavos: decimalParaCentavos(item.uberReal),
        metaCentavos: decimalParaCentavos(item.meta),
      })),
      uberBasePadraoCentavos: decimalParaCentavos(uberBase),
      valorPassagemPadraoCentavos: decimalParaCentavos(valorPassagem),
    });
  }, [inputsAtual, inputsAnterior, daysAtual, daysAnterior, uberBase, valorPassagem]);

  const updateAtual = (index: number, patch: Partial<DiaAtualInput>) => {
    if (isJaPago) return;
    setInputsAtual((curr) =>
      curr.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
    setFeedback(null);
  };

  const updateAnterior = (index: number, patch: Partial<DiaAnteriorInput>) => {
    if (isJaPago) return;
    setInputsAnterior((curr) =>
      curr.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
    setFeedback(null);
  };

  const handleGenerate = async () => {
    if (isJaPago) return;
    setError(null);
    setFeedback(null);

    const itens = [];

    // 1. Antecipação da semana atual
    if (calculo.totalAntecipacaoCentavos > 0) {
      itens.push({
        natureza: "transporte" as const,
        descricao: `Transporte antecipado (${periodoAtualLabel}) - ${calculo.diasPrevistosAtual} dias de ${colaboradorNome}`,
        valor: centavosParaDecimal(calculo.totalAntecipacaoCentavos),
      });
    }

    // 2. Saldo de ajuste de Uber da semana anterior (positivo ou negativo)
    if (calculo.saldoAjusteUberCentavos !== 0) {
      const valorAjuste = centavosParaDecimal(calculo.saldoAjusteUberCentavos);
      itens.push({
        natureza: "ajuste" as const,
        descricao: `Ajuste Uber semana anterior (${periodoAnteriorLabel}) - Saldo ${
          calculo.saldoAjusteUberCentavos > 0 ? "+" : ""
        }${money.format(valorAjuste)}`,
        valor: valorAjuste,
      });
    }

    // 3. Metas / Bônus apurados
    if (calculo.totalMetasCentavos > 0) {
      itens.push({
        natureza: "meta" as const,
        descricao: `Metas/Bônus (${periodoAnteriorLabel}) de ${colaboradorNome}`,
        valor: centavosParaDecimal(calculo.totalMetasCentavos),
      });
    }

    if (itens.length === 0 || calculo.totalTransferenciaCentavos <= 0) {
      setError("O valor total do acerto deve ser positivo para gerar o pagamento.");
      return;
    }

    try {
      await gerarAcerto.mutateAsync({
        colaboradorId,
        periodoInicio: daysAtual[0].date,
        periodoFim: daysAtual[6].date,
        itens,
      });
      setFeedback(
        "Acerto pendente criado com sucesso! Revise os detalhes e confirme a transferência quando estiver pronto."
      );
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Não foi possível gerar o acerto semanal."
      );
    }
  };

  const totalFormatado = money.format(
    centavosParaDecimal(calculo.totalTransferenciaCentavos)
  );

  return (
    <Card className="border border-[#1E2942] bg-[#0B132B] text-foreground rounded-2xl shadow-xl overflow-hidden">
      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* Cabeçalho do Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2942] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧮</span>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Acerto Semanal de Transporte
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Colaborador: <span className="text-white font-semibold">{colaboradorNome}</span> | Base diária: R$ {uberBase.toFixed(2)} (Uber) + R$ {valorPassagem.toFixed(2)} (Passagem) = R$ {(uberBase + valorPassagem).toFixed(2)}/dia
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pixChave ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-semibold shadow-sm w-fit">
                <span>💸</span>
                <span>PIX: {pixChave}</span>
                {pixTipo && <span className="text-[10px] text-emerald-500 uppercase">({pixTipo})</span>}
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-400 text-xs font-semibold shadow-sm w-fit">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>PIX não cadastrado</span>
              </div>
            )}
          </div>
        </div>

        {/* Alerta de Status Existente (Pago ou Pendente) */}
        {isJaPago && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-300 text-sm">
            <Lock className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">Acerto já pago em definitivo</p>
              <p className="text-xs text-blue-300">
                O pagamento desta semana já foi liquidado e está bloqueado para edições para garantir a integridade contábil.
              </p>
            </div>
          </div>
        )}

        {isPendenteExistente && !isJaPago && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span>Existe um acerto pendente gerado para este período (R$ {acertoAtual.valor_total.toFixed(2)}). Gerar novamente atualizará os valores do acerto.</span>
            </div>
          </div>
        )}

        {/* SEÇÃO A: Transporte Antecipado — Semana Atual */}
        <section aria-labelledby="secao-a-titulo" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-sky-400">Seção A</span>
              <h4 id="secao-a-titulo" className="text-sm font-bold text-white tracking-tight">
                Transporte Antecipado — Semana Atual ({periodoAtualLabel})
              </h4>
            </div>
            <span className="text-xs text-slate-400">
              Pagamento adiantado na 2ª feira para os dias previstos de trabalho
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1E2942] bg-[#0E172F]/50">
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-[#1E2942]/80 text-xs font-semibold text-slate-400">
                  <th className="py-2.5 px-3">Dia</th>
                  <th className="py-2.5 px-3 text-center">Vai trabalhar?</th>
                  <th className="py-2.5 px-3 text-center">Uber Fixo</th>
                  <th className="py-2.5 px-3 text-center">Passagem</th>
                  <th className="py-2.5 px-3 text-right">Subtotal Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2942]/40 text-sm">
                {daysAtual.map((day, index) => {
                  const input = inputsAtual[index];
                  const subtotalDiaCentavos = input.previsaoTrabalho
                    ? decimalParaCentavos(input.uberFixo) + decimalParaCentavos(input.passagem)
                    : 0;

                  return (
                    <tr
                      key={day.date}
                      className={`transition-colors ${
                        input.previsaoTrabalho ? "hover:bg-slate-800/30" : "opacity-40 hover:opacity-50"
                      }`}
                    >
                      {/* Dia */}
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-white">{day.label}</p>
                        <p className="text-xs text-slate-400">{formatShortDate(day.date)}</p>
                      </td>

                      {/* Vai trabalhar? */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            id={`previsao-${day.date}`}
                            aria-label={`Previsão de trabalho na ${day.label}`}
                            checked={input.previsaoTrabalho}
                            disabled={isJaPago}
                            onCheckedChange={(checked) =>
                              updateAtual(index, { previsaoTrabalho: Boolean(checked) })
                            }
                            className="h-5 w-5 rounded-md border-slate-600 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                          />
                        </div>
                      </td>

                      {/* Uber Fixo */}
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {input.previsaoTrabalho ? money.format(input.uberFixo) : "—"}
                      </td>

                      {/* Passagem */}
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {input.previsaoTrabalho ? money.format(input.passagem) : "—"}
                      </td>

                      {/* Subtotal Dia */}
                      <td className="py-2.5 px-3 text-right font-medium">
                        {input.previsaoTrabalho ? (
                          <span className="text-sky-300">
                            {money.format(centavosParaDecimal(subtotalDiaCentavos))}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotal da Seção A */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-sky-950/30 border border-sky-800/30 text-xs">
            <div className="flex items-center gap-3 text-slate-300">
              <span>Dias previstos: <strong className="text-white">{calculo.diasPrevistosAtual} dias</strong></span>
              <span>Uber antecipado: <strong className="text-white">{money.format(centavosParaDecimal(calculo.uberAntecipadoCentavos))}</strong></span>
              <span>Passagens: <strong className="text-white">{money.format(centavosParaDecimal(calculo.passagensAntecipadasCentavos))}</strong></span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 mr-2">Total Antecipação:</span>
              <span className="text-sm font-bold text-sky-400">
                {money.format(centavosParaDecimal(calculo.totalAntecipacaoCentavos))}
              </span>
            </div>
          </div>
        </section>

        {/* SEÇÃO B: Ajuste de Uber — Semana Anterior */}
        <section aria-labelledby="secao-b-titulo" className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-amber-400">Seção B</span>
              <h4 id="secao-b-titulo" className="text-sm font-bold text-white tracking-tight">
                Ajuste de Uber — Semana Anterior ({periodoAnteriorLabel})
              </h4>
            </div>
            <span className="text-xs text-slate-400">
              Ajuste do Uber real vs. antecipado (positivo se gastou mais, negativo se sobrou)
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1E2942] bg-[#0E172F]/50">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="border-b border-[#1E2942]/80 text-xs font-semibold text-slate-400">
                  <th className="py-2.5 px-3">Dia</th>
                  <th className="py-2.5 px-3 text-center">Recebeu Uber?</th>
                  <th className="py-2.5 px-3 text-center">Uber Antecipado</th>
                  <th className="py-2.5 px-3 text-center">Uber Real Utilizado</th>
                  <th className="py-2.5 px-3 text-center">Diferença</th>
                  <th className="py-2.5 px-3 text-center">Meta / Bônus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2942]/40 text-sm">
                {daysAnterior.map((day, index) => {
                  const input = inputsAnterior[index];
                  const diferenca = calculo.diferencasDiarias[index]?.diferencaCentavos ?? 0;
                  const diferencaValor = centavosParaDecimal(diferenca);

                  return (
                    <tr
                      key={day.date}
                      className={`transition-colors ${
                        input.recebeuAntecipacao ? "hover:bg-slate-800/30" : "opacity-40 hover:opacity-50"
                      }`}
                    >
                      {/* Dia */}
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-white">{day.label}</p>
                        <p className="text-xs text-slate-400">{formatShortDate(day.date)}</p>
                      </td>

                      {/* Recebeu Uber? */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            id={`recebeu-${day.date}`}
                            aria-label={`Recebeu antecipação na ${day.label}`}
                            checked={input.recebeuAntecipacao}
                            disabled={isJaPago}
                            onCheckedChange={(checked) =>
                              updateAnterior(index, { recebeuAntecipacao: Boolean(checked) })
                            }
                            className="h-5 w-5 rounded-md border-slate-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                          />
                        </div>
                      </td>

                      {/* Uber Antecipado */}
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {input.recebeuAntecipacao ? money.format(input.uberAntecipado) : "—"}
                      </td>

                      {/* Uber Real Utilizado */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex justify-center">
                          {input.recebeuAntecipacao ? (
                            <Input
                              aria-label={`Uber real de ${day.label}`}
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isJaPago}
                              value={input.uberReal || ""}
                              onChange={(e) =>
                                updateAnterior(index, {
                                  uberReal: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="h-8 w-24 bg-[#070D1F]/80 border-[#1E2942] text-center font-medium text-white rounded-lg focus:border-amber-500"
                            />
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </td>

                      {/* Diferença */}
                      <td className="py-2.5 px-3 text-center font-semibold">
                        {input.recebeuAntecipacao ? (
                          <span
                            className={
                              diferenca > 0
                                ? "text-emerald-400"
                                : diferenca < 0
                                ? "text-amber-400"
                                : "text-slate-400"
                            }
                          >
                            {diferenca > 0 ? "+" : ""}
                            {money.format(diferencaValor)}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Meta */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex justify-center">
                          <Input
                            aria-label={`Meta de ${day.label}`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={isJaPago}
                            value={input.meta || ""}
                            placeholder="0,00"
                            onChange={(e) =>
                              updateAnterior(index, {
                                meta: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-8 w-24 bg-[#070D1F]/80 border-[#1E2942] text-center font-medium text-white rounded-lg focus:border-amber-500"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotal da Seção B */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-amber-950/20 border border-amber-800/30 text-xs">
            <div className="flex items-center gap-3 text-slate-300">
              <span>Dias com antecipação: <strong className="text-white">{calculo.diasComAntecipacaoAnterior} dias</strong></span>
              <span>Uber antecipado: <strong className="text-white">{money.format(centavosParaDecimal(calculo.uberAntecipadoTotalAnteriorCentavos))}</strong></span>
              <span>Uber real: <strong className="text-white">{money.format(centavosParaDecimal(calculo.uberRealTotalAnteriorCentavos))}</strong></span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 mr-2">Saldo de Ajustes Uber:</span>
              <span
                className={`text-sm font-bold ${
                  calculo.saldoAjusteUberCentavos >= 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {calculo.saldoAjusteUberCentavos > 0 ? "+" : ""}
                {money.format(centavosParaDecimal(calculo.saldoAjusteUberCentavos))}
              </span>
            </div>
          </div>
        </section>

        {/* SEÇÃO C: Total a Transferir */}
        <section aria-labelledby="secao-c-titulo" className="rounded-2xl border border-[#1E2942] bg-[#0E172F]/90 p-5 space-y-4 shadow-lg pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1E2942]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-emerald-400">Seção C</span>
                <h4 id="secao-c-titulo" className="text-sm font-bold text-white">
                  Total a Transferir na 2ª Feira
                </h4>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Combinação da antecipação da semana atual ({periodoAtualLabel}) + ajuste do Uber da semana anterior ({periodoAnteriorLabel})
              </p>
              {pixChave && (
                <p className="text-xs font-mono text-emerald-400 mt-1">
                  Chave PIX: <span className="font-bold">{pixChave}</span> {pixTipo && `(${pixTipo})`}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-3xl font-black tracking-tight text-white block">
                {totalFormatado}
              </span>
            </div>
          </div>

          {/* Composição detalhada */}
          <div className="space-y-2.5 text-xs sm:text-sm font-medium">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>🚗</span> Uber Antecipado — Semana Atual ({calculo.diasPrevistosAtual} {calculo.diasPrevistosAtual === 1 ? "dia" : "dias"} × R$ {uberBase.toFixed(2)})
              </span>
              <span className="font-bold text-white">
                {money.format(centavosParaDecimal(calculo.uberAntecipadoCentavos))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>🚌</span> Passagem Antecipada — Semana Atual ({calculo.diasPrevistosAtual} {calculo.diasPrevistosAtual === 1 ? "dia" : "dias"} × R$ {valorPassagem.toFixed(2)})
              </span>
              <span className="font-bold text-white">
                {money.format(centavosParaDecimal(calculo.passagensAntecipadasCentavos))}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-2">
                <span>⚖️</span> Saldo Ajustes Uber — Semana Anterior ({periodoAnteriorLabel})
              </span>
              <span
                className={`font-bold ${
                  calculo.saldoAjusteUberCentavos >= 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {calculo.saldoAjusteUberCentavos > 0 ? "+" : ""}
                {money.format(centavosParaDecimal(calculo.saldoAjusteUberCentavos))}
              </span>
            </div>

            {calculo.totalMetasCentavos > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-2">
                  <span>🎯</span> Metas / Bônus — Semana Anterior
                </span>
                <span className="font-bold text-amber-400">
                  +{money.format(centavosParaDecimal(calculo.totalMetasCentavos))}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Mensagens de Feedback / Erro */}
        {feedback && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-sm text-emerald-300 font-medium" role="status">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/20 border border-destructive/40 text-sm text-destructive font-medium" role="alert">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botão de Ação */}
        <Button
          className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black text-sm h-12 rounded-xl transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          size="lg"
          onClick={handleGenerate}
          disabled={calculo.totalTransferenciaCentavos <= 0 || gerarAcerto.isPending || isJaPago}
          aria-label="Gerar acerto pendente"
        >
          {gerarAcerto.isPending ? (
            <>
              <FileClock className="w-4 h-4 text-slate-900 animate-spin" />
              <span>Gerando pagamento...</span>
            </>
          ) : isJaPago ? (
            <>
              <Lock className="w-4 h-4 text-slate-900" />
              <span>Acerto Pago (Bloqueado)</span>
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
