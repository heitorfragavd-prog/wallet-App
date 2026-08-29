import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchTelegramMedia, fetchWhatsAppMedia } from "./media-fetcher.ts";
import { sendToTelegram, sendToWhatsApp } from "./adapters.ts";
import { processMessage } from "./processor.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ─── ENDPOINT: CHATGPT (SÍNCRONO) ──────────────────────────────────────────
  if (path.endsWith("/chatgpt")) {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: CORS_HEADERS });
      }

      // ChatGPT envia o token de autenticação que mapeamos ao canal
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: CORS_HEADERS });
      }

      const body = await req.json();
      const queryText = body.message || body.query || "";

      // Encontrar mapeamento do canal ChatGPT para este usuário
      const { data: mapping } = await supabase
        .from("channel_mappings")
        .select("*")
        .eq("user_id", user.id)
        .eq("channel_type", "chatgpt")
        .eq("is_active", true)
        .maybeSingle();

      if (!mapping) {
        return new Response(JSON.stringify({ error: "ChatGPT channel mapping not found for user" }), { status: 404, headers: CORS_HEADERS });
      }

      const responseText = await processMessage({
        text: queryText,
        userId: user.id,
        workspaceId: mapping.workspace_id,
        accessLevel: mapping.access_level,
        isGroup: false,
        channelType: "chatgpt",
        supabaseUrl,
        supabaseServiceKey,
        nomeExibicao: mapping.nome_exibicao
      });

      return new Response(JSON.stringify({ response: responseText }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    } catch (err: any) {
      console.error("[ChatGPT Endpoint Error]", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  // ─── ENDPOINT: TELEGRAM (ASSÍNCRONO - PREVINE TIMEOUT) ──────────────────────
  if (path.endsWith("/telegram")) {
    try {
      const body = await req.json();
      const message = body.message || body.edited_message;
      if (!message || !message.chat) {
        return new Response(JSON.stringify({ success: true, message: "No actionable payload" }), { status: 200, headers: CORS_HEADERS });
      }

      const chatId = String(message.chat.id);
      const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

      // 1. Verificar se existe mapeamento ativo para este canal do Telegram
      const { data: mapping } = await supabase
        .from("channel_mappings")
        .select("*")
        .eq("channel_type", "telegram")
        .eq("channel_id", chatId)
        .eq("is_active", true)
        .maybeSingle();

      if (!mapping) {
        console.warn(`[Telegram Webhook] Mapeamento não encontrado para Chat ID: ${chatId}. Enviando instruções de vínculo...`);
        
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👋 *Olá!*\n\nPara usar o bot da Wallet, vincule sua conta primeiro:\n\n1️⃣ Abra o app Wallet\n2️⃣ Vá em *Configurações* → *Notificações*\n3️⃣ Clique em *Conectar Telegram*\n4️⃣ Envie /start aqui novamente\n\nSeu ID do chat: \`${chatId}\``,
            parse_mode: "Markdown",
          }),
        }).catch(() => {});

        return new Response(JSON.stringify({ success: true, message: "User not mapped, instructions sent" }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      // RETORNAR HTTP 200 OK IMEDIATAMENTE ANTES DE CHAMAR A OPENAI
      const response = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });

      // Executa o processamento em background
      // @ts-ignore
      EdgeRuntime.waitUntil((async () => {
        try {
          const text = message.text || message.caption || "";
          let imageBase64: string | undefined;

          // Se tiver imagem, obter a de maior resolução
          if (message.photo && message.photo.length > 0) {
            const largestPhoto = message.photo[message.photo.length - 1];
            imageBase64 = await fetchTelegramMedia(largestPhoto.file_id, botToken);
          } else if (message.document && message.document.mime_type?.startsWith("image/")) {
            imageBase64 = await fetchTelegramMedia(message.document.file_id, botToken);
          }

          const responseText = await processMessage({
            text,
            imageBase64,
            userId: mapping.user_id,
            workspaceId: mapping.workspace_id,
            accessLevel: mapping.access_level,
            isGroup,
            channelType: "telegram",
            supabaseUrl,
            supabaseServiceKey,
            nomeExibicao: mapping.nome_exibicao
          });

          await sendToTelegram(chatId, responseText, botToken);
        } catch (err) {
          console.error("[Telegram WaitUntil Task Exception]", err);
          await sendToTelegram(chatId, "⚠️ Desculpe, ocorreu um erro ao processar sua solicitação em background.", botToken);
        }
      })());

      return response;
    } catch (err: any) {
      console.error("[Telegram Endpoint Route Error]", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  // ─── ENDPOINT: WHATSAPP (ASSÍNCRONO - PREVINE TIMEOUT) ──────────────────────
  if (path.endsWith("/whatsapp")) {
    try {
      const body = await req.json();
      
      // O webhook da Evolution API normalmente envia eventos como 'messages.upsert'
      if (body.event !== "messages.upsert" || !body.data || !body.data.key) {
        return new Response(JSON.stringify({ success: true, message: "Ignored event type" }), { status: 200, headers: CORS_HEADERS });
      }

      const messageData = body.data;
      const remoteJid = messageData.key.remoteJid;
      const isGroup = remoteJid.endsWith("@g.us");
      
      const evolutionUrl = Deno.env.get("EVOLUTION_URL") || "";
      const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      const instanceName = body.instance || "default";

      // 1. Procurar por mapeamento ativo para este canal do WhatsApp
      const { data: mapping } = await supabase
        .from("channel_mappings")
        .select("*")
        .eq("channel_type", "whatsapp")
        .eq("channel_id", remoteJid)
        .eq("is_active", true)
        .maybeSingle();

      if (!mapping) {
        console.warn(`[WhatsApp Webhook] Mapeamento não encontrado para JID: ${remoteJid}`);
        return new Response(JSON.stringify({ success: true, message: "Ignored (no mapping)" }), { status: 200, headers: CORS_HEADERS });
      }

      // RETORNAR HTTP 200 OK IMEDIATAMENTE ANTES DE CHAMAR A OPENAI
      const response = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });

      // Executa o processamento em background
      // @ts-ignore
      EdgeRuntime.waitUntil((async () => {
        try {
          const messageContent = messageData.message || {};
          const text = messageContent.conversation || 
                     messageContent.extendedTextMessage?.text || 
                     messageContent.imageMessage?.caption || 
                     "";

          let imageBase64: string | undefined;

          // Se tiver imagem, efetua o download e converte para base64
          if (messageContent.imageMessage) {
            imageBase64 = await fetchWhatsAppMedia(messageContent, evolutionUrl, evolutionApiKey);
          }

          const responseText = await processMessage({
            text,
            imageBase64,
            userId: mapping.user_id,
            workspaceId: mapping.workspace_id,
            accessLevel: mapping.access_level,
            isGroup,
            channelType: "whatsapp",
            supabaseUrl,
            supabaseServiceKey,
            nomeExibicao: mapping.nome_exibicao
          });

          await sendToWhatsApp(remoteJid, responseText, instanceName, evolutionUrl, evolutionApiKey);
        } catch (err) {
          console.error("[WhatsApp WaitUntil Task Exception]", err);
          await sendToWhatsApp(remoteJid, "⚠️ Desculpe, ocorreu um erro ao processar sua solicitação em background.", instanceName, evolutionUrl, evolutionApiKey);
        }
      })());

      return response;
    } catch (err: any) {
      console.error("[WhatsApp Endpoint Route Error]", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: CORS_HEADERS });
});
