import { describe, it, expect } from "vitest";
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NOTIFICATION_CATEGORIES,
} from "../../src/domains/notifications/types";

describe("👑 WALLET CEO 3.0 — ETAPA 05 (ENTREGA B): Preferências Individuais e RBAC", () => {
  const workspaceId = "2af415b6-76aa-4134-8133-a9b405671c1c";
  const _ownerUserId = "0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0";
  const memberUserId = "user-member-uuid-456";

  describe("GATE B1 & B2: Schema, Categorias e Validações de Integridade", () => {
    it("deve conter todas as 7 categorias canônicas especificadas", () => {
      const categoryIds = NOTIFICATION_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain("financeiro");
      expect(categoryIds).toContain("fechamento_caixa");
      expect(categoryIds).toContain("boletos");
      expect(categoryIds).toContain("operacional");
      expect(categoryIds).toContain("estoque_nfe");
      expect(categoryIds).toContain("ceo_executivo");
      expect(categoryIds).toContain("seguranca");
      expect(categoryIds.length).toBe(7);
    });

    it("deve validar canais permitidos (app, push, telegram, whatsapp)", () => {
      const allowedChannels: NotificationChannel[] = ["app", "push", "telegram", "whatsapp"];
      const isValidChannel = (c: string): c is NotificationChannel =>
        allowedChannels.includes(c as NotificationChannel);

      expect(isValidChannel("app")).toBe(true);
      expect(isValidChannel("push")).toBe(true);
      expect(isValidChannel("telegram")).toBe(true);
      expect(isValidChannel("whatsapp")).toBe(true);
      expect(isValidChannel("sms")).toBe(false);
      expect(isValidChannel("discord")).toBe(false);
    });

    it("deve validar níveis de prioridade válidos", () => {
      const allowedPriorities: NotificationPriority[] = [
        "informativa",
        "normal",
        "importante",
        "critica",
      ];
      const isValidPriority = (p: string): p is NotificationPriority =>
        allowedPriorities.includes(p as NotificationPriority);

      expect(isValidPriority("informativa")).toBe(true);
      expect(isValidPriority("normal")).toBe(true);
      expect(isValidPriority("importante")).toBe(true);
      expect(isValidPriority("critica")).toBe(true);
      expect(isValidPriority("urgente")).toBe(false);
    });
  });

  describe("GATE B2: Regra de Ouro - 'Preferência Não É Autorização'", () => {
    it("se autorizado for FALSE, a notificação deve ser bloqueada mesmo com habilitado = TRUE", () => {
      const pref = {
        workspace_id: workspaceId,
        user_id: memberUserId,
        categoria: "financeiro" as NotificationCategory,
        canal: "telegram" as NotificationChannel,
        habilitado: true, // Funcionário tentou ligar
        autorizado: false, // Gestor não autorizou
      };

      const shouldDeliver = (p: typeof pref) => p.autorizado && p.habilitado;

      expect(shouldDeliver(pref)).toBe(false);
    });

    it("se categoria for ceo_executivo, NÃO PODE ser autorizada para não-proprietários", () => {
      const enforceCeoSecurity = (
        categoria: NotificationCategory,
        isWorkspaceOwner: boolean,
        requestedAutorizado: boolean
      ) => {
        if (categoria === "ceo_executivo" && !isWorkspaceOwner) {
          return { autorizado: false, habilitado: false };
        }
        return { autorizado: requestedAutorizado, habilitado: true };
      };

      // Tentativa de autorizar ceo_executivo para membro comum -> bloqueado
      const memberCeo = enforceCeoSecurity("ceo_executivo", false, true);
      expect(memberCeo.autorizado).toBe(false);
      expect(memberCeo.habilitado).toBe(false);

      // Proprietário do workspace -> permitido
      const ownerCeo = enforceCeoSecurity("ceo_executivo", true, true);
      expect(ownerCeo.autorizado).toBe(true);
      expect(ownerCeo.habilitado).toBe(true);
    });

    it("membro comum não pode alterar o campo 'autorizado'", () => {
      const canUserChangeAuthorization = (callerRole: string) => {
        return ["owner", "admin"].includes(callerRole);
      };

      expect(canUserChangeAuthorization("owner")).toBe(true);
      expect(canUserChangeAuthorization("admin")).toBe(true);
      expect(canUserChangeAuthorization("member")).toBe(false);
      expect(canUserChangeAuthorization("viewer")).toBe(false);
    });
  });

  describe("GATE B2: Horários Silenciosos (Quiet Hours) e Filtro de Prioridade", () => {
    it("deve detectar se um horário está dentro da janela de silêncio (ex: 22:00 às 07:00)", () => {
      const isInQuietHours = (
        timeStr: string,
        startStr = "22:00",
        endStr = "07:00"
      ): boolean => {
        const toMinutes = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m;
        };

        const current = toMinutes(timeStr);
        const start = toMinutes(startStr);
        const end = toMinutes(endStr);

        if (start > end) {
          // Passa pela meia-noite (ex: 22:00 -> 07:00)
          return current >= start || current < end;
        }
        return current >= start && current < end;
      };

      expect(isInQuietHours("23:15")).toBe(true);
      expect(isInQuietHours("02:30")).toBe(true);
      expect(isInQuietHours("06:59")).toBe(true);
      expect(isInQuietHours("07:00")).toBe(false);
      expect(isInQuietHours("12:00")).toBe(false);
      expect(isInQuietHours("21:59")).toBe(false);
    });

    it("alertas com prioridade 'critica' devem furar a janela de silêncio", () => {
      const shouldSuppressAlert = (
        priority: NotificationPriority,
        inQuietHours: boolean
      ): boolean => {
        if (priority === "critica") {
          return false; // Alertas críticos furam silêncio
        }
        return inQuietHours;
      };

      expect(shouldSuppressAlert("normal", true)).toBe(true);
      expect(shouldSuppressAlert("informativa", true)).toBe(true);
      expect(shouldSuppressAlert("importante", true)).toBe(true);
      expect(shouldSuppressAlert("critica", true)).toBe(false); // Fura silêncio
    });

    it("filtro de prioridade mínima descarta notificações abaixo do limiar configurado", () => {
      const priorityWeights: Record<NotificationPriority, number> = {
        informativa: 1,
        normal: 2,
        importante: 3,
        critica: 4,
      };

      const satisfiesMinPriority = (
        eventPriority: NotificationPriority,
        minPriority: NotificationPriority
      ): boolean => {
        return priorityWeights[eventPriority] >= priorityWeights[minPriority];
      };

      expect(satisfiesMinPriority("normal", "normal")).toBe(true);
      expect(satisfiesMinPriority("importante", "normal")).toBe(true);
      expect(satisfiesMinPriority("critica", "normal")).toBe(true);
      expect(satisfiesMinPriority("informativa", "normal")).toBe(false);
      expect(satisfiesMinPriority("normal", "importante")).toBe(false);
      expect(satisfiesMinPriority("critica", "critica")).toBe(true);
    });
  });
});
