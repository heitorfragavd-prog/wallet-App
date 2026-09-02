import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  try {
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - 3);

    const { data: alertas, error: errAlertas } = await supabase
      .from("alertas_preco_pendentes")
      .select("*")
      .in("status", ["pendente", "editado"])
      .lt("created_at", dataCorte.toISOString());

    if (errAlertas) throw errAlertas;

    if (!alertas || alertas.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum lembrete necessário" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Filtrar os que já receberam lembrete nos últimos 6 dias
    const seisDiasAtras = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const alertasParaLembrar = alertas.filter(a => !a.ultimo_lembrete || a.ultimo_lembrete < seisDiasAtras);

    if (alertasParaLembrar.length === 0) {
      return new Response(JSON.stringify({ message: "Todos os alertas já foram notificados recentemente" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const fmt = (v: any) =>
      v != null && !isNaN(Number(v))
        ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "N/A";

    let totalEnviados = 0;

    for (const alerta of alertasParaLembrar) {
      // Buscar chat_id do usuário em usuarios_telegram ou telegram_conversas
      let targetChatId: string | null = null;

      const { data: usrTg } = await supabase
        .from("usuarios_telegram")
        .select("telegram_chat_id")
        .eq("user_id", alerta.user_id)
        .limit(1)
        .maybeSingle();

      if (usrTg?.telegram_chat_id) {
        targetChatId = String(usrTg.telegram_chat_id);
      } else {
        const { data: tgConv } = await supabase
          .from("telegram_conversas")
          .select("chat_id")
          .eq("user_id", alerta.user_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tgConv?.chat_id) targetChatId = String(tgConv.chat_id);
      }

      if (!targetChatId) continue;

      await supabase.from("alertas_preco_pendentes").update({
        lembretes_enviados: (alerta.lembretes_enviados || 0) + 1,
        ultimo_lembrete: new Date().toISOString(),
      }).eq("id", alerta.id);

      const idCurto = alerta.id.slice(0, 8);
      const precoMostrar = alerta.preco_definido_usuario || alerta.preco_sugerido;

      const msg = `⏰ <b>Lembrete Semanal: Preço Pendente de Ajuste</b>\n\n` +
        `📦 <b>${alerta.produto_descricao}</b>\n` +
        `💰 Custo subiu de ${fmt(alerta.custo_anterior)} para ${fmt(alerta.custo_novo)}\n` +
        `📈 Aumento: +${alerta.variacao_custo_percentual?.toFixed(1)}%\n` +
        `💰 Preço de venda atual: ${fmt(alerta.preco_venda_atual)}\n` +
        `💡 Preço sugerido: <b>${fmt(precoMostrar)}</b>\n\n` +
        `👉 <code>CONFIRMAR ${idCurto}</code> — Aplicar no Eyemobile PDV\n` +
        `👉 <code>EDITAR ${idCurto} 15.00</code> — Definir outro valor\n` +
        `👉 <code>IGNORAR ${idCurto}</code> — Não alterar preço`;

      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: msg,
          parse_mode: "HTML",
        }),
      });

      totalEnviados++;
    }

    return new Response(JSON.stringify({
      message: `Lembretes enviados com sucesso: ${totalEnviados}`,
      alertas_processados: alertasParaLembrar.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
