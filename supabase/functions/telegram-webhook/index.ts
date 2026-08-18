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
    const { data: conversaAtiva } = await supabase
      .from("telegram_conversas")
      .select("estado, proposta_id")
      .eq("user_id", userId)
      .eq("chat_id", chatId)
      .maybeSingle();

    if (text && conversaAtiva?.estado === "aguardando_confirmacao_boleto" && conversaAtiva.proposta_id) {
      const respLower = text.toLowerCase().trim();
      const isSim = ["sim", "s", "yes", "y", "confirmar", "confirmo", "pode cadastrar"].includes(respLower);
      const isNao = ["não", "nao", "n", "no", "cancelar", "cancela"].includes(respLower);

      if (isSim) {
        const { data: proposta } = await supabase
          .from("telegram_propostas")
          .select("*")
          .eq("id", conversaAtiva.proposta_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!proposta || proposta.status !== "pendente") {
          await supabase.from("telegram_conversas").upsert({ user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null });
          await sendReply("❌ <b>Proposta não encontrada ou já processada.</b>\n\nEnvie a foto do boleto novamente se desejar cadastrar.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        if (new Date(proposta.expires_at) < new Date()) {
          await supabase.from("telegram_propostas").update({ status: "expirada" }).eq("id", proposta.id);
          await supabase.from("telegram_conversas").upsert({ user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null });
          await sendReply("⏰ <b>A proposta expirou.</b>\n\nEnvie a foto do boleto novamente para gerar uma nova proposta.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const dados = typeof proposta.dados === "string" ? JSON.parse(proposta.dados) : proposta.dados;
        const { data: dividaInserida, error: errDivida } = await supabase
          .from("dividas")
          .insert({
            user_id: userId,
            descricao: dados.descricao || `Boleto - ${dados.credor || "Credor"}`,
            valor_total: Number(dados.valor_total || 0),
            valor_restante: Number(dados.valor_restante || dados.valor_total || 0),
            valor_pago: 0,
            data_vencimento: dados.data_vencimento || null,
            credor: dados.credor || null,
            status: "pendente",
            observacoes: dados.observacoes || null,
            linha_digitavel: dados.linha_digitavel || null,
            codigo_barras: dados.codigo_barras || null,
            metodo_pagamento_esperado: "boleto",
          })
          .select("id,descricao,valor_total,data_vencimento,credor")
          .single();

        if (errDivida) {
          console.error("[telegram-webhook] Erro ao cadastrar dívida confirmada:", errDivida.message);
          await sendReply("❌ <b>Erro ao cadastrar boleto no banco de dados.</b> Tente novamente.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        await supabase.from("telegram_propostas").update({ status: "confirmada", executed_at: new Date().toISOString() }).eq("id", proposta.id);
        await supabase.from("telegram_conversas").upsert({ user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null });

        const valFmt = Number(dividaInserida.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const vencFmt = dividaInserida.data_vencimento ? dividaInserida.data_vencimento.split("T")[0].split("-").reverse().join("/") : "Sem data";

        await sendReply(
          `✅ <b>Boleto cadastrado com sucesso!</b>\n\n` +
          `🏢 Beneficiário: <b>${dividaInserida.credor || "Beneficiário"}</b>\n` +
          `💰 Valor: <b>${valFmt}</b>\n` +
          `🗓️ Vencimento: <b>${vencFmt}</b>\n\n` +
          `<i>O lançamento já consta na sua Agenda Financeira e na lista de Dívidas!</i>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      } else if (isNao) {
        await supabase.from("telegram_propostas").update({ status: "cancelada" }).eq("id", conversaAtiva.proposta_id);
        await supabase.from("telegram_conversas").upsert({ user_id: userId, chat_id: chatId, estado: "livre", proposta_id: null });
        await sendReply("❌ <b>Cadastro cancelado.</b> O boleto não foi registrado.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      // Se não foi SIM nem NÃO, mas enviou uma nova foto ou comando, o fluxo prossegue abaixo e limpa o estado antigo.
    }

    // ─── CASO 3: Mensagem natural / Foto / Documento -> Encaminha para o OpenAI Proxy ───
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    const hasDoc = !!message.document;
    const caption = (message.caption || "").trim();
    const promptText = (message.text || caption || "").trim();

    let imageBase64Uri: string | null = null;
    if (hasPhoto || hasDoc) {
      try {
        const fileId = hasPhoto
          ? message.photo[message.photo.length - 1].file_id
          : message.document.file_id;

        console.log("[telegram-webhook] Baixando arquivo/imagem do Telegram:", fileId);
        const getFileResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getFile?file_id=${fileId}`);
        if (getFileResp.ok) {
          const fileInfo = await getFileResp.json();
          const filePath = fileInfo?.result?.file_path;
          if (filePath) {
            console.log("[telegram-webhook] Baixando binário de:", filePath);
            const fileDownloadResp = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
            if (fileDownloadResp.ok) {
              const arrayBuffer = await fileDownloadResp.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);
              let binary = "";
              const len = uint8.byteLength;
              for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(uint8[i]);
              }
              const b64 = btoa(binary);
              const ext = filePath.split(".").pop()?.toLowerCase() || "jpg";
              const mime = ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "image/jpeg";
              imageBase64Uri = `data:${mime};base64,${b64}`;
              console.log("[telegram-webhook] Documento/Imagem convertido para base64 com sucesso! Mime:", mime, "tamanho:", b64.length);
            }
          }
        }
      } catch (err: any) {
        console.error("[telegram-webhook] Falha ao baixar arquivo do Telegram:", err.message);
      }
    }

    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hojeStr = `${nowSp.getFullYear()}-${String(nowSp.getMonth() + 1).padStart(2, "0")}-${String(nowSp.getDate()).padStart(2, "0")}`;
    const mesAtual = nowSp.getMonth() + 1;
    const anoAtual = nowSp.getFullYear();
    const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;

    console.log("[telegram-webhook] Data servidor (UTC):", new Date().toISOString());
    console.log("[telegram-webhook] Data Brasil:", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    console.log("[telegram-webhook] hojeStr enviado:", hojeStr, "primeiroDiaMes:", primeiroDiaMes, "hasImage:", !!imageBase64Uri);

    // Se é uma imagem/documento, analisar estruturadamente para preparar a proposta
    if (imageBase64Uri) {
      const docAnalysisSystemPrompt = `Você é o assistente financeiro do Wallet App especializado em análise de documentos e boletos.
Analise a imagem enviada e identifique se é: boleto, nota fiscal, comprovante ou outro documento.

Se for BOLETO:
- Extraia com precisão: valor em reais, data de vencimento (YYYY-MM-DD), beneficiário/credor/emissor, descrição do boleto, e linha digitável / código de barras (se legível).
- Responda SEMPRE incluindo o JSON estruturado dentro da tag <document_analysis> da seguinte forma:
<document_analysis>
{
  "tipo": "boleto",
  "valor": 123.45,
  "data_vencimento": "YYYY-MM-DD",
  "beneficiario": "Nome do Beneficiário",
  "descricao": "Boleto - Nome",
  "linha_digitavel": "12345.67890 12345.678901 12345.678901 1 12345678901234",
  "confianca": "alta"
}
</document_analysis>

Se for NOTA FISCAL ou COMPROVANTE:
<document_analysis>
{
  "tipo": "nota_fiscal",
  "valor": 123.45,
  "data": "YYYY-MM-DD",
  "beneficiario": "Fornecedor",
  "confianca": "alta"
}
</document_analysis>

Se a imagem não for legível ou não for documento financeiro:
<document_analysis>
{
  "tipo": "desconhecido",
  "confianca": "baixa"
}
</document_analysis>`;

      try {
        const aiDocResponse = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            user_id: userId,
            messages: [
              { role: "system", content: docAnalysisSystemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: promptText || "Analise este documento financeiro e extraia os dados." },
                  { type: "image_url", image_url: { url: imageBase64Uri } },
                ],
              },
            ],
          }),
        });

        if (aiDocResponse.ok) {
          const aiDocJson = await aiDocResponse.json();
          const docAnalysisText = aiDocJson.choices?.[0]?.message?.content || "";
          console.log("[telegram-webhook] Análise de documento retornada:", docAnalysisText.slice(0, 300));

          const jsonMatch = docAnalysisText.match(/<document_analysis>([\s\S]*?)<\/document_analysis>/);
          let documentData: any = null;
          if (jsonMatch) {
            try {
              documentData = JSON.parse(jsonMatch[1].trim());
            } catch (err: any) {
              console.error("[telegram-webhook] Erro ao parsear JSON da análise:", err.message);
            }
          }

          if (documentData && documentData.tipo === "boleto" && Number(documentData.valor) > 0) {
            const valor = Number(documentData.valor) || 0;
            const vencimento = documentData.data_vencimento || hojeStr;
            const beneficiario = documentData.beneficiario || "Beneficiário Boleto";
            const descricao = documentData.descricao || `Boleto - ${beneficiario}`;
            const linhaDigitavel = documentData.linha_digitavel || "";

            const { data: propostaSalva, error: errProp } = await supabase
              .from("telegram_propostas")
              .insert({
                user_id: userId,
                chat_id: chatId,
                tipo: "cadastrar_divida",
                dados: {
                  descricao,
                  valor_total: valor,
                  valor_restante: valor,
                  data_vencimento: vencimento,
                  credor: beneficiario,
                  status: "pendente",
                  observacoes: linhaDigitavel ? `Linha digitável: ${linhaDigitavel}` : "Extraído de boleto via Telegram",
                  linha_digitavel: linhaDigitavel || null,
                },
                resumo: `Boleto de ${beneficiario} no valor de R$ ${valor.toFixed(2)} com vencimento em ${vencimento}`,
                status: "pendente",
                expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              })
              .select("id")
              .single();

            if (!errProp && propostaSalva) {
              await supabase.from("telegram_conversas").upsert({
                user_id: userId,
                chat_id: chatId,
                estado: "aguardando_confirmacao_boleto",
                proposta_id: propostaSalva.id,
                updated_at: new Date().toISOString(),
              });

              const valFmt = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
              const vencFmt = vencimento.split("T")[0].split("-").reverse().join("/");

              const mensagemProposta =
                `📄 <b>Boleto identificado!</b>\n\n` +
                `🏢 Beneficiário: <b>${beneficiario}</b>\n` +
                `💰 Valor: <b>${valFmt}</b>\n` +
                `📅 Vencimento: <b>${vencFmt}</b>\n` +
                (linhaDigitavel ? `🔢 Linha digitável: <code>${linhaDigitavel}</code>\n` : "") +
                `\n⚠️ <b>Deseja cadastrar este boleto como dívida?</b>\n\n` +
                `👉 Responda <b>SIM</b> para confirmar o cadastro.\n` +
                `👉 Responda <b>NÃO</b> para cancelar.\n\n` +
                `⏰ <i>Esta proposta expira em 30 minutos.</i>`;

              await sendReply(mensagemProposta);
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
        }
      } catch (err: any) {
        console.error("[telegram-webhook] Erro ao processar documento:", err.message);
      }
    }

    // ─── CONSULTAS GERAIS DE TEXTO (Vendas, Despesas, Saídas, Dívidas, Saldos) ───
    const systemPrompt = `Você é o assistente financeiro inteligente do Wallet App integrado ao Telegram.
Data atual (fuso de Brasília): ${hojeStr} (Mês: ${mesAtual}/${anoAtual}).
Início do mês atual: ${primeiroDiaMes}.

Diretrizes de TOM DE VOZ e ESTILO (obrigatórias):
- Tom: PROFISSIONAL, DIRETO, OBJETIVO. Como um relatório conciso. O usuário quer números claros e dados estruturados.
- NUNCA use frases introdutórias coloquiais (ex: "Conferi", "Dei uma olhada", "Está tudo certo", "Verifiquei").
- NUNCA use frases conclusivas entusiasmadas (ex: "Bate certinho", "Vamos em frente", "Tudo nos conformes", "Show de bola").
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
