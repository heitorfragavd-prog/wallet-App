import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Data de hoje no fuso horário de Brasília
    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hojeStr = `${nowSp.getFullYear()}-${String(nowSp.getMonth() + 1).padStart(2, "0")}-${String(nowSp.getDate()).padStart(2, "0")}`;

    console.log("[notificar-lembretes] Executando rotina de lembretes para data:", hojeStr);

    // Busca lembretes pendentes com data até hoje (inclui eventuais pendências anteriores)
    const { data: lembretes, error: errLembretes } = await supabase
      .from("lembretes")
      .select("*")
      .lte("data", hojeStr)
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(50);

    if (errLembretes) {
      console.error("[notificar-lembretes] Erro ao buscar lembretes:", errLembretes.message);
      return new Response(JSON.stringify({ error: errLembretes.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const total = lembretes?.length || 0;
    console.log(`[notificar-lembretes] ${total} lembrete(s) pendente(s) encontrado(s).`);

    let notificadosCount = 0;
    const resultados: any[] = [];

    for (const l of lembretes || []) {
      const logsEnvio: string[] = [];

      // 1. Notificação Telegram
      if (l.notificar_telegram && telegramBotToken) {
        try {
          const { data: tgUser } = await supabase
            .from("usuarios_telegram")
            .select("telegram_chat_id")
            .eq("user_id", l.user_id)
            .eq("ativo", true)
            .maybeSingle();

          if (tgUser?.telegram_chat_id) {
            const msgTg =
              `🔔 <b>Lembrete de Vencimento de Dívida / Boleto!</b>\n\n` +
              `📌 <b>${l.titulo.replace(/^🔔\s*/, "")}</b>\n` +
              `📝 ${l.descricao}\n\n` +
              `🗓️ Vencimento: <b>${l.data.split("-").reverse().join("/")}</b>\n\n` +
              `<i>Abra o aplicativo Wallet para registrar o pagamento ou consultar detalhes na sua Agenda Financeira.</i>`;

            const respTg = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: tgUser.telegram_chat_id,
                text: msgTg,
                parse_mode: "HTML",
              }),
            });

            if (respTg.ok) {
              logsEnvio.push("telegram_sucesso");
            } else {
              const errBody = await respTg.text();
              console.error("[notificar-lembretes] Erro Telegram:", errBody);
              logsEnvio.push("telegram_erro");
            }
          }
        } catch (err: unknown) {
          console.error("[notificar-lembretes] Exceção Telegram:", err.message);
          logsEnvio.push("telegram_exception");
        }
      }

      // 2. Notificação In-App / Push Navegador
      if (l.notificar_navegador) {
        try {
          await supabase.from("notificacoes").insert({
            user_id: l.user_id,
            titulo: l.titulo,
            mensagem: l.descricao,
            lida: false,
            link_redirecionamento: "/agenda",
          });
          logsEnvio.push("in_app_sucesso");
        } catch (err: unknown) {
          console.error("[notificar-lembretes] Erro in-app notificacoes:", err.message);
          logsEnvio.push("in_app_erro");
        }
      }

      // 3. Atualiza status do lembrete para 'notificado'
      await supabase
        .from("lembretes")
        .update({
          status: "notificado",
          notificado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", l.id);

      notificadosCount++;
      resultados.push({ id: l.id, titulo: l.titulo, canais: logsEnvio });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: hojeStr,
        total_encontrados: total,
        notificados: notificadosCount,
        detalhes: resultados,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[notificar-lembretes] Exceção geral:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
