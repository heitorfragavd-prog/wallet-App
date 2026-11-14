/**
 * escalaAutomacaoEngine.ts
 *
 * Motor central de automações semanais dos folguistas da Rodo Point (Etapa 3C).
 * Implementa as rotinas de Segunda-feira (Consulta de Disponibilidade),
 * Sexta-feira (Reconfirmação), Busca Inteligente de Substitutos e Idempotência estrita.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  ColaboradorFolguista,
  DisponibilidadeFolguista,
  EscalasConfig,
  EscalaSlot,
  FolguistaSubstitutionCandidate,
  TurnoId,
  TURNOS_PADRAO,
  TelegramEnvioStatus,
  SimulacaoRespostaFolguistaResult,
  AcaoPropostaSimulada,
} from "../types";
import { getNextWeekendDates, formatDateBR, WeekendDates } from "./escalaDateUtils";
import {
  validateFridayToSaturdayMorning,
  validateSuellenSundayNight,
} from "./escalaEngine";
import { parseFolguistaMessage } from "./folguistaResponseParser";

export interface VagaAbertaInfo {
  data: string; // YYYY-MM-DD
  diaSemana: "sabado" | "domingo";
  turno: TurnoId;
  horarioInicio: string;
  horarioFim: string;
  descricaoTurno: string;
}

export interface MondayConsultationResult {
  sucesso: boolean;
  idempotente: boolean;
  mensagem: string;
  vagasAbertas: VagaAbertaInfo[];
  totalFolguistasContatados: number;
  simulada: boolean;
  logId?: string;
}

export interface FridayConfirmationResult {
  sucesso: boolean;
  idempotente: boolean;
  mensagem: string;
  folguistasParaConfirmar: Array<{
    colaboradorId: string;
    colaboradorNome: string;
    data: string;
    diaSemana: string;
    turno: TurnoId;
    horario: string;
    mensagemEnviada: string;
  }>;
  simulada: boolean;
  logsCriados: string[];
}

export interface SubstituteSearchOptions {
  workspaceId: string;
  data: string; // YYYY-MM-DD
  turno: TurnoId;
  horarioInicio?: string;
  horarioFim?: string;
  desistenteId?: string;
  escalasExistentes?: EscalaSlot[];
  folguistas?: ColaboradorFolguista[];
  disponibilidades?: DisponibilidadeFolguista[];
  fridayNightColaboradorId?: string | null;
  mondayMorningColaboradorId?: string | null;
}

export class EscalaAutomacaoEngine {
  /**
   * Identifica os turnos sem cobertura para o próximo fim de semana
   */
  static identifyUncoveredWeekendSlots(params: {
    sabadoDate: string;
    domingoDate: string;
    escalasExistentes: EscalaSlot[];
    config?: Partial<EscalasConfig>;
  }): VagaAbertaInfo[] {
    const { sabadoDate, domingoDate, escalasExistentes, config } = params;

    const turnosSabado: TurnoId[] = config?.dias_semana_turnos?.sabado || ["manha", "noite"];
    const turnosDomingo: TurnoId[] = config?.dias_semana_turnos?.domingo || ["manha", "noite"];

    const vagas: VagaAbertaInfo[] = [];

    // Avalia sábado
    for (const t of turnosSabado) {
      const slotPreenchido = escalasExistentes.some(
        (s) => s.data === sabadoDate && s.turno === t && Boolean(s.colaboradorId) && s.status !== "cancelada"
      );
      if (!slotPreenchido) {
        const info = TURNOS_PADRAO[t] || { inicio: "05:00", fim: "14:30", descricao: t };
        vagas.push({
          data: sabadoDate,
          diaSemana: "sabado",
          turno: t,
          horarioInicio: info.inicio,
          horarioFim: info.fim,
          descricaoTurno: info.descricao,
        });
      }
    }

    // Avalia domingo
    for (const t of turnosDomingo) {
      const slotPreenchido = escalasExistentes.some(
        (s) => s.data === domingoDate && s.turno === t && Boolean(s.colaboradorId) && s.status !== "cancelada"
      );
      if (!slotPreenchido) {
        const info = TURNOS_PADRAO[t] || { inicio: "05:00", fim: "14:30", descricao: t };
        vagas.push({
          data: domingoDate,
          diaSemana: "domingo",
          turno: t,
          horarioInicio: info.inicio,
          horarioFim: info.fim,
          descricaoTurno: info.descricao,
        });
      }
    }

    return vagas;
  }

  /**
   * Constrói o texto amigável e canônico de consulta de segunda-feira (Gate 2)
   */
  static buildMondayConsultationMessage(params: {
    sabadoDate: string;
    domingoDate: string;
    sabadoExtenso: string;
    domingoExtenso: string;
    vagas: VagaAbertaInfo[];
  }): string {
    const { sabadoDate, domingoDate, sabadoExtenso, domingoExtenso, vagas } = params;

    const vagasSabado = vagas.filter((v) => v.data === sabadoDate);
    const vagasDomingo = vagas.filter((v) => v.data === domingoDate);

    let linhasSabado = "";
    if (vagasSabado.length > 0) {
      linhasSabado = vagasSabado
        .map((v) => `- ${v.turno === "manha" ? "Manhã" : "Tarde/noite"}: ${v.horarioInicio} às ${v.horarioFim}`)
        .join("\n");
    } else {
      linhasSabado = "- Escala de sábado já coberta!";
    }

    let linhasDomingo = "";
    if (vagasDomingo.length > 0) {
      linhasDomingo = vagasDomingo
        .map((v) => `- ${v.turno === "manha" ? "Manhã" : "Tarde/noite"}: ${v.horarioInicio} às ${v.horarioFim}`)
        .join("\n");
    } else {
      linhasDomingo = "- Escala de domingo já coberta!";
    }

    return `👥 *RODO POINT — DISPONIBILIDADE DO FIM DE SEMANA*

Bom dia, pessoal! ☀️

Estamos organizando a escala do próximo fim de semana.

Precisamos saber quem poderá trabalhar:

📅 *Sábado, ${formatDateBR(sabadoDate)}* (${sabadoExtenso})
${linhasSabado}

📅 *Domingo, ${formatDateBR(domingoDate)}* (${domingoExtenso})
${linhasDomingo}

Respondam informando os dias e turnos em que estão disponíveis.

Obrigado!`;
  }

  /**
   * Executa a rotina de Segunda-Feira: Consulta de Disponibilidade com Idempotência (Gate 2 & 7)
   */
  static async executeMondayConsultation(params: {
    workspaceId: string;
    referenceDate?: Date;
    forcarExecucao?: boolean; // Para disparos manuais de teste
    escalasExistentes?: EscalaSlot[];
    folguistasAtivos?: ColaboradorFolguista[];
    config?: Partial<EscalasConfig>;
    telegramStatusConfirmed?: {
      sent: boolean;
      messageId?: string;
      apiResponse?: Record<string, unknown>;
      error?: string;
    };
  }): Promise<MondayConsultationResult> {
    const {
      workspaceId,
      referenceDate = new Date(),
      forcarExecucao = false,
      escalasExistentes = [],
      folguistasAtivos = [],
      config = {},
      telegramStatusConfirmed,
    } = params;

    const weekend = getNextWeekendDates(referenceDate);
    const idempotencyKey = `consulta_segunda_ws_${workspaceId}_${weekend.sabado}`;
    const simulada = config.simulacao_modo ?? true;

    // 1. Verificação de idempotência no banco de dados
    if (!forcarExecucao) {
      const { data: existingLog } = await supabase
        .from("escalas_automacoes_log")
        .select("id, status, created_at")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingLog && (existingLog.status === "executada" || existingLog.status === "simulada")) {
        return {
          sucesso: true,
          idempotente: true,
          mensagem: `Rotina de segunda-feira já executada anteriormente nesta semana (${existingLog.created_at}). Disparo ignorado para evitar duplicação.`,
          vagasAbertas: [],
          totalFolguistasContatados: 0,
          simulada,
          logId: existingLog.id,
        };
      }
    }

    // 2. Identificação de vagas abertas
    const vagas = this.identifyUncoveredWeekendSlots({
      sabadoDate: weekend.sabado,
      domingoDate: weekend.domingo,
      escalasExistentes,
      config,
    });

    // 3. Se não houver vagas abertas, grava log informativo sem disparar mensagens
    if (vagas.length === 0) {
      const msgSemVagas = `Escala do fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}) está 100% preenchida. Nenhuma consulta necessária.`;
      
      const { data: inserted } = await supabase
        .from("escalas_automacoes_log")
        .upsert({
          workspace_id: workspaceId,
          tipo_rotina: "consulta_segunda",
          idempotency_key: idempotencyKey,
          data_fim_semana_inicio: weekend.sabado,
          data_fim_semana_fim: weekend.domingo,
          status: simulada ? "simulada" : "executada",
          status_envio: (simulada ? "simulada" : "cancelada") as TelegramEnvioStatus,
          destinatario_tipo: "sistema",
          mensagem_texto: msgSemVagas,
          vagas_identificadas: [],
          enviado_telegram: false,
        }, { onConflict: "idempotency_key" })
        .select("id")
        .single();

      return {
        sucesso: true,
        idempotente: false,
        mensagem: msgSemVagas,
        vagasAbertas: [],
        totalFolguistasContatados: 0,
        simulada,
        logId: inserted?.id,
      };
    }

    // 4. Montagem da mensagem formatada
    const textoMensagem = this.buildMondayConsultationMessage({
      sabadoDate: weekend.sabado,
      domingoDate: weekend.domingo,
      sabadoExtenso: weekend.sabadoExtenso,
      domingoExtenso: weekend.domingoExtenso,
      vagas,
    });

    // 5. Determinação estrita de status de envio (Gate 4)
    const statusEnvio: TelegramEnvioStatus = simulada
      ? "simulada"
      : telegramStatusConfirmed?.sent
      ? "enviada"
      : telegramStatusConfirmed?.error
      ? "falha"
      : "preparada";
    const enviadoTelegram = Boolean(!simulada && telegramStatusConfirmed?.sent);

    // 6. Gravação no log de auditoria
    const { data: logCriado, error: errLog } = await supabase
      .from("escalas_automacoes_log")
      .upsert({
        workspace_id: workspaceId,
        tipo_rotina: "consulta_segunda",
        idempotency_key: idempotencyKey,
        data_fim_semana_inicio: weekend.sabado,
        data_fim_semana_fim: weekend.domingo,
        status: simulada ? "simulada" : (telegramStatusConfirmed?.error ? "erro" : "executada"),
        status_envio: statusEnvio,
        telegram_message_id: telegramStatusConfirmed?.messageId || null,
        api_response: telegramStatusConfirmed?.apiResponse || {},
        erro_detalhes: telegramStatusConfirmed?.error || null,
        erro_mensagem: telegramStatusConfirmed?.error || null,
        destinatario_tipo: "grupo",
        mensagem_texto: textoMensagem,
        vagas_identificadas: vagas.map((v) => ({
          data: v.data,
          diaSemana: v.diaSemana,
          turno: v.turno,
          horario: `${v.horarioInicio} às ${v.horarioFim}`,
        })),
        enviado_telegram: enviadoTelegram,
      }, { onConflict: "idempotency_key" })
      .select("id")
      .single();

    if (errLog) {
      console.error("[EscalaAutomacaoEngine] Erro ao gravar escalas_automacoes_log:", errLog);
    }

    return {
      sucesso: true,
      idempotente: false,
      mensagem: `Consulta de disponibilidade de segunda-feira preparada com sucesso (${vagas.length} turnos a cobrir). Modo de simulação: ${simulada ? "ATIVO (sem disparo real)" : (enviadoTelegram ? "DESATIVADO (enviado e confirmado via Telegram)" : "AGUARDANDO ENVIO")}.`,
      vagasAbertas: vagas,
      totalFolguistasContatados: folguistasAtivos.length,
      simulada,
      logId: logCriado?.id,
    };
  }

  /**
   * Constrói a mensagem individual de confirmação de sexta-feira (Gate 5)
   */
  static buildFridayConfirmationMessage(params: {
    colaboradorNome: string;
    data: string;
    diaSemanaExtenso: string;
    horarioInicio: string;
    horarioFim: string;
    descricaoTurno: string;
  }): string {
    const { colaboradorNome, data, diaSemanaExtenso, horarioInicio, horarioFim, descricaoTurno } = params;
    const primeiroNome = colaboradorNome.split(" ")[0] || "amigo(a)";

    return `Bom dia, ${primeiroNome}! ☀️

Você está escalado para trabalhar na Rodo Point neste *${diaSemanaExtenso}, ${formatDateBR(data)}*, das ${horarioInicio} às ${horarioFim} (${descricaoTurno}).

Está tudo certo para você trabalhar?
Pode confirmar sua presença?`;
  }

  /**
   * Executa a rotina de Sexta-Feira: Reconfirmação de Presença (Gate 5 & 7)
   */
  static async executeFridayConfirmation(params: {
    workspaceId: string;
    referenceDate?: Date;
    escalasExistentes: EscalaSlot[];
    colaboradores?: ColaboradorFolguista[];
    config?: Partial<EscalasConfig>;
    telegramStatusConfirmedMap?: Record<
      string,
      {
        sent: boolean;
        messageId?: string;
        apiResponse?: Record<string, unknown>;
        error?: string;
      }
    >;
  }): Promise<FridayConfirmationResult> {
    const {
      workspaceId,
      referenceDate = new Date(),
      escalasExistentes,
      colaboradores = [],
      config = {},
      telegramStatusConfirmedMap = {},
    } = params;

    const weekend = getNextWeekendDates(referenceDate);
    const simulada = config.simulacao_modo ?? true;

    // Filtra apenas escalas do sábado e domingo que possuem colaborador atribuído
    const slotsWeekend = escalasExistentes.filter(
      (s) =>
        (s.data === weekend.sabado || s.data === weekend.domingo) &&
        Boolean(s.colaboradorId) &&
        s.status !== "cancelada"
    );

    if (slotsWeekend.length === 0) {
      return {
        sucesso: true,
        idempotente: false,
        mensagem: "Nenhum colaborador escalado para o próximo fim de semana. Nenhuma confirmação necessária.",
        folguistasParaConfirmar: [],
        simulada,
        logsCriados: [],
      };
    }

    const folguistasParaConfirmar: FridayConfirmationResult["folguistasParaConfirmar"] = [];
    const logsCriados: string[] = [];

    for (const slot of slotsWeekend) {
      const colab = colaboradores.find((c) => c.id === slot.colaboradorId);
      const colabNome = colab?.nome || slot.colaboradorNome || "Folguista";
      const diaExtenso = slot.data === weekend.sabado ? "Sábado" : "Domingo";
      const infoTurno = TURNOS_PADRAO[slot.turno] || {
        inicio: slot.horarioInicio || "05:00",
        fim: slot.horarioFim || "14:30",
        descricao: slot.turno,
      };

      const textoMsg = this.buildFridayConfirmationMessage({
        colaboradorNome: colabNome,
        data: slot.data,
        diaSemanaExtenso: diaExtenso,
        horarioInicio: infoTurno.inicio,
        horarioFim: infoTurno.fim,
        descricaoTurno: infoTurno.descricao,
      });

      const idempotencyKey = `confirmacao_sexta_ws_${workspaceId}_${slot.data}_${slot.turno}_${slot.colaboradorId}`;
      const confStatus = telegramStatusConfirmedMap[slot.colaboradorId || ""];
      const statusEnvio: TelegramEnvioStatus = simulada
        ? "simulada"
        : confStatus?.sent
        ? "enviada"
        : confStatus?.error
        ? "falha"
        : "preparada";
      const enviadoTelegram = Boolean(!simulada && confStatus?.sent);

      const { data: inserted } = await supabase
        .from("escalas_automacoes_log")
        .upsert({
          workspace_id: workspaceId,
          tipo_rotina: "confirmacao_sexta",
          idempotency_key: idempotencyKey,
          data_fim_semana_inicio: weekend.sabado,
          data_fim_semana_fim: weekend.domingo,
          status: simulada ? "simulada" : (confStatus?.error ? "erro" : "executada"),
          status_envio: statusEnvio,
          telegram_message_id: confStatus?.messageId || null,
          api_response: confStatus?.apiResponse || {},
          erro_detalhes: confStatus?.error || null,
          erro_mensagem: confStatus?.error || null,
          destinatario_tipo: "individual",
          destinatario_id: slot.colaboradorId,
          destinatario_nome: colabNome,
          mensagem_texto: textoMsg,
          vagas_identificadas: [
            {
              data: slot.data,
              diaSemana: slot.data === weekend.sabado ? "sabado" : "domingo",
              turno: slot.turno,
              horario: `${infoTurno.inicio} às ${infoTurno.fim}`,
            },
          ],
          enviado_telegram: enviadoTelegram,
        }, { onConflict: "idempotency_key" })
        .select("id")
        .single();

      if (inserted?.id) {
        logsCriados.push(inserted.id);
      }

      folguistasParaConfirmar.push({
        colaboradorId: slot.colaboradorId!,
        colaboradorNome: colabNome,
        data: slot.data,
        diaSemana: diaExtenso,
        turno: slot.turno,
        horario: `${infoTurno.inicio} às ${infoTurno.fim}`,
        mensagemEnviada: textoMsg,
      });
    }

    return {
      sucesso: true,
      idempotente: false,
      mensagem: `${folguistasParaConfirmar.length} solicitações de reconfirmação preparadas para sexta-feira. Silêncio NUNCA significa confirmação.`,
      folguistasParaConfirmar,
      simulada,
      logsCriados,
    };
  }

  /**
   * Simulação Pura de Resposta de Folguista (Gate 3 - Isolamento Total)
   * NUNCA grava em folguistas_disponibilidade, colaborador_escalas ou tabelas operacionais.
   * Apenas avalia em memória e projeta as ações que seriam executadas.
   */
  static simulateFolguistaResponse(params: {
    colaboradorId: string;
    colaboradorNome: string;
    rawText: string;
    isFridayContext?: boolean;
    weekend: WeekendDates;
  }): SimulacaoRespostaFolguistaResult {
    const { colaboradorId, colaboradorNome, rawText, isFridayContext = false, weekend } = params;

    const parsed = parseFolguistaMessage(rawText, {
      colaboradorId,
      colaboradorNome,
      isFridayConfirmationContext: isFridayContext,
    });

    const acoesPropostas: AcaoPropostaSimulada[] = [];

    if (parsed.tipoMensagem === "desistencia") {
      acoesPropostas.push({
        tipo: "desistencia",
        data: parsed.dias.sabado.desistencia ? weekend.sabado : weekend.domingo,
        turno: "qualquer",
        descricao: "Desistência comunicada por imprevisto",
        detalhes: `Liberar vaga de ${colaboradorNome} e iniciar busca automática por substituto elegível.`,
      });
    } else if (parsed.tipoMensagem === "confirmacao_presenca") {
      acoesPropostas.push({
        tipo: "confirmacao",
        data: parsed.dias.sabado.confirmado ? weekend.sabado : weekend.domingo,
        turno: "qualquer",
        descricao: "Confirmação explícita de presença",
        detalhes: `Status do turno de ${colaboradorNome} passaria para 'confirmado' na escala oficial.`,
      });
    } else if (parsed.disponibilidadeGeral === "indisponivel") {
      acoesPropostas.push({
        tipo: "indisponibilidade",
        data: weekend.sabado,
        turno: "qualquer",
        descricao: "Indisponibilidade comunicada",
        detalhes: `${colaboradorNome} não poderá cobrir turnos neste fim de semana (${weekend.sabadoFormatado} e ${weekend.domingoFormatado}).`,
      });
    } else if (parsed.dias.sabado.disponivel || parsed.dias.domingo.disponivel || parsed.disponibilidadeGeral === "disponivel") {
      if (parsed.dias.sabado.disponivel) {
        const turnosSab = parsed.dias.sabado.turnos.length > 0 ? parsed.dias.sabado.turnos : ["qualquer" as TurnoId];
        for (const t of turnosSab) {
          acoesPropostas.push({
            tipo: "disponibilidade",
            data: weekend.sabado,
            turno: t,
            descricao: `Disponível para Sábado (${t})`,
            detalhes: `Registraria disponibilidade de ${colaboradorNome} para Sábado (${weekend.sabadoFormatado}) no turno ${t}.`,
          });
        }
      }
      if (parsed.dias.domingo.disponivel) {
        const turnosDom = parsed.dias.domingo.turnos.length > 0 ? parsed.dias.domingo.turnos : ["qualquer" as TurnoId];
        for (const t of turnosDom) {
          acoesPropostas.push({
            tipo: "disponibilidade",
            data: weekend.domingo,
            turno: t,
            descricao: `Disponível para Domingo (${t})`,
            detalhes: `Registraria disponibilidade de ${colaboradorNome} para Domingo (${weekend.domingoFormatado}) no turno ${t}.`,
          });
        }
      }
      if (acoesPropostas.length === 0) {
        acoesPropostas.push({
          tipo: "disponibilidade",
          data: weekend.sabado,
          turno: "qualquer",
          descricao: "Disponível para o fim de semana",
          detalhes: `Disponibilidade ampla registrada para ${colaboradorNome}.`,
        });
      }
    } else if (parsed.precisaClarificacao) {
      acoesPropostas.push({
        tipo: "ambigua",
        data: weekend.sabado,
        turno: "qualquer",
        descricao: "Mensagem requer esclarecimento",
        detalhes: parsed.perguntaClarificacao || "Perguntar se prefere turno da manhã (05h) ou noite.",
      });
    }

    return {
      sucesso: true,
      simulada: true,
      colaboradorId,
      colaboradorNome,
      textoOriginal: rawText,
      interpretacao: parsed,
      acoesPropostas,
      resumoAcao: acoesPropostas.map((a) => a.descricao).join(" | ") || "Nenhuma alteração simulada.",
    };
  }

  /**
   * Aplicação Real Autorizada de Resposta de Folguista (Gate 3)
   * Executa a gravação em folguistas_disponibilidade e atualiza status de confirmação.
   */
  static async applyRealFolguistaResponse(params: {
    workspaceId: string;
    colaboradorId: string;
    colaboradorNome?: string;
    rawText: string;
    isFridayContext?: boolean;
    weekend: WeekendDates;
    origem?: "telegram" | "manual" | "whatsapp";
  }): Promise<{ sucesso: boolean; mensagem: string; logsGravados: number }> {
    const {
      workspaceId,
      colaboradorId,
      colaboradorNome = "Folguista",
      rawText,
      isFridayContext = false,
      weekend,
      origem = "manual",
    } = params;

    const parsed = parseFolguistaMessage(rawText, {
      colaboradorId,
      colaboradorNome,
      isFridayConfirmationContext: isFridayContext,
    });

    let logsGravados = 0;

    if (parsed.disponibilidadeGeral === "disponivel" || parsed.dias.sabado.disponivel || parsed.dias.domingo.disponivel) {
      const turnosSab = parsed.dias.sabado.turnos.length > 0 ? parsed.dias.sabado.turnos : ["qualquer" as TurnoId];
      for (const t of turnosSab) {
        const { error } = await supabase
          .from("folguistas_disponibilidade")
          .upsert(
            {
              workspace_id: workspaceId,
              colaborador_id: colaboradorId,
              data_referencia: weekend.sabado,
              turno: t,
              disponivel: true,
              confirmado: parsed.tipoMensagem === "confirmacao_presenca",
              origem,
              resposta_raw: rawText,
            },
            { onConflict: "colaborador_id,data_referencia,turno" }
          );
        if (!error) logsGravados += 1;
      }

      const turnosDom = parsed.dias.domingo.turnos.length > 0 ? parsed.dias.domingo.turnos : ["qualquer" as TurnoId];
      for (const t of turnosDom) {
        const { error } = await supabase
          .from("folguistas_disponibilidade")
          .upsert(
            {
              workspace_id: workspaceId,
              colaborador_id: colaboradorId,
              data_referencia: weekend.domingo,
              turno: t,
              disponivel: true,
              confirmado: parsed.tipoMensagem === "confirmacao_presenca",
              origem,
              resposta_raw: rawText,
            },
            { onConflict: "colaborador_id,data_referencia,turno" }
          );
        if (!error) logsGravados += 1;
      }
    } else if (parsed.disponibilidadeGeral === "indisponivel") {
      const { error: errSab } = await supabase
        .from("folguistas_disponibilidade")
        .upsert(
          {
            workspace_id: workspaceId,
            colaborador_id: colaboradorId,
            data_referencia: weekend.sabado,
            turno: "qualquer",
            disponivel: false,
            confirmado: false,
            origem,
            resposta_raw: rawText,
          },
          { onConflict: "colaborador_id,data_referencia,turno" }
        );
      const { error: errDom } = await supabase
        .from("folguistas_disponibilidade")
        .upsert(
          {
            workspace_id: workspaceId,
            colaborador_id: colaboradorId,
            data_referencia: weekend.domingo,
            turno: "qualquer",
            disponivel: false,
            confirmado: false,
            origem,
            resposta_raw: rawText,
          },
          { onConflict: "colaborador_id,data_referencia,turno" }
        );
      if (!errSab) logsGravados += 1;
      if (!errDom) logsGravados += 1;
    }

    return {
      sucesso: true,
      mensagem: `Resposta real de ${colaboradorNome} processada e gravada com sucesso (${logsGravados} registros).`,
      logsGravados,
    };
  }

  /**
   * Busca Inteligente de Substitutos para Turno em Aberto ou Desistência (Gate 4 & Gate 6)
   */
  static findSubstitutesForSlot(options: SubstituteSearchOptions): FolguistaSubstitutionCandidate[] {
    const {
      data,
      turno,
      desistenteId,
      escalasExistentes = [],
      folguistas = [],
      disponibilidades = [],
      fridayNightColaboradorId,
      mondayMorningColaboradorId,
    } = options;

    const candidatos: FolguistaSubstitutionCandidate[] = [];

    // Filtra folguistas ativos que não sejam o desistente
    const pool = folguistas.filter(
      (f) =>
        f.id !== desistenteId &&
        f.status === "ativo" &&
        (f.tipo === "folguista" || (f.cargo && f.cargo.toLowerCase().includes("folguist")))
    );

    const isDomingoNoite = turno === "noite";

    for (const folguista of pool) {
      let pontuacao = 100;
      const motivoPontuacao: string[] = [];
      const restricoes: string[] = [];
      let atendeDescanso = true;

      // 1. Verifica disponibilidade declarada em folguistas_disponibilidade
      const disp = disponibilidades.find(
        (d) =>
          d.colaborador_id === folguista.id &&
          d.data_referencia === data &&
          (d.turno === turno || d.turno === "qualquer")
      );

      if (disp && disp.disponivel) {
        pontuacao += 50;
        motivoPontuacao.push("Disponibilidade confirmada para a data e turno (+50)");
      } else if (disp && !disp.disponivel) {
        // Declarou indisponibilidade
        pontuacao -= 80;
        restricoes.push("Informou indisponibilidade para este período");
      }

      // 2. Verifica se já está escalado no mesmo dia em outro turno incompatível
      const escaladoNoMesmoDia = escalasExistentes.some(
        (s) => s.data === data && s.colaboradorId === folguista.id && s.status !== "cancelada"
      );
      if (escaladoNoMesmoDia) {
        pontuacao -= 100;
        atendeDescanso = false;
        restricoes.push("Já possui turno atribuído nesta mesma data (sobreposição)");
      }

      // 3. Regra Específica 1: Sexta à noite (23h30) NÃO pode abrir sábado (05h00)
      if (turno === "manha") {
        const violacaoSexta = validateFridayToSaturdayMorning(
          fridayNightColaboradorId,
          folguista.id,
          folguista.nome
        );
        if (violacaoSexta) {
          atendeDescanso = false;
          pontuacao -= 200;
          restricoes.push("Fechou na sexta às 23h30 e não cumpre descanso de 11h para abrir sábado às 05h00");
        }
      }

      // 4. Regra Específica 2: Suellen domingo à noite não pode abrir segunda às 05h00
      if (isDomingoNoite) {
        const violacaoSuellen = validateSuellenSundayNight(
          folguista.id,
          folguista.id, // Se for ela
          folguista.nome
        );
        if (violacaoSuellen && mondayMorningColaboradorId === folguista.id) {
          atendeDescanso = false;
          pontuacao -= 200;
          restricoes.push("Suellen escala segunda às 05h00 e não pode fechar domingo à noite");
        }
      }

      // 5. Preferências de turno cadastradas no perfil
      if (folguista.turnos_preferidos && folguista.turnos_preferidos.includes(turno)) {
        pontuacao += 20;
        motivoPontuacao.push(`Turno ${turno} é o horário preferencial do colaborador (+20)`);
      }

      // 6. Nota de avaliação (1 a 5)
      const nota = folguista.avaliacao_nota || 5.0;
      pontuacao += Math.round(nota * 5);
      motivoPontuacao.push(`Avaliação de desempenho: ${nota.toFixed(1)}/5.0`);

      // 7. Equilíbrio de escalas recentes (favorece quem trabalhou menos)
      const totalEscalasRecentes = escalasExistentes.filter(
        (s) => s.colaboradorId === folguista.id && s.status !== "cancelada"
      ).length;
      if (totalEscalasRecentes === 0) {
        pontuacao += 15;
        motivoPontuacao.push("Sem escalas recentes: distribuição equilibrada (+15)");
      } else {
        pontuacao -= totalEscalasRecentes * 5;
        motivoPontuacao.push(`${totalEscalasRecentes} turno(s) já atribuído(s) recentemente (-${totalEscalasRecentes * 5})`);
      }

      candidatos.push({
        colaborador: folguista,
        pontuacao: Math.max(0, pontuacao),
        motivoPontuacao,
        atendeDescansoClt: atendeDescanso,
        restricoes,
        recomendado: atendeDescanso && pontuacao >= 70,
      });
    }

    // Ordena do mais recomendado para o menos recomendado
    return candidatos.sort((a, b) => b.pontuacao - a.pontuacao);
  }
}
