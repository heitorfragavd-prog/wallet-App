import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "WLT-";
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();

    // ─── CASO 1: Chamada da Web App para vincular a conta via Token ───
    if (body?.action === "vincular") {
      const { token, user_id } = body;
      if (!token || !user_id) {
        return new Response(JSON.stringify({ error: "Token e user_id são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: linkToken, error: tokenErr } = await supabase
        .from("telegram_link_tokens")
        .select("*")
        .eq("token", token.toUpperCase().trim())
        .eq("usado", false)
        .maybeSingle();

      if (tokenErr || !linkToken) {
        return new Response(
          JSON.stringify({ error: "Código inválido ou já utilizado. Envie /start para o bot no Telegram para gerar um novo." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert no usuários_telegram
      const { error: upsertErr } = await supabase.from("usuarios_telegram").upsert(
        {
          user_id,
          telegram_chat_id: linkToken.telegram_chat_id,
          telegram_username: linkToken.telegram_username,
          ativo: true,
        },
        { onConflict: "user_id" }
      );

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Marcar token como usado
      await supabase
        .from("telegram_link_tokens")
        .update({ usado: true })
        .eq("token", linkToken.token);

      // Notifica no Telegram que o vínculo foi realizado com sucesso
      if (telegramBotToken) {
        fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: linkToken.telegram_chat_id,
            text: "✅ <b>Conta Wallet vinculada com sucesso!</b>\n\nAgora você pode perguntar sobre suas vendas, saldos ou lançamentos direto por aqui!\n\nExemplos:\n• <i>Quanto vendeu hoje?</i>\n• <i>Qual meu saldo?</i>\n• /dividas - Listar pendências\n• /saldo - Resumo consolidado",
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CASO 2: Webhook enviado diretamente pelo Telegram ───
    const message = body?.message;
    if (!message || !message.chat) {
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const chatId = String(message.chat.id);
    const username = message.chat.username || message.chat.first_name || null;
    const text = (message.text || "").trim();

    console.log("[telegram-webhook] ===== MENSAGEM RECEBIDA =====");
    console.log("[telegram-webhook] chatId:", chatId, "username:", username, "text:", text.slice(0, 100));

    const sendReply = async (replyText: string) => {
      if (!telegramBotToken) return;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
    };

    // Comando /start
    if (text.startsWith("/start")) {
      const token = generateToken();
      await supabase.from("telegram_link_tokens").insert({
        token,
        telegram_chat_id: chatId,
        telegram_username: username,
      });

      await sendReply(
        `👋 <b>Olá! Seja bem-vindo ao Bot da Wallet.</b>\n\n` +
        `Para conectar este Telegram à sua conta no aplicativo:\n\n` +
        `1. Copie este código: <code>${token}</code>\n` +
        `2. Abra o aplicativo Wallet em <b>Notificações</b>\n` +
        `3. Cole o código e clique em <b>Vincular</b>\n\n` +
        `<i>O código é válido para uma única conexão.</i>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Busca vínculo do usuário
    const { data: usuarioTg } = await supabase
      .from("usuarios_telegram")
      .select("user_id")
      .eq("telegram_chat_id", chatId)
      .eq("ativo", true)
      .maybeSingle();

    if (!usuarioTg) {
      console.log("[telegram-webhook] Usuário NÃO vinculado para chatId:", chatId);
      await sendReply(
        `⚠️ <b>Sua conta do Telegram ainda não está vinculada.</b>\n\nEnvie o comando /start para gerar seu código de vínculo.`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const userId = usuarioTg.user_id;
    console.log("[telegram-webhook] Usuário vinculado: userId=", userId, "chatId=", chatId);

    // Comando /dividas
    if (text.startsWith("/dividas")) {
      const { data: dividas } = await supabase
        .from("dividas")
        .select("*")
        .eq("user_id", userId)
        .eq("paga", false)
        .order("data_vencimento", { ascending: true })
        .limit(10);

      if (!dividas || dividas.length === 0) {
        await sendReply("🎉 <b>Nenhuma dívida pendente encontrada!</b> Parabéns!");
      } else {
        let msg = "💳 <b>Suas Dívidas Pendentes:</b>\n\n";
        dividas.forEach((d, idx) => {
          const valor = Number(d.valor || d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const venc = d.data_vencimento ? d.data_vencimento.split("T")[0].split("-").reverse().join("/") : "Sem data";
          msg += `${idx + 1}. <b>${d.nome || d.descricao || "Dívida"}</b>\n   💰 ${valor} | 🗓️ Vence: ${venc}\n\n`;
        });
        await sendReply(msg);
      }
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Comando /saldo
    if (text.startsWith("/saldo")) {
      const [recResp, despResp] = await Promise.all([
        supabase.from("receitas").select("valor").eq("user_id", userId),
        supabase.from("despesas").select("valor").eq("user_id", userId),
      ]);

      const totalReceitas = (recResp.data || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
      const totalDespesas = (despResp.data || []).reduce((acc, d) => acc + (Number(d.valor) || 0), 0);
      const saldo = totalReceitas - totalDespesas;

      const format = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      await sendReply(
        `📊 <b>Resumo Financeiro Consolidado:</b>\n\n` +
        `🟢 <b>Total Receitas:</b> ${format(totalReceitas)}\n` +
        `🔴 <b>Total Despesas:</b> ${format(totalDespesas)}\n` +
        `💵 <b>Saldo Atual:</b> <b>${format(saldo)}</b>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Comando /ajuda
    if (text.startsWith("/ajuda")) {
      await sendReply(
        `🤖 <b>Comandos do Bot Wallet:</b>\n\n` +
        `/dividas - Lista suas dívidas pendentes\n` +
        `/saldo - Exibe o saldo consolidado\n` +
        `/start - Gerar código de vínculo\n` +
        `/ajuda - Ver este menu de comandos\n\n` +
        `💬 <i>Você também pode conversar naturalmente! Exemplos:</i>\n` +
        `• <i>"Quanto vendeu hoje?"</i>\n` +
        `• <i>"Qual o resumo do mês?"</i>\n` +
        `• <i>"Cadastre uma despesa de R$ 50 de almoço"</i>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── CASO 3: Mensagem natural -> Encaminha para o OpenAI Proxy ───
    const systemPrompt = `Você é o assistente financeiro inteligente do Wallet App integrado ao Telegram.
Responda de forma concisa, educada, clara e direta em português do Brasil.
Use formatação HTML simples suportada pelo Telegram (<b>, <i>, <code>).
Sempre use valores monetários em formato Real (ex: R$ 1.234,56).

Ferramentas disponíveis:
- consultar_vendas_eyemobile: Consulta vendas do PDV Eyemobile em tempo real via API. Use SEMPRE que o usuário perguntar sobre vendas do dia, hoje, ontem, semana ou mês, faturamento da loja ou PDV.
- buscar_transacoes: Consulta transações locais de receitas e despesas.
- consultar_saldos: Consulta saldos de contas cadastradas.
- consultar_dividas: Consulta dívidas pendentes.
- consultar_resumo_mensal: Consulta resumo financeiro mensal.`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    try {
      console.log("[telegram-webhook] Encaminhando para openai-proxy:", { userId, model: "gpt-4o-mini", messageCount: aiMessages.length });
      const aiResponse = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          user_id: userId,
          messages: aiMessages,
        }),
      });

      console.log("[telegram-webhook] openai-proxy response status:", aiResponse.status);

      if (aiResponse.ok) {
        const aiJson = await aiResponse.json();
        const replyContent = aiJson.choices?.[0]?.message?.content;
        console.log("[telegram-webhook] Resposta da IA:", (replyContent || "SEM CONTEÚDO").slice(0, 300));
        console.log("[telegram-webhook] aiJson keys:", Object.keys(aiJson));
        if (replyContent) {
          await sendReply(replyContent);
          return new Response("OK", { status: 200, headers: corsHeaders });
        } else {
          console.log("[telegram-webhook] AVISO: replyContent vazio/null. aiJson.choices:", JSON.stringify(aiJson.choices || []).slice(0, 500));
        }
      } else {
        const errorBody = await aiResponse.text();
        console.error("[telegram-webhook] openai-proxy retornou erro:", aiResponse.status, errorBody.slice(0, 500));
      }
    } catch (aiErr: any) {
      console.error("[telegram-webhook] EXCEPTION ao consultar openai-proxy:", aiErr.message, aiErr.stack);
    }

    // Fallback se a IA não retornar resposta
    await sendReply(
      `🤖 <b>Assistente Wallet:</b>\n\n` +
      `Não consegui processar sua consulta no momento.\n\n` +
      `Use /ajuda para ver os comandos disponíveis ou tente perguntar de outra forma (ex: <i>"Quanto vendeu hoje?"</i>).`
    );

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
