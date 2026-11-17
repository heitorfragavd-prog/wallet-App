import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  updated?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;
  const action = pathname.split("/").pop() || "";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = getSupabaseSecretKey();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    // Autenticação do usuário chamador
    let userId: string | null = null;
    if (jwt) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      userId = userData?.user?.id ?? null;
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

    // ─── 1. GERAR URL DE AUTORIZAÇÃO OAUTH (Google Calendar) ──────────────────
    if (action === "auth-url" && req.method === "POST") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({
            error: "Credenciais Google OAuth não configuradas no Supabase Vault (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET ausentes).",
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;
      const redirectUri = body.redirectUri || "https://wallet.wonderwold.com.br/agenda";

      if (!workspaceId) {
        return new Response(JSON.stringify({ error: "workspaceId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validação de RBAC
      const { data: member } = await supabase
        .from("workspace_members")
        .select("role, active")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!member || !member.active) {
        return new Response(
          JSON.stringify({ error: "Membro inativo ou sem permissão no workspace." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statePayload = btoa(JSON.stringify({ workspaceId, userId, scope: "calendar", timestamp: Date.now() }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(CALENDAR_EVENTS_SCOPE)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(statePayload)}`;

      return new Response(JSON.stringify({ authUrl, state: statePayload }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2. CALLBACK DE AUTORIZAÇÃO OAUTH ─────────────────────────────────────
    if (action === "oauth-callback" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { code, state, redirectUri } = body;

      if (!code || !state) {
        return new Response(JSON.stringify({ error: "Parâmetros code e state são obrigatórios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let parsedState: { workspaceId: string; userId: string };
      try {
        parsedState = JSON.parse(atob(state));
      } catch {
        return new Response(JSON.stringify({ error: "State inválido ou corrompido." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Troca authorization code pelos tokens da Google
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || "https://wallet.wonderwold.com.br/agenda",
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        return new Response(
          JSON.stringify({ error: "Falha na troca de código por token no Google.", details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Consulta o perfil do usuário para identificar o e-mail da conta conectada
      const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userResp.ok) {
        return new Response(JSON.stringify({ error: "Falha ao obter perfil da conta Google conectada." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userInfo = await userResp.json();
      const connectedEmail = (userInfo.email || "").trim().toLowerCase();

      // Persiste ou atualiza a integração em workspace_calendar_integrations
      const { data: upsertData, error: upsertErr } = await supabase
        .from("workspace_calendar_integrations")
        .upsert(
          {
            workspace_id: parsedState.workspaceId,
            user_id: parsedState.userId,
            email_conectado: connectedEmail,
            calendar_id: "primary",
            calendar_nome: "Principal",
            access_token_encrypted: accessToken,
            refresh_token_encrypted: refreshToken || null,
            token_expires_at: expiresAt,
            status: "conectado",
            ultimo_sync_em: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,user_id,email_conectado" }
        )
        .select()
        .single();

      if (upsertErr) {
        return new Response(JSON.stringify({ error: "Erro ao salvar integração no banco.", details: upsertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, integration: upsertData }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. LISTAR CALENDÁRIOS DISPONÍVEIS ────────────────────────────────────
    if (action === "list-calendars" && req.method === "POST") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;

      const { data: integration, error: intErr } = await supabase
        .from("workspace_calendar_integrations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("status", "conectado")
        .maybeSingle();

      if (intErr || !integration) {
        return new Response(JSON.stringify({ error: "Integração Google Calendar não conectada." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let token = integration.access_token_encrypted;
      // Checa se o token expirou
      if (integration.token_expires_at && new Date(integration.token_expires_at) <= new Date()) {
        token = await refreshCalendarToken(supabase, integration, clientId, clientSecret);
      }

      const listResp = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!listResp.ok) {
        return new Response(JSON.stringify({ error: "Erro ao listar calendários no Google." }), {
          status: listResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const listData = await listResp.json();
      const calendars: GoogleCalendarItem[] = (listData.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        description: c.description,
        primary: Boolean(c.primary),
        timeZone: c.timeZone,
      }));

      return new Response(JSON.stringify({ calendars }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 4. SINCRONIZAR EVENTOS INCREMENTAIS ──────────────────────────────────
    if (action === "sync-events" && req.method === "POST") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;

      const { data: integration } = await supabase
        .from("workspace_calendar_integrations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("status", "conectado")
        .maybeSingle();

      if (!integration) {
        return new Response(JSON.stringify({ error: "Integração de calendário não encontrada." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let token = integration.access_token_encrypted;
      if (integration.token_expires_at && new Date(integration.token_expires_at) <= new Date()) {
        token = await refreshCalendarToken(supabase, integration, clientId, clientSecret);
      }

      const calendarId = encodeURIComponent(integration.calendar_id || "primary");
      // Busca eventos dos últimos 30 dias até próximos 90 dias
      const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
      const eventsResp = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!eventsResp.ok) {
        const errText = await eventsResp.text();
        return new Response(JSON.stringify({ error: "Falha ao buscar eventos no Google Calendar.", details: errText }), {
          status: eventsResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const eventsData = await eventsResp.json();
      const items: GoogleCalendarEvent[] = eventsData.items || [];

      let eventsCreated = 0;
      let eventsUpdated = 0;
      let eventsCancelled = 0;

      for (const item of items) {
        if (!item.id) continue;

        const isCancelled = item.status === "cancelled";
        if (isCancelled) {
          eventsCancelled++;
        }

        const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
        const inicio = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00.000Z` : new Date().toISOString());
        const fim = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59.999Z` : inicio);

        const rawHash = `calendar:${workspaceId}:${item.id}:${item.updated || inicio}`;
        const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawHash));
        const idempotencyHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const { error: upsertErr } = await supabase
          .from("calendar_eventos_sincronizados")
          .upsert(
            {
              workspace_id: workspaceId,
              integration_id: integration.id,
              google_event_id: item.id,
              titulo: item.summary || "(Sem título)",
              descricao: item.description || null,
              local: item.location || null,
              inicio,
              fim,
              dia_inteiro: isAllDay,
              status: isCancelled ? "cancelled" : "confirmed",
              idempotency_hash: idempotencyHash,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id,google_event_id" }
          );

        if (!upsertErr) {
          eventsCreated++;
        }
      }

      // Atualiza timestamp do último sync
      await supabase
        .from("workspace_calendar_integrations")
        .update({
          ultimo_sync_em: new Date().toISOString(),
        })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({
          success: true,
          eventsChecked: items.length,
          eventsCreated,
          eventsUpdated,
          eventsCancelled,
          lastSyncTimestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 5. DESCONECTAR INTEGRAÇÃO ────────────────────────────────────────────
    if (action === "disconnect" && req.method === "POST") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;

      await supabase
        .from("workspace_calendar_integrations")
        .update({
          status: "desconectado",
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não encontrada" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno", details: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Renova token de acesso OAuth do Google Calendar
 */
async function refreshCalendarToken(
  supabase: any,
  integration: any,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const refreshToken = integration.refresh_token_encrypted;
  if (!refreshToken) {
    throw new Error("Refresh token ausente. Reconexão necessária.");
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    await supabase
      .from("workspace_calendar_integrations")
      .update({ status: "erro_autenticacao" })
      .eq("id", integration.id);
    throw new Error("Falha ao renovar token do Google Calendar.");
  }

  const data = await resp.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await supabase
    .from("workspace_calendar_integrations")
    .update({
      access_token_encrypted: newAccessToken,
      token_expires_at: newExpiresAt,
      status: "conectado",
    })
    .eq("id", integration.id);

  return newAccessToken;
}
