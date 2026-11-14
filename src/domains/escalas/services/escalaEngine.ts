import type {
  ColaboradorFolguista,
  DisponibilidadeFolguista,
  EscalasConfig,
  EscalaSlot,
  EscalaValidationIssue,
  ScheduleGenerationResult,
  TurnoId,
} from "../types";
import { TURNOS_PADRAO } from "../types";

/**
 * Converte data e hora (YYYY-MM-DD + HH:mm) em timestamp epoch em milissegundos
 */
export function parseDateTimeToEpoch(dateStr: string, timeStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return d.getTime();
}

/**
 * Calcula a quantidade de horas de descanso entre o término do turno anterior e o início do próximo
 */
export function calculateRestHours(
  prevDate: string,
  prevEndTime: string,
  nextDate: string,
  nextStartTime: string,
): number {
  const prevEpoch = parseDateTimeToEpoch(prevDate, prevEndTime);
  const nextEpoch = parseDateTimeToEpoch(nextDate, nextStartTime);
  const diffMs = nextEpoch - prevEpoch;
  return diffMs / (1000 * 60 * 60);
}

/**
 * Validação CLT de interjornada (mínimo 11 horas de descanso)
 */
export function validateInterjornada(
  prevDate: string,
  prevEndTime: string,
  nextDate: string,
  nextStartTime: string,
  minHours = 11,
): { valid: boolean; diffHours: number; message?: string } {
  const diffHours = calculateRestHours(prevDate, prevEndTime, nextDate, nextStartTime);
  if (diffHours < 0) {
    return {
      valid: false,
      diffHours,
      message: `Conflito de horários: o próximo turno inicia antes do término do turno anterior.`,
    };
  }
  if (diffHours < minHours) {
    return {
      valid: false,
      diffHours,
      message: `Violação de descanso interjornada: apenas ${diffHours.toFixed(1)}h entre turnos (mínimo legal: ${minHours}h).`,
    };
  }
  return { valid: true, diffHours };
}

/**
 * Regra Específica 1: Quem fecha na sexta (23h30) NÃO pode abrir no sábado (05h00)
 */
export function validateFridayToSaturdayMorning(
  fridayNightColaboradorId?: string | null,
  saturdayMorningColaboradorId?: string | null,
  colaboradorNome?: string,
): EscalaValidationIssue | null {
  if (
    fridayNightColaboradorId &&
    saturdayMorningColaboradorId &&
    fridayNightColaboradorId === saturdayMorningColaboradorId
  ) {
    return {
      tipo: "violacao_descanso",
      severidade: "erro",
      data: "sabado",
      turno: "manha",
      colaboradorId: fridayNightColaboradorId,
      colaboradorNome,
      mensagem: `Regra de Descanso: ${colaboradorNome || "Colaborador"} fecha na sexta (23h30) e não pode abrir no sábado (05h00). Descanso de apenas 5h30 viola o intervalo mínimo legal de 11h.`,
    };
  }
  return null;
}

/**
 * Regra Específica 2: Suellen no domingo à noite (até 23h30) NÃO pode abrir na segunda (05h00)
 */
export function validateSuellenSundayNight(
  sundayNightColaboradorId?: string | null,
  suellenId?: string | null,
  suellenNome = "Suellen",
): EscalaValidationIssue | null {
  if (sundayNightColaboradorId && suellenId && sundayNightColaboradorId === suellenId) {
    return {
      tipo: "violacao_descanso",
      severidade: "erro",
      data: "domingo",
      turno: "noite",
      colaboradorId: suellenId,
      colaboradorNome: suellenNome,
      mensagem: `Regra de Descanso: ${suellenNome} possui turno regular na segunda-feira às 05h00 e não pode realizar o turno da noite no domingo (encerra às 23h30), pois o descanso seria de apenas 5h30.`,
    };
  }
  return null;
}

/**
 * Validação completa de uma lista de slots agendados
 */
