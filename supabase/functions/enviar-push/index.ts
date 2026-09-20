import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, titulo, mensagem, url = "/" } = await req.json();

    if (!user_id || !titulo || !mensagem) {
      return new Response(JSON.stringify({ success: false, error: "user_id, titulo e mensagem são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    if (!vapidPublicKey || !vapidPrivateKey) {
      // Registrar log de erro
      await supabase.from("notificacoes_log").insert({
        user_id,
        tipo: "push",
        titulo,
        mensagem,
        enviado: false,
        erro: "Chaves VAPID não configuradas nos secrets do Supabase (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY)",
      });

      return new Response(
        JSON.stringify({ success: false, error: "Chaves VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(
      "mailto:suporte@walletapp.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    // Busca subscriptions ativas do usuário
    const { data: subs, error: fetchErr } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (fetchErr || !subs || subs.length === 0) {
      await supabase.from("notificacoes_log").insert({
        user_id,
        tipo: "push",
        titulo,
        mensagem,
        enviado: false,
        erro: "Nenhum dispositivo registrado para este usuário",
      });

      return new Response(
        JSON.stringify({ success: false, message: "Nenhum dispositivo registrado para push" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({ titulo, mensagem, url });
    let enviosComSucesso = 0;
    const erros: string[] = [];

    for (const sub of subs) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };
        await webpush.sendNotification(pushSubscription, payload);
        enviosComSucesso++;
      } catch (err: unknown) {
        const msg = err?.message || String(err);
        erros.push(msg);
        // Se a subscription expirou ou foi revogada (404/410), remove do banco
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    const sucesso = enviosComSucesso > 0;
    await supabase.from("notificacoes_log").insert({
      user_id,
      tipo: "push",
      titulo,
      mensagem,
      enviado: sucesso,
      erro: erros.length > 0 ? erros.join("; ") : null,
    });

    return new Response(
      JSON.stringify({ success: sucesso, envios: enviosComSucesso, total: subs.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
