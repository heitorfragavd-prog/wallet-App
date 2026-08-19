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

async function resolveCategoriaByCredor(
  supabase: any,
  userId: string,
  credorOrDesc: string,
  supabaseUrl?: string,
  serviceKey?: string
): Promise<{ id: string; nome: string } | null> {
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
  const credorNorm = normalize(credorOrDesc);
  if (!credorNorm || credorNorm.length < 2) return null;

  try {
    // ─── 1. CACHE: Histórico de aprendizado do usuário ───
    const { data: cacheHit } = await supabase
      .from("categoria_credor_cache")
      .select("id, hits, categoria_id, categorias(id, nome)")
      .eq("user_id", userId)
      .eq("credor_normalizado", credorNorm)
      .maybeSingle();

    if (cacheHit?.categorias) {
      console.log(`[telegram-webhook] Categoria encontrada via CACHE para "${credorOrDesc}":`, cacheHit.categorias.nome);
      supabase
        .from("categoria_credor_cache")
        .update({ hits: (cacheHit.hits || 1) + 1, updated_at: new Date().toISOString() })
        .eq("id", cacheHit.id)
        .then(() => {});
      return { id: cacheHit.categorias.id, nome: cacheHit.categorias.nome };
    }
  } catch (err: any) {
    console.warn("[telegram-webhook] Aviso ao consultar categoria_credor_cache:", err.message);
  }

  const { data: categorias } = await supabase
    .from("categorias")
    .select("id,nome,tipo,aliases")
    .eq("user_id", userId);

  if (!categorias || categorias.length === 0) return null;

  // ─── 2. ALIASES: Sinônimos e marcas cadastrados ───
  for (const cat of categorias) {
    if (!cat.aliases) continue;
    const aliasList = cat.aliases.split(",").map((a: string) => normalize(a.trim()));
    for (const alias of aliasList) {
      if (alias.length >= 3 && (credorNorm.includes(alias) || alias.includes(credorNorm))) {
        console.log(`[telegram-webhook] Categoria encontrada via ALIAS ("${alias}") para "${credorOrDesc}":`, cat.nome);
        return { id: cat.id, nome: cat.nome };
      }
    }
  }

  // ─── 3. MATCH EXATO E POR INCLUSÃO COMPLETA ───
  const exact = categorias.find((c: any) => normalize(c.nome) === credorNorm);
  if (exact) return { id: exact.id, nome: exact.nome };

  const fullInc = categorias.find((c: any) => {
    const catNorm = normalize(c.nome);
    return catNorm.length >= 3 && (credorNorm.includes(catNorm) || catNorm.includes(credorNorm));
  });
  if (fullInc) return { id: fullInc.id, nome: fullInc.nome };

  // ─── 4. TOKEN MATCHING COM STOPWORDS REMOVIDAS ───
  const ignoreWords = new Set([
    "e", "de", "do", "da", "em", "para", "com", "ltda", "me", "epp", "sa", "s/a", "eireli",
    "comercio", "distribuicao", "distribuidora", "servicos", "pagamentos", "brasil", "alimentos",
    "foods", "industria", "ind", "bras", "cia", "cia."
  ]);
  const inputTokens = credorNorm.split(/\s+/).filter((t: string) => t.length >= 3 && !ignoreWords.has(t));

  for (const token of inputTokens) {
    const match = categorias.find((c: any) => {
      const catNorm = normalize(c.nome);
      return catNorm === token || catNorm.includes(token) || token.includes(catNorm);
    });
    if (match) return { id: match.id, nome: match.nome };
  }

  // ─── 5. LLM FALLBACK: Pergunta ao modelo quando não há correspondência direta ───
  if (supabaseUrl && serviceKey && categorias.length > 0) {
    try {
      console.log(`[telegram-webhook] Tentando categorização por LLM para "${credorOrDesc}"...`);
      const catListStr = categorias.map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
      const prompt = `Você é um classificador financeiro inteligente.
Dado o nome do beneficiário/fornecedor "${credorOrDesc}", escolha a categoria mais provável entre as seguintes:
${catListStr}

Responda APENAS com o número correspondente (ex: 1, 2, etc). Se nenhuma categoria fizer sentido, responda 0.`;

      const aiCatResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          user_id: userId,
          tools: [],
          temperature: 0.0,
          messages: [
            { role: "system", content: "Classificador de categorias. Responda apenas com o número." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (aiCatResp.ok) {
        const aiJson = await aiCatResp.json();
        const numStr = aiJson.choices?.[0]?.message?.content?.match(/\d+/)?.[0];
        const num = numStr ? parseInt(numStr, 10) : 0;
        if (num > 0 && num <= categorias.length) {
          const chosenCat = categorias[num - 1];
          console.log(`[telegram-webhook] Categoria sugerida por LLM para "${credorOrDesc}":`, chosenCat.nome);
          return { id: chosenCat.id, nome: chosenCat.nome };
        }
      }
    } catch (llmCatErr: any) {
      console.warn("[telegram-webhook] Erro no LLM fallback de categoria:", llmCatErr.message);
    }
  }

  return null;
}

async function salvarCacheCategoria(supabase: any, userId: string, credor: string, categoriaId: string) {
  if (!credor || !categoriaId) return;
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
  const credorNorm = normalize(credor);
  if (!credorNorm || credorNorm.length < 2) return;

  try {
    await supabase.from("categoria_credor_cache").upsert(
      {
        user_id: userId,
        credor_normalizado: credorNorm,
        categoria_id: categoriaId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,credor_normalizado" }
    );
    console.log(`[telegram-webhook] Cache de categoria salvo: "${credorNorm}" -> ${categoriaId}`);
  } catch (err: any) {
    console.warn("[telegram-webhook] Erro ao salvar cache de categoria:", err.message);
  }
}

// ─── VALIDADORES DETERMINÍSTICOS PARA BENEFICIÁRIO (EVITA CONFUNDIR COM BANCO OU PAGADOR) ───
const BANCO_STOP_WORDS = [
  "sicoob", "cooperativa de credito", "cooperativa de livre admissao",
  "cooperativa", "credito", "banco", "bradesco", "itau", "itaú",
  "banco do brasil", "caixa economica", "caixa", "santander", "nubank", "inter",
  "c6 bank", "original", "safra", "banrisul", "banco cooperativo", "sicredi"
];

function isNomeDeBanco(nome: string): boolean {
  const norm = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return BANCO_STOP_WORDS.some(sw => norm.includes(sw));
}

function isPessoaFisicaProvavel(nome: string): boolean {
  const norm = (nome || "").toLowerCase().trim();
  const termosCorp = [
    "ltda", "sa", "me", "epp", "eireli", "s/a", "industria", "distribuidora",
    "comercio", "servicos", "participacoes", "cia", "alimentos", "foods",
    "bebidas", "supermercado", "distribuicao", "comercial"
  ];
  const temTermoCorp = termosCorp.some(t => norm.includes(t));
  const palavras = nome.trim().split(/\s+/).filter(Boolean).length;
  // Se tem 3+ nomes próprios e nenhum termo corporativo, é altamente provável ser o pagador pessoa física
  return !temTermoCorp && palavras >= 3;
}

async function reextrairBeneficiarioDoDocumento(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  imageBase64Uri: string,
  tentativaAtual: string
): Promise<string | null> {
  const promptCorrecao = `Você errou na extração anterior do beneficiário do boleto. O nome "${tentativaAtual}" está INCORRETO.

REGRAS OBRIGATÓRIAS PARA CORREÇÃO:
1. No TOPO DO BOLETO (Canhoto Superior), procure o texto "RECEBEMOS DE:" -> O NOME LOGO APÓS É A EMPRESA BENEFICIÁRIA (ex: "Brasnorte Distribuidora de Bebidas Ltda").
2. Se "${tentativaAtual}" for um BANCO ou COOPERATIVA (ex: Sicoob, Bradesco, Itaú...) -> IGNORE O BANCO e procure a empresa fornecedora.
3. Se "${tentativaAtual}" for uma PESSOA FÍSICA (ex: "Viviane...") -> ela é o PAGADOR/SACADO. NUNCA use como beneficiário.
4. Responda APENAS com o JSON:
{"beneficiario": "NOME DA EMPRESA FORNECEDORA"}`;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        user_id: userId,
        tools: [],
        temperature: 0.0,
        messages: [
          { role: "system", content: "Extrator especialista em boletos bancários. Responda apenas com JSON." },
          {
            role: "user",
            content: [
              { type: "text", text: promptCorrecao },
              { type: "image_url", image_url: { url: imageBase64Uri, detail: "high" } },
            ],
          },
        ],
      }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || "";
      const cleaned = raw.replace(/```json\s*/i, "").replace(/```/g, "").trim();
      let parsed: any = null;
      try { parsed = JSON.parse(cleaned); } catch {}
      const nomeCorrigido = parsed?.beneficiario || parsed?.nome || null;
      if (nomeCorrigido && nomeCorrigido.length >= 3 && !isNomeDeBanco(nomeCorrigido)) {
        return nomeCorrigido.trim();
      }
    }
  } catch (e: any) {
    console.error("[telegram-webhook] Erro ao reextrair beneficiário:", e.message);
  }
  return null;
}

