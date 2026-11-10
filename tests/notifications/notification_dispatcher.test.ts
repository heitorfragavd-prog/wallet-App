import { describe, it, expect, vi } from "vitest";
import {
  checkPrioritySufficient,
  isWithinQuietHours,
  evaluateChannelDelivery,
  PRIORITY_WEIGHTS,
} from "../../src/domains/notifications/services/notificationPolicy";
import { NotificationDispatcherService } from "../../src/domains/notifications/services/NotificationDispatcherService";
import { supabase } from "../../src/integrations/supabase/client";

vi.mock("../../src/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("Entrega C: Políticas de Roteamento e Notification Dispatcher", () => {
  describe("1. Ponderação e Validação de Prioridades", () => {
    it("deve ordenar corretamente a hierarquia de pesos das prioridades", () => {
      expect(PRIORITY_WEIGHTS.informativa).toBeLessThan(PRIORITY_WEIGHTS.normal);
      expect(PRIORITY_WEIGHTS.normal).toBeLessThan(PRIORITY_WEIGHTS.importante);
      expect(PRIORITY_WEIGHTS.importante).toBeLessThan(PRIORITY_WEIGHTS.critica);
    });

    it("deve permitir disparo quando prioridade do evento for igual ou superior à mínima", () => {
      expect(checkPrioritySufficient("critica", "normal")).toBe(true);
      expect(checkPrioritySufficient("importante", "importante")).toBe(true);
      expect(checkPrioritySufficient("normal", "informativa")).toBe(true);
    });

    it("deve rejeitar disparo quando prioridade do evento for inferior à mínima", () => {
      expect(checkPrioritySufficient("informativa", "normal")).toBe(false);
      expect(checkPrioritySufficient("normal", "importante")).toBe(false);
      expect(checkPrioritySufficient("importante", "critica")).toBe(false);
    });
  });

  describe("2. Janela de Silêncio (Quiet Hours)", () => {
    it("deve identificar corretamente quando o horário está dentro de intervalo noturno (cruza meia-noite)", () => {
      const start = "22:00";
      const end = "07:00";

      expect(isWithinQuietHours("23:15", start, end)).toBe(true);
      expect(isWithinQuietHours("02:30", start, end)).toBe(true);
      expect(isWithinQuietHours("06:59", start, end)).toBe(true);
      expect(isWithinQuietHours("07:01", start, end)).toBe(false);
      expect(isWithinQuietHours("14:00", start, end)).toBe(false);
      expect(isWithinQuietHours("21:59", start, end)).toBe(false);
    });

    it("deve identificar corretamente horário dentro de intervalo diurno (mesmo dia)", () => {
      const start = "13:00";
      const end = "14:00";

      expect(isWithinQuietHours("13:30", start, end)).toBe(true);
      expect(isWithinQuietHours("12:59", start, end)).toBe(false);
      expect(isWithinQuietHours("14:01", start, end)).toBe(false);
    });

    it("deve retornar false quando horários de silêncio não estiverem definidos", () => {
      expect(isWithinQuietHours("23:00", null, null)).toBe(false);
      expect(isWithinQuietHours("23:00", undefined, undefined)).toBe(false);
    });
  });

  describe("3. Avaliação de Permissão vs Preferência (Regra de Ouro)", () => {
    it("deve bloquear entrega se o gestor não autorizou o canal (autorizado = false)", () => {
      const result = evaluateChannelDelivery({
        channel: "telegram",
        category: "financeiro",
        eventPriority: "importante",
        preference: {
          autorizado: false,
          habilitado: true, // Usuário quer, mas gestor não deu permissão
          prioridade_minima: "normal",
        },
        isOwner: false,
      });

      expect(result.shouldDeliver).toBe(false);
      expect(result.reason).toContain("bloqueado pelas permissões concedidas pelo gestor");
    });

    it("deve respeitar a preferência individual quando o usuário desativa o canal (habilitado = false)", () => {
      const result = evaluateChannelDelivery({
        channel: "push",
        category: "operacional",
        eventPriority: "normal",
        preference: {
          autorizado: true, // Gestor autorizou
          habilitado: false, // Usuário optou por silenciar
          prioridade_minima: "normal",
        },
        isOwner: false,
      });

      expect(result.shouldDeliver).toBe(false);
      expect(result.reason).toContain("desativado nas preferências pessoais");
    });

    it("deve autorizar a entrega quando autorizado = true E habilitado = true", () => {
      const result = evaluateChannelDelivery({
        channel: "app",
        category: "financeiro",
        eventPriority: "normal",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "normal",
        },
        isOwner: false,
      });

      expect(result.shouldDeliver).toBe(true);
      expect(result.reason).toContain("validadas com sucesso");
    });
  });

  describe("4. Blindagem do Cérebro Executivo (CEO)", () => {
    it("deve bloquear sumariamente notificações ceo_executivo para qualquer membro não-proprietário", () => {
      const result = evaluateChannelDelivery({
        channel: "app",
        category: "ceo_executivo",
        eventPriority: "critica",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "informativa",
        },
        isOwner: false, // NÃO é dono
      });

      expect(result.shouldDeliver).toBe(false);
      expect(result.reason).toContain("exclusivamente ao proprietário");
    });

    it("deve autorizar notificações ceo_executivo para o proprietário legítimo", () => {
      const result = evaluateChannelDelivery({
        channel: "app",
        category: "ceo_executivo",
        eventPriority: "importante",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "normal",
        },
        isOwner: true, // É proprietário
      });

      expect(result.shouldDeliver).toBe(true);
    });
  });

  describe("5. Comportamento em Quiet Hours (Horário de Silêncio)", () => {
    it("deve suprimir canais sonoros/externos (push/telegram) durante horário de silêncio para eventos normais", () => {
      const resultPush = evaluateChannelDelivery({
        channel: "push",
        category: "fechamento_caixa",
        eventPriority: "normal",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "normal",
          horario_silencio_inicio: "22:00",
          horario_silencio_fim: "07:00",
        },
        isOwner: false,
        currentTimeHHMM: "23:45",
      });

      expect(resultPush.shouldDeliver).toBe(false);
      expect(resultPush.suppressedByQuietHours).toBe(true);
      expect(resultPush.reason).toContain("suprimido durante a janela");
    });

    it("deve gravar silenciosamente na central in-app durante horário de silêncio para visualização posterior", () => {
      const resultApp = evaluateChannelDelivery({
        channel: "app",
        category: "fechamento_caixa",
        eventPriority: "normal",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "normal",
          horario_silencio_inicio: "22:00",
          horario_silencio_fim: "07:00",
        },
        isOwner: false,
        currentTimeHHMM: "23:45",
      });

      expect(resultApp.shouldDeliver).toBe(true);
      expect(resultApp.suppressedByQuietHours).toBe(true);
      expect(resultApp.reason).toContain("in-app silenciosamente");
    });

    it("deve furar a janela de silêncio se a prioridade for crítica", () => {
      const resultCritico = evaluateChannelDelivery({
        channel: "push",
        category: "seguranca",
        eventPriority: "critica",
        preference: {
          autorizado: true,
          habilitado: true,
          prioridade_minima: "normal",
          horario_silencio_inicio: "22:00",
          horario_silencio_fim: "07:00",
        },
        isOwner: false,
        currentTimeHHMM: "03:00",
      });

      expect(resultCritico.shouldDeliver).toBe(true);
      expect(resultCritico.reason).toContain("fura a janela de silêncio");
    });
  });

  describe("6. NotificationDispatcherService Frontend", () => {
    it("deve invocar a Edge Function com parâmetros tipados e tratar resposta com sucesso", async () => {
      const mockResponse = {
        data: {
          success: true,
          workspace_id: "ws-123",
          categoria: "financeiro",
          total_destinatarios: 1,
          entregas: [
            { user_id: "user-1", channel: "app", delivered: true, reason: "OK" },
          ],
        },
        error: null,
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce(
        mockResponse as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>
      );

      const res = await NotificationDispatcherService.dispatch({
        workspace_id: "ws-123",
        categoria: "financeiro",
        prioridade: "normal",
        titulo: "Teste de Notificação",
        mensagem: "Corpo do alerta",
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith("notification-dispatcher", {
        body: expect.objectContaining({
          workspace_id: "ws-123",
          categoria: "financeiro",
          prioridade: "normal",
          titulo: "Teste de Notificação",
        }),
      });

      expect(res.success).toBe(true);
      expect(res.total_destinatarios).toBe(1);
    });

    it("deve prefixar simulação com [SIMULAÇÃO] e enviar metadata de teste", async () => {
      const mockResponse = {
        data: {
          success: true,
          total_destinatarios: 1,
          entregas: [{ user_id: "user-1", channel: "app", delivered: true, reason: "OK" }],
        },
        error: null,
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce(
        mockResponse as unknown as Awaited<ReturnType<typeof supabase.functions.invoke>>
      );

      const res = await NotificationDispatcherService.simulateAlert({
        workspace_id: "ws-123",
        target_user_id: "user-1",
        categoria: "boletos",
        prioridade: "importante",
        titulo: "Boleto a Vencer",
        mensagem: "Seu boleto vence amanhã.",
      });

      expect(supabase.functions.invoke).toHaveBeenCalledWith("notification-dispatcher", {
        body: expect.objectContaining({
          titulo: "[SIMULAÇÃO] Boleto a Vencer",
          metadata: expect.objectContaining({ simulacao: true }),
        }),
      });

      expect(res.success).toBe(true);
    });
  });
});
