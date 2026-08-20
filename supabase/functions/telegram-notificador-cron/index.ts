import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  if (!botToken) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Obter data de hoje no fuso do Brasil (America/Sao_Paulo)
  const nowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const hoje = new Date(`${nowStr}T12:00:00Z`);

  // 1. NOTIFICAR: boletos que vencem AMANHÃ (1 dia)
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const amanhaStr = amanha.toISOString().split("T")[0];

  const { data: dividasAmanha } = await supabase
    .from("dividas")
    .select("id, descricao, credor, valor_total, valor_restante, data_vencimento, user_id")
    .or("status.eq.pendente,status.eq.parcial")
    .eq("notificado_1dia", false)
    .eq("data_vencimento", amanhaStr);

  let totalNotificados = 0;

  for (const divida of dividasAmanha || []) {
    // Buscar chat_id do usuário
    const { data: userTelegram } = await supabase
      .from("telegram_usuarios")
      .select("telegram_chat_id")
      .eq("user_id", divida.user_id)
      .maybeSingle();

    const chatId = userTelegram?.telegram_chat_id;
    if (!chatId) continue;

    const valor = Number(divida.valor_restante || divida.valor_total || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const msg =
      `⏰ <b>LEMBRETE: Boleto vence AMANHÃ!</b>\n\n` +
      `📄 <b>Descrição:</b> ${divida.descricao || "Boleto"}\n` +
      (divida.credor ? `🏢 <b>Fornecedor:</b> ${divida.credor}\n` : "") +
      `💰 <b>Valor:</b> <b>${valor}</b>\n` +
      `📅 <b>Vencimento:</b> ${amanhaStr.split("-").reverse().join("/")}\n\n` +
      `💳 <i>Não esqueça de realizar o pagamento para evitar juros!</i>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
    });

    await supabase.from("dividas").update({ notificado_1dia: true }).eq("id", divida.id);
    totalNotificados++;
  }

  // 2. NOTIFICAR: boletos que vencem em 3 DIAS
  const dias3 = new Date(hoje);
  dias3.setDate(dias3.getDate() + 3);
  const dias3Str = dias3.toISOString().split("T")[0];

  const { data: dividas3dias } = await supabase
    .from("dividas")
    .select("id, descricao, credor, valor_total, valor_restante, data_vencimento, user_id")
    .or("status.eq.pendente,status.eq.parcial")
    .eq("notificado_3dias", false)
    .eq("data_vencimento", dias3Str);

  for (const divida of dividas3dias || []) {
    const { data: userTelegram } = await supabase
      .from("telegram_usuarios")
      .select("telegram_chat_id")
      .eq("user_id", divida.user_id)
      .maybeSingle();

    const chatId = userTelegram?.telegram_chat_id;
    if (!chatId) continue;

    const valor = Number(divida.valor_restante || divida.valor_total || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const msg =
      `📅 <b>ALERTA: Boleto vence em 3 dias!</b>\n\n` +
      `📄 <b>Descrição:</b> ${divida.descricao || "Boleto"}\n` +
      (divida.credor ? `🏢 <b>Fornecedor:</b> ${divida.credor}\n` : "") +
      `💰 <b>Valor:</b> <b>${valor}</b>\n` +
      `📅 <b>Vencimento:</b> ${dias3Str.split("-").reverse().join("/")}\n\n` +
      `🔔 <i>Prepare a programação financeira deste pagamento.</i>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
    });

    await supabase.from("dividas").update({ notificado_3dias: true }).eq("id", divida.id);
    totalNotificados++;
  }

  return new Response(
    JSON.stringify({
      status: "success",
      notificados: totalNotificados,
      executado_em: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