export function validateFullSchedule(
  slots: EscalaSlot[],
  colaboradores: ColaboradorFolguista[],
  disponibilidades: DisponibilidadeFolguista[],
  minRestHours = 11,
): EscalaValidationIssue[] {
  const issues: EscalaValidationIssue[] = [];
  const colabMap = new Map<string, ColaboradorFolguista>(colaboradores.map((c) => [c.id, c]));

  // 1. Checa turnos descobertos
  for (const slot of slots) {
    if (!slot.colaboradorId) {
      issues.push({
        tipo: "turno_descoberto",
        severidade: "erro",
        data: slot.data,
        turno: slot.turno,
        mensagem: `Turno descoberto: ${slot.diaSemana.toUpperCase()} (${slot.turno}) das ${slot.horarioInicio} às ${slot.horarioFim} está sem profissional alocado.`,
      });
    }
  }

  // 2. Checa duplo turno no mesmo dia
  const dayColabCounts = new Map<string, EscalaSlot[]>();
  for (const slot of slots) {
    if (!slot.colaboradorId) continue;
    const key = `${slot.data}:${slot.colaboradorId}`;
    const list = dayColabCounts.get(key) || [];
    list.push(slot);
    dayColabCounts.set(key, list);
  }

  for (const [, assignedSlots] of dayColabCounts.entries()) {
    if (assignedSlots.length > 1) {
      const colab = colabMap.get(assignedSlots[0].colaboradorId!);
      issues.push({
        tipo: "sobreposicao",
        severidade: "erro",
        data: assignedSlots[0].data,
        turno: assignedSlots[0].turno,
        colaboradorId: assignedSlots[0].colaboradorId!,
        colaboradorNome: colab?.nome,
        mensagem: `Sobrecarga / Duplo Turno: ${colab?.nome || "Colaborador"} foi alocado em ${assignedSlots.length} turnos no mesmo dia (${assignedSlots[0].data}).`,
      });
    }
  }

  // 3. Checa descanso entre turnos consecutivos do mesmo colaborador
  const colabSlots = new Map<string, EscalaSlot[]>();
  for (const slot of slots) {
    if (!slot.colaboradorId) continue;
    const list = colabSlots.get(slot.colaboradorId) || [];
    list.push(slot);
    colabSlots.set(slot.colaboradorId, list);
  }

  for (const [colabId, list] of colabSlots.entries()) {
    const colab = colabMap.get(colabId);
    // Ordena cronologicamente
    const sorted = [...list].sort(
      (a, b) =>
        parseDateTimeToEpoch(a.data, a.horarioInicio) -
        parseDateTimeToEpoch(b.data, b.horarioInicio),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const check = validateInterjornada(
        curr.data,
        curr.horarioFim,
        next.data,
        next.horarioInicio,
        minRestHours,
      );

      if (!check.valid) {
        issues.push({
          tipo: "violacao_descanso",
          severidade: "erro",
          data: next.data,
          turno: next.turno,
          colaboradorId: colabId,
          colaboradorNome: colab?.nome,
          mensagem: `Descanso insuficiente para ${colab?.nome || "Colaborador"}: ${check.diffHours.toFixed(1)}h entre o término em ${curr.data} ${curr.horarioFim} e o início em ${next.data} ${next.horarioInicio} (mínimo ${minRestHours}h).`,
        });
      }
    }
  }

  // 4. Checa disponibilidade prévia registrada
  for (const slot of slots) {
    if (!slot.colaboradorId) continue;
    const colab = colabMap.get(slot.colaboradorId);
    if (colab?.tipo === "folguista") {
      const disp = disponibilidades.find(
        (d) =>
          d.colaborador_id === slot.colaboradorId &&
          d.data_referencia === slot.data &&
          (d.turno === slot.turno || d.turno === "qualquer"),
      );

      if (disp && !disp.disponivel) {
        issues.push({
          tipo: "sem_disponibilidade",
          severidade: "erro",
          data: slot.data,
          turno: slot.turno,
          colaboradorId: slot.colaboradorId,
          colaboradorNome: colab.nome,
          mensagem: `Alocação com indisponibilidade: ${colab.nome} informou estar INDISPONÍVEL para o dia ${slot.data} (${slot.turno}).`,
        });
      } else if (!disp) {
        issues.push({
          tipo: "aviso",
          severidade: "alerta",
          data: slot.data,
          turno: slot.turno,
          colaboradorId: slot.colaboradorId,
          colaboradorNome: colab.nome,
          mensagem: `Disponibilidade pendente: ${colab.nome} ainda não confirmou disponibilidade para ${slot.data} (${slot.turno}).`,
        });
      }
    }
  }

  return issues;
}