// ─── DECODIFICADOR DETERMINÍSTICO FEBRABAN DA LINHA DIGITÁVEL ───
function parseLinhaDigitavelFebraban(linha: string): { valor: number | null; vencimento: string | null } {
  const digits = (linha || "").replace(/\D/g, "");
  if (digits.length !== 47) return { valor: null, vencimento: null };

  const campo5 = digits.slice(33);
  const fatorStr = campo5.slice(0, 4);
  const valorStr = campo5.slice(4);

  const valorCentavos = parseInt(valorStr, 10);
  const valor = !isNaN(valorCentavos) && valorCentavos > 0 ? valorCentavos / 100 : null;

  const fator = parseInt(fatorStr, 10);
  let vencimento: string | null = null;
  if (!isNaN(fator) && fator > 1000) {
    const baseDate = new Date(Date.UTC(2025, 1, 22)); // 2025-02-22 (novo ciclo FEBRABAN)
    const vencDate = new Date(baseDate.getTime() + (fator - 1000) * 86400000);
    vencimento = vencDate.toISOString().split("T")[0];
  }
  return { valor, vencimento };
}

// ─── VALIDAÇÃO DETERMINÍSTICA ANTI-ALUCINAÇÃO DE BOLETOS ───
function isDataValida(ano: number, mes: number, dia: number): boolean {
  if (isNaN(ano) || isNaN(mes) || isNaN(dia) || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function validarExtracaoBoleto(data: {
  beneficiario?: string | null;
  valor?: number | null;
  data_vencimento?: string | null;
  linha_digitavel?: string | null;
}): { valido: boolean; motivo?: string } {
  // 1. Beneficiário não pode ser vazio, muito curto ou genérico
  const benef = String(data.beneficiario || "").trim();
  const benefLower = benef.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (
    !benef ||
    benef.length < 4 ||
    benefLower.includes("nao identificado") ||
    benefLower.includes("desconhecido") ||
    benefLower.includes("ilegivel") ||
    benefLower === "beneficiario" ||
    benefLower === "empresa"
  ) {
    return { valido: false, motivo: "Beneficiário/Cedente não identificado com clareza na imagem" };
  }

  // 2. Valor deve ser positivo e razoável
  const valor = Number(data.valor || 0);
  if (isNaN(valor) || valor <= 0 || valor > 10000000) {
    return { valido: false, motivo: "Valor do documento ilegível ou não identificado" };
  }

  // 3. Data de vencimento deve existir e ser uma data real do calendário (evita 29/02 em ano não-bissexto)
  const vencStr = String(data.data_vencimento || "").trim();
  if (!vencStr || !/^\d{4}-\d{2}-\d{2}/.test(vencStr)) {
    return { valido: false, motivo: "Data de vencimento ilegível ou ausente" };
  }

  const [ano, mes, dia] = vencStr.split("T")[0].split("-").map(Number);
  if (!isDataValida(ano, mes, dia)) {
    return { valido: false, motivo: `Data de vencimento inválida (${dia.toString().padStart(2, "0")}/${mes.toString().padStart(2, "0")}/${ano})` };
  }

  // 4. Data não pode estar fora do intervalo razoável (-10 anos a +5 anos)
  const vencDate = new Date(Date.UTC(ano, mes - 1, dia));
  const hoje = new Date();
  const cincoAnosFuturo = new Date(Date.UTC(hoje.getFullYear() + 5, hoje.getMonth(), hoje.getDate()));
  const dezAnosAtras = new Date(Date.UTC(hoje.getFullYear() - 10, hoje.getMonth(), hoje.getDate()));

  if (vencDate > cincoAnosFuturo || vencDate < dezAnosAtras) {
    return { valido: false, motivo: "Data de vencimento fora do intervalo esperado" };
  }

  // 5. Linha digitável (se fornecida, deve ter 47 ou 48 dígitos)
  const linha = String(data.linha_digitavel || "").replace(/\D/g, "");
  if (linha.length > 0 && linha.length !== 47 && linha.length !== 48) {
    return { valido: false, motivo: "Linha digitável incompleta ou com dígitos faltantes" };
  }

  return { valido: true };
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
    const respLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

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

    // ─── VERIFICAÇÃO DE ESTADO DE CONVERSA (Limpa confirmação pendente se usuário fez outra pergunta) ───
    const isSim = ["sim", "s", "yes", "y", "confirmar", "confirmo", "pode cadastrar", "cadastrar", "ok"].includes(respLower);
    const isNao = ["não", "nao", "n", "no", "cancelar", "cancela", "não cadastrar"].includes(respLower);

    // Se NÃO é confirmação (SIM/NÃO), limpa propostas pendentes antigas para evitar confirmações acidentais
    if (!isSim && !isNao) {
      const { data: conversaAtiva } = await supabase
        .from("telegram_conversas")
        .select("estado, proposta_id, updated_at")
        .eq("chat_id", chatId)
        .maybeSingle();

      if (conversaAtiva?.estado === "aguardando_confirmacao_boleto") {
        const ultimaAtualizacao = new Date(conversaAtiva.updated_at || 0);
        const agora = new Date();
        const diffMin = (agora.getTime() - ultimaAtualizacao.getTime()) / (1000 * 60);
        if (diffMin > 5) {
          console.log("[telegram-webhook] Limpando estado pendente antigo por inatividade (>5min)");
          await supabase
            .from("telegram_conversas")
            .update({ estado: "livre", proposta_id: null, updated_at: agora.toISOString() })
            .eq("chat_id", chatId);
        }
      }
    }

    // ─── 1. CONSULTA DE DÍVIDAS COM FILTRO DE PERÍODO INTELIGENTE ───
    const isConsultaDividas =
      text.startsWith("/dividas") ||
      respLower.includes("quanto devo") ||
      respLower.includes("dividas pendentes") ||
      respLower.includes("minhas dividas") ||
      respLower.includes("contas a pagar") ||
      respLower.includes("boletos a pagar") ||
      respLower.includes("dividas dessa semana") ||
      respLower.includes("dividas desta semana") ||
      respLower.includes("dividas ate sexta");

    if (isConsultaDividas) {
      const hoje = new Date(hojeStr);
      let dataInicioStr: string | null = null;
      let dataFimStr: string | null = null;
      let periodoDescricao = "pendentes";

      // "essa semana" / "esta semana"
      if (respLower.includes("essa semana") || respLower.includes("esta semana")) {
        const diaSemana = hoje.getDay(); // 0=dom, 6=sab
        const dIni = new Date(hoje);
        dIni.setDate(hoje.getDate() - diaSemana);
        const dFim = new Date(dIni);
        dFim.setDate(dIni.getDate() + 6);
        dataInicioStr = dIni.toISOString().split("T")[0];
        dataFimStr = dFim.toISOString().split("T")[0];
        periodoDescricao = "desta semana";
      }
      // "até sexta" / "ate sexta"
      else if (respLower.includes("ate sexta") || respLower.includes("até sexta")) {
        const diaSemana = hoje.getDay();
        const diasAteSexta = (5 - diaSemana + 7) % 7;
        const dFim = new Date(hoje);
        dFim.setDate(hoje.getDate() + diasAteSexta);
        dataFimStr = dFim.toISOString().split("T")[0];
        periodoDescricao = "com vencimento até sexta-feira";
      }
      // "esse mês" / "este mês"
      else if (respLower.includes("esse mes") || respLower.includes("este mes")) {
        dataInicioStr = primeiroDiaMes;
        const ultimoDiaMes = new Date(anoAtual, mesAtual, 0).getDate();
        dataFimStr = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-${String(ultimoDiaMes).padStart(2, "0")}`;
        periodoDescricao = "deste mês";
      }
      // "hoje"
      else if (respLower.includes("hoje")) {
        dataInicioStr = hojeStr;
        dataFimStr = hojeStr;
        periodoDescricao = "de hoje";
      }
      // "próximos X dias"
      else if (respLower.includes("proximo") || respLower.includes("proximos")) {
        const match = respLower.match(/(\d+)\s*dia/);
        if (match) {
          const numDias = parseInt(match[1], 10);
          const dFim = new Date(hoje);
          dFim.setDate(hoje.getDate() + numDias);
          dataFimStr = dFim.toISOString().split("T")[0];
          periodoDescricao = `dos próximos ${numDias} dias`;
        }
      }

      let query = supabase
        .from("dividas")
        .select("id, descricao, status, valor_total, valor_restante, data_vencimento, credor")
        .eq("user_id", userId)
        .neq("status", "quitada")
        .neq("status", "paga")
        .order("data_vencimento", { ascending: true });

      if (dataInicioStr) {
        query = query.gte("data_vencimento", dataInicioStr);
      }
      if (dataFimStr) {
        query = query.lte("data_vencimento", dataFimStr);
      }

      const { data: dividas, error: errDiv } = await query.limit(30);

      if (errDiv) {
        console.error("[telegram-webhook] Erro ao consultar dívidas:", errDiv.message);
      }

      if (!dividas || dividas.length === 0) {
        await sendReply(`🎉 <b>Nenhuma dívida pendente encontrada ${periodoDescricao}!</b> Você está em dia.`);
      } else {
        const hojeObj = new Date(hojeStr);
        let msg = `💳 <b>Suas Dívidas (${periodoDescricao}):</b>\n\n`;

        dividas.forEach((d: any) => {
          const valor = Number(d.valor_restante || d.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const venc = d.data_vencimento ? d.data_vencimento.split("T")[0].split("-").reverse().join("/") : "Sem data";
          let atrasoText = "";
          let statusEmoji = "🟢";

          if (d.data_vencimento) {
            const vDate = new Date(d.data_vencimento.split("T")[0]);
            const diffDays = Math.floor((hojeObj.getTime() - vDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              statusEmoji = "🔴";
              atrasoText = ` <i>(⚠️ ${diffDays} ${diffDays === 1 ? "dia" : "dias"} de atraso)</i>`;
            } else if (diffDays >= -3) {
              statusEmoji = "🟡";
              atrasoText = ` <i>(vence em breve)</i>`;
            }
          }

          msg += `${statusEmoji} <b>${d.descricao || "Dívida"}</b>\n`;
          msg += `   💰 ${valor} | 🗓️ Vence: <b>${venc}</b>${atrasoText}\n`;
          if (d.credor) msg += `   🏢 Beneficiário: ${d.credor}\n`;
          msg += "\n";
        });

        const totalDevido = dividas.reduce((acc: number, d: any) => acc + Number(d.valor_restante || d.valor_total || 0), 0);
        msg += `📊 <b>Total devido:</b> <b>${totalDevido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>\n\n`;
        msg += `<i>Se precisar de mais informações, estou à disposição!</i>`;

        await sendReply(msg);
      }
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 2. CONSULTA DE SALDO E CONTAS BANCÁRIAS ───
    const isConsultaSaldo =
      text.startsWith("/saldo") ||
      respLower.includes("quanto tenho") ||
      respLower.includes("meu saldo") ||
      respLower.includes("saldo da conta") ||
      respLower.includes("saldo das contas") ||
      respLower.includes("quanto tem no banco") ||
      respLower.includes("quanto tenho no banco") ||
      respLower.includes("saldo bancario");

    if (isConsultaSaldo) {
      const [contasResp, recResp, despResp] = await Promise.all([
        supabase.from("contas_usuario").select("nome, tipo, saldo_atual").eq("user_id", userId),
        supabase.from("receitas").select("valor").eq("user_id", userId),
        supabase.from("despesas").select("valor").eq("user_id", userId),
      ]);

      const contas = contasResp.data || [];
      const totalReceitas = (recResp.data || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
      const totalDespesas = (despResp.data || []).reduce((acc, d) => acc + (Number(d.valor) || 0), 0);
      const saldoFluxo = totalReceitas - totalDespesas;
      const format = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      let msg = `🏦 <b>Seus Saldos e Contas:</b>\n\n`;

      if (contas.length > 0) {
        let totalEmContas = 0;
        contas.forEach((c: any) => {
          const s = Number(c.saldo_atual || 0);
          totalEmContas += s;
          const icon = c.tipo === "cartao_credito" ? "💳" : "🏛️";
          msg += `${icon} <b>${c.nome}</b>: <b>${format(s)}</b>\n`;
        });
        msg += `\n💵 <b>Total em Contas:</b> <b>${format(totalEmContas)}</b>\n`;
      }

      msg += `📊 <b>Saldo Acumulado (Receitas - Despesas):</b> <b>${format(saldoFluxo)}</b>\n\n`;
      msg += `<i>Se precisar de mais informações, estou à disposição!</i>`;

      await sendReply(msg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 2.5. CONSULTA DE DESPESAS E GASTOS (Nativo e Preciso) ───
    const isConsultaDespesas =
      text.startsWith("/despesas") ||
      respLower.includes("despesa") ||
      respLower.includes("despeza") ||
      respLower.includes("gastos") ||
      respLower.includes("quanto gastei") ||
      respLower.includes("saidas do mes") ||
      respLower.includes("saidas de agosto");

    if (isConsultaDespesas && !respLower.includes("grafico")) {
      let dataInicioD = primeiroDiaMes;
      let dataFimD = hojeStr;
      let labelPeriodoD = "Deste Mês (Agosto/2026)";

      const mesesMapD: Record<string, number> = {
        janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
        julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
      };

      for (const [nomeMes, numMes] of Object.entries(mesesMapD)) {
        if (respLower.includes(nomeMes)) {
          const uDia = new Date(anoAtual, numMes, 0).getDate();
          dataInicioD = `${anoAtual}-${String(numMes).padStart(2, "0")}-01`;
          dataFimD = `${anoAtual}-${String(numMes).padStart(2, "0")}-${String(uDia).padStart(2, "0")}`;
          labelPeriodoD = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${anoAtual}`;
          break;
        }
      }

      if (respLower.includes("semana")) {
        const diaSemana = nowSp.getDay();
        const dIni = new Date(nowSp);
        dIni.setDate(nowSp.getDate() - diaSemana);
        dataInicioD = dIni.toISOString().split("T")[0];
        labelPeriodoD = "Desta Semana";
      } else if (respLower.includes("hoje")) {
        dataInicioD = hojeStr;
        dataFimD = hojeStr;
        labelPeriodoD = "de Hoje";
      }

      // Busca despesas e categorias
      const [{ data: despesasRaw }, { data: categoriasRaw }] = await Promise.all([
        supabase
          .from("despesas")
          .select("id, descricao, valor, data, categoria_id, metodo_pagamento")
          .eq("user_id", userId)
          .gte("data", dataInicioD)
          .lte("data", dataFimD)
          .order("data", { ascending: false }),
        supabase
          .from("categorias")
          .select("id, nome")
          .eq("user_id", userId),
      ]);

      const catMap = new Map<string, string>();
      (categoriasRaw || []).forEach((c: any) => catMap.set(c.id, c.nome));

      const despesas = despesasRaw || [];
      const totalDespesas = despesas.reduce((s: number, d: any) => s + Number(d.valor || 0), 0);
      const format = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      if (despesas.length === 0) {
        await sendReply(`🎉 <b>Nenhuma despesa registrada no período (${labelPeriodoD}).</b>`);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Agrupa por categoria
      const porCat: Record<string, number> = {};
      // Agrupa por meio de pagamento
      const porMetodo: Record<string, number> = {
        pix: 0,
        cartao_credito: 0,
        boleto: 0,
        cartao_debito: 0,
        dinheiro: 0,
        outros: 0,
      };

      despesas.forEach((d: any) => {
        const val = Number(d.valor || 0);
        const nomeCat = (d.categoria_id && catMap.get(d.categoria_id)) || "Sem categoria";
        porCat[nomeCat] = (porCat[nomeCat] || 0) + val;

        const mRaw = String(d.metodo_pagamento || "").toLowerCase().trim();
        if (mRaw.includes("pix")) {
          porMetodo.pix += val;
        } else if (mRaw.includes("credito") || mRaw.includes("crédito") || mRaw === "cartao_credito") {
          porMetodo.cartao_credito += val;
        } else if (mRaw.includes("boleto")) {
          porMetodo.boleto += val;
        } else if (mRaw.includes("debito") || mRaw.includes("débito") || mRaw === "cartao_debito") {
          porMetodo.cartao_debito += val;
        } else if (mRaw.includes("dinheiro") || mRaw.includes("especie") || mRaw.includes("espécie")) {
          porMetodo.dinheiro += val;
        } else {
          porMetodo.outros += val;
        }
      });

      const topCats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6);

      let msgDesp = `📉 <b>Despesas — ${labelPeriodoD}</b>\n\n`;
      msgDesp += `💰 <b>Total de Despesas:</b> <b>${format(totalDespesas)}</b>\n`;
      msgDesp += `📝 <b>Total de Lançamentos:</b> <b>${despesas.length}</b>\n\n`;
      msgDesp += `📂 <b>Principais Categorias:</b>\n`;

      topCats.forEach(([cat, val]) => {
        const perc = totalDespesas > 0 ? ((val / totalDespesas) * 100).toFixed(1) : "0.0";
        msgDesp += `• <b>${cat}</b>: ${format(val)} <i>(${perc}%)</i>\n`;
      });

      msgDesp += `\n💳 <b>Meios de Pagamento:</b>\n`;
      const labelsMetodos: Array<{ key: keyof typeof porMetodo; label: string; icon: string }> = [
        { key: "pix", label: "PIX", icon: "📲" },
        { key: "cartao_credito", label: "CARTÃO CRÉDITO", icon: "💳" },
        { key: "boleto", label: "BOLETO", icon: "📄" },
        { key: "cartao_debito", label: "CARTÃO DÉBITO", icon: "💳" },
        { key: "dinheiro", label: "DINHEIRO", icon: "💵" },
        { key: "outros", label: "OUTROS", icon: "🔹" },
      ];

      labelsMetodos.forEach(({ key, label, icon }) => {
        const val = porMetodo[key] || 0;
        const perc = totalDespesas > 0 ? ((val / totalDespesas) * 100).toFixed(1) : "0.0";
        msgDesp += `• ${icon} <b>${label}</b>: ${format(val)} <i>(${perc}%)</i>\n`;
      });

      msgDesp += `\n<i>Se precisar de mais informações, estou à disposição!</i>`;

      await sendReply(msgDesp);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 3. GERAÇÃO DE GRÁFICO NO TELEGRAM (ASCII Bar Chart) ───
    const isConsultaGrafico =
      text.startsWith("/grafico") ||
      respLower.includes("grafico") ||
      respLower.includes("gráfico");

    if (isConsultaGrafico) {
      let dataInicioG = primeiroDiaMes;
      let dataFimG = hojeStr;
      let labelPeriodo = "Deste Mês (Agosto/2026)";

      // Mapeamento de meses
      const mesesMap: Record<string, number> = {
        janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
        julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
      };

      for (const [nomeMes, numMes] of Object.entries(mesesMap)) {
        if (respLower.includes(nomeMes)) {
          const uDia = new Date(anoAtual, numMes, 0).getDate();
          dataInicioG = `${anoAtual}-${String(numMes).padStart(2, "0")}-01`;
          dataFimG = `${anoAtual}-${String(numMes).padStart(2, "0")}-${String(uDia).padStart(2, "0")}`;
          labelPeriodo = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${anoAtual}`;
          break;
        }
      }

      if (respLower.includes("semana")) {
        const diaSemana = nowSp.getDay();
        const dIni = new Date(nowSp);
        dIni.setDate(nowSp.getDate() - diaSemana);
        dataInicioG = dIni.toISOString().split("T")[0];
        labelPeriodo = "Desta Semana";
      }

      // Busca todas as receitas e vendas (com paginação ampla para suportar milhares de lançamentos)
      const fetchAllRows = async (table: string, filterTipo?: string) => {
        const rows: any[] = [];
        let from = 0;
        const step = 1000;
        while (true) {
          let q = supabase
            .from(table)
            .select("data, valor, descricao")
            .eq("user_id", userId)
            .gte("data", dataInicioG)
            .lte("data", dataFimG);
          if (filterTipo) q = q.eq("tipo", filterTipo);
          const { data, error } = await q.range(from, from + step - 1);
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < step || rows.length >= 10000) break;
          from += step;
        }
        return rows;
      };

      const [txsReceitas, recsTabela, txsDespesas, despTabela] = await Promise.all([
        fetchAllRows("transacoes", "receita"),
        fetchAllRows("receitas"),
        fetchAllRows("transacoes", "despesa"),
        fetchAllRows("despesas"),
      ]);

      const todasReceitas = [...txsReceitas, ...recsTabela];
      const todasDespesas = [...txsDespesas, ...despTabela];

      const totalReceitas = todasReceitas.reduce((s, r) => s + Number(r.valor || 0), 0);
      const totalDespesas = todasDespesas.reduce((s, d) => s + Number(d.valor || 0), 0);
      const saldoPeriodo = totalReceitas - totalDespesas;

      if (todasReceitas.length === 0 && todasDespesas.length === 0) {
        await sendReply(`📊 <b>Nenhuma movimentação registrada no período (${labelPeriodo}).</b>`);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Agrupa receitas por dia
      const porDia: Record<string, number> = {};
      todasReceitas.forEach((v: any) => {
        const d = (v.data || "").split("T")[0];
        const val = Number(v.valor || 0);
        porDia[d] = (porDia[d] || 0) + val;
      });

      const maxVal = Math.max(...Object.values(porDia), 1);
      let chartMsg = `📊 <b>Gráfico Financeiro — ${labelPeriodo}</b>\n\n`;

      if (Object.keys(porDia).length > 0) {
        chartMsg += `📈 <b>Evolução Diária de Receitas:</b>\n<pre>\n`;
        Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).slice(-15).forEach(([dia, valor]) => {
          const diaFmt = dia.split("-").slice(1).reverse().join("/");
          const barLen = Math.max(1, Math.round((valor / maxVal) * 12));
          const bar = "█".repeat(barLen);
          const valFmt = valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
          chartMsg += `${diaFmt} | ${bar} R$ ${valFmt}\n`;
        });
        chartMsg += `</pre>\n`;
      }

      const format = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      chartMsg += `📈 <b>Total de Receitas:</b> <b>${format(totalReceitas)}</b> (${todasReceitas.length} lançamentos)\n`;
      chartMsg += `📉 <b>Total de Despesas:</b> <b>${format(totalDespesas)}</b> (${todasDespesas.length} lançamentos)\n`;
      chartMsg += `💵 <b>Resultado do Período:</b> <b>${format(saldoPeriodo)}</b>\n\n`;
      chartMsg += `💡 <i>Abra o Wallet App para navegar no gráfico interativo com filtros por categoria!</i>`;

      await sendReply(chartMsg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Comando /ensinar ou /alias
    if (text.startsWith("/ensinar") || text.startsWith("/alias")) {
      const paramStr = text.replace(/^(\/ensinar|\/alias)\s*/i, "").trim();
      const parts = paramStr.split(/=|->|para|:|\s{2,}/i).map((p) => p.trim()).filter(Boolean);

      if (parts.length < 2) {
        await sendReply(
          `🎓 <b>Como ensinar o Bot a associar Fornecedor com Categoria:</b>\n\n` +
          `Envie no formato:\n` +
          `<code>/ensinar Nome do Fornecedor = Nome da Categoria</code>\n\n` +
          `<b>Exemplos:</b>\n` +
          `• <code>/ensinar Sellpack = Descartáveis</code>\n` +
          `• <code>/ensinar Brasnorte = Ambev</code>\n` +
          `• <code>/ensinar SPAL = Coca-Cola</code>\n` +
          `• <code>/ensinar Xodó Foods = Xodó</code>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const fornecedorTerm = parts[0];
      const categoriaAlvoTerm = parts[1];

      // Busca a categoria informada
      const { data: categorias } = await supabase
        .from("categorias")
        .select("id,nome,aliases")
        .eq("user_id", userId);

      const normalize = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
      const catAlvoNorm = normalize(categoriaAlvoTerm);

      const catEncontrada = (categorias || []).find((c: any) => {
        const cNorm = normalize(c.nome);
        return cNorm === catAlvoNorm || cNorm.includes(catAlvoNorm) || catAlvoNorm.includes(cNorm);
      });

      if (!catEncontrada) {
        const nomesDisponiveis = (categorias || []).map((c: any) => `• ${c.nome}`).join("\n");
        await sendReply(
          `❌ <b>Categoria "${categoriaAlvoTerm}" não encontrada.</b>\n\n` +
          `<b>Suas categorias disponíveis:</b>\n${nomesDisponiveis || "Nenhuma categoria cadastrada"}`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // 1. Atualiza aliases da categoria
      const currentAliases = (catEncontrada.aliases || "").split(",").map((a: string) => a.trim()).filter(Boolean);
      const novoAliasNorm = normalize(fornecedorTerm);
      if (!currentAliases.includes(novoAliasNorm)) {
        currentAliases.push(novoAliasNorm);
      }
      const updatedAliasesStr = currentAliases.join(",");

      await supabase
        .from("categorias")
        .update({ aliases: updatedAliasesStr })
        .eq("id", catEncontrada.id);

      // 2. Salva no cache de credor
      await salvarCacheCategoria(supabase, userId, fornecedorTerm, catEncontrada.id);

      await sendReply(
        `✅ <b>Associação aprendida com sucesso!</b>\n\n` +
        `🏢 Fornecedor: <b>${fornecedorTerm}</b>\n` +
        `🏷️ Categoria vinculada: <b>${catEncontrada.nome}</b>\n\n` +
        `<i>A partir de agora, qualquer boleto ou lançamento de "${fornecedorTerm}" será categorizado como "${catEncontrada.nome}" automaticamente!</i>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Comando /ajuda
    if (text.startsWith("/ajuda")) {
      await sendReply(
        `🤖 <b>Comandos do Bot Wallet:</b>\n\n` +
        `/dividas - Lista suas dívidas pendentes\n` +
        `/saldo - Exibe o saldo consolidado\n` +
        `/ensinar - Ensinar vínculo de fornecedor com categoria\n` +
        `/start - Gerar código de vínculo\n` +
        `/ajuda - Ver este menu de comandos\n\n` +
        `💬 <i>Você também pode conversar naturalmente! Exemplos:</i>\n` +
        `• <i>"Quanto vendeu hoje?"</i>\n` +
        `• <i>"Qual o resumo do mês?"</i>\n` +
        `• <i>"Cadastre uma despesa de R$ 50 de almoço"</i>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── VERIFICAÇÃO DE CONFIRMAÇÃO DE PROPOSTAS PENDENTES (SIM / NÃO) ───
    if (text && (isSim || isNao)) {
      const { data: conversaAtiva } = await supabase
        .from("telegram_conversas")
        .select("estado, proposta_id")
        .eq("chat_id", chatId)
        .maybeSingle();

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

      // Fallback: só busca se a proposta tiver menos de 10 minutos
      if (!proposta) {
        const dezMinAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: lastProp } = await supabase
          .from("telegram_propostas")
          .select("*")
          .eq("chat_id", chatId)
          .eq("user_id", userId)
          .eq("status", "pendente")
          .gte("created_at", dezMinAtras)
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

        if (dividaInserida?.categoria_id && credorNome) {
          salvarCacheCategoria(supabase, userId, credorNome, dividaInserida.categoria_id).catch(() => {});
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

            const pdfCat = await resolveCategoriaByCredor(supabase, userId, `${pdfBenef} ${pdfDesc}`, supabaseUrl, supabaseServiceKey);

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

        const docAnalysisSystemPrompt = `Você é um extrator especialista em boletos bancários brasileiros com precisão cirúrgica.

LAYOUT E ANATOMIA DO BOLETO:
1. TOPO (Canhoto Superior):
   - Procure "RECEBEMOS DE:" -> O NOME LOGO APÓS É A EMPRESA BENEFICIÁRIA (ex: "Brasnorte Distribuidora de Bebidas Ltda").
   - "DATA VENCIMENTO:" -> Data de vencimento no canhoto.
   - "VALOR DO DOCUMENTO:" -> Valor do documento no canhoto.
   - "SACADO:" -> É o cliente/pagador (ex: Viviane...). NUNCA use como beneficiário!

2. MEIO E INFERIOR (Recibo do Pagador e Ficha de Compensação):
   - "Beneficiário:" -> Razão Social da Empresa (ex: "Brasnorte Distribuidora de Bebidas").
   - "Vencimento" -> Data limite para pagamento (ex: 22/07/2026). NUNCA use a "Data do Documento".
   - "Valor Documento" -> Valor a pagar (ex: 1053.58).
   - "Pagador:" -> Pessoa que paga a conta (ex: Viviane Cristina Teotonio Siqueira).
   - "Linha Digitável" -> Sequência de 47 dígitos no topo da via (ex: 75691.31191 01052.814538 53620.600014 6 15150000105358).

REGRAS:
- O beneficiário SEMPRE é uma EMPRESA/FORNECEDOR (ex: "Brasnorte Distribuidora de Bebidas Ltda", "SPAL IND BRAS DE BEBIDAS", "SELLPACK DISTRIBUIDORA").
- NUNCA use o PAGADOR (pessoa física) ou o BANCO (Sicoob, Cooperativa) como beneficiário.

FORMATO DE RESPOSTA (JSON estrito em tag <document_analysis>):
<document_analysis>
{
  "tipo": "boleto",
  "beneficiario": "Brasnorte Distribuidora de Bebidas Ltda",
  "pagador": "Viviane Cristina Teotonio Siqueira",
  "valor": 1053.58,
  "data_vencimento": "2026-07-22",
  "descricao": "Boleto - Brasnorte",
  "linha_digitavel": "75691.31191 01052.814538 53620.600014 6 15150000105358",
  "confianca": "alta"
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
                  { type: "text", text: promptText || "Analise esta foto de boleto bancário brasileiro. No topo (canhoto), procure 'RECEBEMOS DE:' para extrair a empresa beneficiária. Leia com máxima atenção a linha digitável, valor e vencimento." },
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

          let valor = parseNum(documentData.valor);
          let dataVencimento = parseDt(documentData.data_vencimento);
          let beneficiario = String(documentData.beneficiario || "").trim();
          const linhaDigitavel = String(documentData.linha_digitavel || "").replace(/\s/g, "");

          // ─── BLINDAGEM MATEMÁTICA FEBRABAN VIA LINHA DIGITÁVEL ───
          if (linhaDigitavel) {
            const febraban = parseLinhaDigitavelFebraban(linhaDigitavel);
            if (febraban.valor && febraban.valor > 0) {
              console.log(`[telegram-webhook] Valor recalculado via FEBRABAN: ${valor} -> ${febraban.valor}`);
              valor = febraban.valor;
            }
            if (febraban.vencimento) {
              console.log(`[telegram-webhook] Vencimento recalculado via FEBRABAN: ${dataVencimento} -> ${febraban.vencimento}`);
              dataVencimento = febraban.vencimento;
            }
          }

          // ─── AUTO-CORREÇÃO: Detecta se o beneficiário foi confundido com Banco ou Pagador ───
          if (beneficiario && (isNomeDeBanco(beneficiario) || isPessoaFisicaProvavel(beneficiario))) {
            console.warn(`[telegram-webhook] Beneficiário suspeito ("${beneficiario}") detectado como Banco ou Pessoa Física. Iniciando re-extração direcionada...`);
            const beneficiarioCorrigido = await reextrairBeneficiarioDoDocumento(
              supabaseUrl,
              supabaseServiceKey,
              userId,
              finalImageBase64Uri,
              beneficiario
            );
            if (beneficiarioCorrigido) {
              console.log(`[telegram-webhook] Beneficiário corrigido com sucesso: "${beneficiario}" -> "${beneficiarioCorrigido}"`);
              beneficiario = beneficiarioCorrigido;
              documentData.beneficiario = beneficiarioCorrigido;
            }
          }

          // ─── VALIDAÇÃO RIGOROSA ANTI-ALUCINAÇÃO ───
          const validacao = validarExtracaoBoleto({
            beneficiario,
            valor,
            data_vencimento: dataVencimento,
            linha_digitavel: linhaDigitavel,
          });

          if (!validacao.valido) {
            console.warn("[telegram-webhook] Boleto rejeitado pela validação anti-alucinação:", validacao.motivo);
            await sendReply(
              `📄 <b>Não foi possível ler o boleto com segurança.</b>\n\n` +
              `⚠️ <b>Motivo:</b> ${validacao.motivo}\n\n` +
              `📸 <b>Por favor, envie uma nova foto:</b>\n` +
              `• Enquadre todo o boleto na vertical (não de lado)\n` +
              `• Certifique-se de que o código de barras e valores estão visíveis\n` +
              `• Tire a foto em um local bem iluminado\n` +
              `• Evite sombras fortes, reflexos e borrões`
            );
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          // ─── BUSCA AUTOMÁTICA DE CATEGORIA PELO BENEFICIÁRIO (4 Camadas: Cache + Aliases + Tokens + LLM) ───
          const catEncontrada = await resolveCategoriaByCredor(
            supabase,
            userId,
            `${beneficiario} ${documentData.descricao || ""}`,
            supabaseUrl,
            supabaseServiceKey
          );
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

Diretrizes de TOM DE VOZ e FORMATAÇÃO:
- Tom: PROFISSIONAL, CORDIAL, DIRETO E VISUALMENTE ELEGANTE.
- REGRA CRÍTICA DE FORMATAÇÃO: NUNCA use Markdown cru (como **negrito** ou _italico_). SEMPRE use tags HTML válidas suportadas pelo Telegram (<b>negrito</b>, <i>itálico</i>, <code>código</code>).
- NUNCA use frases conclusivas exageradas (ex: "Bate certinho", "Show de bola").
- NUNCA invente dados ou conceitos não informados pelas ferramentas.
- Termine sempre com: "<i>Se precisar de mais informações, estou à disposição!</i>"
- Use emojis como marcadores temáticos em blocos organizados e bem espaçados:
  • Métodos de pagamento: 📲 Pix, 💳 Crédito, 💳 Débito, 📄 Boleto, 💵 Dinheiro
  • Métricas: 💰 Total, 📝 Lançamentos, 🛒 Transações, 📈 Receitas, 📉 Despesas, 🗓️ Datas, 💸 Pagamentos, 💼 Colaborador/Profissional

Exemplo de formato para pagamentos a colaboradores / pessoas / fornecedores:
💼 <b>Pagamentos para [Nome] — [Período/Mês]</b>

💰 <b>Total Pago:</b> <b>R$ 1.305,30</b>
📝 <b>Lançamentos:</b> <b>8 transações</b>

📋 <b>Detalhamento:</b>
• 🗓️ <b>17/08/2026</b>
  - 💸 Luiz folguista: <b>R$ 240,00</b> <i>(📲 Pix)</i>
  - 🏷️ Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>
• 🗓️ <b>14/08/2026</b>
  - 💸 Luiz: <b>R$ 379,80</b> <i>(📲 Pix)</i>
  - 🏷️ Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>
• 🗓️ <b>10/08/2026</b>
  - 💸 Luiz folguista: <b>R$ 215,00</b> <i>(📲 Pix)</i>
  - 🏷️ Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>
• 🗓️ <b>04/08/2026</b>
  - 💸 Luiz: <b>R$ 200,00</b> <i>(📲 Pix)</i>
• 🗓️ <b>01/08/2026</b>
  - 💸 Luiz folguista: <b>R$ 260,00</b> <i>(📲 Pix)</i>

<i>Se precisar de mais informações, estou à disposição!</i>

Exemplo de formato para vendas do PDV:
📈 <b>Vendas de [Período], [Data]</b>

💰 Dinheiro: <b>R$ 177,60</b>
💳 Débito: <b>R$ 266,10</b>
💳 Crédito: <b>R$ 47,30</b>
📲 Pix: <b>R$ 302,10</b>

📈 <b>Total de vendas:</b> <b>R$ 793,10</b>
🛒 <b>Transações:</b> <b>62</b>
💵 <b>Ticket médio:</b> <b>R$ 12,79</b>

<i>Se precisar de mais informações, estou à disposição!</i>

Regras de seleção de ferramentas:
- Quando o usuário perguntar "quanto paguei para X", "o que paguei para fulano", "pagamentos para X", "quanto passei para CPF/Pix X" → use buscar_transacoes com busca="nome/cpf/pix" ou data_inicio e data_fim do período.
- Quando o usuário perguntar "quanto paguei hoje", "quanto saiu de dinheiro hoje", "despesas de hoje" → use consultar_saidas_caixa_periodo.
- Quando o usuário perguntar "quanto devo", "dívidas pendentes", "boletos a vencer" → use consultar_dividas.
- Quando o usuário perguntar sobre vendas, faturamento do PDV → use consultar_vendas_eyemobile.

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
