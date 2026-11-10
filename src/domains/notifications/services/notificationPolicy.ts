import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserNotificationPreference,
} from "../types";

export const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  informativa: 0,
  normal: 1,
  importante: 2,
  critica: 3,
};

/**
 * Retorna true se a prioridade do evento satisfaz ou supera a prioridade mínima configurada.
 */
export function checkPrioritySufficient(
  eventPriority: NotificationPriority,
  minPriority: NotificationPriority
): boolean {
  const eventWeight = PRIORITY_WEIGHTS[eventPriority] ?? 1;
  const minWeight = PRIORITY_WEIGHTS[minPriority] ?? 1;
  return eventWeight >= minWeight;
}

/**
 * Verifica se um determinado horário (HH:MM) se encontra dentro da janela de silêncio.
 * Suporta intervalos que cruzam a meia-noite (ex: das 22:00 às 07:00).
 */
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
    // Cruza a meia-noite (ex: 22:00 até 07:00)
    return currentMin >= startMin || currentMin < endMin;
  } else {
    // Mesmo dia (ex: 13:00 até 14:00)
    return currentMin >= startMin && currentMin < endMin;
  }
}

/**
 * Obtém a hora atual formatada em HH:MM no fuso horário especificado.
 */
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
    // Fallback para UTC caso fuso seja inválido
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

/**
 * Avalia se uma notificação deve ser entregue em um canal específico para um usuário,
 * considerando:
 * 1. Regra de ouro da segregação do CEO (apenas proprietário)
 * 2. Permissão do gestor (autorizado = true)
 * 3. Preferência individual do usuário (habilitado = true)
 * 4. Ponderação de prioridade (prioridade >= prioridade_minima)
 * 5. Janela de silêncio (quiet hours), com exceção para prioridade 'critica'
 */
export function evaluateChannelDelivery(params: {
  channel: NotificationChannel;
  category: NotificationCategory;
  eventPriority: NotificationPriority;
  preference?: Partial<UserNotificationPreference> | null;
  isOwner: boolean;
  currentTimeHHMM?: string;
}): EvaluationResult {
  const { channel, category, eventPriority, preference, isOwner, currentTimeHHMM } = params;

  // 1. Blindagem do CEO: apenas o proprietário do workspace pode receber alertas de CEO
  if (category === "ceo_executivo" && !isOwner) {
    return {
      shouldDeliver: false,
      reason: "Categoria executiva restrita exclusivamente ao proprietário do workspace.",
    };
  }

  // 2. Se há registro de preferência explícito no banco de dados
  if (preference) {
    // a) Permissão concedida pelo gestor/proprietário
    if (preference.autorizado === false) {
      return {
        shouldDeliver: false,
        reason: "Canal bloqueado pelas permissões concedidas pelo gestor.",
      };
    }

    // b) Preferência pessoal do usuário
    if (preference.habilitado === false) {
      return {
        shouldDeliver: false,
        reason: "Canal desativado nas preferências pessoais do usuário.",
      };
    }

    // c) Nível mínimo de prioridade configurado
    if (
      preference.prioridade_minima &&
      !checkPrioritySufficient(eventPriority, preference.prioridade_minima)
    ) {
      return {
        shouldDeliver: false,
        reason: `Prioridade '${eventPriority}' inferior à mínima exigida '${preference.prioridade_minima}'.`,
      };
    }

    // d) Janela de silêncio (quiet hours)
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

      // Durante o horário de silêncio:
      // O app sempre recebe para alimentar a bandeja in-app (sem som/notificação externa)
      if (channel === "app") {
        return {
          shouldDeliver: true,
          reason: "Notificação gravada na central in-app silenciosamente.",
          suppressedByQuietHours: true,
        };
      }

      // Canais intrusivos (push, telegram, whatsapp) são suprimidos
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

  // 3. Fallback seguro quando não há preferência prévia cadastrada
  if (category === "ceo_executivo" && isOwner) {
    return {
      shouldDeliver: channel === "app" || channel === "push",
      reason: "Preferência padrão para proprietário em inteligência CEO.",
    };
  }

  // Para outras categorias, canais 'app' e 'push' são permitidos por padrão;
  // Canais externos como Telegram e WhatsApp requerem cadastro/configuração explícita.
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
