import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

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

async function resolveCategoriaByCredor(supabase: any, userId: string, credorOrDesc: string): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
  if (!data || data.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
  const inputNorm = normalize(credorOrDesc);

  // 1. Match exato
  const exact = data.find((c: any) => normalize(c.nome) === inputNorm);
  if (exact) return { id: exact.id, nome: exact.nome };

  // 2. Inclusão completa
  const fullInc = data.find((c: any) => {
    const catNorm = normalize(c.nome);
    return catNorm.length >= 3 && (inputNorm.includes(catNorm) || catNorm.includes(inputNorm));
  });
  if (fullInc) return { id: fullInc.id, nome: fullInc.nome };

  // 3. Match por palavras-chave do beneficiário
  const ignoreWords = new Set(["e", "de", "do", "da", "em", "para", "com", "ltda", "me", "epp", "sa", "s/a", "eireli", "comercio", "distribuicao", "distribuidora", "servicos", "pagamentos", "brasil", "alimentos", "foods", "industria", "cia"]);
  const inputTokens = inputNorm.split(/\s+/).filter((t: string) => t.length >= 3 && !ignoreWords.has(t));

  for (const token of inputTokens) {
    const match = data.find((c: any) => {
      const catNorm = normalize(c.nome);
      return catNorm === token || catNorm.includes(token) || token.includes(catNorm);
    });
    if (match) return { id: match.id, nome: match.nome };
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

  console.log("[telegram-webhook] ===== REQUISIÇÃO RECEBIDA =====");
  console.log("[telegram-webhook] URL:", req.url, "Method:", req.method, "hasBotToken:", !!telegramBotToken);

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (_) {}

    // ─── AÇÕES ADMINISTRATIVAS (Info / Configuração do Webhook) ───
    if (body?.action === "get_webhook_info" || req.method === "GET") {
      if (!telegramBotToken) {
        return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN não configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const [whResp, meResp] = await Promise.all([
        fetch(`https://api.telegram.org/bot${telegramBotToken}/getWebhookInfo`).then(r => r.json()),
        fetch(`https://api.telegram.org/bot${telegramBotToken}/getMe`).then(r => r.json()),
      ]);
      return new Response(JSON.stringify({ webhook_info: whResp, bot_info: meResp, expected_url: `${supabaseUrl}/functions/v1/telegram-webhook` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body?.action === "setup_webhook") {
      if (!telegramBotToken) {
        return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN não configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const targetUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
      const setResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${encodeURIComponent(targetUrl)}&drop_pending_updates=true`).then(r => r.json());
      const meResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getMe`).then(r => r.json());
      return new Response(JSON.stringify({ success: true, targetUrl, telegram_response: setResp, bot: meResp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hojeStr = `${nowSp.getFullYear()}-${String(nowSp.getMonth() + 1).padStart(2, "0")}-${String(nowSp.getDate()).padStart(2, "0")}`;
    const mesAtual = nowSp.getMonth() + 1;
    const anoAtual = nowSp.getFullYear();
    const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;

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

    // ─── VERIFICAÇÃO DE ESTADO DE CONVERSA (Confirmação de Propostas Pendentes) ───
    const respLower = text.toLowerCase().trim();
    const isSim = ["sim", "s", "yes", "y", "confirmar", "confirmo", "pode cadastrar", "cadastrar", "ok"].includes(respLower);
    const isNao = ["não", "nao", "n", "no", "cancelar", "cancela", "não cadastrar"].includes(respLower);

    const { data: conversaAtiva } = await supabase
      .from("telegram_conversas")
      .select("estado, proposta_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (text && (isSim || isNao)) {
      let proposta: any = null;

      if (conversaAtiva?.proposta_id) {
        const { data: propById } = await supabase
          .from("telegram_propostas")
          .select("*")
          .eq("id", conversaAtiva.proposta_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (propById && propById.status === "pendente") {
          proposta = propById;
        }
      }

      // Fallback resiliente: se não encontrou por conversaAtiva, busca a última proposta pendente deste chat
      if (!proposta) {
        const { data: lastProp } = await supabase
          .from("telegram_propostas")
          .select("*")
          .eq("chat_id", chatId)
          .eq("user_id", userId)
          .eq("status", "pendente")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastProp) {
          proposta = lastProp;
        }
      }

      if (isSim) {
        if (!proposta || proposta.status !== "pendente") {
          await supabase.from("telegram_conversas").upsert(
            { user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null, updated_at: new Date().toISOString() },
            { onConflict: "chat_id" }
          );
          await sendReply("❌ <b>Nenhuma proposta pendente encontrada.</b>\n\nEnvie a foto do boleto novamente se desejar cadastrar.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        if (new Date(proposta.expires_at) < new Date()) {
          await supabase.from("telegram_propostas").update({ status: "expirada" }).eq("id", proposta.id);
          await supabase.from("telegram_conversas").upsert(
            { user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null, updated_at: new Date().toISOString() },
            { onConflict: "chat_id" }
          );
          await sendReply("⏰ <b>A proposta expirou.</b>\n\nEnvie a foto do boleto novamente para gerar uma nova proposta.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const dados = typeof proposta.dados === "string" ? JSON.parse(proposta.dados) : proposta.dados;
        
        // Sanitização de valores e datas
        const parseNum = (v: any) => {
          if (typeof v === "number") return isNaN(v) ? 0 : v;
          if (!v) return 0;
          const s = String(v).replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
          const n = parseFloat(s);
          return isNaN(n) ? 0 : n;
        };

        const parseDate = (v: any) => {
          if (!v) return hojeStr;
          const str = String(v).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0];
          if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
            const p = str.split("/");
            return `${p[2]}-${p[1]}-${p[0]}`;
          }
          return hojeStr;
        };

        const valorNum = parseNum(dados.valor_total || dados.valor);
        const vencIso = parseDate(dados.data_vencimento || dados.vencimento);
        const credorNome = String(dados.credor || dados.beneficiario || "Beneficiário Boleto").trim();
        const desc = String(dados.descricao || `Boleto - ${credorNome}`).trim();

        // Busca workspace do usuário para associar a dívida
        const { data: wsMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        const insertPayload: Record<string, any> = {
          user_id: userId,
          descricao: desc,
          valor_total: valorNum,
          valor_restante: valorNum,
          valor_pago: 0,
          data_vencimento: vencIso,
          credor: credorNome,
          status: "pendente",
          parcelas: 1,
          parcelas_pagas: 0,
          metodo_pagamento_esperado: "boleto",
          linha_digitavel: dados.linha_digitavel || null,
          codigo_barras: dados.codigo_barras || null,
        };

        if (dados.categoria_id) {
          insertPayload.categoria_id = dados.categoria_id;
        }

        if (wsMember?.workspace_id) {
          insertPayload.workspace_id = wsMember.workspace_id;
        }

        console.log("[telegram-webhook] Inserindo divida confirmada:", JSON.stringify(insertPayload));

        const { data: dividaInserida, error: errDivida } = await supabase
          .from("dividas")
          .insert(insertPayload)
          .select("id,descricao,valor_total,data_vencimento,credor,categoria_id")
          .single();

        if (errDivida) {
          console.error("[telegram-webhook] Erro ao cadastrar dívida confirmada:", errDivida.message, JSON.stringify(errDivida));
          await sendReply(`❌ <b>Erro ao cadastrar boleto no banco de dados:</b> ${errDivida.message}`);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        await supabase.from("telegram_propostas").update({ status: "confirmada", executed_at: new Date().toISOString() }).eq("id", proposta.id);
        await supabase.from("telegram_conversas").upsert(
          { user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null, updated_at: new Date().toISOString() },
          { onConflict: "chat_id" }
        );

        const valFmt = Number(dividaInserida.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const vencFmt = dividaInserida.data_vencimento ? dividaInserida.data_vencimento.split("T")[0].split("-").reverse().join("/") : "Sem data";

        await sendReply(
          `✅ <b>Boleto cadastrado com sucesso!</b>\n\n` +
          `🏢 Beneficiário: <b>${dividaInserida.credor || "Beneficiário"}</b>\n` +
          (dados.categoria_nome ? `🏷️ Categoria: <b>${dados.categoria_nome}</b>\n` : "") +
          `💰 Valor: <b>${valFmt}</b>\n` +
          `🗓️ Vencimento: <b>${vencFmt}</b>\n\n` +
          `🔔 <b>Lembrete automático agendado para ${vencFmt} às 09:00!</b>\n` +
          `<i>O lançamento já consta na sua Agenda Financeira e na lista de Dívidas.</i>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      } else if (isNao) {
        if (proposta) {
          await supabase.from("telegram_propostas").update({ status: "cancelada" }).eq("id", proposta.id);
        }
        await supabase.from("telegram_conversas").upsert(
          { user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null, updated_at: new Date().toISOString() },
          { onConflict: "chat_id" }
        );
        await sendReply("❌ <b>Cadastro cancelado.</b> O boleto não foi registrado.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      // Se não foi SIM nem NÃO, mas enviou uma nova foto ou comando, o fluxo prossegue abaixo e limpa o estado antigo.
    }

    // ─── CASO 3: Mensagem com Foto / Documento ───
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    const hasDoc = !!message.document;
    const caption = (message.caption || "").trim();
    const promptText = (message.text || caption || "").trim();

    if (hasPhoto || hasDoc) {
      console.log("[telegram-webhook] ===== INÍCIO PROCESSAMENTO DE IMAGEM =====");
      try {
        if (!telegramBotToken) {
          await sendReply("❌ Token do bot do Telegram não configurado no servidor.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Feedback imediato ao usuário
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendChatAction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, action: "typing" }),
        }).catch(() => {});

        const fileId = hasPhoto
          ? message.photo[message.photo.length - 1].file_id
          : message.document.file_id;

        console.log("[telegram-webhook] fileId:", fileId, "hasBotToken:", !!telegramBotToken);

        console.log("[telegram-webhook] Chamando Telegram getFile para fileId:", fileId);
        const getFileResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getFile?file_id=${fileId}`);
        const fileInfo = await getFileResp.json();
        console.log("[telegram-webhook] getFile response ok:", fileInfo?.ok);

        if (!fileInfo?.ok || !fileInfo?.result?.file_path) {
          console.error("[telegram-webhook] getFile falhou:", JSON.stringify(fileInfo));
          await sendReply("❌ Não foi possível baixar a imagem do Telegram. Tente enviar novamente.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const filePath = fileInfo.result.file_path;
        const ext = filePath.split(".").pop()?.toLowerCase() || "jpg";
        const docMime = (message.document?.mime_type || "").toLowerCase();

        // ─── VARIÁVEL ÚNICA — NUNCA redeclare! ───
        let finalImageBase64Uri = "";

        // ============================================
        // FLUXO PDF: OpenAI Assistants API Nativo (Code Interpreter + File Search)
        // ============================================
        if (ext === "pdf" || docMime.includes("pdf")) {
          console.log("[telegram-webhook] Documento PDF recebido, iniciando processamento nativo...");
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
          }).catch(() => {});

          // 1. Baixar PDF do Telegram
          const pdfDownloadResp = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
          if (!pdfDownloadResp.ok) {
            await sendReply("❌ Não foi possível baixar o PDF. Tente enviar novamente.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
          const pdfBuffer = await pdfDownloadResp.arrayBuffer();
          console.log("[telegram-webhook] PDF baixado:", pdfBuffer.byteLength, "bytes");

          let pdfDocumentData: any = null;

          // 2. Busca chave da OpenAI do usuário ou do ambiente
          const { data: iaCfg } = await supabase.from("ia_configuracoes").select("api_key").eq("user_id", userId).maybeSingle();
          const openaiApiKey = iaCfg?.api_key || Deno.env.get("OPENAI_API_KEY");

          if (openaiApiKey) {
            try {
              console.log("[telegram-webhook] Fazendo upload do PDF para OpenAI Files API...");
              const fd = new FormData();
              fd.append("purpose", "assistants");
              fd.append("file", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "boleto.pdf");

              const upRes = await fetch("https://api.openai.com/v1/files", {
                method: "POST",
                headers: { Authorization: `Bearer ${openaiApiKey}` },
                body: fd,
              });
              const upData = await upRes.json();
              console.log("[telegram-webhook] OpenAI File ID:", upData?.id);

              if (upData?.id) {
                const fileId = upData.id;
                console.log("[telegram-webhook] Disparando Assistente OpenAI para leitura de boleto...");

                const runRes = await fetch("https://api.openai.com/v1/threads/runs", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${openaiApiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2",
                  },
                  body: JSON.stringify({
                    assistant_id: "asst_VOopPuJfJ8MtZAtLd8WbSC22",
                    thread: {
                      messages: [
                        {
                          role: "user",
                          content: "Extraia com máxima precisão o beneficiário (quem recebe), valor do documento, data de vencimento e linha digitável deste boleto bancário.",
                          attachments: [
                            { file_id: fileId, tools: [{ type: "code_interpreter" }, { type: "file_search" }] },
                          ],
                        },
                      ],
                    },
                  }),
                });
                const runData = await runRes.json();
                console.log("[telegram-webhook] Run ID:", runData?.id, "Thread ID:", runData?.thread_id);

                if (runData?.id && runData?.thread_id) {
                  let runStatus = runData.status;
                  const threadId = runData.thread_id;
                  const runId = runData.id;

                  for (let i = 0; i < 15 && (runStatus === "queued" || runStatus === "in_progress"); i++) {
                    await new Promise((r) => setTimeout(r, 1200));
                    const checkRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                      headers: { Authorization: `Bearer ${openaiApiKey}`, "OpenAI-Beta": "assistants=v2" },
                    });
                    const checkData = await checkRes.json();
                    runStatus = checkData.status;
                  }

                  console.log("[telegram-webhook] Assistente finalizou com status:", runStatus);

                  if (runStatus === "completed") {
                    const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                      headers: { Authorization: `Bearer ${openaiApiKey}`, "OpenAI-Beta": "assistants=v2" },
                    });
                    const msgData = await msgRes.json();
                    const rawMsg = msgData.data?.[0]?.content?.[0]?.text?.value || "";
                    console.log("[telegram-webhook] Resposta do Assistente:", rawMsg.slice(0, 300));

                    try {
                      const cleaned = rawMsg.replace(/```json\s*/i, "").replace(/```/g, "").trim();
                      pdfDocumentData = JSON.parse(cleaned);
                    } catch {
                      const objMatch = rawMsg.match(/\{[\s\S]*\}/);
                      if (objMatch) {
                        try { pdfDocumentData = JSON.parse(objMatch[0]); } catch {}
                      }
                    }
                  }
                }

                // Limpeza do arquivo na OpenAI
                fetch(`https://api.openai.com/v1/files/${fileId}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${openaiApiKey}` },
                }).catch(() => {});
              }
            } catch (asstErr: any) {
              console.error("[telegram-webhook] Falha no Assistente OpenAI:", asstErr.message);
            }
          }

          // Se conseguiu extrair os dados do boleto com sucesso
          if (pdfDocumentData && (pdfDocumentData.valor || pdfDocumentData.beneficiario)) {
            const pdfValor = typeof pdfDocumentData.valor === "number" ? pdfDocumentData.valor : parseFloat(String(pdfDocumentData.valor).replace(",", ".")) || 0;
            const pdfVenc = pdfDocumentData.data_vencimento || pdfDocumentData.vencimento || hojeStr;
            const pdfBenef = String(pdfDocumentData.beneficiario || "Beneficiário Boleto").trim();
            const pdfLinha = String(pdfDocumentData.linha_digitavel || "").trim();
            const pdfDesc = String(pdfDocumentData.descricao || `Boleto PDF - ${pdfBenef}`).trim();

            const pdfCat = await resolveCategoriaByCredor(supabase, userId, `${pdfBenef} ${pdfDesc}`);

            const { data: pdfProposta, error: errPdfProp } = await supabase
              .from("telegram_propostas")
              .insert({
                user_id: userId,
                chat_id: chatId,
                tipo: "cadastrar_divida",
                dados: {
                  descricao: pdfDesc,
                  valor_total: pdfValor,
                  valor_restante: pdfValor,
                  data_vencimento: pdfVenc,
                  credor: pdfBenef,
                  categoria_id: pdfCat?.id || null,
                  categoria_nome: pdfCat?.nome || null,
                  status: "pendente",
                  linha_digitavel: pdfLinha || null,
                },
                resumo: `Boleto PDF de ${pdfBenef} no valor de R$ ${pdfValor.toFixed(2)} com vencimento em ${pdfVenc}`,
                status: "pendente",
                expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              })
              .select("id")
              .single();

            if (!errPdfProp && pdfProposta) {
              await supabase.from("telegram_conversas").upsert(
                { user_id: userId, chat_id: chatId, estado: "aguardando_confirmacao_boleto", proposta_id: pdfProposta.id, updated_at: new Date().toISOString() },
                { onConflict: "chat_id" }
              );
              const pdfValFmt = pdfValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
              const pdfIsVencido = pdfVenc && pdfVenc < hojeStr;
              const pdfVencFmt = pdfVenc ? pdfVenc.split("-").reverse().join("/") : "Sem data";
              await sendReply(
                `📄 <b>Boleto PDF identificado!</b>\n\n` +
                `🏢 Beneficiário: <b>${pdfBenef}</b>\n` +
                (pdfCat?.nome ? `🏷️ Categoria: <b>${pdfCat.nome}</b>\n` : "") +
                `💰 Valor: <b>${pdfValFmt}</b>\n` +
                `📅 Vencimento: <b>${pdfVencFmt}</b>${pdfIsVencido ? " <i>(⚠️ Boleto vencido)</i>" : ""}\n` +
                (pdfLinha ? `🔢 Linha digitável: <code>${pdfLinha}</code>\n` : "") +
                `\n⚠️ <b>Deseja cadastrar este boleto como dívida?</b>\n\n` +
                `👉 Responda <b>SIM</b> para confirmar o cadastro.\n` +
                `👉 Responda <b>NÃO</b> para cancelar.\n\n` +
                `⏰ <i>Esta proposta expira em 30 minutos.</i>`
              );
              return new Response("OK", { status: 200, headers: corsHeaders });
            }
          }

          // Fallback amigável se a leitura automática do PDF não identificar os dados
          await sendReply(
            "📄 <b>PDF recebido!</b>\n\n" +
            "Os boletos em PDF possuem camadas vetoriais protegidas que impedem a extração direta do texto.\n\n" +
            "📸 <b>Como cadastrar instantaneamente:</b>\n" +
            "Abra o boleto no celular → <b>tire um print / screenshot</b> → envie a imagem aqui no chat!\n\n" +
            "<i>A nossa IA lê a foto na hora, identifica os valores, vencimento e cadastra a dívida automaticamente.</i>"
          );
          return new Response("OK", { status: 200, headers: corsHeaders });
        }


        // ============================================
        // FLUXO IMAGEM (foto normal, se não veio de PDF convertido)
        // ============================================
        if (!finalImageBase64Uri) {
          console.log("[telegram-webhook] Baixando binário de:", filePath);
          const fileDownloadResp = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
          if (!fileDownloadResp.ok) {
            console.error("[telegram-webhook] download binário falhou com status:", fileDownloadResp.status);
            await sendReply("❌ Erro ao transferir o arquivo do Telegram. Tente novamente.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          const arrayBuffer = await fileDownloadResp.arrayBuffer();
          console.log("[telegram-webhook] Tamanho do buffer baixado:", arrayBuffer.byteLength, "bytes");

          if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
            await sendReply("📷 Imagem muito grande (limite de 20MB). Envie uma foto menor ou com resolução padrão.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          const b64 = base64Encode(new Uint8Array(arrayBuffer));
          console.log("[telegram-webhook] Base64 gerado com sucesso! Tamanho:", b64.length);

          const mime = ext === "png" ? "image/png" : "image/jpeg";
          finalImageBase64Uri = `data:${mime};base64,${b64}`;

          // ─── PRÉ-PROCESSAMENTO: Detecção e Rotação Física da Imagem via ImageScript (apenas para fotos) ───
          try {
            console.log("[telegram-webhook] Iniciando decodificação de imagem com ImageScript...");
            const decodedImage = await Image.decode(new Uint8Array(arrayBuffer));
            console.log(`[telegram-webhook] Dimensões da foto: ${decodedImage.width}x${decodedImage.height}`);

            // Gera miniaturas leves nas 4 rotações (0°, 90°, 180°, 270°)
            const angles = [0, 90, 180, 270];
            const thumbs: { angle: number; b64: string }[] = [];

            for (const angle of angles) {
              const rotated = angle === 0 ? decodedImage.clone() : decodedImage.clone().rotate(angle);
              const thumb = rotated.resize(160, Image.RESIZE_AUTO);
              const enc = await thumb.encodeJPEG(50);
              thumbs.push({ angle, b64: base64Encode(enc) });
            }

            console.log("[telegram-webhook] Classificando orientação correta...");
            const orientResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o",
                user_id: userId,
                tools: [],
                messages: [
                  {
                    role: "system",
                    content:
                      "Você é um classificador de orientação de documentos. Analise as 4 miniaturas [0 graus, 90 graus, 180 graus, 270 graus]. Responda APENAS com o número correspondente (0, 90, 180 ou 270) da imagem que estiver na orientação VERTICAL CORRETA de leitura (onde o texto do documento e código de barras estão retos e legíveis de cima para baixo). Responda SOMENTE o número.",
                  },
                  {
                    role: "user",
                    content: [
                      { type: "text", text: "Qual das miniaturas está na orientação vertical correta?" },
                      { type: "text", text: "Opção 0°:" },
                      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumbs[0].b64}` } },
                      { type: "text", text: "Opção 90°:" },
                      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumbs[1].b64}` } },
                      { type: "text", text: "Opção 180°:" },
                      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumbs[2].b64}` } },
                      { type: "text", text: "Opção 270°:" },
                      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumbs[3].b64}` } },
                    ],
                  },
                ],
              }),
            });

            if (orientResp.ok) {
              const orientJson = await orientResp.json();
              const orientText = orientJson.choices?.[0]?.message?.content || "0";
              console.log("[telegram-webhook] Resposta da orientação:", orientText);
              const matchAngle = orientText.match(/(0|90|180|270)/);
              const bestAngle = matchAngle ? parseInt(matchAngle[0], 10) : 0;
              console.log("[telegram-webhook] Melhor ângulo detectado:", bestAngle);

              if (bestAngle !== 0) {
                console.log(`[telegram-webhook] Rotacionando imagem original em ${bestAngle}°...`);
                const rotatedOriginal = decodedImage.rotate(bestAngle);
                const correctedJpg = await rotatedOriginal.encodeJPEG(85);
                finalImageBase64Uri = `data:image/jpeg;base64,${base64Encode(correctedJpg)}`;
                console.log("[telegram-webhook] Imagem rotacionada e re-codificada com sucesso!");
              }
            }
          } catch (imgErr: any) {
            console.error("[telegram-webhook] Erro no pré-processamento ImageScript:", imgErr.message);
          }
        }

        const docAnalysisSystemPrompt = `Você é um sistema especializado em extração de dados de boletos bancários brasileiros a partir de imagens com altíssima precisão.

## REGRAS ABSOLUTAS (obedecer rigorosamente):

1. **BENEFICIÁRIO / CEDENTE (quem RECEBE o dinheiro)**:
   - Procure os campos: "Beneficiário", "Cedente", "Beneficiário Final", "Recebedor", "Razão Social"
   - É a EMPRESA / FORNECEDOR / INSTITUIÇÃO que emitiu o boleto
   - Fica no TOPO do boleto (logo abaixo do nome/logotipo do banco)
   - ⚠️ ESTE é o campo "beneficiario" que você deve extrair
   - ❌ NUNCA confunda com o pagador/sacado

2. **PAGADOR / SACADO (quem PAGA o boleto)**:
   - Procure os campos: "Pagador", "Sacado", "Sacado/Avalista", "Nome do Pagador"
   - Fica na parte INFERIOR do boleto
   - ❌ NUNCA use o PAGADOR como "beneficiario" — o pagador é quem está pagando a conta

3. **VALOR DO DOCUMENTO**:
   - Procure: "Valor do Documento", "Valor", "(=) Valor documento", "Valor cobrado"
   - Normalize para número decimal (ex: 1534.39)
   - Se houver 3 vias, leia a terceira via (na parte inferior da folha)

4. **VENCIMENTO**:
   - Procure: "Vencimento", "Data de Vencimento", "Vencimento do Título"
   - Formato no documento: DD/MM/AAAA → normalize para YYYY-MM-DD
   - Boletos vencidos (data no passado) são válidos e devem ser cadastrados

5. **LINHA DIGITÁVEL**:
   - É a sequência numérica longa no topo do boleto (acima do código de barras)
   - Formato: 47 ou 48 dígitos (com ou sem pontos/espaços)
   - Se visível, extraia a linha digitável completa

6. **CONFIANÇA**:
   - "alta": beneficiário, valor e vencimento lidos com clareza
   - "media": um dos campos secundários foi inferido
   - "baixa": imagem borrada ou dados essenciais ilegíveis

## FORMATO DE RESPOSTA (SEMPRE dentro da tag <document_analysis> com JSON estrito):
<document_analysis>
{
  "tipo": "boleto",
  "beneficiario": "ISPAL INDUSTRIA BRASILEIRA DE",
  "pagador": "HEITOR FRAGA DE OLIVEIRA",
  "valor": 1534.39,
  "data_vencimento": "2026-08-21",
  "descricao": "Boleto - ISPAL INDUSTRIA",
  "linha_digitavel": "34191091079611684293983045790009715450000153439",
  "confianca": "alta",
  "motivo_confianca": "Beneficiário e valores perfeitamente legíveis",
  "campos_ilegiveis": []
}
</document_analysis>`;

        console.log("[telegram-webhook] Chamando openai-proxy para analisar documento (detail: high, temp: 0.0)...");
        const aiDocResponse = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            user_id: userId,
            tools: [],
            temperature: 0.0,
            messages: [
              { role: "system", content: docAnalysisSystemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: promptText || "Analise este boleto bancário brasileiro e extraia com máxima precisão o beneficiário (quem recebe), valor, vencimento e linha digitável." },
                  { type: "image_url", image_url: { url: finalImageBase64Uri, detail: "high" } },
                ],
              },
            ],
          }),
        });

        console.log("[telegram-webhook] openai-proxy doc status:", aiDocResponse.status);

        if (!aiDocResponse.ok) {
          const errText = await aiDocResponse.text();
          console.error("[telegram-webhook] openai-proxy falhou na análise de doc:", errText);
          await sendReply("❌ Erro ao analisar a imagem com a IA. Detalhe: " + errText.slice(0, 100));
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const aiDocJson = await aiDocResponse.json();
        const docAnalysisText = aiDocJson.choices?.[0]?.message?.content || "";
        console.log("[telegram-webhook] Análise retornada pela IA:", docAnalysisText.slice(0, 300));

        let documentData: any = null;
        const jsonTagMatch = docAnalysisText.match(/<document_analysis>([\s\S]*?)<\/document_analysis>/);
        if (jsonTagMatch) {
          try {
            documentData = JSON.parse(jsonTagMatch[1].trim());
          } catch (err: any) {
            console.error("[telegram-webhook] Erro ao parsear JSON de <document_analysis>:", err.message);
          }
        }

        if (!documentData) {
          try {
            const cleaned = docAnalysisText.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
            documentData = JSON.parse(cleaned);
          } catch {
            // fallback: regex para achar primeiro objeto JSON { ... }
            const objMatch = docAnalysisText.match(/\{[\s\S]*\}/);
            if (objMatch) {
              try {
                documentData = JSON.parse(objMatch[0]);
              } catch {}
            }
          }
        }

        if (documentData && (documentData.tipo === "boleto" || documentData.valor || documentData.beneficiario)) {
          // Normaliza campos caso venham com nomes alternativos
          if (!documentData.tipo) documentData.tipo = "boleto";
          if (!documentData.data_vencimento && documentData.vencimento) {
            documentData.data_vencimento = documentData.vencimento;
          }
          // ─── VALIDAÇÃO DETERMINÍSTICA CONTRA ALUCINAÇÃO ───
          const parseNum = (v: any) => {
            if (typeof v === "number") return isNaN(v) ? 0 : v;
            if (!v) return 0;
            const s = String(v).replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
          };

          const parseDt = (v: any) => {
            if (!v) return null;
            const str = String(v).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split("T")[0];
            if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
              const p = str.split("/");
              return `${p[2]}-${p[1]}-${p[0]}`;
            }
            return null;
          };

          const valor = parseNum(documentData.valor);
          const dataVencimento = parseDt(documentData.data_vencimento);
          const beneficiario = String(documentData.beneficiario || "").trim();
          const linhaDigitavel = String(documentData.linha_digitavel || "").replace(/\s/g, "");

          const camposIlegiveis: string[] = Array.isArray(documentData.campos_ilegiveis) ? [...documentData.campos_ilegiveis] : [];
          const isConfiancaBaixa = (documentData.confianca === "baixa" && (valor <= 0 || !dataVencimento)) || camposIlegiveis.length >= 3;

          if (isConfiancaBaixa) {
            const listaCampos = camposIlegiveis.length > 0
              ? camposIlegiveis.map(c => `• <b>${c}</b>`).join("\n")
              : "• <b>Valor ou data de vencimento ilegíveis</b>";

            const msgRecusa =
              `📄 <b>Não foi possível analisar o boleto com segurança.</b>\n\n` +
              `⚠️ <b>A imagem está muito borrada, cortada ou com iluminação insuficiente.</b>\n\n` +
              `❌ <b>Campos não identificados com precisão:</b>\n` +
              `${listaCampos}\n\n` +
              `📸 <b>Dica para envio:</b>\n` +
              `Envie uma foto nítida e bem iluminada enquadrando todo o código de barras e valores.`;

            await sendReply(msgRecusa);
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          // ─── BUSCA AUTOMÁTICA DE CATEGORIA PELO BENEFICIÁRIO ───
          const catEncontrada = await resolveCategoriaByCredor(supabase, userId, `${beneficiario} ${documentData.descricao || ""}`);
          const categoriaId = catEncontrada?.id || null;
          const categoriaNome = catEncontrada?.nome || null;
          console.log("[telegram-webhook] Categoria auto-identificada para", beneficiario, ":", categoriaNome, "(id:", categoriaId, ")");

          const descricaoBoleto = String(documentData.descricao || `Boleto - ${beneficiario}`).trim();
          const linhaFmt = documentData.linha_digitavel ? String(documentData.linha_digitavel).trim() : "";

          const { data: propostaSalva, error: errProp } = await supabase
            .from("telegram_propostas")
            .insert({
              user_id: userId,
              chat_id: chatId,
              tipo: "cadastrar_divida",
              dados: {
                descricao: descricaoBoleto,
                valor_total: valor,
                valor_restante: valor,
                data_vencimento: dataVencimento || hojeStr,
                credor: beneficiario,
                categoria_id: categoriaId,
                categoria_nome: categoriaNome,
                status: "pendente",
                linha_digitavel: linhaFmt || null,
              },
              resumo: `Boleto de ${beneficiario} no valor de R$ ${valor.toFixed(2)} com vencimento em ${dataVencimento || hojeStr}`,
              status: "pendente",
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();

          if (!errProp && propostaSalva) {
            const { error: errConv } = await supabase.from("telegram_conversas").upsert(
              {
                user_id: userId,
                chat_id: chatId,
                estado: "aguardando_confirmacao_boleto",
                proposta_id: propostaSalva.id,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "chat_id" }
            );

            if (errConv) {
              console.error("[telegram-webhook] Erro ao salvar estado da conversa:", errConv.message);
            }

            const valFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const isVencido = dataVencimento && dataVencimento < hojeStr;
            const vencFmt = dataVencimento ? dataVencimento.split("-").reverse().join("/") : "Sem data";

            let mensagemProposta =
              `📄 <b>Boleto identificado!</b>\n\n` +
              `🏢 Beneficiário: <b>${beneficiario}</b>\n` +
              (categoriaNome ? `🏷️ Categoria: <b>${categoriaNome}</b>\n` : "") +
              `💰 Valor: <b>${valFmt}</b>\n` +
              `📅 Vencimento: <b>${vencFmt}</b>${isVencido ? " <i>(⚠️ Boleto vencido)</i>" : ""}\n` +
              (linhaFmt ? `🔢 Linha digitável: <code>${linhaFmt}</code>\n` : "");

            mensagemProposta +=
              `\n⚠️ <b>Deseja cadastrar este boleto como dívida?</b>\n\n` +
              `👉 Responda <b>SIM</b> para confirmar o cadastro.\n` +
              `👉 Responda <b>NÃO</b> para cancelar.\n\n` +
              `⏰ <i>Esta proposta expira em 30 minutos.</i>`;

            await sendReply(mensagemProposta);
            return new Response("OK", { status: 200, headers: corsHeaders });
          } else {
            console.error("[telegram-webhook] Erro ao salvar proposta:", errProp?.message);
            await sendReply("❌ Erro ao registrar a proposta do boleto. Tente novamente.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
        } else if (documentData && documentData.tipo !== "desconhecido" && documentData.confianca !== "baixa") {
          const valFmt = Number(documentData.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const dtFmt = documentData.data || documentData.data_vencimento || "Não identificada";
          await sendReply(
            `📄 <b>Documento identificado: ${String(documentData.tipo).toUpperCase()}</b>\n\n` +
            `💰 Valor: <b>${valFmt}</b>\n` +
            `📅 Data: <b>${dtFmt}</b>\n` +
            `🏢 Beneficiário / Fornecedor: <b>${documentData.beneficiario || "Não identificado"}</b>\n\n` +
            `<i>Para notas fiscais ou comprovantes, você também pode registrar diretamente no aplicativo Wallet!</i>`
          );
          return new Response("OK", { status: 200, headers: corsHeaders });
        } else {
          await sendReply(
            `📄 <b>Não foi possível identificar o documento com clareza.</b>\n\n` +
            `Por favor, envie uma foto nítida e bem iluminada do boleto ou nota fiscal com os valores e códigos visíveis.`
          );
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
      } catch (imgErr: any) {
        console.error("[telegram-webhook] ERRO FATAL no processamento de imagem:", imgErr.message, imgErr.stack);
        await sendReply("❌ Ocorreu um erro ao processar sua imagem: " + imgErr.message);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // ─── CONSULTAS GERAIS DE TEXTO (Vendas, Despesas, Saídas, Dívidas, Saldos) ───
    if (!promptText) {
      await sendReply("👋 Olá! Envie sua pergunta sobre finanças (ex: <i>'Quanto vendeu hoje?'</i>) ou a foto de um boleto para cadastrar.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const systemPrompt = `Você é o assistente financeiro inteligente do Wallet App integrado ao Telegram.
Data atual (fuso de Brasília): ${hojeStr} (Mês: ${mesAtual}/${anoAtual}).
Início do mês atual: ${primeiroDiaMes}.

Diretrizes de TOM DE VOZ e ESTILO:
- Tom: PROFISSIONAL, CORDIAL, DIRETO E OBJETIVO.
- Para saudações e cumprimentos (ex: "oi", "olá", "bom dia", "boa tarde"): responda cordialmente e informe que está pronto para consultar vendas, contas, dívidas ou cadastrar boletos.
- NUNCA use frases conclusivas exageradas (ex: "Bate certinho", "Vamos em frente", "Show de bola").
- NUNCA use a palavra "Fechamento" a menos que o usuário pergunte especificamente sobre fechamento de turno/caixa.
- NUNCA invente dados ou conceitos não informados pelas ferramentas.
- Comece respostas de vendas com: "As vendas de [período], [data], foram:" (ex: "As vendas de hoje, 18/08/2026, foram:")
- Termine respostas de vendas com: "Se precisar de mais informações, estou à disposição!"
- Formatação: use negrito em HTML (<b>valor</b>) nos valores e números.
- Use emojis como marcadores temáticos em blocos organizados:
  • Métodos de pagamento: 💰 Dinheiro, 💳 Débito, 💳 Crédito, 📲 Pix, 🎫 Voucher
  • Métricas: 📈 Total de vendas, 🛒 Transações, 💵 Ticket médio

Exemplo de formato esperado para consulta de vendas:
As vendas de hoje, 18/08/2026, foram:

💰 Dinheiro: <b>R$ 177,60</b>
💳 Débito: <b>R$ 266,10</b>
💳 Crédito: <b>R$ 47,30</b>
📲 Pix: <b>R$ 302,10</b>

📈 Total de vendas: <b>R$ 793,10</b>
🛒 Transações: <b>62</b>
💵 Ticket médio: <b>R$ 12,79</b>

Se precisar de mais informações, estou à disposição!

Exemplo de formato esperado para consulta de despesas / pagamentos / saídas do dia:
As saídas de hoje, 18/08/2026, foram:

💰 Total: <b>R$ 5.000,00</b>
📝 Transações: <b>1</b>

💼 Pró-labore: <b>R$ 5.000,00</b> — Heitor Fraga de Oliveira (Pix)

Se precisar de mais informações, estou à disposição!

Regras de seleção de ferramentas:
- Quando o usuário perguntar "quanto paguei", "quanto gastei", "quanto saiu de dinheiro", "quanto paguei de dívida/conta hoje", "despesas de hoje/ontem/mês", "pró-labore" → use SEMPRE consultar_saidas_caixa_periodo com data_inicio=${hojeStr} e data_fim=${hojeStr}.
- Quando o usuário perguntar "quanto devo", "dívidas pendentes", "boletos a vencer" → use consultar_dividas.
- Quando o usuário perguntar sobre vendas, faturamento, caixa do PDV → use consultar_vendas_eyemobile.

Ferramentas disponíveis:
- cadastrar_divida: Cadastra uma nova dívida ou financiamento no sistema.
- cadastrar_boleto: Cadastra um boleto como dívida no sistema.
- cadastrar_despesa_nf: Cadastra despesa a partir de Nota Fiscal.
- consultar_saidas_caixa_periodo: Consulta TODAS as saídas de dinheiro do período: despesas, pró-labore, salários, vales, pagamentos de dívidas, transferências e saques.
- consultar_vendas_eyemobile: Consulta vendas do PDV Eyemobile em tempo real via API e banco de dados.
- buscar_transacoes: Consulta transações locais gerais.
- consultar_saldos: Consulta saldos de contas cadastradas.
- consultar_dividas: Consulta dívidas pendentes e futuras a vencer.
- consultar_resumo_mensal: Consulta resumo financeiro mensal consolidado (ano=${anoAtual}, mes=${mesAtual}).`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: promptText },
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
        if (replyContent) {
          await sendReply(replyContent);
          return new Response("OK", { status: 200, headers: corsHeaders });
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
