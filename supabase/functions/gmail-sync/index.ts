import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const TARGET_GMAIL_ACCOUNT = Deno.env.get("GMAIL_TARGET_ACCOUNT") || "rodopointcafe@gmail.com";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
  name?: string;
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

    // ─── 1. GERAR URL DE AUTORIZAÇÃO OAUTH (Somente Leitura) ───────────────────
    if (action === "auth-url" && req.method === "POST") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;
      const redirectUri = body.redirectUri || "https://wallet.wonderwold.com.br/configuracoes";

      if (!workspaceId) {
        return new Response(JSON.stringify({ error: "workspaceId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validação de RBAC: Apenas owner ou admin podem conectar o Gmail
      const { data: member } = await supabase
        .from("workspace_members")
        .select("role, active")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!member || !member.active || !["owner", "admin"].includes(member.role)) {
        return new Response(
          JSON.stringify({ error: "Apenas administradores podem gerenciar integrações de e-mail." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statePayload = btoa(JSON.stringify({ workspaceId, userId, timestamp: Date.now() }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(GMAIL_READONLY_SCOPE)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `login_hint=${encodeURIComponent(TARGET_GMAIL_ACCOUNT)}&` +
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

      // Troca o authorization code pelos tokens da Google
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || "https://wallet.wonderwold.com.br/configuracoes",
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResp.ok) {
        const err = await tokenResp.text();
        console.error("[gmail-sync] Erro ao trocar code por token:", err);
        return new Response(JSON.stringify({ error: "Falha na autenticação com a Google.", details: err }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokens: GoogleTokenResponse = await tokenResp.json();

      // Identifica o e-mail conectado
      const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo: GoogleUserInfo = await userinfoResp.json();

      // GATE 2: Validação estrita da conta autorizada (rodopointcafe@gmail.com)
      if (userInfo.email.toLowerCase() !== TARGET_GMAIL_ACCOUNT.toLowerCase()) {
        console.warn(`[gmail-sync] E-mail não autorizado: ${userInfo.email}. Esperado: ${TARGET_GMAIL_ACCOUNT}`);
        return new Response(
          JSON.stringify({
            error: `Conta inválida (${userInfo.email}). A integração é restrita exclusivamente ao e-mail comercial ${TARGET_GMAIL_ACCOUNT}.`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Salva ou atualiza a integração no banco
      const { error: upsertErr } = await supabase.from("workspace_gmail_integrations").upsert(
        {
          workspace_id: parsedState.workspaceId,
          user_id: parsedState.userId,
          email_conectado: userInfo.email.toLowerCase(),
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token ?? null,
          token_expires_at: expiresAt,
          status: "conectado",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,email_conectado" }
      );

      if (upsertErr) {
        console.error("[gmail-sync] Erro ao persistir tokens:", upsertErr);
        return new Response(JSON.stringify({ error: "Falha ao gravar credenciais de integração." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          email: userInfo.email,
          status: "conectado",
          expiresAt,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 3. SINCRONIZAÇÃO INCREMENTAL SEGURA (GATE 3) ──────────────────────────
    if (action === "sync" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;

      if (!workspaceId) {
        return new Response(JSON.stringify({ error: "workspaceId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: integ, error: integErr } = await supabase
        .from("workspace_gmail_integrations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "conectado")
        .maybeSingle();

      if (integErr || !integ) {
        return new Response(
          JSON.stringify({
            success: false,
            messagesChecked: 0,
            newDocumentsFound: 0,
            duplicatesSkipped: 0,
            errorsCount: 1,
            lastSyncTimestamp: new Date().toISOString(),
            error: "Nenhuma integração ativa encontrada para este workspace.",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let accessToken = integ.access_token_encrypted;
      const isExpired = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() <= Date.now() + 60000 : true;

      // Renovação automática de token se expirado
      if (isExpired && integ.refresh_token_encrypted) {
        const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: integ.refresh_token_encrypted,
            grant_type: "refresh_token",
          }),
        });

        if (refreshResp.ok) {
          const newTokens = await refreshResp.json();
          accessToken = newTokens.access_token;
          const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

          await supabase
            .from("workspace_gmail_integrations")
            .update({
              access_token_encrypted: accessToken,
              token_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", integ.id);
        } else {
          console.error("[gmail-sync] Erro ao renovar token de acesso.");
          await supabase
            .from("workspace_gmail_integrations")
            .update({ status: "erro_autenticacao", updated_at: new Date().toISOString() })
            .eq("id", integ.id);

          return new Response(
            JSON.stringify({
              success: false,
              messagesChecked: 0,
              newDocumentsFound: 0,
              duplicatesSkipped: 0,
              errorsCount: 1,
              lastSyncTimestamp: new Date().toISOString(),
              error: "Credenciais do Gmail expiradas. Necessária nova autorização.",
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Query restrita a anexos financeiros potenciais (PDF, XML, Imagens)
      const searchQuery = "has:attachment (filename:pdf OR filename:xml OR filename:jpg OR filename:png)";
      const listResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listResp.ok) {
        const listErr = await listResp.text();
        return new Response(
          JSON.stringify({
            success: false,
            messagesChecked: 0,
            newDocumentsFound: 0,
            duplicatesSkipped: 0,
            errorsCount: 1,
            lastSyncTimestamp: new Date().toISOString(),
            error: `Erro ao consultar API do Gmail (${listResp.status}): ${listErr}`,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const listData = await listResp.json();
      const messages = (listData.messages || []) as Array<{ id: string; threadId: string }>;

      let messagesChecked = 0;
      let newDocumentsFound = 0;
      let duplicatesSkipped = 0;
      let errorsCount = 0;

      for (const msgRef of messages) {
        messagesChecked++;
        // Idempotência: Verifica se a mensagem já foi processada anteriormente
        const { data: existing } = await supabase
          .from("gmail_mensagens_processadas")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("message_id", msgRef.id)
          .maybeSingle();

        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        // Obtém detalhes da mensagem
        const msgDetailResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgDetailResp.ok) {
          errorsCount++;
          continue;
        }

        const msgDetail = await msgDetailResp.json();
        const headersList = (msgDetail.payload?.headers || []) as Array<{ name: string; value: string }>;
        const getHeader = (name: string) => headersList.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        const from = getHeader("From");
        const to = getHeader("To");
        const subject = getHeader("Subject");
        const dateStr = getHeader("Date");
        const emailDate = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

        // Conta anexos
        const parts = (msgDetail.payload?.parts || []) as Array<{ filename?: string; body?: { attachmentId?: string } }>;
        const attachmentParts = parts.filter((p) => p.filename && p.filename.length > 0);

        // Gera hash idempotente único do e-mail
        const rawHashInput = `${workspaceId}:${msgRef.id}:${from}:${subject}`;
        const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawHashInput));
        const idempotencyHash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Registra mensagem processada
        const { error: insErr } = await supabase.from("gmail_mensagens_processadas").insert({
          workspace_id: workspaceId,
          integration_id: integ.id,
          message_id: msgRef.id,
          thread_id: msgRef.threadId,
          remetente: from,
          destinatario: to,
          assunto: subject,
          data_email: emailDate,
          qtd_anexos: attachmentParts.length,
          status: attachmentParts.length > 0 ? "processado" : "ignorado",
          tipo_documento_detectado: attachmentParts.length > 0 ? "outro" : "sem_anexo",
          idempotency_hash: idempotencyHash,
        });

        if (insErr) {
          console.warn("[gmail-sync] Erro ao registrar mensagem:", insErr);
          errorsCount++;
        } else {
          if (attachmentParts.length > 0) {
            newDocumentsFound++;
          }
        }
      }

      // Atualiza último sync
      const nowIso = new Date().toISOString();
      await supabase
        .from("workspace_gmail_integrations")
        .update({
          ultimo_sync_em: nowIso,
          ultima_mensagem_sync_id: messages[0]?.id ?? integ.ultima_mensagem_sync_id,
          updated_at: nowIso,
        })
        .eq("id", integ.id);

      return new Response(
        JSON.stringify({
          success: true,
          messagesChecked,
          newDocumentsFound,
          duplicatesSkipped,
          errorsCount,
          lastSyncTimestamp: nowIso,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 4. DESCONEXÃO E REVOGAÇÃO (GATE 2) ───────────────────────────────────
    if (action === "disconnect" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const workspaceId = body.workspaceId;

      if (!workspaceId) {
        return new Response(JSON.stringify({ error: "workspaceId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("workspace_gmail_integrations")
        .update({
          status: "desconectado",
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);

      return new Response(JSON.stringify({ success: true, status: "desconectado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não encontrada" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gmail-sync] Erro interno:", msg);
    return new Response(JSON.stringify({ error: "Erro interno", details: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
