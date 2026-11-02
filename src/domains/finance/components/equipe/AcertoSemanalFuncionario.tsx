import { useEffect, useMemo, useState } from "react";
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
import {
  type AjusteDiarioInput,
  type EquipeAcertoDetalhes,
  useEquipeAcertos,
} from "@/domains/finance/hooks/useEquipeAcertos";
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
  uberReal: string; // string permite distinguir explicitamente vazio "" de 0 ou 0.00 informado
  meta: string;
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

  const { acertos, ajustes = [], gerarAcerto } = useEquipeAcertos(colaboradorId);

  // Identifica se já existe acerto gravado para a semana atual
  const acertoAtual = useMemo(() => {
    if (!acertos || !Array.isArray(acertos)) return null;
    return acertos.find(
      (a) => a.periodo_inicio === daysAtual[0].date
    );
  }, [acertos, daysAtual]);

  // Identifica se existiu acerto gravado para a semana anterior (histórico real)
  const acertoAnterior = useMemo(() => {
    if (!acertos || !Array.isArray(acertos)) return null;
    return acertos.find(
      (a) => a.periodo_inicio === daysAnterior[0].date
    );
  }, [acertos, daysAnterior]);

  const hasHistoricoAnterior = Boolean(acertoAnterior);
  const isJaPago = acertoAtual?.status === "pago";
  const isProcessando = acertoAtual?.status === "processando";
  const isPendenteExistente = acertoAtual?.status === "pendente";

  // Estado da Semana Atual (Antecipação)
  const [inputsAtual, setInputsAtual] = useState<DiaAtualInput[]>(() =>
    daysAtual.map((_, index) => ({
      previsaoTrabalho: index < 6,
      uberFixo: uberBase,
      passagem: valorPassagem,
    }))
  );

  // Estado da Semana Anterior (Ajuste)
  // Seg a Sáb receberam antecipação por padrão se houver histórico ou na inicialização padrão
  const [inputsAnterior, setInputsAnterior] = useState<DiaAnteriorInput[]>(() =>
    daysAnterior.map((_, index) => ({
      recebeuAntecipacao: index < 6,
      uberAntecipado: index < 6 ? uberBase : 0,
      uberReal: index < 6 ? String(uberBase) : "",
      meta: "",
    }))
  );

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dadosSincronizados, setDadosSincronizados] = useState(false);

  // Sincroniza dados históricos persistidos no banco
  useEffect(() => {
    // 1. Se o acerto atual já foi gerado e possui snapshot em detalhes, restaura exatamente o que foi salvo
    if (acertoAtual?.detalhes) {
      const det = acertoAtual.detalhes;
      if (Array.isArray(det.semana_atual) && det.semana_atual.length === 7) {
        setInputsAtual(
          det.semana_atual.map((dia) => ({
            previsaoTrabalho: Boolean(dia.previsaoTrabalho),
            uberFixo: dia.uberFixo ?? uberBase,
            passagem: dia.passagem ?? valorPassagem,
          }))
        );
      }
      if (Array.isArray(det.semana_anterior) && det.semana_anterior.length === 7) {
        setInputsAnterior(
          det.semana_anterior.map((dia) => ({
            recebeuAntecipacao: Boolean(dia.recebeuAntecipacao),
            uberAntecipado: dia.uberAntecipado ?? 0,
            uberReal: dia.uberReal !== null && dia.uberReal !== undefined ? String(dia.uberReal) : "",
            meta: dia.meta ? String(dia.meta) : "",
          }))
        );
        setDadosSincronizados(true);
        return;
      }
    }

    // 2. Se a semana anterior tiver acerto persistido com detalhes, recupera os dias que tiveram antecipação comprovada
    if (acertoAnterior?.detalhes?.semana_atual && !dadosSincronizados) {
      const diasPrevistosAnterior = acertoAnterior.detalhes.semana_atual;
      setInputsAnterior(
        daysAnterior.map((day, idx) => {
          const diaHistorico = diasPrevistosAnterior[idx];
          const teveAntecipacao = Boolean(diaHistorico?.previsaoTrabalho);
          const uberFixoHist = diaHistorico?.uberFixo ?? uberBase;

          // Verifica se já existia ajuste gravado para esta data em colaborador_ajustes
          const ajusteSalvo = Array.isArray(ajustes)
            ? ajustes.find((aj) => aj.data_gasto === day.date)
            : undefined;
          const uberRealSalvo =
            ajusteSalvo?.valor_real !== undefined && ajusteSalvo?.valor_real !== null
              ? String(ajusteSalvo.valor_real)
              : "";

          return {
            recebeuAntecipacao: teveAntecipacao,
            uberAntecipado: teveAntecipacao ? uberFixoHist : 0,
            uberReal: uberRealSalvo,
            meta: "",
          };
        })
      );
      setDadosSincronizados(true);
      return;
    }

    // 3. Se houver ajustes gravados no banco para o colaborador na semana anterior, sincroniza
    if (Array.isArray(ajustes) && ajustes.length > 0 && !dadosSincronizados) {
      setInputsAnterior(
        daysAnterior.map((day) => {
          const aj = ajustes.find((item) => item.data_gasto === day.date);
          if (aj) {
            return {
              recebeuAntecipacao: (aj.valor_antecipado ?? 0) > 0,
              uberAntecipado: aj.valor_antecipado ?? 0,
              uberReal: aj.valor_real !== null && aj.valor_real !== undefined ? String(aj.valor_real) : "",
              meta: "",
            };
          }
          return {
            recebeuAntecipacao: false,
            uberAntecipado: 0,
            uberReal: "",
            meta: "",
          };
        })
      );
      setDadosSincronizados(true);
    }
  }, [acertoAtual, acertoAnterior, ajustes, daysAnterior, uberBase, valorPassagem, dadosSincronizados]);

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
      semanaAnterior: inputsAnterior.map((item, idx) => {
        const uberRealTrim = item.uberReal.trim();
        const temUberReal = uberRealTrim !== "";
        const uberRealParsed = temUberReal ? parseFloat(uberRealTrim) : null;
        const metaParsed = item.meta.trim() !== "" ? parseFloat(item.meta) : 0;

        return {
          data: daysAnterior[idx].date,
          label: daysAnterior[idx].label,
          recebeuAntecipacao: item.recebeuAntecipacao,
          uberAntecipadoCentavos: item.recebeuAntecipacao
            ? decimalParaCentavos(item.uberAntecipado || uberBase)
            : 0,
          uberRealCentavos:
            uberRealParsed !== null && !isNaN(uberRealParsed)
              ? decimalParaCentavos(uberRealParsed)
              : null,
          metaCentavos: decimalParaCentavos(metaParsed || 0),
        };
      }),
      uberBasePadraoCentavos: decimalParaCentavos(uberBase),
      valorPassagemPadraoCentavos: decimalParaCentavos(valorPassagem),
    });
  }, [inputsAtual, inputsAnterior, daysAtual, daysAnterior, uberBase, valorPassagem]);

  const updateAtual = (index: number, patch: Partial<DiaAtualInput>) => {
    if (isJaPago || isProcessando) return;
    setInputsAtual((curr) =>
      curr.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
    setFeedback(null);
  };

  const updateAnterior = (index: number, patch: Partial<DiaAnteriorInput>) => {
    if (isJaPago || isProcessando) return;
    setInputsAnterior((curr) =>
      curr.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        // Se ativou recebeuAntecipacao e uberAntecipado era 0, preenche com uberBase padrão
        if (patch.recebeuAntecipacao === true && (next.uberAntecipado === 0 || !next.uberAntecipado)) {
          next.uberAntecipado = uberBase;
        }
        return next;
      })
    );
    setFeedback(null);
  };

  const handleGenerate = async () => {
    if (calculo.totalTransferenciaCentavos <= 0) {
      setError("O valor total da transferência deve ser maior que zero.");
      return;
    }

    if (isJaPago) {
      setError("Este acerto já foi liquidado e está bloqueado para edições.");
      return;
    }

    if (isProcessando) {
      setError("O pagamento deste acerto já está em processamento.");
      return;
    }

    try {
      setError(null);
      setFeedback(null);

      // Prepara itens de resumo do acerto
      const itens = [
        {
          natureza: "transporte" as const,
          descricao: `Transporte antecipado semana atual (${periodoAtualLabel}) - ${calculo.diasPrevistosAtual} dias`,
          valor: centavosParaDecimal(calculo.totalAntecipacaoCentavos),
        },
      ];

      if (calculo.saldoAjusteUberCentavos !== 0) {
        itens.push({
          natureza: "ajuste" as const,
          descricao: `Ajuste Uber semana anterior (${periodoAnteriorLabel})`,
          valor: centavosParaDecimal(calculo.saldoAjusteUberCentavos),
        });
      }

      if (calculo.totalMetasCentavos > 0) {
        itens.push({
          natureza: "meta" as const,
          descricao: `Metas/Bônus da semana anterior (${periodoAnteriorLabel})`,
          valor: centavosParaDecimal(calculo.totalMetasCentavos),
        });
      }

      // Prepara lista de ajustes diários individuais para persistência em colaborador_ajustes
      const ajustesDiarios: AjusteDiarioInput[] = [];
      daysAnterior.forEach((day, idx) => {
        const input = inputsAnterior[idx];
        const dif = calculo.diferencasDiarias[idx];
        const uberRealTrim = input.uberReal.trim();

        // Registra o ajuste individual sempre que houver informação explícita de gasto ou diferença
        if (uberRealTrim !== "" || (input.recebeuAntecipacao && dif && dif.diferencaCentavos !== 0)) {
          const valorReal = uberRealTrim !== "" ? parseFloat(uberRealTrim) : null;
          const valorAntecipado = input.recebeuAntecipacao ? input.uberAntecipado : 0;
          const diferenca = dif ? centavosParaDecimal(dif.diferencaCentavos) : 0;

          ajustesDiarios.push({
            colaborador_id: colaboradorId,
            data_gasto: day.date,
            periodo_referencia_inicio: daysAnterior[0].date,
            periodo_referencia_fim: daysAnterior[6].date,
            valor_antecipado: valorAntecipado,
            valor_real: valorReal !== null && !isNaN(valorReal) ? valorReal : 0,
            diferenca,
            status: "compensado",
          });
        }
      });

      // Snapshot completo para reconstituição visual futura e auditoria
      const detalhes: EquipeAcertoDetalhes = {
        origem: "AcertoSemanalFuncionario",
        versao: "2.1",
        data_geracao: new Date().toISOString(),
        semana_atual: daysAtual.map((day, idx) => ({
          date: day.date,
          dayName: day.label,
          previsaoTrabalho: inputsAtual[idx].previsaoTrabalho,
          uberFixo: inputsAtual[idx].uberFixo,
          passagem: inputsAtual[idx].passagem,
        })),
        semana_anterior: daysAnterior.map((day, idx) => ({
          date: day.date,
          dayName: day.label,
          recebeuAntecipacao: inputsAnterior[idx].recebeuAntecipacao,
          uberAntecipado: inputsAnterior[idx].uberAntecipado,
          uberReal: inputsAnterior[idx].uberReal.trim() !== "" ? parseFloat(inputsAnterior[idx].uberReal) : null,
          meta: inputsAnterior[idx].meta.trim() !== "" ? parseFloat(inputsAnterior[idx].meta) : null,
        })),
      };

      await gerarAcerto.mutateAsync({
        colaboradorId,
        periodoInicio: daysAtual[0].date,
        periodoFim: daysAtual[6].date,
        itens,
        ajustesDiarios,
        detalhes,
      });

      setFeedback(
        isPendenteExistente
          ? "Acerto semanal atualizado com sucesso!"
          : "Acerto pendente criado com sucesso! Revise os detalhes e confirme a transferência quando estiver pronto."
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

        {/* Banners de Status Financeiro */}
        {isJaPago && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-300 text-sm" role="status">
            <Lock className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">Acerto já pago em definitivo</p>
              <p className="text-xs text-blue-300">
                O pagamento desta semana já foi liquidado e está bloqueado para edições para garantir a integridade contábil.
              </p>
            </div>
          </div>
        )}

        {isProcessando && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-indigo-300 text-xs" role="status">
            <FileClock className="w-4 h-4 text-indigo-400 shrink-0 animate-spin" />
            <div>
              <span className="font-semibold text-white">Pagamento em Processamento: </span>
              <span>A transferência PIX está sendo executada pelo Divipay. Aguarde a confirmação bancária.</span>
            </div>
          </div>
        )}

        {isPendenteExistente && !isJaPago && !isProcessando && (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs" role="status">
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold text-white">Acerto pendente gerado: </span>
                <span>Existe um acerto salvo para este período (R$ {acertoAtual?.valor_total?.toFixed(2)}). Você pode revisar e atualizar os valores sem duplicidade de despesas.</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-semibold text-[11px] border border-amber-500/40 shrink-0">
              PENDENTE
            </span>
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
                            disabled={isJaPago || isProcessando}
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

          {/* Banner de Rastreabilidade Histórica */}
          {!hasHistoricoAnterior ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-300">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Sem histórico anterior gravado: </span>
                <span>
                  Nenhum acerto semanal foi registrado na semana anterior ({periodoAnteriorLabel}).
                  Marque manualmente os dias em que houve antecipação ou informe gastos elegíveis de Uber do próprio bolso.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Antecipações da semana anterior carregadas do histórico persistido.</span>
            </div>
          )}

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
                  const difInfo = calculo.diferencasDiarias[index];
                  const diferencaCentavos = difInfo?.diferencaCentavos ?? 0;
                  const diferencaValor = centavosParaDecimal(diferencaCentavos);
                  const temInformacaoGasto = input.uberReal.trim() !== "";

                  return (
                    <tr
                      key={day.date}
                      className={`transition-colors ${
                        input.recebeuAntecipacao || temInformacaoGasto
                          ? "hover:bg-slate-800/30"
                          : "opacity-40 hover:opacity-50"
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
                            disabled={isJaPago || isProcessando}
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
                          <Input
                            aria-label={`Uber real de ${day.label}`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={isJaPago || isProcessando}
                            value={input.uberReal}
                            placeholder="0,00"
                            onChange={(e) =>
                              updateAnterior(index, { uberReal: e.target.value })
                            }
                            className="h-8 w-24 bg-[#070D1F]/80 border-[#1E2942] text-center font-medium text-white rounded-lg focus:border-amber-500"
                          />
                        </div>
                      </td>

                      {/* Diferença */}
                      <td className="py-2.5 px-3 text-center font-semibold">
                        {difInfo && difInfo.informado ? (
                          <span
                            className={
                              difInfo.diferencaCentavos > 0
                                ? "text-emerald-400"
                                : difInfo.diferencaCentavos < 0
                                ? "text-amber-400"
                                : "text-slate-400"
                            }
                          >
                            {difInfo.diferencaCentavos > 0 ? "+" : ""}
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
                            disabled={isJaPago || isProcessando}
                            value={input.meta}
                            placeholder="0,00"
                            onChange={(e) =>
                              updateAnterior(index, { meta: e.target.value })
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
              <span>Uber real informado: <strong className="text-white">{money.format(centavosParaDecimal(calculo.uberRealTotalAnteriorCentavos))}</strong></span>
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
          disabled={calculo.totalTransferenciaCentavos <= 0 || gerarAcerto.isPending || isJaPago || isProcessando}
          aria-label={
            isJaPago
              ? "Acerto já pago"
              : isPendenteExistente
              ? "Atualizar acerto pendente"
              : "Gerar acerto pendente"
          }
        >
          {gerarAcerto.isPending ? (
            <>
              <FileClock className="w-4 h-4 text-slate-900 animate-spin" />
              <span>Salvando acerto...</span>
            </>
          ) : isJaPago ? (
            <>
              <Lock className="w-4 h-4 text-slate-900" />
              <span>Acerto Pago (Bloqueado)</span>
            </>
          ) : isProcessando ? (
            <>
              <FileClock className="w-4 h-4 text-slate-900 animate-spin" />
              <span>Pagamento em Processamento...</span>
            </>
          ) : isPendenteExistente ? (
            <>
              <CreditCard className="w-4 h-4 text-slate-900" />
              <span>Atualizar Acerto de {totalFormatado}</span>
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
