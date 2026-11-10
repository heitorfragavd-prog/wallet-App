import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { isAuthorizedCronCaller, timingSafeEqual } from "../_shared/auth-guard.ts";
import {
  evaluateChannelDelivery,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  UserNotificationPreferenceData,
} from "../_shared/notification-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DispatchPayload {
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

const VALID_CATEGORIES: NotificationCategory[] = [
  "financeiro",
  "fechamento_caixa",
  "boletos",
  "operacional",
  "estoque_nfe",
  "ceo_executivo",
  "seguranca",
];

const VALID_PRIORITIES: NotificationPriority[] = [
  "informativa",
  "normal",
  "importante",
  "critica",
];

const VALID_CHANNELS: NotificationChannel[] = ["app", "push", "telegram", "whatsapp"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = getSupabaseSecretKey() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

    let isServiceRoleOrCron = isAuthorizedCronCaller(req);
    if (!isServiceRoleOrCron && token && supabaseServiceKey) {
      isServiceRoleOrCron = timingSafeEqual(token, supabaseServiceKey);
    }

    let callerUserId: string | null = null;

    if (!isServiceRoleOrCron) {
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais de autorização ausentes." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Sessão inválida ou expirada." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerUserId = userData.user.id;
    }

    const payload: DispatchPayload = await req.json();
    const {
      workspace_id,
      categoria,
      prioridade,
      titulo,
      mensagem,
      link_redirecionamento,
      target_user_ids,
      target_role,
      canais,
    } = payload;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ success: false, error: "workspace_id é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_CATEGORIES.includes(categoria)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Categoria inválida. Categorias aceitas: ${VALID_CATEGORIES.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_PRIORITIES.includes(prioridade)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Prioridade inválida. Prioridades aceitas: ${VALID_PRIORITIES.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!titulo || !mensagem) {
      return new Response(
        JSON.stringify({ success: false, error: "titulo e mensagem são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validar existência do Workspace e obter Owner
    const { data: workspaceData, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("id, user_id, nome")
      .eq("id", workspace_id)
      .single();

    if (wsError || !workspaceData) {
      return new Response(
        JSON.stringify({ success: false, error: "Workspace não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownerUserId = workspaceData.user_id;

    // 2. Se for chamado por usuário comum, validar associação com o workspace
    if (callerUserId) {
      const isCallerOwner = callerUserId === ownerUserId;
      let isCallerMember = isCallerOwner;

      if (!isCallerMember) {
        const { data: memberData } = await supabaseAdmin
          .from("workspace_members")
          .select("id, role, status")
          .eq("workspace_id", workspace_id)
          .eq("user_id", callerUserId)
          .eq("status", "active")
          .maybeSingle();

        if (memberData) {
          isCallerMember = true;
        }
      }

      if (!isCallerMember) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Usuário não possui autorização neste workspace.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Se categoria for ceo_executivo, chamador DEVE ser o proprietário
      if (categoria === "ceo_executivo" && !isCallerOwner) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Apenas o proprietário do workspace pode emitir alertas da categoria ceo_executivo.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Obter todos os membros elegíveis do Workspace
    const { data: membersList } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id, role, status")
      .eq("workspace_id", workspace_id)
      .eq("status", "active");

    const validWorkspaceUserIds = new Set<string>();
    validWorkspaceUserIds.add(ownerUserId);
    (membersList || []).forEach((m) => validWorkspaceUserIds.add(m.user_id));

    // 4. Determinar destinatários candidatos
    let candidateUserIds: string[] = [];

    if (categoria === "ceo_executivo") {
      // Blindagem estrita: CEO só pode ser entregue ao proprietário
      candidateUserIds = [ownerUserId];
    } else if (target_user_ids && target_user_ids.length > 0) {
      // Filtra apenas usuários que realmente são membros válidos do workspace
      candidateUserIds = target_user_ids.filter((uid) => validWorkspaceUserIds.has(uid));
    } else if (target_role === "owner") {
      candidateUserIds = [ownerUserId];
    } else if (target_role === "admin" || target_role === "manager") {
      const adminUsers = (membersList || [])
        .filter((m) => m.role === "admin" || m.role === "manager")
        .map((m) => m.user_id);
      candidateUserIds = Array.from(new Set([ownerUserId, ...adminUsers]));
    } else {
      // Default: todos os membros do workspace
      candidateUserIds = Array.from(validWorkspaceUserIds);
    }

    if (candidateUserIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          mensagem: "Nenhum destinatário elegível encontrado.",
          entregas: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Canais a considerar
    const activeChannels: NotificationChannel[] = (canais || ["app", "push", "telegram"]).filter(
      (c) => VALID_CHANNELS.includes(c)
    );

    // 6. Buscar todas as preferências para os candidatos neste workspace e categoria
    const { data: preferencesData } = await supabaseAdmin
      .from("user_notification_preferences")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("categoria", categoria)
      .in("user_id", candidateUserIds);

    const prefMap = new Map<string, UserNotificationPreferenceData>();
    (preferencesData || []).forEach((p) => {
      const key = `${p.user_id}:${p.canal}`;
      prefMap.set(key, p as UserNotificationPreferenceData);
    });

    const auditLogs: Array<{
      user_id: string;
      tipo: string;
      titulo: string;
      mensagem: string;
      enviado: boolean;
      erro: string | null;
    }> = [];

    const appNotificationsToInsert: Array<{
      user_id: string;
      titulo: string;
      mensagem: string;
      lida: boolean;
      link_redirecionamento?: string;
    }> = [];

    const deliverySummary: Array<{
      user_id: string;
      channel: NotificationChannel;
      delivered: boolean;
      reason: string;
    }> = [];

    // 7. Avaliar e Despachar para cada destinatário e canal
    for (const userId of candidateUserIds) {
      const isOwner = userId === ownerUserId;

      for (const channel of activeChannels) {
        const pref = prefMap.get(`${userId}:${channel}`);

        const evaluation = evaluateChannelDelivery({
          channel,
          category: categoria,
          eventPriority: prioridade,
          preference: pref,
          isOwner,
        });

        if (!evaluation.shouldDeliver) {
          deliverySummary.push({
            user_id: userId,
            channel,
            delivered: false,
            reason: evaluation.reason,
          });

          auditLogs.push({
            user_id: userId,
            tipo: channel,
            titulo,
            mensagem,
            enviado: false,
            erro: evaluation.reason,
          });
          continue;
        }

        // Executar despacho do canal autorizado
        if (channel === "app") {
          appNotificationsToInsert.push({
            user_id: userId,
            titulo,
            mensagem,
            lida: false,
            link_redirecionamento,
          });

          deliverySummary.push({
            user_id: userId,
            channel: "app",
            delivered: true,
            reason: evaluation.reason,
          });

          auditLogs.push({
            user_id: userId,
            tipo: "app",
            titulo,
            mensagem,
            enviado: true,
            erro: null,
          });
        } else if (channel === "push") {
          try {
            const pushRes = await supabaseAdmin.functions.invoke("enviar-push", {
              body: {
                user_id: userId,
                titulo,
                mensagem,
                url: link_redirecionamento || "/",
              },
            });

            const pushSuccess = pushRes.data?.success !== false;
            deliverySummary.push({
              user_id: userId,
              channel: "push",
              delivered: pushSuccess,
              reason: pushSuccess ? "Push despachado." : "Falha na entrega push.",
            });

            auditLogs.push({
              user_id: userId,
              tipo: "push",
              titulo,
              mensagem,
              enviado: pushSuccess,
              erro: pushSuccess ? null : (pushRes.error?.message || pushRes.data?.error || "Falha push"),
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            deliverySummary.push({
              user_id: userId,
              channel: "push",
              delivered: false,
              reason: `Erro no despacho push: ${errMsg}`,
            });

            auditLogs.push({
              user_id: userId,
              tipo: "push",
              titulo,
              mensagem,
              enviado: false,
              erro: errMsg,
            });
          }
        } else if (channel === "telegram") {
          try {
            const telegramRes = await supabaseAdmin.functions.invoke("enviar-telegram", {
              body: {
                user_id: userId,
                titulo,
                mensagem,
              },
            });

            const tgSuccess = telegramRes.data?.success !== false;
            deliverySummary.push({
              user_id: userId,
              channel: "telegram",
              delivered: tgSuccess,
              reason: tgSuccess ? "Telegram despachado." : "Falha no envio telegram.",
            });

            auditLogs.push({
              user_id: userId,
              tipo: "telegram",
              titulo,
              mensagem,
              enviado: tgSuccess,
              erro: tgSuccess ? null : (telegramRes.error?.message || telegramRes.data?.error || "Falha telegram"),
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            deliverySummary.push({
              user_id: userId,
              channel: "telegram",
              delivered: false,
              reason: `Erro no despacho telegram: ${errMsg}`,
            });

            auditLogs.push({
              user_id: userId,
              tipo: "telegram",
              titulo,
              mensagem,
              enviado: false,
              erro: errMsg,
            });
          }
        }
      }
    }

    // 8. Gravar notificações in-app em lote
    if (appNotificationsToInsert.length > 0) {
      await supabaseAdmin.from("notificacoes").insert(appNotificationsToInsert);
    }

    // 9. Gravar logs de auditoria
    if (auditLogs.length > 0) {
      await supabaseAdmin.from("notificacoes_log").insert(auditLogs);
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id,
        categoria,
        total_destinatarios: candidateUserIds.length,
        entregas: deliverySummary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Erro interno no notification-dispatcher:", error);
    const message = error instanceof Error ? error.message : "Erro interno no dispatcher";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
