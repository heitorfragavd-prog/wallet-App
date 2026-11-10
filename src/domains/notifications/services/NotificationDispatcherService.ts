import { supabase } from "@/integrations/supabase/client";
import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserNotificationPreference,
} from "../types";
import { evaluateChannelDelivery } from "./notificationPolicy";

export interface DispatchNotificationParams {
  workspace_id: string;
  categoria: NotificationCategory;
  prioridade: NotificationPriority;
  titulo: string;
  mensagem: string;
  link_redirecionamento?: string;
  metadata?: Record<string, unknown>;
  target_user_ids?: string[];
  target_role?: "owner" | "admin" | "manager" | "member" | "all";
  canais?: NotificationChannel[];
}

export interface DeliveryResult {
  user_id: string;
  channel: NotificationChannel;
  delivered: boolean;
  reason: string;
}

export interface DispatchNotificationResponse {
  success: boolean;
  workspace_id?: string;
  categoria?: NotificationCategory;
  total_destinatarios?: number;
  entregas?: DeliveryResult[];
  error?: string;
}

export class NotificationDispatcherService {
  /**
   * Despacha uma notificação respeitando as políticas do workspace, RBAC,
   * preferências individuais e horário de silêncio através do notification-dispatcher.
   * Possui fallback resiliente via banco quando a edge function não estiver disponível.
   */
  public static async dispatch(
    params: DispatchNotificationParams
  ): Promise<DispatchNotificationResponse> {
    try {
      // 1. Tenta envio através do motor centralizado no Supabase Edge
      const { data, error } = await supabase.functions.invoke("notification-dispatcher", {
        body: params,
      });

      if (!error && data && data.success) {
        return data as DispatchNotificationResponse;
      }

      // Se a Edge Function falhar ou não estiver implantada, aciona o fallback resiliente
      return await this.fallbackDirectDispatch(params);
    } catch {
      return await this.fallbackDirectDispatch(params);
    }
  }

  /**
   * Fallback resiliente direto no Supabase:
   * Valida regras de negócio, permissões do gestor, preferências e quiet hours
   * diretamente via cliente autenticado, garantindo gravação in-app e auditoria.
   */
  public static async fallbackDirectDispatch(
    params: DispatchNotificationParams
  ): Promise<DispatchNotificationResponse> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user;

      if (!currentUser) {
        return { success: false, error: "Usuário não autenticado." };
      }

      // 1. Obter informações do Workspace e Dono
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces")
        .select("id, user_id")
        .eq("id", params.workspace_id)
        .single();

      if (wsErr || !ws) {
        return { success: false, error: "Workspace não encontrado." };
      }

      const isCallerOwner = ws.user_id === currentUser.id;

      // Se categoria for ceo_executivo e chamador não for dono, rejeita
      if (params.categoria === "ceo_executivo" && !isCallerOwner) {
        return {
          success: false,
          error: "Apenas o proprietário pode emitir alertas da categoria ceo_executivo.",
        };
      }

      // 2. Destinatários
      let targetUserIds: string[] = [];
      if (params.categoria === "ceo_executivo") {
        targetUserIds = [ws.user_id];
      } else if (params.target_user_ids && params.target_user_ids.length > 0) {
        targetUserIds = params.target_user_ids;
      } else {
        targetUserIds = [currentUser.id];
      }

      // 3. Buscar preferências
      const { data: prefs } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("workspace_id", params.workspace_id)
        .eq("categoria", params.categoria)
        .in("user_id", targetUserIds);

      const prefMap = new Map<string, Partial<UserNotificationPreference>>();
      (prefs || []).forEach((p) => {
        prefMap.set(`${p.user_id}:${p.canal}`, p as unknown as UserNotificationPreference);
      });

      const channels: NotificationChannel[] = params.canais || ["app", "push", "telegram"];
      const entregas: DeliveryResult[] = [];
      const appInserts: Array<{
        user_id: string;
        titulo: string;
        mensagem: string;
        lida: boolean;
        link_redirecionamento?: string;
      }> = [];

      for (const uid of targetUserIds) {
        const isTargetOwner = uid === ws.user_id;

        for (const ch of channels) {
          const pref = prefMap.get(`${uid}:${ch}`);
          const evalResult = evaluateChannelDelivery({
            channel: ch,
            category: params.categoria,
            eventPriority: params.prioridade,
            preference: pref,
            isOwner: isTargetOwner,
          });

          entregas.push({
            user_id: uid,
            channel: ch,
            delivered: evalResult.shouldDeliver,
            reason: evalResult.reason,
          });

          if (ch === "app" && evalResult.shouldDeliver) {
            appInserts.push({
              user_id: uid,
              titulo: params.titulo,
              mensagem: params.mensagem,
              lida: false,
              link_redirecionamento: params.link_redirecionamento,
            });
          }
        }
      }

      if (appInserts.length > 0) {
        await supabase.from("notificacoes").insert(appInserts);
      }

      // Gravar log de auditoria
      const logs = entregas.map((e) => ({
        user_id: e.user_id,
        tipo: e.channel,
        titulo: params.titulo,
        mensagem: params.mensagem,
        enviado: e.delivered,
        erro: e.delivered ? null : e.reason,
      }));

      await supabase.from("notificacoes_log").insert(logs);

      return {
        success: true,
        workspace_id: params.workspace_id,
        categoria: params.categoria,
        total_destinatarios: targetUserIds.length,
        entregas,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no fallback do dispatcher.";
      return { success: false, error: msg };
    }
  }

  /**
   * Simula o envio de um alerta de teste para o próprio usuário sem poluir
   * nem alterar dados financeiros reais.
   */
  public static async simulateAlert(params: {
    workspace_id: string;
    target_user_id: string;
    categoria: NotificationCategory;
    prioridade: NotificationPriority;
    titulo: string;
    mensagem: string;
    link_redirecionamento?: string;
  }): Promise<DispatchNotificationResponse> {
    return this.dispatch({
      workspace_id: params.workspace_id,
      categoria: params.categoria,
      prioridade: params.prioridade,
      titulo: `[SIMULAÇÃO] ${params.titulo}`,
      mensagem: params.mensagem,
      link_redirecionamento: params.link_redirecionamento,
      target_user_ids: [params.target_user_id],
      metadata: { simulacao: true, timestamp: new Date().toISOString() },
    });
  }
}
