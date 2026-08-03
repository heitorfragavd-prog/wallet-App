import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, mensagem, titulo = "Wallet Bot" } = await req.json();

    if (!user_id || !mensagem) {
      return new Response(JSON.stringify({ success: false, error: "user_id e mensagem são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    if (!telegramBotToken) {
      await supabase.from("notificacoes_log").insert({
        user_id,
        tipo: "telegram",
        titulo,
        mensagem,
        enviado: false,
        erro: "TELEGRAM_BOT_TOKEN não configurado nos secrets do Supabase",
      });

      return new Response(
        JSON.stringify({ success: false, error: "TELEGRAM_BOT_TOKEN não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Busca o vínculo do usuário com o Telegram
    const { data: usuarioTg, error: tgErr } = await supabase
      .from("usuarios_telegram")
      .select("telegram_chat_id")
      .eq("user_id", user_id)
      .eq("ativo", true)
      .maybeSingle();

    if (tgErr || !usuarioTg?.telegram_chat_id) {
      await supabase.from("notificacoes_log").insert({
        user_id,
        tipo: "telegram",
        titulo,
        mensagem,
        enviado: false,
        erro: "Usuário não possui conta do Telegram vinculada ou ativa",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Telegram não vinculado ao usuário" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Envia a mensagem via API do Telegram
    const resp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: usuarioTg.telegram_chat_id,
        text: mensagem,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const resJson = await resp.json();

    if (!resJson.ok) {
      const errorMsg = resJson.description || "Erro na API do Telegram";
      await supabase.from("notificacoes_log").insert({
        user_id,
        tipo: "telegram",
        titulo,
        mensagem,
        enviado: false,
        erro: errorMsg,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("notificacoes_log").insert({
      user_id,
      tipo: "telegram",
      titulo,
      mensagem,
      enviado: true,
      erro: null,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Mensagem enviada com sucesso via Telegram" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
