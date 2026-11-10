export type NotificationCategory =
  | "financeiro"
  | "fechamento_caixa"
  | "boletos"
  | "operacional"
  | "estoque_nfe"
  | "ceo_executivo"
  | "seguranca";

export type NotificationChannel = "app" | "push" | "telegram" | "whatsapp";

export type NotificationPriority = "informativa" | "normal" | "importante" | "critica";

export interface UserNotificationPreferenceData {
  id?: string;
  workspace_id?: string;
  user_id?: string;
  categoria?: NotificationCategory;
  canal?: NotificationChannel;
  habilitado?: boolean;
  autorizado?: boolean;
  prioridade_minima?: NotificationPriority;
  horario_silencio_inicio?: string | null;
  horario_silencio_fim?: string | null;
  fuso_horario?: string | null;
}

export const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  informativa: 0,
  normal: 1,
  importante: 2,
  critica: 3,
};

export function checkPrioritySufficient(
  eventPriority: NotificationPriority,
  minPriority: NotificationPriority
): boolean {
  const eventWeight = PRIORITY_WEIGHTS[eventPriority] ?? 1;
  const minWeight = PRIORITY_WEIGHTS[minPriority] ?? 1;
  return eventWeight >= minWeight;
}

export function isWithinQuietHours(
  currentTimeHHMM: string,
  startHHMM?: string | null,
  endHHMM?: string | null
): boolean {
  if (!startHHMM || !endHHMM || !currentTimeHHMM) return false;

  const toMinutes = (timeStr: string): number => {
    const parts = timeStr.trim().split(":");
    if (parts.length < 2) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return (isNaN(hours) ? 0 : hours) * 60 + (isNaN(minutes) ? 0 : minutes);
  };

  const currentMin = toMinutes(currentTimeHHMM);
  const startMin = toMinutes(startHHMM);
  const endMin = toMinutes(endHHMM);

  if (startMin === endMin) return false;

  if (startMin > endMin) {
    return currentMin >= startMin || currentMin < endMin;
  } else {
    return currentMin >= startMin && currentMin < endMin;
  }
}

export function getCurrentTimeInTimezone(timeZone = "America/Sao_Paulo", date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(date);
  } catch {
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}

export interface EvaluationResult {
  shouldDeliver: boolean;
  reason: string;
  suppressedByQuietHours?: boolean;
}

export function evaluateChannelDelivery(params: {
  channel: NotificationChannel;
  category: NotificationCategory;
  eventPriority: NotificationPriority;
  preference?: UserNotificationPreferenceData | null;
  isOwner: boolean;
  currentTimeHHMM?: string;
}): EvaluationResult {
  const { channel, category, eventPriority, preference, isOwner, currentTimeHHMM } = params;

  if (category === "ceo_executivo" && !isOwner) {
    return {
      shouldDeliver: false,
      reason: "Categoria executiva restrita exclusivamente ao proprietário do workspace.",
    };
  }

  if (preference) {
    if (preference.autorizado === false) {
      return {
        shouldDeliver: false,
        reason: "Canal bloqueado pelas permissões concedidas pelo gestor.",
      };
    }

    if (preference.habilitado === false) {
      return {
        shouldDeliver: false,
        reason: "Canal desativado nas preferências pessoais do usuário.",
      };
    }

    if (
      preference.prioridade_minima &&
      !checkPrioritySufficient(eventPriority, preference.prioridade_minima)
    ) {
      return {
        shouldDeliver: false,
        reason: `Prioridade '${eventPriority}' inferior à mínima exigida '${preference.prioridade_minima}'.`,
      };
    }

    const effectiveTime =
      currentTimeHHMM ||
      getCurrentTimeInTimezone(preference.fuso_horario || "America/Sao_Paulo");

    const inQuietHours = isWithinQuietHours(
      effectiveTime,
      preference.horario_silencio_inicio,
      preference.horario_silencio_fim
    );

    if (inQuietHours) {
      if (eventPriority === "critica") {
        return {
          shouldDeliver: true,
          reason: "Alerta com prioridade crítica fura a janela de silêncio.",
        };
      }

      if (channel === "app") {
        return {
          shouldDeliver: true,
          reason: "Notificação gravada na central in-app silenciosamente.",
          suppressedByQuietHours: true,
        };
      }

      return {
        shouldDeliver: false,
        reason: "Canal suprimido durante a janela de horário de silêncio (Quiet Hours).",
        suppressedByQuietHours: true,
      };
    }

    return {
      shouldDeliver: true,
      reason: "Preferência e permissão validadas com sucesso.",
    };
  }

  if (category === "ceo_executivo" && isOwner) {
    return {
      shouldDeliver: channel === "app" || channel === "push",
      reason: "Preferência padrão para proprietário em inteligência CEO.",
    };
  }

  if (channel === "app" || channel === "push") {
    return {
      shouldDeliver: true,
      reason: "Entrega padrão inicial autorizada.",
    };
  }

  return {
    shouldDeliver: false,
    reason: `Canal '${channel}' requer ativação e vinculação prévia.`,
  };
}