/**
 * Motor de Geração Automática de Escalas para Fim de Semana
 */
export function generateWeekendSchedule(params: {
  targetWeekendDates: { sabado: string; domingo: string };
  colaboradores: ColaboradorFolguista[];
  disponibilidades: DisponibilidadeFolguista[];
  config: EscalasConfig;
  fridayNightColaboradorId?: string | null;
  suellenId?: string | null;
}): ScheduleGenerationResult {
  const {
    targetWeekendDates,
    colaboradores,
    disponibilidades,
    config,
    fridayNightColaboradorId,
    suellenId,
  } = params;

  const minRest = config.min_horas_descanso || 11;
  const turnosSabado = config.dias_semana_turnos?.sabado || ["manha", "intermediario", "noite"];
  const turnosDomingo = config.dias_semana_turnos?.domingo || ["manha", "intermediario", "noite"];

  const slots: EscalaSlot[] = [];
  const assignedColabPerDay = new Map<string, Set<string>>([
    [targetWeekendDates.sabado, new Set<string>()],
    [targetWeekendDates.domingo, new Set<string>()],
  ]);

  const shiftCountPerColab = new Map<string, number>();
  for (const c of colaboradores) {
    shiftCountPerColab.set(c.id, 0);
  }

  // Identifica folguistas ativos
  const activeFolguistas = colaboradores.filter(
    (c) => c.status === "ativo" && c.tipo === "folguista",
  );

  // Helper para verificar se colaborador pode assumir turno
  const canAssign = (
    colab: ColaboradorFolguista,
    date: string,
    diaSemana: "sabado" | "domingo",
    turno: TurnoId,
  ): { can: boolean; reason?: string } => {
    // 1. Já alocado no mesmo dia?
    const daySet = assignedColabPerDay.get(date);
    if (daySet?.has(colab.id)) {
      return { can: false, reason: "Já alocado no dia" };
    }

    // 2. Indisponibilidade explícita?
    const disp = disponibilidades.find(
      (d) =>
        d.colaborador_id === colab.id &&
        d.data_referencia === date &&
        (d.turno === turno || d.turno === "qualquer"),
    );
    if (disp && !disp.disponivel) {
      return { can: false, reason: "Declarou indisponibilidade" };
    }

    // 3. Regra Sexta Noite -> Sábado Manhã (11h)
    if (
      diaSemana === "sabado" &&
      turno === "manha" &&
      fridayNightColaboradorId &&
      colab.id === fridayNightColaboradorId
    ) {
      return { can: false, reason: "Fechou sexta-feira às 23h30 (descanso < 11h)" };
    }

    // 4. Regra Sábado Noite -> Domingo Manhã (11h)
    if (diaSemana === "domingo" && turno === "manha") {
      const satNightSlot = slots.find(
        (s) => s.data === targetWeekendDates.sabado && s.turno === "noite",
      );
      if (satNightSlot?.colaboradorId === colab.id) {
        return { can: false, reason: "Fechou sábado às 23h30 (descanso < 11h)" };
      }
    }

    // 5. Regra Suellen Domingo Noite -> Segunda Manhã (11h)
    if (
      diaSemana === "domingo" &&
      turno === "noite" &&
      suellenId &&
      colab.id === suellenId
    ) {
      return { can: false, reason: "Abre na segunda às 05h00 (descanso < 11h)" };
    }

    return { can: true };
  };

  // Helper para escolher melhor candidato equilibrando turnos
  const pickCandidate = (
    candidates: ColaboradorFolguista[],
    date: string,
    diaSemana: "sabado" | "domingo",
    turno: TurnoId,
  ): ColaboradorFolguista | null => {
    const eligible = candidates.filter((c) => canAssign(c, date, diaSemana, turno).can);
    if (eligible.length === 0) return null;

    // Ordena: 1º menor número de turnos atribuídos neste fim de semana, 2º tem preferência declarada, 3º melhor nota
    return eligible.sort((a, b) => {
      const countA = shiftCountPerColab.get(a.id) || 0;
      const countB = shiftCountPerColab.get(b.id) || 0;
      if (countA !== countB) return countA - countB;

      const prefA = a.turnos_preferidos?.includes(turno) ? 1 : 0;
      const prefB = b.turnos_preferidos?.includes(turno) ? 1 : 0;
      if (prefA !== prefB) return prefB - prefA;

      return (b.avaliacao_nota || 5) - (a.avaliacao_nota || 5);
    })[0];
  };

  // ── GERAÇÃO SÁBADO ──
  for (const turno of turnosSabado) {
    const info = TURNOS_PADRAO[turno] || { inicio: "08:00", fim: "16:00" };
    const customInfo = config.horarios_turnos?.[turno];
    const inicio = customInfo?.inicio || info.inicio;
    const fim = customInfo?.fim || info.fim;

    const chosen = pickCandidate(activeFolguistas, targetWeekendDates.sabado, "sabado", turno);
    if (chosen) {
      assignedColabPerDay.get(targetWeekendDates.sabado)?.add(chosen.id);
      shiftCountPerColab.set(chosen.id, (shiftCountPerColab.get(chosen.id) || 0) + 1);
    }

    slots.push({
      data: targetWeekendDates.sabado,
      diaSemana: "sabado",
      turno,
      horarioInicio: inicio,
      horarioFim: fim,
      colaboradorId: chosen?.id || null,
      colaboradorNome: chosen?.nome || null,
      colaboradorTipo: chosen?.tipo || null,
      valorDiaria: chosen?.valor_diaria || config.valor_diaria_padrao || 100,
      valorMeta: config.valor_meta_padrao || 20,
      status: chosen ? "programada" : "cancelada",
      observacao: chosen
        ? undefined
        : "Nenhum folguista disponível com descanso regulamentar",
    });
  }

  // ── GERAÇÃO DOMINGO ──
  for (const turno of turnosDomingo) {
    const info = TURNOS_PADRAO[turno] || { inicio: "08:00", fim: "16:00" };
    const customInfo = config.horarios_turnos?.[turno];
    const inicio = customInfo?.inicio || info.inicio;
    const fim = customInfo?.fim || info.fim;

    const chosen = pickCandidate(activeFolguistas, targetWeekendDates.domingo, "domingo", turno);
    if (chosen) {
      assignedColabPerDay.get(targetWeekendDates.domingo)?.add(chosen.id);
      shiftCountPerColab.set(chosen.id, (shiftCountPerColab.get(chosen.id) || 0) + 1);
    }

    slots.push({
      data: targetWeekendDates.domingo,
      diaSemana: "domingo",
      turno,
      horarioInicio: inicio,
      horarioFim: fim,
      colaboradorId: chosen?.id || null,
      colaboradorNome: chosen?.nome || null,
      colaboradorTipo: chosen?.tipo || null,
      valorDiaria: chosen?.valor_diaria || config.valor_diaria_padrao || 100,
      valorMeta: config.valor_meta_padrao || 20,
      status: chosen ? "programada" : "cancelada",
      observacao: chosen
        ? undefined
        : "Nenhum folguista disponível com descanso regulamentar",
    });
  }

  // Validação final e geração de avisos
  const violacoes = validateFullSchedule(slots, colaboradores, disponibilidades, minRest);
  const turnosDescobertosCount = slots.filter((s) => !s.colaboradorId).length;

  const sugestoes: string[] = [];
  if (turnosDescobertosCount > 0) {
    sugestoes.push(
      `Atenção: ${turnosDescobertosCount} turno(s) ficaram descobertos. Realize busca ativa com os folguistas no grupo de conversas.`,
    );
  } else {
    sugestoes.push("Escala completa gerada com 100% dos turnos cobertos e descanso regular.");
  }

  return {
    slots,
    turnosDescobertosCount,
    violacoes,
    sugestoes,
  };
}
