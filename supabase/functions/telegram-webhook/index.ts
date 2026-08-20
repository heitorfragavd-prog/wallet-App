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

// ─── TRANSCRIÇÃO DE ÁUDIO (Whisper via openai-proxy) ───
async function transcribeAudio(fileId: string, telegramBotToken: string, supabaseUrl: string, supabaseServiceKey: string, userId: string): Promise<string | null> {
  try {
    const getFileResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getFile?file_id=${fileId}`);
    const fileInfo = await getFileResp.json();
    if (!fileInfo?.ok || !fileInfo?.result?.file_path) {
      console.error("[transcribeAudio] getFile failed:", fileInfo);
      return null;
    }

    const filePath = fileInfo.result.file_path;
    const fileDownloadResp = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
    const audioBuffer = await fileDownloadResp.arrayBuffer();

    const ext = filePath.split(".").pop()?.toLowerCase() || "ogg";
    const mimeType = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "m4a" ? "audio/mp4" : "audio/ogg";

    const formData = new FormData();
    formData.append("audio", new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
    formData.append("user_id", userId);

    const transcribeResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy/transcribe-audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: formData,
    });

    if (!transcribeResp.ok) {
      console.error("[transcribeAudio] transcribe failed:", await transcribeResp.text());
      return null;
    }

    const result = await transcribeResp.json();
    return result.transcription || null;
  } catch (err: any) {
    console.error("[transcribeAudio] exception:", err.message);
    return null;
  }
}

// ─── PREVISÃO DE CAIXA INTELIGENTE ───
async function calcularPrevisaoCaixa(supabase: any, userId: string, workspaceId?: string | null): Promise<string> {
  const hoje = new Date();
  
  // 1. Saldo atual nas contas
  let qContas = supabase
    .from("contas")
    .select("saldo, instituicao, nome")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (workspaceId) {
    qContas = qContas.eq("workspace_id", workspaceId);
  }
  const { data: contas } = await qContas;
  
  const saldoAtual = (contas || []).reduce((a: number, c: any) => a + (Number(c.saldo) || 0), 0);
  
  // 2. Receitas médias dos últimos 30 dias
  const dataInicio30 = new Date(hoje);
  dataInicio30.setDate(hoje.getDate() - 30);
  const dataInicio30Str = dataInicio30.toISOString().split("T")[0];
  
  let qTxRec = supabase
    .from("transacoes")
    .select("valor")
    .eq("user_id", userId)
    .eq("tipo", "receita")
    .gte("data", dataInicio30Str);
  if (workspaceId) qTxRec = qTxRec.eq("workspace_id", workspaceId);
  const { data: txsRec30d } = await qTxRec;
  
  let qRec = supabase
    .from("receitas")
    .select("valor")
    .eq("user_id", userId)
    .gte("data", dataInicio30Str);
  if (workspaceId) qRec = qRec.eq("workspace_id", workspaceId);
  const { data: recs30d } = await qRec;
  
  const totalReceitas30d = [...(txsRec30d || []), ...(recs30d || [])].reduce((a, v) => a + Number(v.valor || 0), 0);
  const mediaDiariaVendas = totalReceitas30d > 0 ? totalReceitas30d / 30 : 0;
  
  // 3. Despesas diárias estimadas
  let qDespFixas = supabase
    .from("despesas")
    .select("valor, recorrencia_id")
    .eq("user_id", userId)
    .gte("data", dataInicio30Str);
  if (workspaceId) qDespFixas = qDespFixas.eq("workspace_id", workspaceId);
  const { data: despesas30d } = await qDespFixas;
  
  const totalDespesas30d = (despesas30d || []).reduce((a: number, d: any) => a + Number(d.valor || 0), 0);
  const despesaDiaria = totalDespesas30d > 0 ? totalDespesas30d / 30 : 0;
  
  // 4. Dívidas a vencer nos próximos 90 dias
  const hojeStr = hoje.toISOString().split("T")[0];
  const d90 = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  
  let qDividas = supabase
    .from("dividas")
    .select("valor_restante, valor_total, data_vencimento, credor, descricao")
    .eq("user_id", userId)
    .or("status.eq.pendente,status.eq.parcial")
    .gte("data_vencimento", hojeStr)
    .lte("data_vencimento", d90)
    .order("data_vencimento", { ascending: true });
  if (workspaceId) qDividas = qDividas.eq("workspace_id", workspaceId);
  const { data: dividasFuturas } = await qDividas;
  
  const totalDividasProximas = (dividasFuturas || []).reduce((a: number, d: any) => a + (Number(d.valor_restante || d.valor_total) || 0), 0);
  
  // 5. Calcular fluxo diário
  const fluxoDiario = mediaDiariaVendas - despesaDiaria;
  const format = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  
  // 6. Montar resposta
  let msg = "📊 <b>Previsão de Caixa Inteligente</b>\n\n";
  msg += `💰 <b>Saldo atual:</b> <b>${format(saldoAtual)}</b>\n`;
  msg += `📈 <b>Receita média/dia:</b> ${format(mediaDiariaVendas)}\n`;
  msg += `📉 <b>Despesa média/dia:</b> ${format(despesaDiaria)}\n`;
  msg += `📊 <b>Fluxo diário:</b> <b>${fluxoDiario >= 0 ? "+" : ""}${format(fluxoDiario)}</b>\n\n`;
  
  if (fluxoDiario >= 0) {
    const proj30dias = fluxoDiario * 30;
    msg += `✅ <b>Fluxo de Caixa Positivo!</b>\n`;
    msg += `📈 <b>Projeção para 30 dias:</b> +${format(proj30dias)}\n`;
  } else {
    const diasAteZerar = saldoAtual > 0 ? Math.max(1, Math.floor(saldoAtual / Math.abs(fluxoDiario))) : 0;
    const dataZerar = new Date(hoje);
    dataZerar.setDate(hoje.getDate() + diasAteZerar);
    
    msg += `🚨 <b>ALERTA DE CAIXA:</b> Seu fluxo diário está negativo!\n`;
    msg += `⏰ <b>Seu saldo atual cobre cerca de ${diasAteZerar} dias de operação.</b>\n`;
    msg += `📅 Data estimada de exaustão: <b>${dataZerar.toLocaleDateString("pt-BR")}</b>\n\n`;
    msg += `💡 <b>Recomendações:</b>\n`;
    msg += `• Acelere recebimentos e ações de vendas\n`;
    msg += `• Renegocie prazos de vencimento de fornecedores\n`;
    msg += `• Pause despesas não essenciais\n`;
  }
  
  // 7. Dívidas próximas
  if (dividasFuturas && dividasFuturas.length > 0) {
    msg += `\n📋 <b>Contas a vencer (próx. 90 dias):</b> <b>${format(totalDividasProximas)}</b>\n`;
    msg += `   (<i>${dividasFuturas.length} compromissos</i>)\n\n`;
    
    msg += `<b>Próximos vencimentos:</b>\n`;
    dividasFuturas.slice(0, 5).forEach((d: any) => {
      const venc = new Date(d.data_vencimento + "T12:00:00Z");
      const dias = Math.max(0, Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)));
      const emoji = dias <= 3 ? "🔴" : dias <= 7 ? "🟡" : "🟢";
      const val = Number(d.valor_restante || d.valor_total || 0);
      msg += `${emoji} <b>${d.credor || d.descricao || "Boleto"}</b> — ${format(val)} (${dias === 0 ? "Vence hoje" : `em ${dias} dias`})\n`;
    });
  }
  
  return msg;
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

// ─── PARSER DETERMINÍSTICO DE XML DE NF-e BRASILEIRA ───
function parseNFeXml(xmlText: string) {
  const getTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? match[1].trim() : "";
  };

  const getNum = (xml: string, tag: string): number => {
    const v = getTag(xml, tag);
    return v ? parseFloat(v) || 0 : 0;
  };

  // 1. Chave de Acesso (44 dígitos)
  let chaveAcesso = getTag(xmlText, "chNFe");
  if (!chaveAcesso) {
    const idMatch = xmlText.match(/Id="NFe(\d{44})"/i);
    if (idMatch) chaveAcesso = idMatch[1];
  }

  // 2. Identificação da NF
  const ideMatch = xmlText.match(/<ide[\s\S]*?<\/ide>/i);
  const ideXml = ideMatch ? ideMatch[0] : "";
  const numeroNf = getTag(ideXml, "nNF");
  const serieNf = getTag(ideXml, "serie");
  const dataEmissaoRaw = getTag(ideXml, "dhEmi") || getTag(ideXml, "dEmi");
  const dataEmissao = dataEmissaoRaw ? dataEmissaoRaw.split("T")[0] : "";

  // 3. Emitente / Fornecedor
  const emitMatch = xmlText.match(/<emit[\s\S]*?<\/emit>/i);
  const emitXml = emitMatch ? emitMatch[0] : "";
  const cnpjFornecedor = getTag(emitXml, "CNPJ") || getTag(emitXml, "CPF");
  const razaoSocial = getTag(emitXml, "xNome");
  const nomeFantasia = getTag(emitXml, "xFant");
  const fornecedor = razaoSocial || nomeFantasia || "Fornecedor";

  // 4. Totais da Nota
  const totalMatch = xmlText.match(/<ICMSTot[\s\S]*?<\/ICMSTot>/i);
  const totalXml = totalMatch ? totalMatch[0] : "";
  const valorTotalNf = getNum(totalXml, "vNF");
  const valorProdutos = getNum(totalXml, "vProd");
  const valorIcms = getNum(totalXml, "vICMS");
  const valorIcmsSt = getNum(totalXml, "vST");
  const valorIpi = getNum(totalXml, "vIPI");
  const valorFrete = getNum(totalXml, "vFrete");
  const valorDesconto = getNum(totalXml, "vDesc");

  // 5. Itens da Nota
  const detMatches = xmlText.match(/<det[\s\S]*?<\/det>/gi) || [];
  const itens = detMatches.map((detXml, index) => {
    const prodMatch = detXml.match(/<prod[\s\S]*?<\/prod>/i);
    const prodXml = prodMatch ? prodMatch[0] : "";

    const codigo = getTag(prodXml, "cProd") || String(index + 1);
    const descricao = getTag(prodXml, "xProd");
    const ncm = getTag(prodXml, "NCM");
    const cfop = getTag(prodXml, "CFOP");
    const unidade = getTag(prodXml, "uCom") || "UN";
    const quantidade = getNum(prodXml, "qCom") || 1;
    const valorUnitario = getNum(prodXml, "vUnCom");
    const valorTotal = getNum(prodXml, "vProd");

    // Impostos
    const icmsAliq = getNum(detXml, "pICMS");
    const ipiAliq = getNum(detXml, "pIPI");
    const pisAliq = getNum(detXml, "pPIS");
    const cofinsAliq = getNum(detXml, "pCOFINS");

    // Custo unitário líquido
    const icmsValor = valorUnitario * (icmsAliq / 100);
    const ipiValor = valorUnitario * (ipiAliq / 100);
    const custoUnitarioLiquido = Math.max(0, valorUnitario - icmsValor - ipiValor);

    return {
      codigo,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
      icms_aliquota: icmsAliq,
      ipi_aliquota: ipiAliq,
      pis_aliquota: pisAliq,
      cofins_aliquota: cofinsAliq,
      custo_unitario_liquido: custoUnitarioLiquido > 0 ? custoUnitarioLiquido : valorUnitario,
    };
  });

  return {
    tipo: "nf_compra",
    confianca_geral: "alta",
    origem: "xml",
    cabecalho: {
      numero_nf: numeroNf,
      serie_nf: serieNf,
      data_emissao: dataEmissao,
      data_entrada: dataEmissao,
      fornecedor,
      cnpj_fornecedor: cnpjFornecedor,
      chave_acesso: chaveAcesso,
    },
    valores_totais: {
      valor_total_nf: valorTotalNf,
      valor_produtos: valorProdutos,
      valor_icms: valorIcms,
      valor_icms_st: valorIcmsSt,
      valor_ipi: valorIpi,
      valor_frete: valorFrete,
      valor_desconto: valorDesconto,
    },
    itens,
  };
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

    const sendReplyWithButtons = async (replyChatId: string | number, replyText: string, buttons: Array<Array<{ text: string; callback_data: string }>>) => {
      if (!telegramBotToken) return null;
      const resp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: replyChatId,
          text: replyText,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: buttons },
        }),
      });
      return await resp.json().catch(() => ({}));
    };

    const editMessageText = async (replyChatId: string | number, messageId: number, text: string) => {
      if (!telegramBotToken) return;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: replyChatId,
          message_id: messageId,
          text,
          parse_mode: "HTML",
        }),
      }).catch(() => {});
    };

    const removeInlineKeyboard = async (replyChatId: string | number, messageId: number) => {
      if (!telegramBotToken) return;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: replyChatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        }),
      }).catch(() => {});
    };

    const answerCallback = async (callbackQueryId: string, text: string) => {
      if (!telegramBotToken) return;
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      }).catch(() => {});
    };

    // ─── CASO 2: Webhook enviado diretamente pelo Telegram ───
    const message = body?.message;
    const callbackQuery = body?.callback_query;

    if (callbackQuery) {
      const callbackChatId = callbackQuery.message?.chat?.id;
      const callbackMessageId = callbackQuery.message?.message_id;
      const callbackData = callbackQuery.data || "";
      const callbackUserId = callbackQuery.from?.id;

      let { data: userData } = await supabase
        .from("usuarios_telegram")
        .select("user_id, telegram_chat_id")
        .eq("telegram_chat_id", String(callbackChatId))
        .maybeSingle();

      if (!userData && callbackUserId) {
        const { data: uData } = await supabase
          .from("usuarios_telegram")
          .select("user_id, telegram_chat_id")
          .eq("telegram_user_id", String(callbackUserId))
          .maybeSingle();
        userData = uData;
      }

      const cbUserId = userData?.user_id;
      const cbChatId = userData?.telegram_chat_id || callbackChatId;

      if (!cbUserId) {
        await answerCallback(callbackQuery.id, "Usuário não encontrado.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      // ================================================================
      // BOTÃO: nf_confirmar
      // ================================================================
      if (callbackData.startsWith("nf_confirmar:")) {
        const nfId = callbackData.split(":")[1];
        await removeInlineKeyboard(cbChatId, callbackMessageId);

        const { data: nf } = await supabase
          .from("notas_fiscais_compra")
          .select("*")
          .eq("id", nfId)
          .single();

        if (!nf) {
          await answerCallback(callbackQuery.id, "Nota fiscal não encontrada.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        if (nf.status === "confirmada" || nf.status === "custo_atualizado") {
          await editMessageText(cbChatId, callbackMessageId, "✅ Esta Nota Fiscal já foi confirmada anteriormente.");
          await answerCallback(callbackQuery.id, "NF já confirmada!");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        await supabase.from("notas_fiscais_compra").update({ status: "confirmada" }).eq("id", nfId);
        await supabase.from("telegram_propostas").update({ status: "confirmada", executed_at: new Date().toISOString() }).eq("dados->>nf_id", nfId);

        const { data: itens } = await supabase
          .from("nf_itens")
          .select("*")
          .eq("nf_id", nfId);

        let msgConf = `✅ <b>Nota Fiscal Confirmada!</b>\n\n`;
        msgConf += `🏢 <b>Fornecedor:</b> ${nf.fornecedor || "N/A"}\n`;
        msgConf += `📄 <b>NF:</b> ${nf.numero_nf || "N/A"}\n`;
        msgConf += `💰 <b>Total:</b> ${fmt(nf.valor_total)}\n`;
        msgConf += `📦 <b>Itens processados:</b> ${itens?.length || 0}\n\n`;

        const alertasCriados: any[] = [];
        if (itens && itens.length > 0) {
          for (const item of itens) {
            await supabase.from("nf_itens").update({ status_estoque: "processado" }).eq("id", item.id);

            await supabase.from("historico_custo_produto").insert({
              user_id: cbUserId,
              workspace_id: nf.workspace_id,
              produto_descricao: item.descricao,
              codigo_produto: item.codigo_produto,
              fornecedor: nf.fornecedor,
              cnpj_fornecedor: nf.cnpj_fornecedor,
              custo_unitario_bruto: item.valor_unitario,
              custo_unitario_liquido: item.custo_unitario_liquido,
              data_compra: nf.data_emissao || new Date().toISOString().split("T")[0],
              nf_id: nfId,
            });

            const { data: prodEye } = await supabase
              .from("produtos_eyemobile")
              .select("*")
              .eq("user_id", cbUserId)
              .ilike("descricao", `%${item.descricao.trim()}%`)
              .limit(1)
              .maybeSingle();

            if (prodEye) {
              await supabase.from("produtos_eyemobile").update({
                custo_atual: item.custo_unitario_liquido,
                estoque_atual: (Number(prodEye.estoque_atual) || 0) + (Number(item.quantidade) || 0),
                ultima_atualizacao_custo: new Date().toISOString(),
              }).eq("id", prodEye.id);
            }

            const dozeMesesAtras = new Date();
            dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);

            const { data: histAnterior } = await supabase
              .from("historico_custo_produto")
              .select("custo_unitario_liquido, created_at")
              .eq("user_id", cbUserId)
              .ilike("produto_descricao", `%${item.descricao.trim()}%`)
              .lt("created_at", nf.created_at || new Date().toISOString())
              .gte("created_at", dozeMesesAtras.toISOString())
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (histAnterior && Number(histAnterior.custo_unitario_liquido) > 0) {
              const custoAnt = Number(histAnterior.custo_unitario_liquido);
              const custoNovo = Number(item.custo_unitario_liquido);
              const variacao = ((custoNovo - custoAnt) / custoAnt) * 100;

              if (variacao > 10) {
                let precoVendaAtual = Number(prodEye?.preco_venda || 0);
                let margemReal = Number(prodEye?.margem_real_percentual || 0);
                let precoSugerido = 0;

                if (precoVendaAtual > 0 && custoAnt > 0) {
                  margemReal = ((precoVendaAtual / custoAnt) - 1) * 100;
                  precoSugerido = custoNovo * (1 + margemReal / 100);
                } else {
                  precoSugerido = custoNovo * 1.3;
                }

                const { data: novoAlerta } = await supabase
                  .from("alertas_preco_pendentes")
                  .insert({
                    user_id: cbUserId,
                    workspace_id: nf.workspace_id,
                    nf_id: nfId,
                    produto_eyemobile_id: prodEye?.eyemobile_id || null,
                    produto_codigo: item.codigo_produto,
                    produto_descricao: item.descricao,
                    custo_anterior: custoAnt,
                    custo_novo: custoNovo,
                    variacao_custo_percentual: variacao,
                    preco_venda_atual: precoVendaAtual > 0 ? precoVendaAtual : null,
                    margem_real_percentual: margemReal > 0 ? margemReal : null,
                    preco_sugerido: precoSugerido,
                    status: "pendente",
                  })
                  .select("*")
                  .single();

                if (novoAlerta) {
                  alertasCriados.push(novoAlerta);
                }
              }
            }
          }
        }

        await editMessageText(cbChatId, callbackMessageId, msgConf);

        if (alertasCriados.length > 0) {
          for (const alerta of alertasCriados) {
            let msgAlerta = `🚨 <b>ALERTA DE AUMENTO DE CUSTO</b>\n\n`;
            msgAlerta += `📦 <b>${alerta.produto_descricao}</b>\n\n`;
            msgAlerta += `💰 Custo anterior: ${fmt(alerta.custo_anterior)}\n`;
            msgAlerta += `💰 Custo novo: ${fmt(alerta.custo_novo)}\n`;
            msgAlerta += `📈 Aumento: <b>+${alerta.variacao_custo_percentual?.toFixed(1)}%</b>\n\n`;
            if (alerta.preco_venda_atual) msgAlerta += `💰 Preço venda atual: ${fmt(alerta.preco_venda_atual)}\n`;
            msgAlerta += `💡 <b>PREÇO SUGERIDO: ${fmt(alerta.preco_sugerido)}</b>\n`;
            if (alerta.margem_real_percentual) msgAlerta += `<i>(margem real ${alerta.margem_real_percentual.toFixed(0)}%)</i>`;

            const botoesPreco = [
              [{ text: `✅ CONFIRMAR ${fmt(alerta.preco_sugerido)}`, callback_data: `preco_confirmar:${alerta.id}` }],
              [
                { text: "✏️ EDITAR PREÇO", callback_data: `preco_editar:${alerta.id}` },
                { text: "🚫 IGNORAR", callback_data: `preco_ignorar:${alerta.id}` },
              ],
            ];

            await sendReplyWithButtons(cbChatId, msgAlerta, botoesPreco);
          }

          await supabase.from("telegram_conversas").upsert(
            {
              user_id: cbUserId,
              chat_id: Number(cbChatId),
              estado: "aguardando_ajuste_precos",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "chat_id" }
          );
        }

        await answerCallback(callbackQuery.id, "NF confirmada com sucesso!");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: nf_cancelar
      // ================================================================
      if (callbackData.startsWith("nf_cancelar:")) {
        const nfId = callbackData.split(":")[1];
        await removeInlineKeyboard(cbChatId, callbackMessageId);
        await editMessageText(cbChatId, callbackMessageId, "❌ Nota Fiscal cancelada.");
        await supabase.from("nf_itens").delete().eq("nf_id", nfId);
        await supabase.from("notas_fiscais_compra").delete().eq("id", nfId);
        await answerCallback(callbackQuery.id, "NF cancelada.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: preco_confirmar
      // ================================================================
      if (callbackData.startsWith("preco_confirmar:")) {
        const alertaId = callbackData.split(":")[1];
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("id", alertaId)
          .maybeSingle();

        if (!alerta) {
          await answerCallback(callbackQuery.id, "Alerta não encontrado.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        let updateResult: any = { success: true };
        if (alerta.produto_eyemobile_id) {
          const updateResp = await fetch(`${supabaseUrl}/functions/v1/eyemobile-sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "UPDATE_PRODUCT_PRICE",
              user_id: cbUserId,
              product_id: alerta.produto_eyemobile_id,
              new_price: alerta.preco_sugerido,
            }),
          });
          updateResult = await updateResp.json().catch(() => ({ success: false }));
        }

        await supabase.from("alertas_preco_pendentes").update({
          status: "aplicado",
          data_resolucao: new Date().toISOString(),
        }).eq("id", alertaId);

        if (alerta.produto_eyemobile_id) {
          await supabase.from("produtos_eyemobile").update({
            preco_venda: alerta.preco_sugerido,
          }).eq("eyemobile_id", alerta.produto_eyemobile_id).eq("user_id", cbUserId);
        }

        await removeInlineKeyboard(cbChatId, callbackMessageId);
        await editMessageText(
          cbChatId,
          callbackMessageId,
          `✅ <b>Preço atualizado!</b>\n\n` +
          `📦 <b>${alerta.produto_descricao}</b>\n` +
          `💰 Novo preço: <b>${fmt(alerta.preco_sugerido)}</b>` +
          (updateResult?.success ? "" : "\n⚠️ <i>(Atualizado localmente)</i>")
        );
        await answerCallback(callbackQuery.id, "Preço aplicado no Eyemobile!");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: preco_editar
      // ================================================================
      if (callbackData.startsWith("preco_editar:")) {
        const alertaId = callbackData.split(":")[1];
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("id", alertaId)
          .maybeSingle();

        if (!alerta) {
          await answerCallback(callbackQuery.id, "Alerta não encontrado.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        await removeInlineKeyboard(cbChatId, callbackMessageId);
        await editMessageText(
          cbChatId,
          callbackMessageId,
          `✏️ <b>Editar preço: ${alerta.produto_descricao}</b>\n\n` +
          `💰 Sugerido: ${fmt(alerta.preco_sugerido)}\n` +
          `💰 Custo: ${fmt(alerta.custo_novo)}\n\n` +
          `👉 <b>Digite o novo preço no chat</b> (ex: 15.00):`
        );

        await supabase.from("telegram_conversas").upsert(
          {
            user_id: cbUserId,
            chat_id: Number(cbChatId),
            estado: "aguardando_preco_editado",
            proposta_id: alertaId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "chat_id" }
        );

        await answerCallback(callbackQuery.id, "Digite o novo preço");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: preco_ignorar
      // ================================================================
      if (callbackData.startsWith("preco_ignorar:")) {
        const alertaId = callbackData.split(":")[1];
        await supabase.from("alertas_preco_pendentes").update({
          status: "ignorado",
          data_resolucao: new Date().toISOString(),
        }).eq("id", alertaId);

        await removeInlineKeyboard(cbChatId, callbackMessageId);
        await editMessageText(
          cbChatId,
          callbackMessageId,
          `🚫 <b>Alerta ignorado.</b>\n` +
          `Preço não será alterado. Lembrete semanal ativo.`
        );
        await answerCallback(callbackQuery.id, "Alerta ignorado.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: preco_confirmar_editado
      // ================================================================
      if (callbackData.startsWith("preco_confirmar_editado:")) {
        const parts = callbackData.split(":");
        const alertaId = parts[1];
        const precoDigitado = parseFloat(parts[2]);

        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("id", alertaId)
          .maybeSingle();

        if (!alerta) {
          await answerCallback(callbackQuery.id, "Alerta não encontrado.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        let updateResult: any = { success: true };
        if (alerta.produto_eyemobile_id) {
          const updateResp = await fetch(`${supabaseUrl}/functions/v1/eyemobile-sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "UPDATE_PRODUCT_PRICE",
              user_id: cbUserId,
              product_id: alerta.produto_eyemobile_id,
              new_price: precoDigitado,
            }),
          });
          updateResult = await updateResp.json().catch(() => ({ success: false }));
        }

        await supabase.from("alertas_preco_pendentes").update({
          status: "aplicado",
          preco_definido_usuario: precoDigitado,
          data_resolucao: new Date().toISOString(),
        }).eq("id", alertaId);

        if (alerta.produto_eyemobile_id) {
          await supabase.from("produtos_eyemobile").update({
            preco_venda: precoDigitado,
          }).eq("eyemobile_id", alerta.produto_eyemobile_id).eq("user_id", cbUserId);
        }

        await removeInlineKeyboard(cbChatId, callbackMessageId);
        await editMessageText(
          cbChatId,
          callbackMessageId,
          `✅ <b>Preço atualizado!</b>\n\n` +
          `📦 <b>${alerta.produto_descricao}</b>\n` +
          `💰 Novo preço: <b>${fmt(precoDigitado)}</b>` +
          (updateResult?.success ? "" : "\n⚠️ <i>(Atualizado localmente)</i>")
        );
        await answerCallback(callbackQuery.id, "Preço aplicado!");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // ================================================================
      // BOTÃO: sefaz_consultar
      // ================================================================
      if (callbackData.startsWith("sefaz_consultar:")) {
        const chaveAcesso = callbackData.split(":")[1] || "";
        await answerCallback(callbackQuery.id, "Abrindo consulta SEFAZ...");
        await removeInlineKeyboard(cbChatId, callbackMessageId);

        // Determinar estado com base nos primeiros 2 dígitos da chave (cUF)
        const estadoCodigos: Record<string, string> = {
          "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA",
          "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE",
          "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE",
          "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
          "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT",
          "52": "GO", "53": "DF",
        };
        const cuf = chaveAcesso.slice(0, 2);
        const estado = estadoCodigos[cuf] || "??";

        const urlNacional = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&nfe=${chaveAcesso}`;

        let msgSefaz = `🔍 <b>Consulta SEFAZ — Nota Fiscal Eletrônica</b>\n\n`;
        msgSefaz += `📋 <b>Chave de Acesso:</b>\n<code>${chaveAcesso}</code>\n\n`;
        msgSefaz += `🗺️ Estado emissor: <b>${estado}</b>\n\n`;
        msgSefaz += `🌐 <b>Portal Nacional NF-e:</b>\n`;
        msgSefaz += `${urlNacional}\n\n`;
        msgSefaz += `📱 <b>Como consultar:</b>\n`;
        msgSefaz += `① Acesse o link acima no seu navegador\n`;
        msgSefaz += `② A chave já está na URL — confirme e resolva o CAPTCHA\n`;
        msgSefaz += `③ Veja todos os dados oficiais da nota\n\n`;
        msgSefaz += `💡 <i>Alternativa: escaneie o QR Code impresso na DANFE com a câmera do celular para abrir diretamente.</i>`;

        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cbChatId,
            text: msgSefaz,
            parse_mode: "HTML",
            disable_web_page_preview: false,
          }),
        });

        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // Fallback para callbacks não reconhecidos
      await answerCallback(callbackQuery.id, "Ação realizada.");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    if (!message || !message.chat) {
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const chatId = String(message.chat.id);
    const username = message.chat.username || message.chat.first_name || null;
    let text = (message.text || "").trim();
    let respLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

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

    // ─── RESOLUÇÃO DE USUÁRIO / GRUPO ───
    const chatType = message.chat?.type || "private";
    const isGroup = chatType === "group" || chatType === "supergroup";
    let grupoConfig: any = null;
    let userId: string = "";
    let workspaceId: string | null = null;

    if (isGroup) {
      const { data: gc } = await supabase
        .from("telegram_grupos_config")
        .select("*")
        .eq("chat_id", chatId)
        .maybeSingle();

      if (!gc) {
        await sendReply(
          `⚠️ <b>Este grupo do Telegram ainda não está configurado.</b>\n\n` +
          `🆔 <b>Chat ID do Grupo:</b> <code>${chatId}</code>\n` +
          `🏷️ <b>Nome:</b> <i>${message.chat?.title || "Grupo"}</i>\n\n` +
          `<i>Para habilitar o bot neste grupo, configure as permissões no banco de dados na tabela <code>telegram_grupos_config</code>.</i>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      grupoConfig = gc;
      workspaceId = gc.workspace_id || null;

      // Se o grupo tiver workspace_id vinculado, busca o dono do workspace
      if (workspaceId) {
        const { data: ws } = await supabase.from("workspaces").select("user_id").eq("id", workspaceId).maybeSingle();
        userId = ws?.user_id || "";
      }

      // Fallback para primeiro usuário ativo vinculado se não houver dono explícito
      if (!userId) {
        const { data: anyUser } = await supabase.from("usuarios_telegram").select("user_id").eq("ativo", true).limit(1).maybeSingle();
        userId = anyUser?.user_id || "";
      }

      if (!userId) {
        await sendReply("⚠️ Não foi possível identificar a conta administradora para este grupo.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    } else {
      // Busca vínculo do usuário no chat privado
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

      userId = usuarioTg.user_id;
    }

    console.log("[telegram-webhook] Identificação:", isGroup ? `GRUPO (${grupoConfig?.nome_grupo})` : "PRIVADO", "userId=", userId, "chatId=", chatId);

    // ================================================================
    // SUPORTE A ÁUDIO (Whisper Transcription)
    // ================================================================
    const hasAudio = !!(message.voice || message.audio || message.video_note);
    if (hasAudio) {
      const audioFileId = message.voice?.file_id || message.audio?.file_id || message.video_note?.file_id;
      const duracao = message.voice?.duration || message.audio?.duration || message.video_note?.duration || 0;

      if (audioFileId && telegramBotToken) {
        console.log("[telegram-webhook] Áudio recebido, iniciando transcrição Whisper...");
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendChatAction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, action: "record_voice" }),
        }).catch(() => {});

        const transcricao = await transcribeAudio(audioFileId, telegramBotToken, supabaseUrl, supabaseServiceKey, userId);

        if (transcricao) {
          console.log("[telegram-webhook] Áudio transcrito com sucesso:", transcricao);
          await supabase.from("audio_transcricoes").insert({
            user_id: userId,
            chat_id: Number(chatId) || null,
            file_id: audioFileId,
            duracao_segundos: duracao,
            transcricao: transcricao,
            sucesso: true,
          });

          text = transcricao.trim();
          respLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

          await sendReply(`🎙️ <b>Áudio transcrito:</b>\n<i>"${transcricao}"</i>`);
        } else {
          await sendReply("❌ Não consegui transcrever o áudio. Tente enviar novamente.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }
      }
    }

    const nowSp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hojeStr = `${nowSp.getFullYear()}-${String(nowSp.getMonth() + 1).padStart(2, "0")}-${String(nowSp.getDate()).padStart(2, "0")}`;
    const mesAtual = nowSp.getMonth() + 1;
    const anoAtual = nowSp.getFullYear();
    const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;

    // ─── COMANDO /sefaz — STATUS E CONSULTA SEFAZ ───
    if (respLower.startsWith("/sefaz") || respLower === "sefaz") {
      const { data: cert } = await supabase
        .from("workspace_certificados_sefaz")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cert || !cert.certificado_storage_path) {
        let msgSefazInfo = `🏛️ <b>Sincronização Automática com a SEFAZ (DF-e)</b>\n\n`;
        msgSefazInfo += `Para que o Wallet App baixe <b>automaticamente</b> todas as notas emitidas contra o seu CNPJ (sem você precisar fotografar nem digitar nada):\n\n`;
        msgSefazInfo += `🔐 <b>Requisito:</b> Certificado Digital A1 (.pfx) do seu CNPJ.\n\n`;
        msgSefazInfo += `📋 <b>Como ativar:</b>\n`;
        msgSefazInfo += `1. Abra o Wallet App em <b>Configurações > SEFAZ / Certificado A1</b>\n`;
        msgSefazInfo += `2. Faça o upload do arquivo <code>.pfx</code> e informe a senha\n`;
        msgSefazInfo += `3. O sistema conectará na SEFAZ e buscará novas notas a cada hora automaticamente! 🚀\n\n`;
        msgSefazInfo += `💡 <i>Enquanto isso, você pode enviar fotos de DANFEs ou arquivos <b>.XML</b> e <b>.PDF</b> direto aqui no chat!</i>`;

        await sendReply(msgSefazInfo);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const valFmt = cert.validade_fim ? new Date(cert.validade_fim).toLocaleDateString("pt-BR") : "Não informada";
      const ultSyncFmt = cert.ultima_sincronizacao ? new Date(cert.ultima_sincronizacao).toLocaleString("pt-BR") : "Nenhuma ainda";

      let msgStatus = `🏛️ <b>Status da Integração SEFAZ:</b>\n\n`;
      msgStatus += `🏢 <b>CNPJ:</b> <code>${cert.cnpj}</code>\n`;
      msgStatus += `📍 <b>UF:</b> ${cert.uf || "MG"} (${cert.ambiente})\n`;
      msgStatus += `📅 <b>Validade do Certificado:</b> ${valFmt}\n`;
      msgStatus += `🔄 <b>Última busca na SEFAZ:</b> ${ultSyncFmt}\n`;
      msgStatus += `📊 <b>Status:</b> ${cert.status === "ativo" ? "🟢 Ativo e Conectado" : "🔴 " + (cert.status || "Pendente")}\n\n`;
      msgStatus += `💡 <i>As novas notas fiscais são sincronizadas automaticamente em segundo plano.</i>`;

      await sendReply(msgStatus);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── VERIFICAÇÃO DE ESTADO DE CONVERSA (Limpa confirmação pendente se usuário fez outra pergunta) ───
    const isSim = ["sim", "s", "yes", "y", "confirmar", "confirmo", "pode cadastrar", "cadastrar", "ok"].includes(respLower);
    const isNao = ["não", "nao", "n", "no", "cancelar", "cancela", "não cadastrar"].includes(respLower);

    // ─── HANDLER PARA PREÇO EDITADO DIGITADO NO CHAT ───
    const { data: conversaPrecoEdit } = await supabase
      .from("telegram_conversas")
      .select("estado, proposta_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (conversaPrecoEdit?.estado === "aguardando_preco_editado" && conversaPrecoEdit?.proposta_id) {
      const alertaId = conversaPrecoEdit.proposta_id;
      const precoDigitado = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));

      if (isNaN(precoDigitado) || precoDigitado <= 0) {
        await sendReply("❌ Valor inválido. Digite apenas o número do novo preço (ex: 15.00)");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const { data: alerta } = await supabase
        .from("alertas_preco_pendentes")
        .select("*")
        .eq("id", alertaId)
        .maybeSingle();

      if (alerta) {
        const custoNovo = Number(alerta.custo_novo || 0);
        const novaMargem = custoNovo > 0 ? ((precoDigitado / custoNovo) - 1) * 100 : 0;

        const fmt = (v: any) =>
          v != null && !isNaN(Number(v))
            ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "R$ 0,00";

        const msgEditado = `✏️ <b>Preço definido por você:</b>\n\n` +
          `📦 <b>${alerta.produto_descricao}</b>\n` +
          `💰 Sugerido: ${fmt(alerta.preco_sugerido)}\n` +
          `💰 Definido por você: <b>${fmt(precoDigitado)}</b>\n` +
          `📈 Nova margem real: <b>${novaMargem.toFixed(1)}%</b>\n\n` +
          `👉 Confirmar este preço para atualizar no Eyemobile?`;

        const botoesConfirmar = [
          [{ text: `✅ CONFIRMAR ${fmt(precoDigitado)}`, callback_data: `preco_confirmar_editado:${alertaId}:${precoDigitado}` }],
          [
            { text: "✏️ TENTAR OUTRO", callback_data: `preco_editar:${alertaId}` },
            { text: "🚫 CANCELAR", callback_data: `preco_ignorar:${alertaId}` },
          ],
        ];

        await sendReplyWithButtons(chatId, msgEditado, botoesConfirmar);

        await supabase.from("alertas_preco_pendentes").update({
          preco_definido_usuario: precoDigitado,
          status: "editado",
        }).eq("id", alertaId);

        await supabase.from("telegram_conversas").upsert(
          {
            user_id: userId,
            chat_id: Number(chatId),
            estado: "inicio",
            proposta_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "chat_id" }
        );

        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // ─── HANDLERS DE CORREÇÃO DE NOTA FISCAL (PROSSEGUIR / MANUAL) ───
    const { data: conversaAtivaPre } = await supabase
      .from("telegram_conversas")
      .select("estado, proposta_id, updated_at")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (respLower === "prosseguir" && conversaAtivaPre?.estado === "aguardando_correcao_nf") {
      const { data: nfParcial } = await supabase
        .from("notas_fiscais_compra")
        .select("*")
        .eq("chat_id", Number(chatId))
        .eq("status", "validacao_falhou")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!nfParcial) {
        await sendReply("❌ NF não encontrada. Envie a foto novamente.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const { data: itensParciais } = await supabase
        .from("nf_itens")
        .select("*")
        .eq("nf_id", nfParcial.id);

      await supabase.from("notas_fiscais_compra").update({ status: "pendente" }).eq("id", nfParcial.id);

      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      let msg = `📄 <b>Prosseguindo com os itens detectados:</b>\n\n`;
      msg += `🏢 <b>Fornecedor:</b> ${nfParcial.fornecedor || "N/A"}\n`;
      msg += `📦 <b>Itens:</b> ${itensParciais?.length || 0} produtos\n`;
      msg += `💰 <b>Valor Total NF:</b> ${fmt(nfParcial.valor_total)}\n\n`;

      (itensParciais || []).forEach((item: any, i: number) => {
        msg += `${i + 1}. <b>${item.descricao || "Item"}</b>\n`;
        msg += `   📦 ${item.quantidade || 0} ${item.unidade || "UN"} × ${fmt(item.valor_unitario)}\n`;
        msg += `   💰 Total: ${fmt(item.valor_total)}\n`;
      });

      msg += `\n⚠️ <b>Deseja confirmar e atualizar estoque/custo?</b>\n`;
      msg += `👉 Responda <b>CONFIRMAR</b> para atualizar com os itens lidos.\n`;
      msg += `👉 Responda <b>CANCELAR</b> para descartar.`;

      const { data: propCriada } = await supabase.from("telegram_propostas").insert({
        user_id: userId,
        chat_id: Number(chatId),
        tipo: "atualizar_estoque_nf",
        dados: { nf_id: nfParcial.id },
        resumo: `NF ${nfParcial.numero_nf} - ${nfParcial.fornecedor} - ${fmt(nfParcial.valor_total)}`,
        status: "pendente",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).select("id").single();

      await supabase.from("telegram_conversas").upsert({
        user_id: userId,
        chat_id: chatId,
        estado: "aguardando_confirmacao_nf",
        proposta_id: propCriada?.id || nfParcial.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "chat_id" });

      await sendReply(msg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    if (respLower === "manual" && conversaAtivaPre?.estado === "aguardando_correcao_nf") {
      await sendReply(
        `📝 <b>Modo Manual de Entrada de NF:</b>\n\n` +
        `Você pode reenviar a foto mais próxima da tabela ou informar os produtos no formato:\n` +
        `<code>Item: Coca-Cola 2L | Qtd: 10 | R$ 7,50</code>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    if ((respLower.includes("sefaz") || text.toUpperCase().includes("SEFAZ")) && conversaAtivaPre?.estado === "aguardando_consulta_sefaz") {
      await sendReply(
        `📋 <b>Consulta SEFAZ</b>\n\n` +
        `Acesse o Portal Oficial da SEFAZ para consultar a DANFE:\n` +
        `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx\n\n` +
        `Ou escaneie o QR Code impresso na nota com a câmera do seu celular.\n\n` +
        `💡 <i>Para cadastrar os produtos no Wallet, envie uma foto aproximada da tabela de produtos ou utilize o modo manual.</i>`
      );
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

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

    // ─── 0. COMANDO /precos (LISTAR ALERTAS DE PREÇO PENDENTES) ───
    if (text.startsWith("/precos") || respLower.includes("alertas de preco") || respLower.includes("precos pendentes")) {
      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      const { data: alertas } = await supabase
        .from("alertas_preco_pendentes")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["pendente", "editado"])
        .order("created_at", { ascending: false });

      if (!alertas || alertas.length === 0) {
        await sendReply("✅ <b>Nenhum alerta de preço pendente!</b> Todos os preços estão atualizados e dentro da margem.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      let msgPrecos = `🚨 <b>Alertas de Preço Pendentes:</b> (${alertas.length} produto(s))\n\n`;

      alertas.forEach((alerta: any, idx: number) => {
        const idCurto = alerta.id.slice(0, 8);
        const statusEmoji = alerta.status === "editado" ? "✏️" : "⏳";

        msgPrecos += `${idx + 1}. ${statusEmoji} <b>${alerta.produto_descricao}</b> (<code>${idCurto}</code>)\n`;
        msgPrecos += `   💰 Custo: ${fmt(alerta.custo_anterior)} → <b>${fmt(alerta.custo_novo)}</b> (+${alerta.variacao_custo_percentual?.toFixed(1)}%)\n`;
        msgPrecos += `   💰 Preço venda atual: ${fmt(alerta.preco_venda_atual)}\n`;
        msgPrecos += `   💡 Sugerido: <b>${fmt(alerta.preco_sugerido)}</b> (margem ${alerta.margem_real_percentual?.toFixed(0)}%)\n`;
        if (alerta.preco_definido_usuario) {
          msgPrecos += `   ✏️ Editado por você: <b>${fmt(alerta.preco_definido_usuario)}</b>\n`;
        }
        msgPrecos += `   👉 <code>CONFIRMAR ${idCurto}</code> | <code>EDITAR ${idCurto} 15.00</code> | <code>IGNORAR ${idCurto}</code>\n\n`;
      });

      await sendReply(msgPrecos);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 0.1 HANDLER DE CONFIRMAR PREÇO NO EYEMOBILE ───
    const confirmarPrecoMatch = text.match(/^confirmar\s+([a-f0-9]{8})/i);
    const { data: conversaAtivaPreco } = await supabase
      .from("telegram_conversas")
      .select("estado, proposta_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (confirmarPrecoMatch || (respLower.startsWith("confirmar") && conversaAtivaPreco?.estado === "aguardando_ajuste_precos")) {
      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      let alertaId: string | null = null;

      if (confirmarPrecoMatch) {
        const idCurto = confirmarPrecoMatch[1].toLowerCase();
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .ilike("id", `${idCurto}%`)
          .in("status", ["pendente", "editado"])
          .maybeSingle();
        alertaId = alerta?.id || null;
      } else {
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .in("status", ["pendente", "editado"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        alertaId = alerta?.id || null;
      }

      if (alertaId) {
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("id", alertaId)
          .single();

        if (alerta) {
          const precoConfirmado = alerta.preco_definido_usuario || alerta.preco_sugerido;

          await sendReply(
            `🔄 <b>Atualizando preço no Eyemobile PDV...</b>\n` +
            `📦 <b>Produto:</b> ${alerta.produto_descricao}\n` +
            `💰 <b>Novo Preço:</b> <b>${fmt(precoConfirmado)}</b>`
          );

          const updateResp = await fetch(`${supabaseUrl}/functions/v1/eyemobile-sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "UPDATE_PRODUCT_PRICE",
              user_id: userId,
              product_id: alerta.produto_eyemobile_id,
              new_price: precoConfirmado,
            }),
          });

          let updateResult: any = null;
          try {
            updateResult = await updateResp.json();
          } catch {
            updateResult = { success: updateResp.ok };
          }

          if (updateResult?.success) {
            await supabase.from("alertas_preco_pendentes").update({
              status: "aplicado",
              preco_definido_usuario: precoConfirmado,
              data_resolucao: new Date().toISOString(),
            }).eq("id", alertaId);

            await supabase.from("produtos_eyemobile").update({
              preco_venda: precoConfirmado,
            }).eq("eyemobile_id", alerta.produto_eyemobile_id).eq("user_id", userId);

            await sendReply(
              `✅ <b>Preço atualizado com sucesso no Eyemobile!</b>\n\n` +
              `📦 <b>${alerta.produto_descricao}</b>\n` +
              `💰 Preço de venda: <b>${fmt(precoConfirmado)}</b>\n` +
              `📈 Margem mantida: <b>${alerta.margem_real_percentual?.toFixed(0)}%</b>`
            );
          } else {
            await sendReply(
              `❌ <b>Erro ao atualizar preço no Eyemobile PDV:</b>\n` +
              `${updateResult?.error || "Erro de comunicação com a API do Eyemobile"}\n\n` +
              `💡 Você também pode ajustar diretamente no PDV.`
            );
          }

          const { count: pendentesRestantes } = await supabase
            .from("alertas_preco_pendentes")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("status", ["pendente", "editado"]);

          if (pendentesRestantes === 0) {
            await supabase.from("telegram_conversas").upsert(
              {
                user_id: userId,
                chat_id: chatId,
                estado: "inicio",
                proposta_id: null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "chat_id" }
            );
            await sendReply("🎉 <b>Todos os preços pendentes foram ajustados com sucesso!</b>");
          } else {
            await sendReply(`📋 Ainda há <b>${pendentesRestantes}</b> alerta(s) de preço pendente(s). Use /precos para ver.`);
          }

          return new Response("OK", { status: 200, headers: corsHeaders });
        }
      }
    }

    // ─── 0.2 HANDLER DE EDITAR PREÇO ───
    const editarPrecoMatch = text.match(/^editar\s+([a-f0-9]{8})\s+R?\$?\s*([0-9]+[.,]?[0-9]*)/i);

    if (editarPrecoMatch || (respLower.startsWith("editar") && conversaAtivaPreco?.estado === "aguardando_ajuste_precos")) {
      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      let alertaId: string | null = null;
      let precoEditado: number | null = null;

      if (editarPrecoMatch) {
        const idCurto = editarPrecoMatch[1].toLowerCase();
        precoEditado = parseFloat(editarPrecoMatch[2].replace(",", "."));

        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .ilike("id", `${idCurto}%`)
          .in("status", ["pendente", "editado"])
          .maybeSingle();
        alertaId = alerta?.id || null;
      } else {
        const valorMatch = text.match(/R?\$?\s*([0-9]+[.,]?[0-9]*)/);
        if (valorMatch) {
          precoEditado = parseFloat(valorMatch[1].replace(",", "."));
        }
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .in("status", ["pendente", "editado"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        alertaId = alerta?.id || null;
      }

      if (alertaId && precoEditado && precoEditado > 0) {
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("id", alertaId)
          .single();

        if (alerta) {
          const novaMargem = alerta.custo_novo > 0 ? ((precoEditado / Number(alerta.custo_novo)) - 1) * 100 : 0;

          await supabase.from("alertas_preco_pendentes").update({
            preco_definido_usuario: precoEditado,
            status: "editado",
          }).eq("id", alertaId);

          await sendReply(
            `✏️ <b>Preço editado:</b>\n\n` +
            `📦 <b>${alerta.produto_descricao}</b>\n` +
            `💰 Preço sugerido: ${fmt(alerta.preco_sugerido)}\n` +
            `💰 Preço definido: <b>${fmt(precoEditado)}</b>\n` +
            `📈 Nova margem: <b>${novaMargem.toFixed(1)}%</b> (Custo: ${fmt(alerta.custo_novo)})\n\n` +
            `👉 Responda <code>CONFIRMAR ${alerta.id.slice(0, 8)}</code> para aplicar no Eyemobile PDV.`
          );

          return new Response("OK", { status: 200, headers: corsHeaders });
        }
      }
    }

    // ─── 0.3 HANDLER DE IGNORAR ALERTA DE PREÇO ───
    const ignorarMatch = text.match(/^ignorar\s+([a-f0-9]{8})/i);

    if (ignorarMatch || (respLower === "ignorar" && conversaAtivaPreco?.estado === "aguardando_ajuste_precos")) {
      let alertaId: string | null = null;

      if (ignorarMatch) {
        const idCurto = ignorarMatch[1].toLowerCase();
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .ilike("id", `${idCurto}%`)
          .in("status", ["pendente", "editado"])
          .maybeSingle();
        alertaId = alerta?.id || null;
      } else {
        const { data: alerta } = await supabase
          .from("alertas_preco_pendentes")
          .select("*")
          .eq("user_id", userId)
          .in("status", ["pendente", "editado"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        alertaId = alerta?.id || null;
      }

      if (alertaId) {
        await supabase.from("alertas_preco_pendentes").update({
          status: "ignorado",
          data_resolucao: new Date().toISOString(),
        }).eq("id", alertaId);

        await sendReply(
          `🚫 <b>Alerta de preço ignorado.</b>\n` +
          `O preço de venda no PDV não foi alterado.\n` +
          `Você pode alterar manualmente quando desejar.`
        );

        const { count: pendentesRestantes } = await supabase
          .from("alertas_preco_pendentes")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("status", ["pendente", "editado"]);

        if (pendentesRestantes === 0) {
          await supabase.from("telegram_conversas").upsert(
            {
              user_id: userId,
              chat_id: chatId,
              estado: "inicio",
              proposta_id: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "chat_id" }
          );
        }

        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // ─── 0.0. BOAS-VINDAS / ORIENTAÇÃO NO GRUPO DE FECHAMENTO ───
    if (isGroup && grupoConfig?.tipo_grupo === "fechamento") {
      const isGreeting = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "fechamento", "/start", "/ajuda"].includes(respLower);
      if (isGreeting) {
        await sendReply(
          `🤖 <b>Bot de Fechamento de Caixa Conectado!</b>\n\n` +
          `📸 <b>Como usar:</b>\n` +
          `1. Envie a <b>foto do envelope</b> ou <b>relatório de caixa</b> aqui no grupo.\n` +
          `2. Eu vou ler os valores (Dinheiro, Débito, Crédito, Pix e Voucher) e conferir com o sistema Eyemobile.\n` +
          `3. Se houver sobra física, digite: <code>Sobra: R$ 50,00</code> que eu lanço automaticamente na conta Caixa!\n\n` +
          `<i>💡 Importante: Para o bot ler todas as fotos enviadas no grupo, certifique-se de promover o bot a <b>Administrador</b> deste grupo.</i>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // ─── 0.0. FECHAMENTO DE CAIXA: SOBRA (Grupo Fechamento ou Chat) ───
    const matchSobra = text.match(/sobra[:\s]*R?\$?\s*([\d.,]+)/i);
    if (matchSobra) {
      const sobraStr = matchSobra[1].replace(/\./g, "").replace(",", ".");
      const sobraValor = parseFloat(sobraStr);

      if (!isNaN(sobraValor)) {
        let qUltimo = supabase
          .from("fechamentos_caixa")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);

        if (isGroup) {
          qUltimo = qUltimo.eq("chat_id", chatId);
        } else if (userId) {
          qUltimo = qUltimo.eq("user_id", userId);
        }

        const { data: ultimo } = await qUltimo.maybeSingle();

        if (!ultimo) {
          await sendReply("❌ Envie a foto do envelope de fechamento primeiro antes de informar a sobra.");
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        const total = (ultimo.total || {}) as Record<string, any>;
        const fmt = (v: any) =>
          v != null && Number(v) > 0
            ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "R$ 0,00";

        let msg = `🔸 <b>Fechamento</b>\n\n`;
        msg += `📅 <b>Data:</b> ${ultimo.data_fechamento || hojeStr.split("-").reverse().join("/")}\n\n`;
        msg += `💰 Dinheiro: ${fmt(total.dinheiro)}\n`;
        msg += `💳 Cartão Débito: ${fmt(total.debito)}\n`;
        msg += `💳 Cartão Crédito: ${fmt(total.credito)}\n`;
        msg += `📲 Pix: ${fmt(total.pix)}\n`;
        if (total.voucher) msg += `🎫 Voucher: ${fmt(total.voucher)}\n`;
        msg += `\n💵 <b>Sobra:</b> ${fmt(sobraValor)}\n`;

        const totalGeral =
          (Number(total.dinheiro) || 0) +
          (Number(total.debito) || 0) +
          (Number(total.credito) || 0) +
          (Number(total.pix) || 0) +
          (Number(total.voucher) || 0) +
          sobraValor;

        msg += `\n🔸 <b>TOTAL GERAL:</b> <b>${fmt(totalGeral)}</b>\n`;

        // Lançar no sistema via RPC adicionar_saldo_conta
        const { data: rpcResult, error: errSobra } = await supabase.rpc("adicionar_saldo_conta", {
          p_user_id: userId,
          p_workspace_id: workspaceId,
          p_conta_nome: "Caixa",
          p_valor: sobraValor,
          p_descricao: `Sobra fechamento caixa - ${ultimo.data_fechamento || hojeStr}`,
          p_categoria_nome: "Sobra de Caixa",
        });

        if (rpcResult?.success && !errSobra) {
          msg += `\n✅ <b>Sobra lançada automaticamente!</b>\n`;
          msg += `📥 Conta: Caixa / Dinheiro\n`;
          msg += `💵 Valor: <b>${fmt(sobraValor)}</b>\n`;
          msg += `🏷️ Categoria: <b>Sobra de Caixa</b>\n`;
          if (rpcResult.novo_saldo != null) {
            msg += `💰 Novo saldo em caixa: <b>${fmt(rpcResult.novo_saldo)}</b>\n`;
          }
          msg += `\n💡 <i>Seu saldo físico e o DRE já foram atualizados no Wallet App.</i>`;
        }

        await supabase
          .from("fechamentos_caixa")
          .update({ sobra: sobraValor, status: "conferido" })
          .eq("id", ultimo.id);

        await sendReply(msg);
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // ─── 0. COMANDO /ensinar: APRENDIZADO DE CATEGORIA POR CREDOR ───
    if (text.startsWith("/ensinar")) {
      const match = text.match(/^\/ensinar\s+(.+?)\s+(?:e|é|eh)\s+(.+)$/i);

      if (!match) {
        await sendReply(
          "🎓 <b>Como ensinar categorias:</b>\n\n" +
          "Envie no formato:\n" +
          "<code>/ensinar [nome do credor] e [nome da categoria]</code>\n\n" +
          "<b>Exemplos:</b>\n" +
          "• <code>/ensinar Brasnorte e Ambev</code>\n" +
          "• <code>/ensinar SELLPACK e Descartáveis</code>\n" +
          "• <code>/ensinar CEMIG e Energia Elétrica</code>\n\n" +
          "<i>O Wallet lembrará dessa regra e categorizará futuros boletos automaticamente!</i>"
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const credorNome = match[1].trim();
      const categoriaNome = match[2].trim();

      // Busca categorias do usuário
      const { data: categorias } = await supabase
        .from("categorias")
        .select("id, nome")
        .eq("user_id", userId);

      const catNorm = categoriaNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const categoria = (categorias || []).find((c: any) => {
        const n = (c.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return n === catNorm || n.includes(catNorm) || catNorm.includes(n);
      });

      if (!categoria) {
        const sugestoes = (categorias || []).slice(0, 6).map((c: any) => `• ${c.nome}`).join("\n");
        await sendReply(
          `❌ Categoria <b>"${categoriaNome}"</b> não encontrada.\n\n` +
          (sugestoes ? `<b>Categorias disponíveis:</b>\n${sugestoes}\n\n` : "") +
          `<i>Verifique a ortografia ou cadastre a categoria no painel do Wallet.</i>`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const credorNorm = credorNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();

      const { error: upsertErr } = await supabase.from("categoria_credor_cache").upsert({
        user_id: userId,
        credor_normalizado: credorNorm,
        categoria_id: categoria.id,
        hits: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,credor_normalizado" });

      if (upsertErr) {
        console.error("[telegram-webhook] Erro ao salvar /ensinar no cache:", upsertErr.message);
      }

      await sendReply(
        `✅ <b>Aprendido com sucesso!</b>\n\n` +
        `📄 <b>Credor / Fornecedor:</b> <code>${credorNome}</code>\n` +
        `🏷️ <b>Categoria vinculada:</b> <b>${categoria.nome}</b>\n\n` +
        `🎯 <i>Todos os próximos boletos e despesas deste fornecedor serão classificados automaticamente como <b>${categoria.nome}</b>.</i>`
      );

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 0.5. CONSULTA DE MÉTRICAS E CUSTOS DE IA ───
    const isConsultaMetricasIA =
      text.startsWith("/metricas") ||
      text.startsWith("/ia_metricas") ||
      respLower.includes("painel de metricas") ||
      respLower.includes("painel de métricas") ||
      respLower.includes("metricas de ia") ||
      respLower.includes("métricas de ia") ||
      respLower.includes("metricas da ia") ||
      respLower.includes("métricas da ia") ||
      respLower.includes("custo de ia") ||
      respLower.includes("custos de ia") ||
      respLower.includes("custo da ia") ||
      respLower.includes("custos da ia") ||
      respLower.includes("gasto com ia") ||
      respLower.includes("consumo de ia") ||
      respLower.includes("tokens");

    if (isConsultaMetricasIA) {
      const { data: events } = await supabase
        .from("wallet_ai_audit_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      const evts = events || [];
      const totalCalls = evts.length;
      const successfulCalls = evts.filter((e: any) => e.execution_status === "success").length;
      const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 100;
      const totalTokens = evts.reduce((acc: number, e: any) => acc + (Number(e.tokens_total) || 500), 0);
      const estimatedCostUsd = (totalTokens / 1_000_000) * 0.15;
      const estimatedCostBrl = estimatedCostUsd * 5.65;
      const avgDuration = totalCalls > 0
        ? Math.round(evts.reduce((acc: number, e: any) => acc + (Number(e.duration_ms) || 0), 0) / totalCalls)
        : 0;

      const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      let msg = `🧠 <b>Painel de Métricas & Custos de IA</b>\n`;
      msg += `<i>Monitoramento de desempenho, tokens e custos do Wallet</i>\n\n`;

      msg += `⚡ <b>Requisições IA:</b> <b>${totalCalls}</b> (${successRate.toFixed(1)}% taxa de sucesso)\n`;
      msg += `📦 <b>Tokens Processados:</b> <b>${totalTokens.toLocaleString("pt-BR")}</b> (Prompt + Completion)\n`;
      msg += `💵 <b>Custo Acumulado:</b> <b>${formatBRL(estimatedCostBrl)}</b> ($${estimatedCostUsd.toFixed(4)} USD)\n`;
      msg += `⏱️ <b>Tempo Médio Resposta:</b> <b>${avgDuration} ms</b>\n\n`;

      if (evts.length > 0) {
        msg += `📋 <b>Últimas Ações Auditadas:</b>\n`;
        evts.slice(0, 4).forEach((e: any) => {
          const dt = new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          const st = e.execution_status === "success" ? "✅" : "⚠️";
          msg += `• ${dt} — <code>${e.tool_name}</code> (${st} ${e.duration_ms || 0}ms)\n`;
        });
        msg += `\n`;
      }

      msg += `<i>Se precisar de mais informações, estou à disposição!</i>`;

      await sendReply(msg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 0.55. COMANDO /custo — HISTÓRICO DE CUSTO & AUMENTOS DE PRODUTOS ───
    if (
      text.startsWith("/custo") ||
      respLower.includes("historico de custo") ||
      respLower.includes("aumento de custo") ||
      respLower.includes("custo dos produtos")
    ) {
      const produtoMatch = text.match(/^\/custo\s+(.+)$/i) || text.match(/custo\s+(?:de|do|da)?\s*(.+)/i);
      const produtoBusca = produtoMatch ? produtoMatch[1].trim() : null;

      let query = supabase
        .from("historico_custo_produto")
        .select("*")
        .eq("user_id", userId)
        .order("data_compra", { ascending: false })
        .limit(20);

      if (produtoBusca) {
        query = query.or(`produto_descricao.ilike.%${produtoBusca}%,produto_codigo.ilike.%${produtoBusca}%`);
      }

      const { data: historico } = await query;

      const fmt = (v: any) =>
        v != null && !isNaN(Number(v))
          ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "R$ 0,00";

      if (!historico || historico.length === 0) {
        await sendReply(
          `📊 <b>Sem histórico de custo encontrado${produtoBusca ? ` para "${produtoBusca}"` : ""}.</b>\n\n` +
          `Envie uma foto de Nota Fiscal de Compra para registrar os custos dos produtos ou tente buscar por outro termo (ex: <code>/custo coca</code>).`
        );
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      let msg = `📊 <b>Histórico de Custo de Produtos</b>${produtoBusca ? ` — <i>"${produtoBusca}"</i>` : ""}\n\n`;

      historico.forEach((h: any, i: number) => {
        const dataFmt = h.data_compra ? h.data_compra.split("-").reverse().join("/") : "Sem data";
        const variacao = Number(h.variacao_percentual) || 0;
        const emoji = variacao > 10 ? "🔴" : variacao > 0 ? "🟡" : "🟢";

        msg += `${i + 1}. ${emoji} <b>${h.produto_descricao || h.produto_codigo || "Produto"}</b>\n`;
        msg += `   📅 ${dataFmt} | 🏢 <i>${h.fornecedor || "Fornecedor"}</i>\n`;
        msg += `   💰 Custo Líquido: <b>${fmt(h.custo_unitario)}</b> | 📦 Qtd: ${h.quantidade || 0}\n`;
        if (h.variacao_percentual != null) {
          msg += `   📈 Variação: <b>${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%</b>\n`;
        }
        if (h.alerta_enviado && h.sugestao_preco_venda) {
          msg += `   💡 Sugestão preço venda: <b>${fmt(h.sugestao_preco_venda)}</b> (markup ${h.markup_aplicado || 30}%)\n`;
        }
        msg += `\n`;
      });

      await sendReply(msg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 0.6. CONSULTA DE AGENDA / EVENTOS / COMPROMISSOS (ETAPA 1) ───
    const isConsultaAgenda =
      text.startsWith("/agenda") ||
      respLower.includes("agenda") ||
      respLower.includes("evento") ||
      respLower.includes("compromisso") ||
      respLower.includes("reuniao") ||
      respLower.includes("reunião") ||
      respLower.includes("tem algo") ||
      respLower.includes("o que tenho") ||
      respLower.includes("minha agenda");

    if (isConsultaAgenda) {
      if (isGroup && grupoConfig?.ferramentas_permitidas?.length > 0 &&
          !grupoConfig.ferramentas_permitidas.includes("consultar_agenda") &&
          !grupoConfig.ferramentas_permitidas.includes("agenda")) {
        await sendReply("❌ Este grupo não tem permissão para consultar a agenda.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const hoje = new Date(hojeStr);
      let dataInicio = new Date(hoje);
      let dataFim = new Date(hoje);
      let periodoLabel = "de hoje";

      // Detectar período solicitado
      if (respLower.includes("semana que vem") || respLower.includes("proxima semana") || respLower.includes("próxima semana")) {
        const diaSemana = hoje.getDay();
        dataInicio = new Date(hoje);
        dataInicio.setDate(hoje.getDate() + (7 - diaSemana));
        dataFim = new Date(dataInicio);
        dataFim.setDate(dataInicio.getDate() + 6);
        periodoLabel = "da semana que vem";
      } else if (respLower.includes("essa semana") || respLower.includes("esta semana")) {
        const diaSemana = hoje.getDay();
        dataInicio = new Date(hoje);
        dataInicio.setDate(hoje.getDate() - diaSemana);
        dataFim = new Date(dataInicio);
        dataFim.setDate(dataInicio.getDate() + 6);
        periodoLabel = "desta semana";
      } else if (respLower.includes("esse mes") || respLower.includes("este mes") || respLower.includes("esse mês") || respLower.includes("este mês")) {
        dataInicio = new Date(anoAtual, mesAtual - 1, 1);
        const uDia = new Date(anoAtual, mesAtual, 0).getDate();
        dataFim = new Date(anoAtual, mesAtual - 1, uDia);
        periodoLabel = "deste mês";
      } else if (respLower.includes("amanha") || respLower.includes("amanhã")) {
        dataInicio = new Date(hoje);
        dataInicio.setDate(hoje.getDate() + 1);
        dataFim = new Date(dataInicio);
        periodoLabel = "de amanhã";
      } else if (respLower.includes("proximo") || respLower.includes("próximo") || respLower.includes("proximos") || respLower.includes("próximos")) {
        const matchDias = text.match(/(\d+)\s*dias?/);
        const dias = matchDias ? parseInt(matchDias[1], 10) : 7;
        dataFim = new Date(hoje);
        dataFim.setDate(hoje.getDate() + dias);
        periodoLabel = `dos próximos ${dias} dias`;
      }

      const dataInicioStr = dataInicio.toISOString().split("T")[0];
      const dataFimStr = dataFim.toISOString().split("T")[0];

      // Busca unificada em compromissos e lembretes
      const [{ data: compromissos }, { data: lembretes }] = await Promise.all([
        supabase
          .from("compromissos")
          .select("*")
          .eq("user_id", userId)
          .gte("data", dataInicioStr)
          .lte("data", dataFimStr)
          .order("data", { ascending: true }),
        supabase
          .from("lembretes")
          .select("*")
          .eq("user_id", userId)
          .gte("data", dataInicioStr)
          .lte("data", dataFimStr)
          .order("data", { ascending: true }),
      ]);

      const eventos = [
        ...(compromissos || []).map((c: any) => ({
          tipo: "Compromisso",
          titulo: c.titulo,
          data: c.data,
          hora: c.hora,
          local: c.local,
          descricao: null,
        })),
        ...(lembretes || []).map((l: any) => ({
          tipo: "Lembrete",
          titulo: l.titulo,
          data: l.data,
          hora: l.hora,
          local: null,
          descricao: l.descricao,
        })),
      ].sort((a, b) => {
        const da = `${a.data}T${a.hora || "00:00:00"}`;
        const db = `${b.data}T${b.hora || "00:00:00"}`;
        return da.localeCompare(db);
      });

      if (eventos.length === 0) {
        await sendReply(`📅 <b>Sem eventos ${periodoLabel}!</b>\n\nSua agenda está livre. 🎉`);
      } else {
        let msg = `📅 <b>Agenda & Eventos ${periodoLabel}:</b>\n\n`;
        eventos.forEach((e: any, i: number) => {
          const [ano, mes, dia] = e.data.split("-");
          const dObj = new Date(Number(ano), Number(mes) - 1, Number(dia));
          const diaSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][dObj.getDay()];
          const dataFmt = `${dia}/${mes}/${ano}`;
          const horaFmt = e.hora ? String(e.hora).slice(0, 5) : "Dia todo";

          msg += `${i + 1}. <b>${e.titulo || "Evento"}</b>\n`;
          msg += `   📆 ${diaSemana}, ${dataFmt} | 🕐 ${horaFmt}\n`;
          if (e.local) msg += `   📍 <i>Local:</i> ${e.local}\n`;
          if (e.descricao) msg += `   📝 <i>Nota:</i> ${e.descricao}\n`;
          msg += `\n`;
        });
        await sendReply(msg);
      }

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── 0.7. PREVISÃO DE CAIXA INTELIGENTE (ETAPA 2) ───
    const isConsultaPrevisaoCaixa =
      text.startsWith("/previsao") ||
      respLower.includes("previsao") ||
      respLower.includes("previsão") ||
      respLower.includes("quando acaba") ||
      respLower.includes("caixa acaba") ||
      respLower.includes("quanto tempo") ||
      respLower.includes("meu caixa") ||
      respLower.includes("quanto dura") ||
      respLower.includes("quanto sobra");

    if (isConsultaPrevisaoCaixa) {
      if (isGroup && grupoConfig?.ferramentas_permitidas?.length > 0 &&
          !grupoConfig.ferramentas_permitidas.includes("previsao_caixa") &&
          !grupoConfig.ferramentas_permitidas.includes("consultar_saldo")) {
        await sendReply("❌ Este grupo não tem permissão para consultar a previsão de caixa.");
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      const previsaoMsg = await calcularPrevisaoCaixa(supabase, userId, workspaceId);
      await sendReply(previsaoMsg);
      return new Response("OK", { status: 200, headers: corsHeaders });
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

      let contas = contasResp.data || [];
      
      // Filtro por instituição se mencionada
      const bancoMatch = respLower.match(/(?:divipay|nubank|inter|bradesco|itau|itaú|caixa|sicoob|pagbank|pagseguro|banco\s+do\s+brasil|bb)/i);
      if (bancoMatch) {
        const bTerm = bancoMatch[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const filtradas = contas.filter((c: any) => {
          const nNorm = (c.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return nNorm.includes(bTerm);
        });
        if (filtradas.length > 0) {
          contas = filtradas;
        }
      }

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
      } else {
        msg += `<i>Nenhuma conta correspondente encontrada.</i>\n\n`;
      }

      if (!bancoMatch) {
        msg += `📊 <b>Saldo Acumulado (Receitas - Despesas):</b> <b>${format(saldoFluxo)}</b>\n\n`;
      }
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

      // Busca despesas, transações do tipo despesa e categorias
      const [{ data: despesasRaw }, { data: txsDespesasRaw }, { data: categoriasRaw }] = await Promise.all([
        supabase
          .from("despesas")
          .select("id, descricao, valor, data, categoria_id, metodo_pagamento")
          .eq("user_id", userId)
          .gte("data", dataInicioD)
          .lte("data", dataFimD)
          .order("data", { ascending: false }),
        supabase
          .from("transacoes")
          .select("id, descricao, valor, data, categoria_id, metodo_pagamento")
          .eq("user_id", userId)
          .eq("tipo", "despesa")
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

      const despesas = [...(despesasRaw || []), ...(txsDespesasRaw || [])];
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

      msgDesp += `\n💡 <b>Entenda:</b>\n`;
      msgDesp += `• <b>Total de Despesas</b> = Todas as saídas operacionais e cartões\n`;
      msgDesp += `• <b>Saldo bancário</b> = Dinheiro disponível nas contas agora\n`;
      msgDesp += `• Para ver seu saldo real: <i>"Quanto tenho no banco?"</i> ou <code>/saldo</code>\n`;

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
      const resultado = totalReceitas - totalDespesas;
      const labelResultado = resultado >= 0 ? "Lucro do Período" : "Prejuízo do Período";
      const emojiResultado = resultado >= 0 ? "📈" : "📉";

      chartMsg += `💰 <b>Total de Receitas:</b> <b>${format(totalReceitas)}</b> (${todasReceitas.length} lançamentos)\n`;
      chartMsg += `💸 <b>Total de Despesas:</b> <b>${format(totalDespesas)}</b> (${todasDespesas.length} lançamentos)\n`;
      chartMsg += `${emojiResultado} <b>${labelResultado}:</b> <b>${format(resultado)}</b>\n\n`;

      chartMsg += `💡 <b>Entenda:</b>\n`;
      chartMsg += `• <b>Resultado do período</b> = Receitas − Despesas (lucro/prejuízo operacional)\n`;
      chartMsg += `• <b>Saldo bancário</b> = Dinheiro disponível nas contas agora\n`;
      chartMsg += `• Para ver seu saldo real: <i>"Quanto tenho no banco?"</i> ou <code>/saldo</code>`;

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
        `/agenda - Consulta seus eventos e compromissos\n` +
        `/previsao - Previsão de fluxo de caixa inteligente\n` +
        `/custo [produto] - Histórico de custos e alertas de aumento\n` +
        `/metricas - Métricas e telemetria da IA\n` +
        `/ensinar - Ensinar vínculo de fornecedor com categoria\n` +
        `/start - Gerar código de vínculo\n` +
        `/ajuda - Ver este menu de comandos\n\n` +
        `📸 <b>Fotos & Documentos:</b>\n` +
        `• <b>Nota Fiscal de Compra (DANFE):</b> Envie a foto para atualizar estoque e custo dos produtos automaticamente.\n` +
        `• <b>Boleto Bancário:</b> Envie a foto para cadastrar como dívida a pagar.\n` +
        `• <b>Fechamento de Caixa:</b> Envie a foto do relatório ou envelope para conferir com o Eyemobile.\n\n` +
        `🎙️ <b>Comandos por Áudio:</b>\n` +
        `• Envie mensagens de voz no privado para transcrever e executar ações automaticamente!\n\n` +
        `💬 <i>Você também pode conversar naturalmente! Exemplos:</i>\n` +
        `• <i>"Quanto vendeu hoje?"</i>\n` +
        `• <i>"Tem algum evento na agenda semana que vem?"</i>\n` +
        `• <i>"Quando acaba meu caixa?"</i>\n` +
        `• <i>"Qual o resumo do mês?"</i>`
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

        // ─── CASO B: PROPOSTA DE NF DE COMPRA (ESTOQUE & CUSTO) ───
        if (proposta.tipo === "atualizar_estoque_nf" || conversaAtiva?.estado === "aguardando_confirmacao_nf") {
          const nfId = dados?.nf_id || conversaAtiva?.proposta_id;

          const { data: nf } = await supabase
            .from("notas_fiscais_compra")
            .select("*")
            .eq("id", nfId)
            .single();

          const { data: itens } = await supabase
            .from("nf_itens")
            .select("*")
            .eq("nf_id", nfId);

          if (!nf || !itens || itens.length === 0) {
            await sendReply("❌ NF não encontrada ou sem itens para atualização.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          let msg = `✅ <b>Nota Fiscal de Compra Confirmada!</b>\n\nAtualizando estoque e custos...\n\n`;
          const alertasAumento: string[] = [];
          const sugestoesPreco: string[] = [];
          const produtosAtualizados: string[] = [];

          const fmt = (v: any) =>
            v != null && !isNaN(Number(v))
              ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "R$ 0,00";

          for (const item of itens) {
            const { data: produtoExistente } = await supabase
              .from("produtos_eyemobile")
              .select("*")
              .eq("user_id", userId)
              .eq("codigo", item.codigo_produto)
              .maybeSingle();

            let variacaoPct = 0;
            if (produtoExistente?.custo_atual && item.custo_unitario_liquido) {
              variacaoPct = ((item.custo_unitario_liquido - produtoExistente.custo_atual) / produtoExistente.custo_atual) * 100;
            }

            await supabase.from("historico_custo_produto").insert({
              user_id: userId,
              workspace_id: nf.workspace_id,
              produto_codigo: item.codigo_produto,
              produto_descricao: item.descricao,
              fornecedor: nf.fornecedor,
              custo_unitario: item.custo_unitario_liquido,
              quantidade: item.quantidade,
              nf_id: nf.id,
              data_compra: nf.data_entrada || hojeStr,
              variacao_percentual: variacaoPct,
            });

            const dataLimite = new Date();
            dataLimite.setMonth(dataLimite.getMonth() - 12);

            const { data: historico12m } = await supabase
              .from("historico_custo_produto")
              .select("custo_unitario, data_compra")
              .eq("user_id", userId)
              .eq("produto_codigo", item.codigo_produto)
              .gte("data_compra", dataLimite.toISOString().split("T")[0])
              .order("data_compra", { ascending: true })
              .limit(1);

            const custoInicial12m = historico12m?.[0]?.custo_unitario || produtoExistente?.custo_atual || item.custo_unitario_liquido;
            const variacao12m = custoInicial12m > 0
              ? ((item.custo_unitario_liquido - custoInicial12m) / custoInicial12m) * 100
              : 0;

            // Usar margem real do produto ((preco_venda / custo_atual) - 1) * 100
            let margemReal = Number(produtoExistente?.margem_real_percentual) || 0;
            if (margemReal <= 0 && produtoExistente?.preco_venda && produtoExistente?.custo_atual) {
              margemReal = ((Number(produtoExistente.preco_venda) / Number(produtoExistente.custo_atual)) - 1) * 100;
            }
            if (margemReal <= 0 || margemReal > 500) margemReal = 30; // Proteção e fallback

            let markupAplicado = margemReal;

            if (variacao12m > 10) {
              const sugestaoPreco = item.custo_unitario_liquido * (1 + margemReal / 100);

              const { data: alertaCriado } = await supabase.from("alertas_preco_pendentes").insert({
                user_id: userId,
                workspace_id: nf.workspace_id,
                produto_eyemobile_id: produtoExistente?.eyemobile_id || item.codigo_produto,
                produto_codigo: item.codigo_produto,
                produto_descricao: item.descricao,
                custo_anterior: custoInicial12m,
                custo_novo: item.custo_unitario_liquido,
                preco_venda_atual: produtoExistente?.preco_venda || 0,
                preco_sugerido: sugestaoPreco,
                margem_real_percentual: margemReal,
                variacao_custo_percentual: variacao12m,
                nf_id: nf.id,
                status: "pendente",
              }).select("id").single();

              const idCurto = alertaCriado?.id ? alertaCriado.id.slice(0, 8) : "N/A";

              alertasAumento.push(
                `🔴 <b>${item.descricao}</b> (Alerta <code>#${idCurto}</code>)\n` +
                `   Custo 12m atrás: ${fmt(custoInicial12m)}\n` +
                `   Custo novo: <b>${fmt(item.custo_unitario_liquido)}</b>\n` +
                `   📈 Aumento: <b>+${variacao12m.toFixed(1)}%</b> em 12 meses\n` +
                `   💰 Preço venda atual: ${fmt(produtoExistente?.preco_venda)}\n` +
                `   💡 PREÇO SUGERIDO: <b>${fmt(sugestaoPreco)}</b> (margem ${margemReal.toFixed(0)}%)`
              );

              await supabase.from("historico_custo_produto")
                .update({ alerta_enviado: true, sugestao_preco_venda: sugestaoPreco, markup_aplicado: margemReal })
                .eq("nf_id", nf.id)
                .eq("produto_codigo", item.codigo_produto);
            } else if (variacao12m > 0) {
              alertasAumento.push(
                `🟡 <b>${item.descricao}</b>\n` +
                `   Custo 12m atrás: ${fmt(custoInicial12m)}\n` +
                `   Custo novo: ${fmt(item.custo_unitario_liquido)}\n` +
                `   📈 Aumento: +${variacao12m.toFixed(1)}% em 12 meses (dentro da margem)`
              );
            }

            if (produtoExistente) {
              await supabase.from("produtos_eyemobile").update({
                custo_atual: item.custo_unitario_liquido,
                estoque_atual: (Number(produtoExistente.estoque_atual) || 0) + (Number(item.quantidade) || 0),
                ultima_atualizacao_custo: new Date().toISOString(),
                alerta_aumento_10pct: variacao12m > 10,
              }).eq("id", produtoExistente.id);
            } else {
              await supabase.from("produtos_eyemobile").insert({
                user_id: userId,
                workspace_id: nf.workspace_id,
                codigo: item.codigo_produto,
                descricao: item.descricao,
                custo_atual: item.custo_unitario_liquido,
                estoque_atual: Number(item.quantidade) || 0,
                ultima_atualizacao_custo: new Date().toISOString(),
              });
            }

            await supabase.from("nf_itens").update({
              status_estoque: "atualizado",
              produto_eyemobile_id: produtoExistente?.eyemobile_id || item.codigo_produto,
            }).eq("id", item.id);

            produtosAtualizados.push(item.descricao);
          }

          await supabase.from("notas_fiscais_compra").update({ status: "custo_atualizado" }).eq("id", nfId);
          await supabase.from("telegram_propostas").update({ status: "confirmada", executed_at: new Date().toISOString() }).eq("id", proposta.id);

          msg += `<b>📦 Estoque atualizado:</b> ${produtosAtualizados.length} produtos\n`;
          msg += `<b>💰 Custos atualizados:</b> ${produtosAtualizados.length} produtos\n\n`;

          if (alertasAumento.length > 0) {
            msg += `📊 <b>RESUMO DE VARIAÇÕES DE CUSTO:</b>\n\n`;
            alertasAumento.forEach(a => msg += a + "\n\n");
          }

          const { data: alertasPendentes } = await supabase
            .from("alertas_preco_pendentes")
            .select("*")
            .eq("nf_id", nfId)
            .eq("status", "pendente");

          if (alertasPendentes && alertasPendentes.length > 0) {
            msg += `\n🚨 <b>PREÇOS DE VENDA PRECISAM SER AJUSTADOS:</b>\n\n`;
            alertasPendentes.forEach((alerta: any, idx: number) => {
              const idCurto = alerta.id.slice(0, 8);
              msg += `${idx + 1}. <b>${alerta.produto_descricao}</b>\n`;
              msg += `   💰 Preço atual: ${fmt(alerta.preco_venda_atual)}\n`;
              msg += `   💡 Sugerido: <b>${fmt(alerta.preco_sugerido)}</b>\n`;
              msg += `   ✅ Para confirmar: <code>CONFIRMAR ${idCurto}</code>\n`;
              msg += `   ✏️ Para editar: <code>EDITAR ${idCurto} 15.00</code>\n`;
              msg += `   🚫 Para ignorar: <code>IGNORAR ${idCurto}</code>\n\n`;
            });

            msg += `<i>💡 Ao responder CONFIRMAR, o preço sobe automaticamente para o Eyemobile PDV.</i>\n`;
            msg += `<i>Alertas não resolvidos serão lembrados 1x por semana.</i>`;

            await supabase.from("telegram_conversas").upsert(
              {
                user_id: userId,
                chat_id: chatId,
                estado: "aguardando_ajuste_precos",
                proposta_id: nfId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "chat_id" }
            );
          } else {
            msg += `✅ <b>Nenhum aumento crítico de custo detectado (>10%).</b>\n`;
            msg += `💡 Preços de venda estão dentro da margem esperada.`;

            await supabase.from("telegram_conversas").upsert(
              {
                user_id: userId,
                chat_id: chatId,
                estado: "inicio",
                proposta_id: null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "chat_id" }
            );
          }

          await sendReply(msg);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

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

        // IMPORTANTE: fotos enviadas como "foto" (hasPhoto) são comprimidas pelo Telegram para ~1280px.
        // Arquivos enviados como "documento" (hasDoc) mantêm a qualidade original.
        // Isso impacta diretamente a legibilidade de DANFEs com muitas linhas de texto pequeno.
        const isTelegramCompressedPhoto = hasPhoto && !hasDoc;

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

        // ─── VARIÁVEIS DE DOCUMENTO ───
        let finalImageBase64Uri = "";
        let documentData: any = null;

        // ============================================
        // FLUXO XML: Parser Nativo Determinístico de NF-e
        // ============================================
        if (ext === "xml" || docMime.includes("xml") || docMime.includes("text/xml")) {
          console.log("[telegram-webhook] Arquivo XML recebido, iniciando parse nativo de NF-e...");
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" }),
          }).catch(() => {});

          const xmlDownloadResp = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${filePath}`);
          if (!xmlDownloadResp.ok) {
            await sendReply("❌ Não foi possível baixar o arquivo XML. Tente enviar novamente.");
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
          const xmlText = await xmlDownloadResp.text();
          const parsedNFe = parseNFeXml(xmlText);

          if (parsedNFe && parsedNFe.itens && parsedNFe.itens.length > 0) {
            console.log(`[telegram-webhook] XML de NF-e processado com sucesso! ${parsedNFe.itens.length} itens extraídos.`);
            documentData = parsedNFe;
          } else {
            await sendReply(
              "⚠️ <b>Arquivo XML recebido, mas não foi identificado como NF-e padrão.</b>\n\n" +
              "Certifique-se de que o arquivo é o XML oficial da Nota Fiscal Eletrônica (com tags &lt;nfeProc&gt; ou &lt;NFe&gt;)."
            );
            return new Response("OK", { status: 200, headers: corsHeaders });
          }
        }

        // ============================================
        // FLUXO PDF: OpenAI Assistants API Nativo (Code Interpreter + File Search)
        // ============================================
        if (!documentData && (ext === "pdf" || docMime.includes("pdf"))) {
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

          // Log das dimensões da imagem (sem re-encoding ou rotação)
          // A detecção de rotação foi REMOVIDA porque:
          // 1. Causava dupla compressão JPEG (perda de qualidade)
          // 2. As miniaturas de 160px eram insuficientes para detectar ângulo correto
          // 3. O prompt OCR já instrui o GPT-4o a ler em qualquer orientação
          // 4. O ChatGPT lê a mesma foto sem qualquer pré-rotação
          try {
            const decodedImage = await Image.decode(new Uint8Array(arrayBuffer));
            console.log(`[telegram-webhook] Dimensões da imagem: ${decodedImage.width}x${decodedImage.height}. Enviando diretamente ao OCR sem rotação.`);
          } catch (imgErr: any) {
            console.log("[telegram-webhook] Não foi possível decodificar dimensões:", imgErr.message);
          }
        }

        // ================================================================
        // FECHAMENTO DE CAIXA (grupo fechamento ou foto de envelope)
        // CONFERÊNCIA vs SISTEMA EYEMOBILE + SOBRA AUTOMÁTICA
        // ================================================================
        const isFechamentoContext =
          (isGroup && (grupoConfig?.tipo_grupo === "fechamento" || grupoConfig?.acoes_permitidas?.includes("extrair_fechamento"))) ||
          caption.toLowerCase().includes("fechamento") ||
          caption.toLowerCase().includes("envelope") ||
          caption.toLowerCase().includes("caixa");

        if (isFechamentoContext) {
          console.log("[telegram-webhook] Iniciando extração e conferência de Fechamento de Caixa Rodo Point...");

          // 1. Busca vendas do sistema para o dia de hoje (ou data informada)
          let qVendasHoje = supabase
            .from("transacoes")
            .select("valor, metodo_pagamento")
            .eq("tipo", "receita")
            .eq("data", hojeStr);

          if (workspaceId) qVendasHoje = qVendasHoje.eq("workspace_id", workspaceId);
          else qVendasHoje = qVendasHoje.eq("user_id", userId);

          const { data: txsHoje } = await qVendasHoje;

          const eyemobilePorMetodo: Record<string, number> = {
            dinheiro: 0,
            debito: 0,
            credito: 0,
            pix: 0,
            voucher: 0,
          };
          let totalEyemobile = 0;

          for (const tx of txsHoje || []) {
            const val = Number(tx.valor) || 0;
            const m = (tx.metodo_pagamento || "").toLowerCase();
            totalEyemobile += val;
            if (m.includes("dinheiro")) eyemobilePorMetodo.dinheiro += val;
            else if (m.includes("deb") || m.includes("debito")) eyemobilePorMetodo.debito += val;
            else if (m.includes("cred") || m.includes("credito")) eyemobilePorMetodo.credito += val;
            else if (m.includes("pix")) eyemobilePorMetodo.pix += val;
            else if (m.includes("voucher") || m.includes("alimentacao") || m.includes("refeicao")) eyemobilePorMetodo.voucher += val;
          }

          const promptConferencia = `Você é um conferente especialista de fechamento de caixa e envelopes da Rodo Point.

Analise esta imagem (envelope de fechamento, relatório de caixa, comprovante de maquininha ou resumo) e extraia os valores por forma de pagamento:
- Dinheiro
- Cartão Débito
- Cartão Crédito
- Pix
- Voucher (somente se indicar VA, VR, Alimentação ou Refeição)
- Sobra (se houver valor anotado como sobra de caixa)

REGRAS DE CONFERÊNCIA:
1. QR Code / Pix na maquininha = PIX
2. Comprovante de Débito = DÉBITO
3. Comprovante de Crédito = CRÉDITO
4. SOMENTE classifique como VOUCHER se indicar explicitamente VA/VR/Ticket/Alelo/Sodexo
5. Nunca invente valores numéricos
6. Se houver Caixa 1 e Caixa 2 discriminados, separe nos campos correspondentes e faça a soma no campo "total".
7. Se houver apenas um total geral ou um caixa, preencha no campo "total".

Responda ESTRITAMENTE em formato JSON (sem markdown):
{
  "tipo": "fechamento",
  "data": "DD/MM/AAAA",
  "caixa1": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "voucher": 0 },
  "caixa2": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "voucher": 0 },
  "total": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "voucher": 0 },
  "sobra": 0,
  "observacao": ""
}`;

          const aiResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o",
              user_id: userId,
              temperature: 0.0,
              messages: [
                { role: "system", content: promptConferencia },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Dados de vendas no sistema Eyemobile hoje: Dinheiro=R$ ${eyemobilePorMetodo.dinheiro.toFixed(2)}, Débito=R$ ${eyemobilePorMetodo.debito.toFixed(2)}, Crédito=R$ ${eyemobilePorMetodo.credito.toFixed(2)}, Pix=R$ ${eyemobilePorMetodo.pix.toFixed(2)}. Extraia e confira este fechamento.`,
                    },
                    { type: "image_url", image_url: { url: finalImageBase64Uri, detail: "high" } },
                  ],
                },
              ],
            }),
          });

          if (aiResp.ok) {
            const aiJson = await aiResp.json();
            const rawContent = aiJson.choices?.[0]?.message?.content || "";
            console.log("[telegram-webhook] Resposta bruta conferência fechamento:", rawContent.slice(0, 300));

            let fechamento: any = null;
            try {
              fechamento = JSON.parse(rawContent.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
            } catch {
              const match = rawContent.match(/\{[\s\S]*\}/);
              if (match) {
                try { fechamento = JSON.parse(match[0]); } catch {}
              }
            }

            if (fechamento && fechamento.tipo === "fechamento") {
              const fmt = (v: any) =>
                v != null && Number(v) > 0
                  ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "R$ 0,00";

              const env = fechamento.total || fechamento.envelope || {};
              const envDinheiro = Number(env.dinheiro) || 0;
              const envDebito = Number(env.debito) || 0;
              const envCredito = Number(env.credito) || 0;
              const envPix = Number(env.pix) || 0;
              const envVoucher = Number(env.voucher) || 0;
              const totalEnvelope = envDinheiro + envDebito + envCredito + envPix + envVoucher;

              // Comparar se há divergências com o sistema (apenas se houver vendas registradas no sistema)
              const diferencas: string[] = [];
              if (totalEyemobile > 0) {
                const compara = (label: string, envVal: number, sysVal: number) => {
                  const diff = envVal - sysVal;
                  if (Math.abs(diff) > 0.5) {
                    diferencas.push(
                      `• <b>${label}:</b> Envelope ${fmt(envVal)} vs Sistema ${fmt(sysVal)} (diferença: ${diff > 0 ? "+" : ""}${fmt(diff)})`
                    );
                  }
                };

                compara("Dinheiro", envDinheiro, eyemobilePorMetodo.dinheiro);
                compara("Débito", envDebito, eyemobilePorMetodo.debito);
                compara("Crédito", envCredito, eyemobilePorMetodo.credito);
                compara("Pix", envPix, eyemobilePorMetodo.pix);
              }

              let msg = "";

              if (diferencas.length > 0) {
                // DIVERGÊNCIA IDENTIFICADA
                msg = `⚠️ <b>DIVERGÊNCIA NO FECHAMENTO!</b>\n\n`;
                msg += `📅 <b>Data:</b> ${fechamento.data || hojeStr.split("-").reverse().join("/")}\n\n`;
                msg += `<b>📄 Envelope Físico:</b>\n`;
                msg += `💰 Dinheiro: ${fmt(envDinheiro)}\n`;
                msg += `💳 Cartão Débito: ${fmt(envDebito)}\n`;
                msg += `💳 Cartão Crédito: ${fmt(envCredito)}\n`;
                msg += `📲 Pix: ${fmt(envPix)}\n`;
                if (envVoucher > 0) msg += `🎫 Voucher: ${fmt(envVoucher)}\n`;
                msg += `\n`;
                msg += `<b>💻 Sistema (Eyemobile):</b>\n`;
                msg += `💰 Dinheiro: ${fmt(eyemobilePorMetodo.dinheiro)}\n`;
                msg += `💳 Cartão Débito: ${fmt(eyemobilePorMetodo.debito)}\n`;
                msg += `💳 Cartão Crédito: ${fmt(eyemobilePorMetodo.credito)}\n`;
                msg += `📲 Pix: ${fmt(eyemobilePorMetodo.pix)}\n`;
                msg += `\n`;
                msg += `❌ <b>Diferenças Encontradas:</b>\n`;
                diferencas.forEach((d) => (msg += `${d}\n`));
                msg += `\n💡 <i>Verifique os comprovantes do caixa e envie novamente se necessário.</i>`;

                await supabase.from("fechamentos_caixa").insert({
                  user_id: userId,
                  workspace_id: workspaceId,
                  chat_id: Number(chatId) || null,
                  data_fechamento: fechamento.data || hojeStr.split("-").reverse().join("/"),
                  eyemobile_total: eyemobilePorMetodo,
                  envelope_total: env,
                  caixa1: fechamento.caixa1 || {},
                  caixa2: fechamento.caixa2 || {},
                  total: env,
                  status: "divergencia",
                  observacao: diferencas.join("; "),
                });
              } else {
                // FECHAMENTO OK — BATEU COM SUCESSO!
                msg = `✅ <b>Fechamento OK — Confirmado!</b>\n\n`;
                msg += `📅 <b>Data:</b> ${fechamento.data || hojeStr.split("-").reverse().join("/")}\n\n`;

                const temCaixa1 = fechamento.caixa1 && Object.values(fechamento.caixa1).some((v: any) => Number(v) > 0);
                const temCaixa2 = fechamento.caixa2 && Object.values(fechamento.caixa2).some((v: any) => Number(v) > 0);

                if (temCaixa1 || temCaixa2) {
                  if (temCaixa1) {
                    msg += `<b>Caixa 1:</b>\n  💰 ${fmt(fechamento.caixa1?.dinheiro)} | 💳 Déb: ${fmt(fechamento.caixa1?.debito)} | 💳 Créd: ${fmt(fechamento.caixa1?.credito)} | 📲 Pix: ${fmt(fechamento.caixa1?.pix)}\n\n`;
                  }
                  if (temCaixa2) {
                    msg += `<b>Caixa 2:</b>\n  💰 ${fmt(fechamento.caixa2?.dinheiro)} | 💳 Déb: ${fmt(fechamento.caixa2?.debito)} | 💳 Créd: ${fmt(fechamento.caixa2?.credito)} | 📲 Pix: ${fmt(fechamento.caixa2?.pix)}\n\n`;
                  }
                }

                msg += `<b>🔸 Valores Conferidos:</b>\n`;
                msg += `💰 Dinheiro: ${fmt(envDinheiro)} ✅\n`;
                msg += `💳 Cartão Débito: ${fmt(envDebito)} ✅\n`;
                msg += `💳 Cartão Crédito: ${fmt(envCredito)} ✅\n`;
                msg += `📲 Pix: ${fmt(envPix)} ✅\n`;
                if (envVoucher > 0) msg += `🎫 Voucher: ${fmt(envVoucher)} ✅\n`;
                msg += `\n`;
                if (totalEyemobile > 0) {
                  msg += `📊 Total Sistema (PDV): <b>${fmt(totalEyemobile)}</b>\n`;
                }
                msg += `📊 Total Envelope: <b>${fmt(totalEnvelope)}</b>\n`;
                msg += `✅ <i>Sem divergências operacionais!</i>\n`;

                // LANÇAMENTO AUTOMÁTICO DE SOBRA (se detectada no envelope)
                const sobraValor = Number(fechamento.sobra) || 0;
                if (sobraValor > 0) {
                  msg += `\n💵 <b>Sobra detectada:</b> <b>${fmt(sobraValor)}</b>\n`;

                  const { data: rpcResult, error: errSobra } = await supabase.rpc("adicionar_saldo_conta", {
                    p_user_id: userId,
                    p_workspace_id: workspaceId,
                    p_conta_nome: "Caixa",
                    p_valor: sobraValor,
                    p_descricao: `Sobra fechamento caixa - ${fechamento.data || hojeStr}`,
                    p_categoria_nome: "Sobra de Caixa",
                  });

                  if (rpcResult?.success && !errSobra) {
                    msg += `✅ <b>Sobra lançada automaticamente!</b>\n`;
                    msg += `📥 Conta: Caixa / Dinheiro\n`;
                    msg += `💵 Valor: <b>${fmt(sobraValor)}</b>\n`;
                    msg += `🏷️ Categoria: <b>Sobra de Caixa</b>\n`;
                    if (rpcResult.novo_saldo != null) {
                      msg += `💰 Novo saldo em caixa: <b>${fmt(rpcResult.novo_saldo)}</b>\n`;
                    }
                    msg += `\n💡 <i>Seu saldo físico e o DRE já foram atualizados no Wallet App.</i>`;
                  }
                } else {
                  msg += `\n<i>Para lançar sobra de caixa extra, envie no chat:</i>\n<code>Sobra: R$ 50,00</code>`;
                }

                await supabase.from("fechamentos_caixa").insert({
                  user_id: userId,
                  workspace_id: workspaceId,
                  chat_id: Number(chatId) || null,
                  data_fechamento: fechamento.data || hojeStr.split("-").reverse().join("/"),
                  eyemobile_total: eyemobilePorMetodo,
                  envelope_total: env,
                  caixa1: fechamento.caixa1 || {},
                  caixa2: fechamento.caixa2 || {},
                  total: env,
                  sobra: sobraValor > 0 ? sobraValor : null,
                  status: "confirmado",
                });
              }

              await sendReply(msg);
              return new Response("OK", { status: 200, headers: corsHeaders });
            }
          }
        }

        // ================================================================
        // EXTRATOR UNIFICADO DE DOCUMENTOS (DANFE / NF COMPRA / BOLETO)
        // Suporta imagens em qualquer orientação (vertical, horizontal 90°/270°, inclinadas)
        // ================================================================
        if (!documentData && finalImageBase64Uri) {
          const docAnalysisSystemPrompt = `Você é um scanner OCR especialista em documentos fiscais e boletos bancários brasileiros.
Extraia com 100% de fidelidade APENAS o que está visível no documento. NUNCA invente dados nem resuma produtos.

TIPO DE DOCUMENTO:
- DANFE / Nota Fiscal de Compra -> tipo: "nf_compra"
- Boleto Bancário -> tipo: "boleto"
- Outro documento -> tipo: "outro"

INSTRUÇÕES PARA DANFE (tipo: "nf_compra"):
1. CABEÇALHO:
   - numero_nf: número da NF (ex: "013.754.779" ou "13754779")
   - serie_nf: série da NF (ex: "26")
   - data_emissao: data no formato YYYY-MM-DD
   - data_entrada: data no formato YYYY-MM-DD
   - fornecedor: Razão Social do emitente (ex: "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A")
   - cnpj_fornecedor: CNPJ do emitente formatado
   - chave_acesso: 44 dígitos numéricos da chave de acesso (se visível no topo ou código de barras)

2. TOTAIS DA NOTA:
   - valor_total_nf: Valor Total da NF (campo "VALOR TOTAL DA NOTA")
   - valor_produtos: Valor Total dos Produtos (campo "VALOR TOTAL DOS PRODUTOS")
   - valor_icms: Valor do ICMS
   - valor_icms_st: Valor do ICMS Substituição Tributária
   - valor_ipi: Valor do IPI
   - valor_frete: Valor do Frete

3. TABELA DE PRODUTOS (DADOS DO PRODUTO / SERVIÇO):
   - Extraia TODAS as linhas da tabela de produtos sem pular nenhuma linha.
   - codigo: código interno do item (coluna CÓDIGO DO PRODUTO/SERVIÇO)
   - descricao: descrição completa do produto impressa na nota (marca, nome, volume, sabor, embalagem)
   - ncm: NCM (8 dígitos se visível)
   - cfop: CFOP (4 dígitos se visível)
   - unidade: unidade de medida (CX, UN, FD, LT, KG, etc.)
   - quantidade: quantidade faturada (número decimal)
   - valor_unitario: valor unitário do item (número decimal)
   - valor_total: valor total do item (número decimal)
   - icms_aliquota: % alíquota ICMS (número)
   - ipi_aliquota: % alíquota IPI (número)
   - custo_unitario_liquido: valor_unitario - (valor_unitario * icms_aliquota/100) - (valor_unitario * ipi_aliquota/100)

INSTRUÇÕES PARA BOLETO (tipo: "boleto"):
- beneficiario: Razão Social do beneficiário/cedente
- valor: Valor do documento (número decimal)
- data_vencimento: Data de vencimento no formato YYYY-MM-DD
- linha_digitavel: 47 dígitos numéricos da linha digitável

Retorne APENAS JSON válido no seguinte formato:
{
  "tipo": "nf_compra",
  "confianca_geral": "alta",
  "cabecalho": {
    "numero_nf": "013754779",
    "serie_nf": "26",
    "data_emissao": "2026-08-07",
    "data_entrada": "2026-08-07",
    "fornecedor": "SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A",
    "cnpj_fornecedor": "61.186.888/0020-56",
    "chave_acesso": "31260861186888002056550260137547791096161890"
  },
  "valores_totais": {
    "valor_total_nf": 1262.55,
    "valor_produtos": 1093.39,
    "valor_icms": 127.86,
    "valor_icms_st": 196.82,
    "valor_ipi": 0.00,
    "valor_frete": 0.00
  },
  "itens": [
    {
      "codigo": "55380",
      "descricao": "AGUA TONICA LT 350ML",
      "ncm": "22021000",
      "cfop": "5405",
      "unidade": "CX",
      "quantidade": 1.0,
      "valor_unitario": 28.56,
      "valor_total": 28.56,
      "icms_aliquota": 0.0,
      "ipi_aliquota": 0.0,
      "custo_unitario_liquido": 28.56
    }
  ],
  "beneficiario": null,
  "valor": null,
  "data_vencimento": null,
  "linha_digitavel": null
}`;

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
                    {
                      type: "text",
                      text: promptText ||
                        "Analise esta imagem e extraia todos os dados fiscais ou bancários visíveis com máxima fidelidade. " +
                        "Se for DANFE, leia linha por linha da tabela de produtos sem pular nenhuma linha e sem agrupar itens. " +
                        "Se a imagem estiver deitada ou inclinada, leia na orientação adequada. Retorne APENAS o JSON."
                    },
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
          console.log("[telegram-webhook] Análise retornada pela IA:", docAnalysisText.slice(0, 400));

          try {
            const cleaned = docAnalysisText.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
            documentData = JSON.parse(cleaned);
          } catch {
            const jsonTagMatch = docAnalysisText.match(/<document_analysis>([\s\S]*?)<\/document_analysis>/);
            if (jsonTagMatch) {
              try { documentData = JSON.parse(jsonTagMatch[1].trim()); } catch {}
            }
            if (!documentData) {
              const objMatch = docAnalysisText.match(/\{[\s\S]*\}/);
              if (objMatch) {
                try { documentData = JSON.parse(objMatch[0]); } catch {}
              }
            }
          }

          // ================================================================
          // SEGUNDA PASSAGEM OPCIONAL (ZOOM): Se a NF tem alto valor mas poucos itens foram lidos
          // ================================================================
          if (documentData && documentData.tipo === "nf_compra") {
            const itensIniciais = documentData.itens || [];
            const valorTotalNFPass2 = Number(documentData.valores_totais?.valor_total_nf || 0);
            const somaItensIniciais = itensIniciais.reduce((sum: number, it: any) => sum + (Number(it.valor_total) || 0), 0);

            if (itensIniciais.length < 4 && valorTotalNFPass2 > 300 && somaItensIniciais < valorTotalNFPass2 * 0.6) {
              console.log(`[telegram-webhook] Segunda passagem: focando na tabela de produtos (${itensIniciais.length} itens lidos inicialmente para NF de R$ ${valorTotalNFPass2})...`);

              const promptZoom = `Você está vendo uma NOTA FISCAL DANFE brasileira. Foque EXCLUSIVAMENTE na tabela "DADOS DO PRODUTO / SERVIÇO" (a maior tabela de itens do documento).
Esta tabela tem VÁRIAS LINHAS de produtos. Leia CADA LINHA individualmente e extraia todos os produtos visíveis.
Retorne APENAS um array JSON de itens no formato:
[
  {
    "codigo": "...",
    "descricao": "...",
    "ncm": "...",
    "cfop": "...",
    "unidade": "CX",
    "quantidade": 1.0,
    "valor_unitario": 0.00,
    "valor_total": 0.00,
    "icms_aliquota": 0.00,
    "ipi_aliquota": 0.00,
    "custo_unitario_liquido": 0.00
  }
]`;

              try {
                const aiZoomResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-4o",
                    user_id: userId,
                    temperature: 0.0,
                    messages: [
                      { role: "system", content: promptZoom },
                      {
                        role: "user",
                        content: [
                          { type: "text", text: "Extraia todas as linhas individuais desta tabela de produtos da DANFE sem resumir nem agrupar:" },
                          { type: "image_url", image_url: { url: finalImageBase64Uri, detail: "high" } },
                        ],
                      },
                    ],
                  }),
                });

                if (aiZoomResp.ok) {
                  const aiZoomJson = await aiZoomResp.json();
                  const rawZoom = aiZoomJson.choices?.[0]?.message?.content || "";
                  let itensZoom: any[] = [];
                  try {
                    itensZoom = JSON.parse(rawZoom.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
                  } catch {
                    const matchZ = rawZoom.match(/\[[\s\S]*\]/);
                    if (matchZ) {
                      try { itensZoom = JSON.parse(matchZ[0]); } catch {}
                    }
                  }

                  if (Array.isArray(itensZoom) && itensZoom.length > itensIniciais.length) {
                    console.log(`[telegram-webhook] Segunda passagem melhorou: ${itensIniciais.length} -> ${itensZoom.length} itens extraídos!`);
                    documentData.itens = itensZoom;
                  }
                }
              } catch (zoomErr: any) {
                console.warn("[telegram-webhook] Erro na segunda passagem zoom:", zoomErr.message);
              }
            }
          }
        }

        // ================================================================
        // 1. FLUXO NOTA FISCAL DE COMPRA (DANFE)
        // ================================================================
        if (documentData && (documentData.tipo === "nf_compra" || (documentData.itens && documentData.itens.length > 0))) {
          console.log("[telegram-webhook] >>> NOTA FISCAL DE COMPRA IDENTIFICADA <<< Itens:", documentData.itens?.length);

          const { data: wsData } = await supabase
            .from("workspaces")
            .select("id")
            .eq("user_id", userId)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle();

          const wsId = wsData?.id || workspaceId || null;

          const fmt = (v: any) =>
            v != null && !isNaN(Number(v))
              ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "R$ 0,00";

          // ─── VALIDAÇÃO DE SANIDADE: Rejeitar apenas leituras comprovadamente absurdas ───
          const itensExtraidos = documentData.itens || [];
          const valorTotalNF = Number(documentData.valores_totais?.valor_total_nf || 0);
          const valorProdutosNF = Number(documentData.valores_totais?.valor_produtos || 0);

          // REGRA 1: Valor total razoável (R$ 1 a R$ 200.000)
          const valorAbsurdo = valorTotalNF < 1 || valorTotalNF > 200000;

          // REGRA 2 & 3: Coerência de Fornecedor x Marca de Produto
          const fornecedorLido = documentData.cabecalho?.fornecedor || "";
          const ehSpalVal = fornecedorLido.toLowerCase().includes("spal") || fornecedorLido.toLowerCase().includes("coca");
          const ehAmbevVal = fornecedorLido.toLowerCase().includes("ambev") || fornecedorLido.toLowerCase().includes("brasnor") || fornecedorLido.toLowerCase().includes("brahma");

          const descricoesVal = itensExtraidos.map((i: any) => (i.descricao || "").toLowerCase());
          const marcasSpal = [
            "monster", "eisenbahn", "guarana", "coca", "schweppes", "del valle",
            "kuat", "tonica", "crystal", "burn", "matte", "leao", "heineken",
            "amstel", "tiger", "bavaria", "kaiser", "sol", "fresh", "kapo"
          ];
          const marcasAmbev = [
            "brahma", "skol", "antarctica", "original", "stella", "bohemia",
            "budweiser", "corona", "spaten", "beck", "colorado", "patagonia",
            "fusion", "gatorade", "pepsi", "sukita", "h2oh"
          ];

          const temProdutoSpalVal = descricoesVal.some((d: string) => marcasSpal.some(m => d.includes(m)));
          const temProdutoAmbevVal = descricoesVal.some((d: string) => marcasAmbev.some(m => d.includes(m)));

          const incoerenteFornecedor = (ehSpalVal && temProdutoAmbevVal && !temProdutoSpalVal) || (ehAmbevVal && temProdutoSpalVal && !temProdutoAmbevVal);

          // REGRA 4: Valores unitários razoáveis (R$ 0,10 a R$ 10.000)
          const valoresUnitariosAbsurdos = itensExtraidos.some((i: any) => {
            const vu = Number(i.valor_unitario);
            return vu > 10000 || (vu < 0.10 && vu > 0);
          });

          // REGRA 5: Soma dos itens vs total da NF
          // Em notas de bebidas (SPAL/Ambev), o ICMS-ST e IPI podem representar 15% a 30% do total da NF acima dos produtos.
          const valorTotalItens = itensExtraidos.reduce((sum: number, item: any) => sum + (Number(item.valor_total) || 0), 0);
          const baseComparacao = valorProdutosNF > 0 ? valorProdutosNF : valorTotalNF;
          const diferencaValor = Math.abs(valorTotalItens - baseComparacao);
          const percentualDiferenca = baseComparacao > 0 ? (diferencaValor / baseComparacao) * 100 : 0;
          const limiteDiff = valorProdutosNF > 0 ? 25 : 35;
          const somaIncoerente = percentualDiferenca > limiteDiff && itensExtraidos.length > 1;

          // SE QUALQUER REGRA DE SANIDADE FALHAR → REJEITAR E OFERECER CHAVE DE ACESSO OU SEFAZ
          if (valorAbsurdo || incoerenteFornecedor || valoresUnitariosAbsurdos || somaIncoerente || itensExtraidos.length === 0) {
            console.error("[NF] SANIDADE FALHOU:", {
              valorAbsurdo,
              incoerenteFornecedor,
              valoresUnitariosAbsurdos,
              somaIncoerente,
              itensCount: itensExtraidos.length,
              fornecedor: fornecedorLido,
              valorTotal: valorTotalNF,
              valorTotalItens,
            });

            // Tentar extrair CHAVE DE ACESSO (44 dígitos)
            const rawChave = (documentData.cabecalho?.chave_acesso || "").replace(/\D/g, "");
            if (rawChave && rawChave.length === 44) {
              const botoesSefaz = [
                [{ text: "🔍 CONSULTAR NO SEFAZ", callback_data: `sefaz_consultar:${rawChave}` }],
              ];

              await sendReplyWithButtons(
                chatId,
                `⚠️ <b>Leitura automática falhou</b>, mas encontrei a chave de acesso!\n\n` +
                `📋 Chave: <code>${rawChave}</code>\n\n` +
                `💡 Posso indicar a consulta dos dados oficiais no SEFAZ.\n` +
                `Clique no botão abaixo ou responda <b>SEFAZ</b> para consultar.`,
                botoesSefaz
              );

              await supabase.from("telegram_conversas").upsert(
                {
                  user_id: userId,
                  chat_id: Number(chatId),
                  estado: "aguardando_consulta_sefaz",
                  proposta_id: null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "chat_id" }
              );

              return new Response("OK", { status: 200, headers: corsHeaders });
            }

            let msgSanidade = `⚠️ <b>Não consegui ler a nota corretamente.</b>\n\n`;
            msgSanidade += `🔍 Problemas detectados:\n`;
            if (valorAbsurdo) msgSanidade += `• Valor total da nota lido parece incorreto\n`;
            if (incoerenteFornecedor) msgSanidade += `• Fornecedor (${fornecedorLido}) e produtos não batem\n`;
            if (valoresUnitariosAbsurdos) msgSanidade += `• Valores unitários parecem incorretos\n`;
            if (somaIncoerente) msgSanidade += `• Soma dos itens (${fmt(valorTotalItens)}) difere do total (${fmt(valorTotalNF)})\n`;
            if (itensExtraidos.length === 0) msgSanidade += `• Nenhum item encontrado na tabela\n`;

            // Se foi enviado como foto comprimida pelo Telegram → qualidade limitada
            if (isTelegramCompressedPhoto) {
              msgSanidade += `\n📂 <b>Solução principal — envie como ARQUIVO:</b>\n`;
              msgSanidade += `O Telegram comprime fotos e reduz a resolução, dificultando a leitura de DANFEs.\n`;
              msgSanidade += `Para melhor qualidade:\n`;
              msgSanidade += `① Toque no clipe 📎 → selecione <b>Arquivo</b> (não Galeria/Foto)\n`;
              msgSanidade += `② Navegue até a foto da DANFE e envie como arquivo\n`;
              msgSanidade += `③ O bot receberá a imagem em resolução original ✅\n\n`;
            } else {
              msgSanidade += `\n💡 <b>Soluções:</b>\n`;
              msgSanidade += `1. Envie a foto mais próxima da tabela de produtos\n`;
              msgSanidade += `2. Tire a foto com mais luz e sem reflexo\n`;
              msgSanidade += `3. Envie apenas a tabela de produtos (corte a imagem)\n\n`;
              msgSanidade += `📸 <b>Dicas para tirar uma boa foto da DANFE:</b>\n`;
              msgSanidade += `• Aproxime a câmera da tabela de produtos\n`;
              msgSanidade += `• Tire a foto de cima, sem inclinação\n`;
              msgSanidade += `• Evite reflexos de luz no papel\n`;
              msgSanidade += `• Se a nota estiver dobrada, abra completamente\n`;
              msgSanidade += `• Envie a foto no formato retrato (vertical) se possível`;
            }

            await sendReply(msgSanidade);
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          // Se a diferença for maior que 10% e houver menos de 3 itens em nota de alto valor:
          const alertaItensFaltando = percentualDiferenca > 10 && valorTotalNF > 300 && itensExtraidos.length < 3;

          if (alertaItensFaltando) {
            console.warn(`[telegram-webhook] Validação NF falhou: ${itensExtraidos.length} itens, soma=${valorTotalItens}, totalNF=${valorTotalNF}, diff=${percentualDiferenca.toFixed(1)}%`);

            const { data: nfFalha } = await supabase
              .from("notas_fiscais_compra")
              .insert({
                user_id: userId,
                workspace_id: wsId,
                chat_id: Number(chatId) || null,
                numero_nf: documentData.cabecalho?.numero_nf,
                serie_nf: documentData.cabecalho?.serie_nf,
                fornecedor: documentData.cabecalho?.fornecedor,
                cnpj_fornecedor: documentData.cabecalho?.cnpj_fornecedor,
                data_emissao: documentData.cabecalho?.data_emissao,
                data_entrada: documentData.cabecalho?.data_entrada || hojeStr,
                valor_total: valorTotalNF,
                status: "validacao_falhou",
                origem: "foto",
              })
              .select("id")
              .single();

            if (nfFalha && itensExtraidos.length > 0) {
              const itensParc = itensExtraidos.map((it: any) => ({
                nf_id: nfFalha.id,
                codigo_produto: it.codigo,
                descricao: it.descricao,
                quantidade: it.quantidade,
                valor_unitario: it.valor_unitario,
                valor_total: it.valor_total,
                custo_unitario_liquido: it.custo_unitario_liquido || it.valor_unitario,
                status_estoque: "pendente",
              }));
              await supabase.from("nf_itens").insert(itensParc);
            }

            let msgAlerta = `⚠️ <b>Atenção: Possível erro na leitura completa da Nota Fiscal!</b>\n\n`;
            msgAlerta += `🏢 <b>Fornecedor:</b> ${documentData.cabecalho?.fornecedor || "N/A"}\n`;
            msgAlerta += `💰 <b>Valor Total da NF:</b> ${fmt(valorTotalNF)}\n`;
            msgAlerta += `📦 <b>Itens lidos:</b> ${itensExtraidos.length} produto(s)\n`;
            msgAlerta += `💰 <b>Soma dos itens:</b> ${fmt(valorTotalItens)}\n`;
            msgAlerta += `📊 <b>Diferença:</b> ${percentualDiferenca.toFixed(1)}%\n\n`;
            msgAlerta += `🔍 <i>A tabela é extensa e podem faltar itens na leitura automática.</i>\n\n`;
            msgAlerta += `👉 <b>Opções:</b>\n`;
            msgAlerta += `1. Envie a foto mais próxima e focada na tabela de produtos.\n`;
            msgAlerta += `2. Digite <b>PROSSEGUIR</b> para cadastrar apenas os ${itensExtraidos.length} itens lidos.\n`;
            msgAlerta += `3. Digite <b>MANUAL</b> para registrar manualmente.`;

            await supabase.from("telegram_conversas").upsert(
              {
                user_id: userId,
                chat_id: chatId,
                estado: "aguardando_correcao_nf",
                proposta_id: nfFalha?.id || null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "chat_id" }
            );

            await sendReply(msgAlerta);
            return new Response("OK", { status: 200, headers: corsHeaders });
          }

          const { data: nfSalva, error: errNF } = await supabase
            .from("notas_fiscais_compra")
            .insert({
              user_id: userId,
              workspace_id: wsId,
              chat_id: Number(chatId) || null,
              numero_nf: documentData.cabecalho?.numero_nf,
              serie_nf: documentData.cabecalho?.serie_nf,
              fornecedor: documentData.cabecalho?.fornecedor,
              cnpj_fornecedor: documentData.cabecalho?.cnpj_fornecedor,
              data_emissao: documentData.cabecalho?.data_emissao,
              data_entrada: documentData.cabecalho?.data_entrada || hojeStr,
              valor_total: documentData.valores_totais?.valor_total_nf,
              valor_icms: documentData.valores_totais?.valor_icms,
              valor_ipi: documentData.valores_totais?.valor_ipi,
              valor_frete: documentData.valores_totais?.valor_frete,
              valor_produtos: documentData.valores_totais?.valor_produtos,
              chave_acesso: documentData.cabecalho?.chave_acesso,
              status: "pendente",
              origem: "foto",
            })
            .select("id")
            .single();

          if (!errNF && nfSalva) {
            const itensParaInserir = (documentData.itens || []).map((item: any) => ({
              nf_id: nfSalva.id,
              codigo_produto: item.codigo,
              descricao: item.descricao,
              ncm: item.ncm,
              cfop: item.cfop,
              unidade: item.unidade,
              quantidade: item.quantidade,
              valor_unitario: item.valor_unitario,
              valor_total: item.valor_total,
              icms_aliquota: item.icms_aliquota,
              ipi_aliquota: item.ipi_aliquota,
              pis_aliquota: item.pis_aliquota,
              cofins_aliquota: item.cofins_aliquota,
              custo_unitario_liquido: item.custo_unitario_liquido || item.valor_unitario,
              status_estoque: "pendente",
            }));

            if (itensParaInserir.length > 0) {
              await supabase.from("nf_itens").insert(itensParaInserir);
            }

            const fmt = (v: any) =>
              v != null && !isNaN(Number(v))
                ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "R$ 0,00";

            let msg = `📄 <b>Nota Fiscal de Compra Identificada!</b>\n\n`;
            msg += `🏢 <b>Fornecedor:</b> ${documentData.cabecalho?.fornecedor || "N/A"}\n`;
            msg += `📋 <b>NF:</b> ${documentData.cabecalho?.numero_nf || "N/A"} ${documentData.cabecalho?.serie_nf ? `(Série ${documentData.cabecalho.serie_nf})` : ""}\n`;
            msg += `📅 <b>Emissão:</b> ${documentData.cabecalho?.data_emissao ? documentData.cabecalho.data_emissao.split("-").reverse().join("/") : hojeStr}\n`;
            msg += `💰 <b>Valor Total:</b> <b>${fmt(documentData.valores_totais?.valor_total_nf)}</b>\n`;
            msg += `📦 <b>Itens:</b> ${documentData.itens.length} produtos\n\n`;

            documentData.itens.slice(0, 8).forEach((item: any, i: number) => {
              const qtd = Number(item.quantidade) || 1;
              const vUnit = Number(item.valor_unitario) || 0;
              const vLiq = Number(item.custo_unitario_liquido) || vUnit;
              msg += `${i + 1}. <b>${item.descricao || "Produto"}</b>\n`;
              msg += `   📦 ${qtd} ${item.unidade || "UN"} × ${fmt(vUnit)}\n`;
              msg += `   💰 Total: ${fmt(item.valor_total)} | Custo Líquido: <b>${fmt(vLiq)}</b>\n\n`;
            });

            if (documentData.itens.length > 8) {
              msg += `<i>... e mais ${documentData.itens.length - 8} produtos</i>\n\n`;
            }

            msg += `⚠️ <b>Deseja confirmar e atualizar estoque e custos?</b>\n\n`;
            msg += `👉 Responda <b>CONFIRMAR</b> para atualizar o sistema.\n`;
            msg += `👉 Responda <b>CANCELAR</b> para descartar.\n\n`;
            msg += `⏰ <i>Esta proposta expira em 30 minutos.</i>`;

            const botoesNF = [
              [
                { text: "✅ SIM, confirmar", callback_data: `nf_confirmar:${nfSalva.id}` },
                { text: "❌ NÃO, cancelar", callback_data: `nf_cancelar:${nfSalva.id}` },
              ],
            ];

            const respMsg = await sendReplyWithButtons(chatId, msg, botoesNF);
            const messageId = respMsg?.result?.message_id;

            const { data: propCriada } = await supabase.from("telegram_propostas").insert({
              user_id: userId,
              chat_id: Number(chatId) || null,
              tipo: "atualizar_estoque_nf",
              dados: { nf_id: nfSalva.id, message_id: messageId },
              resumo: `NF ${documentData.cabecalho?.numero_nf} - ${documentData.cabecalho?.fornecedor} - ${fmt(documentData.valores_totais?.valor_total_nf)}`,
              status: "pendente",
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            }).select("id").single();

            if (propCriada) {
              await supabase.from("telegram_conversas").upsert(
                {
                  user_id: userId,
                  chat_id: chatId,
                  estado: "aguardando_confirmacao_nf",
                  proposta_id: propCriada.id,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "chat_id" }
              );
            }

            return new Response("OK", { status: 200, headers: corsHeaders });
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
        } else if (documentData && documentData.tipo !== "desconhecido" && documentData.confianca_geral !== "baixa" && documentData.tipo !== "outro") {
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
          // Fallback: documento não identificado — fornecer orientações contextuais
          let msgFallback = `📄 <b>Não consegui identificar o documento.</b>\n\n`;
          msgFallback += `🔍 Causas possíveis:\n`;
          msgFallback += `• Imagem com pouca resolução ou muito inclinada\n`;
          msgFallback += `• Documento muito pequeno em relação ao fundo\n`;
          msgFallback += `• Iluminação insuficiente ou reflexos no papel\n\n`;

          if (isTelegramCompressedPhoto) {
            msgFallback += `📂 <b>Solução recomendada — envie como ARQUIVO:</b>\n`;
            msgFallback += `O Telegram comprime fotos automaticamente, reduzindo a resolução.\n`;
            msgFallback += `Para a IA conseguir ler a DANFE:\n\n`;
            msgFallback += `① Toque no ícone 📎 (clipe/anexo)\n`;
            msgFallback += `② Selecione <b>"Arquivo"</b> (não "Galeria" nem "Câmera")\n`;
            msgFallback += `③ Escolha a foto da nota fiscal e envie\n`;
            msgFallback += `④ O bot recebe em resolução original e lê corretamente ✅`;
          } else {
            msgFallback += `💡 <b>Dicas para melhorar a leitura:</b>\n`;
            msgFallback += `• Aproxime a câmera do documento\n`;
            msgFallback += `• Tire a foto de cima, sem inclinação\n`;
            msgFallback += `• Garanta boa iluminação sem reflexo\n`;
            msgFallback += `• Abra a nota completamente antes de fotografar`;
          }

          await sendReply(msgFallback);
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
- REGRA CRÍTICA DE FORMATAÇÃO:
  • NUNCA use Markdown cru (como **negrito** ou _italico_). SEMPRE use tags HTML válidas suportadas pelo Telegram (<b>negrito</b>, <i>itálico</i>, <code>código</code>).
  • DÊ UMA LINHA EM BRANCO (ESPAÇAMENTO) ENTRE CADA DATA/DIA NO DETALHAMENTO para que a leitura fique confortável e clara.
  • NO DETALHAMENTO DOS ITENS: use apenas o marcador simples • (SEM emojis redundantes como 💸 ou 🏷️ antes do nome da despesa).
- NUNCA use frases conclusivas exageradas (ex: "Bate certinho", "Show de bola").
- NUNCA invente dados ou conceitos não informados pelas ferramentas.
- Termine sempre com: "<i>Se precisar de mais informações, estou à disposição!</i>"
- Use emojis como marcadores temáticos de cabeçalho:
  • Cabeçalhos e Métricas: 💼 Colaborador, 💰 Total, 📝 Lançamentos, 📋 Detalhamento, 🗓️ Datas
  • Métodos de pagamento: 📲 Pix, 💳 Crédito, 💳 Débito, 📄 Boleto, 💵 Dinheiro

Exemplo de formato para pagamentos a colaboradores / pessoas / fornecedores:
💼 <b>Pagamentos para [Nome] — [Período/Mês]</b>

💰 <b>Total Pago:</b> <b>R$ 1.305,30</b>
📝 <b>Lançamentos:</b> <b>8 transações</b>

📋 <b>Detalhamento:</b>

🗓️ <b>17/08/2026</b>
• Luiz folguista: <b>R$ 240,00</b> <i>(📲 Pix)</i>
• Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>

🗓️ <b>14/08/2026</b>
• Luiz: <b>R$ 379,80</b> <i>(📲 Pix)</i>
• Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>

🗓️ <b>10/08/2026</b>
• Luiz folguista: <b>R$ 215,00</b> <i>(📲 Pix)</i>
• Taxa Divipay: <b>R$ 3,50</b> <i>(📲 Pix)</i>

🗓️ <b>04/08/2026</b>
• Luiz: <b>R$ 200,00</b> <i>(📲 Pix)</i>

🗓️ <b>01/08/2026</b>
• Luiz folguista: <b>R$ 260,00</b> <i>(📲 Pix)</i>

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
