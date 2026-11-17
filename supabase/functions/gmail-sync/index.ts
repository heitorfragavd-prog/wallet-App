import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { parseNfeXml } from "../_shared/ai/nfe-xml-parser.ts";
import { findGlobalFinancialDuplicate } from "../_shared/ai/financial-deduplication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const TARGET_GMAIL_ACCOUNT = Deno.env.get("GMAIL_TARGET_ACCOUNT") || "rodopointcafe@gmail.com";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  email?: string;
  verified_email?: boolean;
  name?: string;
}

export interface GmailUserProfile {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

export interface OAuthStatePayload {
  workspaceId: string;
  userId: string;
  redirectUri?: string;
  timestamp?: number;
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

      const statePayload = btoa(
        JSON.stringify({
          workspaceId,
          userId,
          redirectUri,
          timestamp: Date.now(),
        })
      );
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
        return new Response(
          JSON.stringify({ error: "Parâmetros code e state são obrigatórios." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let parsedState: OAuthStatePayload;
      try {
        parsedState = JSON.parse(atob(state));
      } catch {
        return new Response(
          JSON.stringify({ error: "State inválido ou corrompido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!parsedState?.workspaceId || !parsedState?.userId) {
        return new Response(
          JSON.stringify({ error: "State incompleto ou workspace não identificado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validação de RBAC: caso o usuário esteja autenticado via JWT, valida pertencimento ao workspace
      if (userId) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("role, active")
          .eq("workspace_id", parsedState.workspaceId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!member || !member.active || !["owner", "admin"].includes(member.role)) {
          return new Response(
            JSON.stringify({ error: "Usuário sem permissão administrativa neste workspace." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({
            error: "Credenciais Google OAuth não configuradas no Supabase Vault.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Usa estritamente o redirect_uri consistente com o state original
      const effectiveRedirectUri = redirectUri || parsedState.redirectUri || "https://wallet.wonderwold.com.br/dividas";

      // Troca o authorization code pelos tokens da Google
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: effectiveRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResp.ok) {
        const errJson = await tokenResp.json().catch(() => null);
        const errCode = errJson?.error || "oauth_exchange_failed";
        const errDesc = errJson?.error_description || "Falha na troca do código de autorização Google.";
        console.error("[gmail-sync] Erro ao trocar code por token:", errCode, errDesc);

        let userFriendlyError = "Falha na autenticação com a Google.";
        if (errCode === "invalid_grant") {
          userFriendlyError = "Código de autorização expirado ou já utilizado. Por favor, tente conectar novamente.";
        } else if (errCode === "redirect_uri_mismatch") {
          userFriendlyError = "URI de redirecionamento incompatível com as credenciais do Google Cloud.";
        }

        return new Response(
          JSON.stringify({ error: userFriendlyError, code: errCode }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokens: GoogleTokenResponse = await tokenResp.json();
      if (!tokens?.access_token) {
        return new Response(
          JSON.stringify({ error: "Resposta inválida do Google: access_token ausente." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Identifica o e-mail conectado com dupla verificação (Gmail API Profile + Google Userinfo)
      let connectedEmail = "";

      // 1. Tenta obter diretamente via Gmail API Profile (garantido com gmail.readonly)
      try {
        const gmailProfileResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (gmailProfileResp.ok) {
          const profileData: GmailUserProfile = await gmailProfileResp.json();
          if (typeof profileData?.emailAddress === "string" && profileData.emailAddress.trim()) {
            connectedEmail = profileData.emailAddress.trim().toLowerCase();
          }
        } else {
          console.warn("[gmail-sync] Falha ao consultar /gmail/v1/users/me/profile:", gmailProfileResp.status);
        }
      } catch (profileErr) {
        console.warn("[gmail-sync] Erro ao consultar perfil Gmail:", profileErr instanceof Error ? profileErr.message : String(profileErr));
      }

      // 2. Fallback para Google userinfo (caso userinfo.email tenha sido concedido)
      if (!connectedEmail) {
        try {
          const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (userinfoResp.ok) {
            const userInfo: GoogleUserInfo = await userinfoResp.json();
            if (typeof userInfo?.email === "string" && userInfo.email.trim()) {
              connectedEmail = userInfo.email.trim().toLowerCase();
            }
          }
        } catch (userinfoErr) {
          console.warn("[gmail-sync] Erro ao consultar userinfo:", userinfoErr instanceof Error ? userinfoErr.message : String(userinfoErr));
        }
      }

      if (!connectedEmail) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível identificar o endereço de e-mail da conta Google conectada.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // GATE 2: Validação estrita da conta autorizada (rodopointcafe@gmail.com)
      if (connectedEmail !== TARGET_GMAIL_ACCOUNT.toLowerCase()) {
        console.warn(`[gmail-sync] E-mail não autorizado: ${connectedEmail}. Esperado: ${TARGET_GMAIL_ACCOUNT}`);
        return new Response(
          JSON.stringify({
            error: `Conta inválida (${connectedEmail}). A integração é restrita exclusivamente ao e-mail comercial ${TARGET_GMAIL_ACCOUNT}.`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      // Se o Google não retornar um novo refresh_token nesta troca (ex: reautorização sem revogação prévia),
      // preservamos o refresh_token já persistido para manter acesso offline contínuo.
      let refreshTokenToSave = tokens.refresh_token ?? null;
      if (!refreshTokenToSave) {
        const { data: existingInteg } = await supabase
          .from("workspace_gmail_integrations")
          .select("refresh_token_encrypted")
          .eq("workspace_id", parsedState.workspaceId)
          .eq("email_conectado", connectedEmail)
          .maybeSingle();

        if (existingInteg?.refresh_token_encrypted) {
          refreshTokenToSave = existingInteg.refresh_token_encrypted;
        }
      }

      // Salva ou atualiza a integração no banco
      const { error: upsertErr } = await supabase.from("workspace_gmail_integrations").upsert(
        {
          workspace_id: parsedState.workspaceId,
          user_id: parsedState.userId,
          email_conectado: connectedEmail,
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: refreshTokenToSave,
          token_expires_at: expiresAt,
          status: "conectado",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,email_conectado" }
      );

      if (upsertErr) {
        console.error("[gmail-sync] Erro ao persistir tokens:", upsertErr.message);
        return new Response(
          JSON.stringify({ error: "Falha ao gravar credenciais de integração no banco de dados." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          email: connectedEmail,
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

        // Conta e avalia anexos
        const parts = (msgDetail.payload?.parts || []) as Array<{
          partId?: string;
          filename?: string;
          mimeType?: string;
          body?: { attachmentId?: string; size?: number };
        }>;
        const attachmentParts = parts.filter((p) => p.filename && p.filename.length > 0);

        let tipoDocumento: "boleto" | "nfe" | "comprovante" | "cobranca" | "outro" | "sem_anexo" =
          attachmentParts.length > 0 ? "outro" : "sem_anexo";
        let proposalId: string | null = null;
        let fornecedorId: string | null = null;
        const detalhesExtracao: Record<string, unknown> = {};

        // Processamento inteligente de anexos (GATE 4 & GATE 5)
        for (const att of attachmentParts) {
          const fname = (att.filename || "").toLowerCase();
          const attId = att.body?.attachmentId;

          // Processamento Determinístico de XML NF-e
          if (fname.endsWith(".xml") && attId) {
            try {
              const attResp = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}/attachments/${attId}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (attResp.ok) {
                const attData = await attResp.json();
                const rawBase64 = (attData.data || "").replace(/-/g, "+").replace(/_/g, "/");
                const xmlString = new TextDecoder().decode(
                  Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0))
                );

                const nfeParsed = parseNfeXml(xmlString);
                if (nfeParsed.valido && nfeParsed.chaveAcesso) {
                  tipoDocumento = "nfe";
                  detalhesExtracao.chave_acesso = nfeParsed.chaveAcesso;
                  detalhesExtracao.numero_nota = nfeParsed.numeroNota;
                  detalhesExtracao.emitente = nfeParsed.emitente;
                  detalhesExtracao.valor_total = nfeParsed.valores.valorTotal;
                  detalhesExtracao.duplicatas = nfeParsed.duplicatas;
                  detalhesExtracao.itens_qtd = nfeParsed.itens.length;

                  // Deduplicação Global Trilateral (GATE 6)
                  const dupCheck = await findGlobalFinancialDuplicate(supabase, {
                    workspaceId,
                    chaveAcesso: nfeParsed.chaveAcesso,
                    numeroNota: nfeParsed.numeroNota,
                    cnpjEmitente: nfeParsed.emitente.cnpj,
                    valor: nfeParsed.valores.valorTotal,
                  });

                  if (dupCheck.isDuplicate) {
                    detalhesExtracao.duplicado = true;
                    detalhesExtracao.duplicado_origem = dupCheck.source;
                    detalhesExtracao.duplicado_registro_id = dupCheck.existingRecordId;
                  } else {
                    // Associação ou Localização de Fornecedor
                    const { data: forn } = await supabase
                      .from("fornecedores")
                      .select("id, razao_social, cnpj")
                      .eq("workspace_id", workspaceId)
                      .eq("cnpj", nfeParsed.emitente.cnpj)
                      .maybeSingle();

                    if (forn) {
                      fornecedorId = forn.id;
                      detalhesExtracao.fornecedor_id = forn.id;
                    }

                    // Criação de Proposta de Ação Transacional (STATUS: prepared, NUNCA executa pagamento)
                    const propHashInput = `${workspaceId}:nfe:${nfeParsed.chaveAcesso}`;
                    const propHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(propHashInput));
                    const propIdempotencyHash = Array.from(new Uint8Array(propHashBuf))
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("");

                    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
                    const { data: newProp } = await supabase
                      .from("wallet_ai_action_proposals")
                      .insert({
                        workspace_id: workspaceId,
                        user_id: integ.user_id,
                        action_type: "cadastrar_nfe",
                        summary: `Nota Fiscal nº ${nfeParsed.numeroNota || "S/N"} - ${nfeParsed.emitente.razaoSocial} (R$ ${nfeParsed.valores.valorTotal.toFixed(2)})`,
                        payload: {
                          origem: "gmail",
                          email_message_id: msgRef.id,
                          email_subject: subject,
                          email_remetente: from,
                          chave_acesso: nfeParsed.chaveAcesso,
                          numero_nota: nfeParsed.numeroNota,
                          fornecedor_id: fornecedorId,
                          emitente: nfeParsed.emitente,
                          valores: nfeParsed.valores,
                          duplicatas: nfeParsed.duplicatas,
                          itens: nfeParsed.itens,
                        },
                        idempotency_hash: propIdempotencyHash,
                        status: "prepared",
                        expires_at: expiresAt,
                      })
                      .select("id")
                      .maybeSingle();

                    if (newProp) {
                      proposalId = newProp.id;
                    }
                  }
                }
              }
            } catch (xmlErr) {
              console.warn("[gmail-sync] Falha na extração de XML:", xmlErr);
            }
          }

          // Se for boleto em PDF
          if (fname.includes("boleto") && fname.endsWith(".pdf")) {
            tipoDocumento = "boleto";
            detalhesExtracao.tipo_detectado_nome = "boleto_pdf";
          }
        }

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
          tipo_documento_detectado: tipoDocumento,
          proposal_id: proposalId,
          fornecedor_id: fornecedorId,
          detalhes_extracao: detalhesExtracao,
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
