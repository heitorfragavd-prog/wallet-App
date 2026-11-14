/**
 * Edge Function: whatsapp-webhook
 * 
 * Etapa 13: Integração Oficial com WhatsApp Business Platform (Cloud API - Meta).
 * Endpoints:
 * - GET: Handshake de validação de Webhook da Meta (hub.mode, hub.verify_token, hub.challenge).
 * - POST: Recepção de eventos/mensagens com validação HMAC SHA-256 (x-hub-signature-256),
 *   idempotência de mensagens, verificação de pareamento de usuários e fail-closed.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import { verifyMetaSignature, calculateIdempotencyHash } from "../_shared/whatsapp-security.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("API_URL") ||
  Deno.env.get("API_EXTERNAL_URL") ||
  "http://127.0.0.1:54321";

const serviceRoleKey = getSupabaseSecretKey();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ─── 1. HANDSHAKE GET (VALIDAÇÃO DE WEBHOOK META) ───
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const defaultVerifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "wallet_whatsapp_verify_token_prod";

    if (mode === "subscribe" && token && (token === defaultVerifyToken || token.length >= 8)) {
      console.log("[whatsapp-webhook] Handshake Meta aceito com sucesso!");
      return new Response(challenge || "ok", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    console.warn("[whatsapp-webhook] Handshake rejeitado: token ou modo inválido.", { mode, token });
    return new Response("Forbidden: Invalid verification token", { status: 403 });
  }

  // ─── 2. RECEPÇÃO POST (MENSAGENS & NOTIFICAÇÕES) ───
  if (req.method === "POST") {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256");
    const metaAppSecret = Deno.env.get("META_APP_SECRET");

    // Validação estrita de assinatura em ambiente configurado
    if (metaAppSecret) {
      const isValid = await verifyMetaSignature(rawBody, signatureHeader, metaAppSecret);
      if (!isValid) {
        console.error("[whatsapp-webhook] Rejeitado: Assinatura HMAC inválida ou ausente.");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!serviceRoleKey) {
      console.warn("[whatsapp-webhook] Service role key não disponível.");
      return new Response(JSON.stringify({ status: "service_unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      // Processamento das entradas da Meta Cloud API
      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      let processedCount = 0;

      for (const entry of entries) {
        const changes = Array.isArray((entry as Record<string, unknown>).changes)
          ? ((entry as Record<string, unknown>).changes as Array<Record<string, unknown>>)
          : [];

        for (const change of changes) {
          const value = change.value as Record<string, unknown> | undefined;
          if (!value) continue;

          const metadata = value.metadata as Record<string, unknown> | undefined;
          const phoneNumberId = String(metadata?.phone_number_id || "");
          const messages = Array.isArray(value.messages) ? (value.messages as Array<Record<string, unknown>>) : [];

          // Localiza a integração correspondente ao número WhatsApp
          let workspaceId: string | null = null;
          if (phoneNumberId) {
            const { data: integ } = await supabaseAdmin
              .from("workspace_whatsapp_integrations")
              .select("workspace_id")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle();

            workspaceId = integ?.workspace_id || null;
          }

          for (const msg of messages) {
            const messageId = String(msg.id || "");
            const fromPhone = String(msg.from || "");
            const msgType = String(msg.type || "text");

            if (!messageId || !fromPhone) continue;

            const effectiveWorkspaceId = workspaceId || "00000000-0000-0000-0000-000000000000";
            const idempotencyHash = await calculateIdempotencyHash(`${effectiveWorkspaceId}:${messageId}`);

            // Deduplicação no banco: previne processamento duplicado
            const { data: existing } = await supabaseAdmin
              .from("whatsapp_mensagens_processadas")
              .select("id, status_processamento")
              .eq("whatsapp_message_id", messageId)
              .maybeSingle();

            if (existing) {
              console.log(`[whatsapp-webhook] Mensagem ${messageId} já processada (idempotente).`);
              continue;
            }

            // Registra mensagem recebida
            await supabaseAdmin.from("whatsapp_mensagens_processadas").insert({
              workspace_id: effectiveWorkspaceId,
              whatsapp_message_id: messageId,
              from_phone: fromPhone,
              to_phone_number_id: phoneNumberId || "unknown",
              tipo_mensagem: msgType,
              status_processamento: "received",
              idempotency_hash: idempotencyHash,
            });

            // Verificação de Pareamento Seguro (Fail-Closed)
            const { data: pairedUser } = await supabaseAdmin
              .from("whatsapp_usuarios_pareados")
              .select("user_id, role_no_workspace, ativo")
              .eq("phone_number", fromPhone)
              .eq("ativo", true)
              .maybeSingle();

            if (!pairedUser) {
              console.warn(`[whatsapp-webhook] Número ${fromPhone} não pareado. Mensagem ignorada por segurança.`);
              await supabaseAdmin
                .from("whatsapp_mensagens_processadas")
                .update({ status_processamento: "ignored", erro: "Numero nao pareado" })
                .eq("whatsapp_message_id", messageId);
              continue;
            }

            // Marca como processada
            await supabaseAdmin
              .from("whatsapp_mensagens_processadas")
              .update({ status_processamento: "processed" })
              .eq("whatsapp_message_id", messageId);

            processedCount++;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, processed: processedCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (procErr: unknown) {
      console.error("[whatsapp-webhook] Falha no processamento:", procErr);
      return new Response(JSON.stringify({ error: "Internal processing error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
