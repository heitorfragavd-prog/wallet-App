// Supabase Edge Functions & Deno Shared Module
// Engine Inteligente de Conferência de Estoque via Telegram (Etapa 4D.1 - Gates 1, 2, 3, 4, 5)
// Rodo Point — Grupo "Conversas da Loja"

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ItemEstoqueInterpretado {
  produto_nome: string;
  fornecedor_nome: string;
  quantidade_informada: number | null;
  unidade_medida: string;
  tipo_informacao: "confirmado_positivo" | "confirmado_zero" | "pendente" | "inconsistente";
  confianca: number;
  is_correcao: boolean;
  motivo_inconsistencia?: string;
}

export interface ReferenciaProdutoDB {
  id: string;
  workspace_id: string;
  fornecedor_id: string | null;
  fornecedor_nome: string;
  produto_nome: string;
  categoria?: string;
  unidade_medida?: string;
  quantidade_referencia?: number;
  validacao_status?: "confirmado" | "pendente_validacao" | "divergente";
  ativo?: boolean;
}

export interface ResultadoProcessamentoEstoque {
  sucesso: boolean;
  itensInterpretados: ItemEstoqueInterpretado[];
  itensPersistidos: Array<{
    produto_nome: string;
    fornecedor_nome: string;
    quantidade: number | null;
    tipo: string;
    status: string;
  }>;
  pedidosAfetados: Array<{
    fornecedor_nome: string;
    status_anterior?: string;
    novo_status?: string;
    total_itens?: number;
    itens_pendentes?: number;
  }>;
  mensagemResposta: string;
  alertas: string[];
}

/**
 * Sanitiza e remove tentativas de prompt injection ou ordens executivas
 */
export function sanitizarMensagemOperacional(texto: string): string {
  if (!texto) return "";
  let limpo = texto.trim();

  const comandosProibidos = [
    /ignore\s+(previous|all)\s+instructions/gi,
    /aprovar\s+pedido/gi,
    /fazer\s+pagamento/gi,
    /transferir\s+dinheiro/gi,
    /executar\s+comando/gi,
    /sudo\s+/gi,
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  ];

  for (const padrao of comandosProibidos) {
    limpo = limpo.replace(padrao, "[texto desconsiderado]");
  }

  return limpo;
}

/**
 * Normaliza string para comparação fonética/textual tolerante
 */
export function normalizar(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte palavras numéricas em números (ex: "duas" -> 2, "oito" -> 8)
 */
export function converterPalavraParaNumero(palavra: string): number | null {
  if (!palavra || !palavra.trim()) return null;
  const norm = normalizar(palavra);
  if (!norm) return null;

  const mapa: Record<string, number> = {
    zero: 0,
    um: 1, uma: 1,
    dois: 2, duas: 2,
    tres: 3, três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6, meia: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14, catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
  };
  if (mapa[norm] !== undefined) return mapa[norm];

  if (/^\d+(?:[.,]\d+)?$/.test(norm)) {
    const num = Number(norm.replace(",", "."));
    return !isNaN(num) ? num : null;
  }

  return null;
}

/**
 * Obtém a data corrente no fuso de Brasília (YYYY-MM-DD)
 */
export function getDataOperacionalBrasilia(): string {
  const agora = new Date();
  const formatador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatador.format(agora);
}

/**
 * Localiza o melhor produto de referência com regras estritas de desambiguação
 */
export function encontrarMelhorReferencia(
  trecho: string,
  catalogo: ReferenciaProdutoDB[]
): { referencia: ReferenciaProdutoDB | null; pontuacao: number } {
  const normTrecho = normalizar(trecho);
  if (!normTrecho) return { referencia: null, pontuacao: 0 };

  const temZero = normTrecho.includes("zero") || normTrecho.includes("black") || normTrecho.includes("sem acucar");
  const temOriginal = normTrecho.includes("original") || normTrecho.includes("comum") || normTrecho.includes("tradicional") || normTrecho.includes("normal");
  const temCatupiry = normTrecho.includes("catupiry");
  const tem200 = normTrecho.includes("200") || normTrecho.includes("caculinha") || normTrecho.includes("mini");
  const tem250 = normTrecho.includes("250");
  const tem350 = normTrecho.includes("350") || normTrecho.includes("lata");
  const tem473 = normTrecho.includes("473") || normTrecho.includes("latao") || normTrecho.includes("grande");
  const tem2l = normTrecho.includes("2l") || normTrecho.includes("2 litros") || normTrecho.includes("2 pet");
  const tem600 = normTrecho.includes("600");

  let melhor: ReferenciaProdutoDB | null = null;
  let maiorPont = 0;

  for (const ref of catalogo) {
    const normNome = normalizar(ref.produto_nome);

    const prodEhZero = normNome.includes("zero") || normNome.includes("black");
    const prodEhCatupiry = normNome.includes("catupiry");
    const prodEh200 = normNome.includes("200");
    const prodEh250 = normNome.includes("250");
    const prodEh350 = normNome.includes("350");
    const prodEh473 = normNome.includes("473");
    const prodEh2l = normNome.includes("2l");
    const prodEh600 = normNome.includes("600");

    // Guardrails de exclusão de variantes
    if (temZero && !prodEhZero && (normNome.includes("coca") || normNome === "zero")) continue;
    if (!temZero && temOriginal && prodEhZero && normNome.includes("coca")) continue;
    if (temCatupiry && !prodEhCatupiry && normNome.includes("coxinha")) continue;
    if (!temCatupiry && normTrecho.includes("coxinha") && prodEhCatupiry) continue;
    if (tem200 && !prodEh200 && normNome.includes("coca")) continue;
    if (!tem200 && prodEh200 && normTrecho.includes("coca") && (tem350 || tem2l || tem600)) continue;
    if (tem473 && !prodEh473 && (normNome.includes("red bull") || normNome.includes("monster"))) continue;
    if (tem250 && !prodEh250 && normNome.includes("red bull")) continue;

    // Sabores de Monster
    if (normNome.includes("mango loco") && !normTrecho.includes("mango")) continue;
    if (!normNome.includes("mango loco") && normTrecho.includes("mango")) continue;
    if (normNome.includes("ultra paradise") && !normTrecho.includes("paradise") && !normTrecho.includes("ultra")) continue;

    const palavras = normNome.split(" ").filter((p) => p.length > 2);
    let score = 0;

    if (normTrecho.includes(normNome)) {
      score = 100;
    } else {
      let matches = 0;
      for (const p of palavras) {
        if (new RegExp(`\\b${p}\\b`, "i").test(normTrecho)) matches++;
      }
      if (palavras.length > 0 && matches > 0) {
        score = (matches / palavras.length) * 80;
      }
    }

    if (score > maiorPont && score >= 40) {
      maiorPont = score;
      melhor = ref;
    }
  }

  return { referencia: melhor, pontuacao: maiorPont };
}

/**
 * Extrai a quantidade numérica informada no segmento, isolando especificações técnicas
 * de volume, gramatura ou números presentes no nome do produto (Gate 3).
 */
export function extrairQuantidadeDoTrecho(seg: string, produtoNome: string): number | null {
  // 1. Operador explícito de atribuição (=, :, -, tem, são, etc.)
  // Ex: "Red Bull 250 ml = 3" -> 3
  // Ex: "Coca 200 ml: 8" -> 8
  // Ex: "Coca 350 ml Zero = 2" -> 2
  const matchOp = seg.match(/(?:=|:|-|\b(?:tem|sao|são|sobrou|sobraram|restam|estoque|qtd|quantidade)\b)\s*(\d+(?:[.,]\d+)?|[a-zA-ZÀ-ÿ]+)/i);
  if (matchOp) {
    const val = converterPalavraParaNumero(matchOp[1]);
    if (val !== null && !isNaN(val)) return val;
  }

  // 2. Remove especificações explícitas de volume / peso com suas unidades
  // Ex: "250 ml", "250ml", "350 ml", "200ml", "473 ml", "500ml", "600ml", "2l", "84g", "76g", "100un", "1kg", "500g"
  let limpo = seg.replace(/\b\d+\s*(?:ml|l|litros?|g|gramas?|kg|quilos?|un|unidades?)\b/gi, " ");

  // 3. Remove os números específicos que fazem parte do nome daquele produto
  // Ex: se produtoNome é "Coca 200ml", remove 200; se "Red Bull 473 ml", remove 473
  const numsNoNome = produtoNome.match(/\b\d+\b/g);
  if (numsNoNome) {
    for (const n of numsNoNome) {
      limpo = limpo.replace(new RegExp(`\\b${n}\\b`, "g"), " ");
    }
  }

  // 4. Se o produto tem "zero" no nome (ex: Coca Zero, Monster Zero), remove "zero" do texto
  // para não confundir o nome do produto com quantidade 0
  if (normalizar(produtoNome).includes("zero")) {
    limpo = limpo.replace(/\bzero\b/gi, " ");
  }

  // 5. Procura números com unidades de contagem de estoque
  // Ex: "3 caixas", "8 fardos", "2 display", "15 latas"
  const matchUnidade = limpo.match(/\b(\d+(?:[.,]\d+)?|[a-zA-ZÀ-ÿ]+)\s*(?:cx|caixas?|fardos?|unidades?|un|display|pacotes?|pct|latas?|garrafas?)\b/i);
  if (matchUnidade) {
    const val = converterPalavraParaNumero(matchUnidade[1]);
    if (val !== null && !isNaN(val)) return val;
  }

  // 6. Procura qualquer número remanescente no segmento limpo
  const tokens = limpo.split(/[\s=:]+/);
  for (const tok of tokens) {
    const val = converterPalavraParaNumero(tok);
    if (val !== null && !isNaN(val) && val >= 0) {
      return val;
    }
  }

  return null;
}

/**
 * Interpreta texto, áudio transcrito ou OCR de estoque contra as referências cadastradas (Gate 3)
 */
export function interpretarTextoEstoque(
  textoOriginal: string,
  referencias: ReferenciaProdutoDB[]
): { itens: ItemEstoqueInterpretado[]; itensNaoReconhecidos: string[] } {
  const textoLimpo = sanitizarMensagemOperacional(textoOriginal);
  if (!textoLimpo) return { itens: [], itensNaoReconhecidos: [] };

  const normTextoGlobal = normalizar(textoLimpo);

  const isMensagemCorrecao =
    /\b(corrigindo|correcao|correção|retificando|retificacao|na verdade|errei)\b/i.test(normTextoGlobal);

  // Divide mantendo expressões lógicas (frases por ponto, quebra de linha ou ponto-e-vírgula)
  const frases = textoLimpo
    .split(/[\n;.]/g)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const itens: ItemEstoqueInterpretado[] = [];
  const itensNaoReconhecidos: string[] = [];
  const produtosVistos = new Set<string>();

  for (const frase of frases) {
    const normFrase = normalizar(frase);
    if (!normFrase) continue;

    const fraseComecaComZero =
      /^(?:acabou|zerou|zerado|nao tem|não tem|sem estoque)\b/i.test(frase.trim()) ||
      /\b(?:acabou|zerou|zerado|sem estoque)\s+(?:tudo|todos)\b/i.test(frase);

    // Divide a frase em trechos por vírgula ou conjunção "e"
    const trechos = frase
      .split(/,\s*(?=[a-zA-ZÀ-ÿ0-9])|\be\b(?=\s+(?:o|a|os|as|[a-zA-ZÀ-ÿ0-9]))/gi)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const seg of trechos) {
      const normSeg = normalizar(seg);
      if (!normSeg) continue;

      // Detecta se o segmento é aviso de pendência exclusivo
      const isPendente =
        /\b(nao contei|não contei|nao consegui contar|falta contar|depois vejo|nao sei|não sei|pulei)\b/i.test(normSeg);

      // Detecta se é imprecisão não numérica
      const isInconsistente =
        /\b(bastante|muito|pouco|cheio|meio pacote|alguns|varios|vários)\b/i.test(normSeg);

      const { referencia, pontuacao } = encontrarMelhorReferencia(seg, referencias);

      if (referencia) {
        if (produtosVistos.has(referencia.produto_nome)) continue;
        produtosVistos.add(referencia.produto_nome);

        // Detecta zero explícito no segmento EXCLUSIVO (sem vazar para outras frases)
        const ehProdutoComZeroNoNome = normalizar(referencia.produto_nome).includes("zero");
        const segTemTermoZero =
          fraseComecaComZero ||
          /\b(zerou|zerado|acabou|nao tem|não tem|sem estoque|esgotado)\b/i.test(normSeg) ||
          (!ehProdutoComZeroNoNome && /\bzero\b/i.test(normSeg)) ||
          /[=:]\s*0\b/.test(seg);

        let qtd: number | null = null;
        let tipoInf: "confirmado_positivo" | "confirmado_zero" | "pendente" | "inconsistente" = "confirmado_positivo";

        if (isPendente) {
          tipoInf = "pendente";
          qtd = null;
        } else if (isInconsistente) {
          tipoInf = "inconsistente";
          qtd = null;
        } else if (segTemTermoZero) {
          tipoInf = "confirmado_zero";
          qtd = 0;
        } else {
          // Extrai quantidade sem confundir números de ml/g com estoque
          qtd = extrairQuantidadeDoTrecho(seg, referencia.produto_nome);

          if (qtd !== null) {
            if (qtd === 0) {
              tipoInf = "confirmado_zero";
            } else {
              tipoInf = "confirmado_positivo";
            }
          } else {
            // Sem número informado: permanece pendente sem inventar número falso
            tipoInf = "pendente";
          }
        }

        itens.push({
          produto_nome: referencia.produto_nome,
          fornecedor_nome: referencia.fornecedor_nome,
          quantidade_informada: qtd,
          unidade_medida: referencia.unidade_medida || "unidade",
          tipo_informacao: tipoInf,
          confianca: Math.min(100, Math.round(pontuacao)),
          is_correcao: isMensagemCorrecao,
          motivo_inconsistencia: isInconsistente ? "Quantidade imprecisa ou não numérica" : undefined,
        });
      } else {
        const ignoraveis = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "estoque", "contagem", "segue", "loja", "corrigindo", "na verdade"];
        if (!ignoraveis.includes(normSeg)) {
          itensNaoReconhecidos.push(seg);
        }
      }
    }
  }

  return { itens, itensNaoReconhecidos };
}

/**
 * Transcreve imagem / foto de prancheta ou estoque utilizando a API de visão via openai-proxy
 */
export async function transcreverFotoComVisao(
  fileId: string,
  telegramBotToken: string,
  supabaseUrl: string,
  serviceKey: string,
  userId: string
): Promise<string | null> {
  try {
    const getFileResp = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getFile?file_id=${fileId}`);
    const fileInfo = await getFileResp.json();
    if (!fileInfo?.ok || !fileInfo?.result?.file_path) {
      console.error("[transcreverFotoComVisao] getFile failed:", fileInfo);
      return null;
    }

    const fileUrl = `https://api.telegram.org/file/bot${telegramBotToken}/${fileInfo.result.file_path}`;
    const imgResp = await fetch(fileUrl);
    if (!imgResp.ok) return null;

    const arrayBuffer = await imgResp.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    const promptVision = `Você é um leitor especialista em listas de estoque e contagem física da loja de conveniência Rodo Point.
Extraia todos os produtos contados e suas respectivas quantidades e unidades escritas na imagem ou prancheta.
Retorne uma lista simples de texto, uma linha por produto, no formato:
[Nome do Produto]: [Quantidade] [Unidade]
Exemplo:
Coxinha: 15 unidades
Coca 350ml original: 8 caixas
Kibe: 0 (acabou)
Trident Menta: 4 display
Se não houver contagem de estoque legível, retorne vazio.`;

    const aiResp = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        user_id: userId,
        temperature: 0.0,
        messages: [
          { role: "system", content: promptVision },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva a lista de conferência de estoque presente nesta imagem:" },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      console.error("[transcreverFotoComVisao] OpenAI vision proxy error:", await aiResp.text());
      return null;
    }

    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content || "";
    return content.trim();
  } catch (err) {
    console.error("[transcreverFotoComVisao] Exceção na leitura visual:", err);
    return null;
  }
}

/**
 * Processador principal de mensagens do grupo "Conversas da Loja"
 */
export async function processarEstoqueConversasLoja(params: {
  supabase: SupabaseClient;
  message: Record<string, unknown>;
  grupoConfig: Record<string, unknown>;
  workspaceId: string;
  userId: string;
  telegramBotToken: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  sendReply: (text: string) => Promise<unknown>;
}): Promise<Response> {
  const {
    supabase,
    message,
    workspaceId,
    userId,
    telegramBotToken,
    supabaseUrl,
    supabaseServiceKey,
    sendReply,
  } = params;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // 1. Previne loops se a mensagem veio do próprio bot
  const fromObj = (message?.from as Record<string, unknown> | undefined) || {};
  if (fromObj.is_bot) {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // 2. Extrai identificação do remetente
  const senderFirstName = (typeof fromObj.first_name === "string" ? fromObj.first_name : "").trim();
  const senderLastName = (typeof fromObj.last_name === "string" ? fromObj.last_name : "").trim();
  const senderName = [senderFirstName, senderLastName].filter(Boolean).join(" ") || "Colaborador Loja";
  const senderTelegramId = typeof fromObj.id === "number" ? fromObj.id : null;

  // 3. Extrai texto, legenda ou mídia
  const rawText = (typeof message?.text === "string" ? message.text : "").trim();
  const rawCaption = (typeof message?.caption === "string" ? message.caption : "").trim();
  let textoParaProcessar = rawText || rawCaption || "";

  const hasPhoto = Array.isArray(message?.photo) && message.photo.length > 0;
  const hasDoc = !!message?.document;
  let origemTipo = "telegram_texto";

  // 4. Se for imagem/foto e não tiver legenda suficiente, utiliza Visão AI
  if ((hasPhoto || hasDoc) && textoParaProcessar.length < 5) {
    const photoArr = hasPhoto ? (message.photo as Array<{ file_id: string }>) : [];
    const fileId = hasPhoto ? photoArr[photoArr.length - 1].file_id : (message.document as { file_id: string })?.file_id;

    if (fileId && telegramBotToken) {
      await sendReply("📸 <b>Processando imagem da conferência de estoque...</b> Aguarde um instante.");
      const ocrTexto = await transcreverFotoComVisao(fileId, telegramBotToken, supabaseUrl, supabaseServiceKey, userId);
      if (ocrTexto) {
        textoParaProcessar = ocrTexto;
        origemTipo = "telegram_foto";
      }
    }
  }

  const textoNorm = normalizar(textoParaProcessar);

  // 5. Salvaguarda de Sigilo Financeiro (Regra Estrita Rodo Point)
  const financialKeywords = ["lucro", "faturamento", "dre", "saldo", "banco", "divida", "dívida", "pagamento fornecedor", "quanto faturou"];
  if (financialKeywords.some((kw) => textoNorm.includes(kw))) {
    await sendReply(
      `🔒 <b>Sigilo Operacional Rodo Point:</b>\n` +
      `Por normas de segurança e privacidade da empresa, consultas de faturamento, saldos e lucros não são permitidas no grupo da loja. Para dúvidas executivas, contate a diretoria.`
    );
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // 6. Comandos informativos e de boas-vindas
  const isHelpCommand = ["/start", "/ajuda", "/estoque", "/compras", "ajuda", "como usar"].includes(textoNorm);
  const isOnlyGreeting = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"].includes(textoNorm);

  if (isHelpCommand || isOnlyGreeting) {
    await sendReply(
      `📦 <b>Central de Estoque & Compras — Rodo Point</b>\n\n` +
      `Olá, <b>${senderName}</b>! Eu sou a Wallet IA responsável por receber as contagens físicas de estoque e gerar as listas de compras dos fornecedores.\n\n` +
      `📋 <b>Como informar a contagem:</b>\n` +
      `• <b>Por texto:</b> Digite os produtos e quantidades. Exemplo:\n` +
      `  <code>Coxinha 15, Coxinha Catupiry 10, Kibe 4, Pão de Batata 0</code>\n` +
      `• <b>Por áudio:</b> Envie um áudio claro listando os itens contados.\n` +
      `• <b>Por foto:</b> Envie uma foto legível da prancheta ou folha de conferência.\n\n` +
      `⚠️ <b>Dicas importantes:</b>\n` +
      `• Se algum item acabou, diga <i>"zerou"</i> ou coloque <code>0</code>.\n` +
      `• Se errou um número, envie: <i>"Corrigindo, Coxinha são 12"</i> que eu atualizo na hora!\n` +
      `• O que você não souber, pode dizer <i>"não contei"</i> para que a diretoria veja o item como pendente.`
    );
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // 7. Data operacional de Brasília
  const dataOperacional = getDataOperacionalBrasilia();

  // 8. Carrega base de produtos de referência ativos do workspace
  const { data: refsDB, error: refsErr } = await supabase
    .from("compras_produtos_referencia")
    .select("id, workspace_id, fornecedor_id, fornecedor_nome, produto_nome, categoria, unidade_medida, quantidade_referencia, validacao_status, ativo")
    .eq("workspace_id", workspaceId)
    .eq("ativo", true);

  if (refsErr || !refsDB || refsDB.length === 0) {
    console.error("[compras-telegram-engine] Erro ao carregar referências:", refsErr);
    await sendReply("⚠️ Não foram encontrados produtos de referência cadastrados para esta loja.");
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // 9. Interpretação semântica e tolerante da mensagem
  const { itens } = interpretarTextoEstoque(textoParaProcessar, refsDB as ReferenciaProdutoDB[]);

  if (itens.length === 0) {
    if (textoParaProcessar.length > 10) {
      await sendReply(
        `⚠️ <b>Nenhum produto de estoque foi identificado na mensagem.</b>\n\n` +
        `Por favor, informe o nome do produto e a quantidade contada.\n` +
        `<i>Exemplo: "Coxinha 15, Kibe 5, Coca zero lata 8"</i>`
      );
    }
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // 10. Persistência Atômica via RPC no PostgreSQL
  const persistidos: Array<{
    produto_nome: string;
    fornecedor_nome: string;
    quantidade: number | null;
    tipo: string;
    status: string;
  }> = [];

  const pedidosAfetadosMap = new Map<string, {
    fornecedor_nome: string;
    status_anterior?: string;
    novo_status?: string;
    total_itens?: number;
    itens_pendentes?: number;
  }>();

  for (const item of itens) {
    if (item.tipo_informacao === "confirmado_positivo" || item.tipo_informacao === "confirmado_zero") {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("registrar_item_conferencia_estoque", {
          p_workspace_id: workspaceId,
          p_fornecedor_nome: item.fornecedor_nome,
          p_data_operacional: dataOperacional,
          p_produto_nome: item.produto_nome,
          p_quantidade_informada: item.quantidade_informada,
          p_tipo_informacao: item.tipo_informacao,
          p_origem_tipo: origemTipo,
          p_informado_por_usuario_id: null,
          p_informado_por_telegram_id: senderTelegramId,
          p_informado_por_nome: senderName,
          p_arquivo_url: null,
          p_transcricao: textoParaProcessar,
          p_observacoes: item.is_correcao ? "Correção informada via Telegram" : null,
        });

        if (rpcErr) {
          console.error(`[compras-telegram-engine] RPC erro para ${item.produto_nome}:`, rpcErr);
        } else {
          persistidos.push({
            produto_nome: item.produto_nome,
            fornecedor_nome: item.fornecedor_nome,
            quantidade: item.quantidade_informada,
            tipo: item.tipo_informacao,
            status: rpcRes?.status_conferencia || "registrado",
          });

          if (rpcRes?.fornecedor_nome) {
            pedidosAfetadosMap.set(rpcRes.fornecedor_nome, {
              fornecedor_nome: rpcRes.fornecedor_nome,
              novo_status: rpcRes.novo_status_pedido,
              total_itens: rpcRes.total_itens,
              itens_pendentes: rpcRes.itens_pendentes,
            });
          }
        }
      } catch (e) {
        console.error(`[compras-telegram-engine] Exceção ao persistir ${item.produto_nome}:`, e);
      }
    }
  }

  // 11. Montagem da Resposta Operacional do Telegram
  const dataFmt = dataOperacional.split("-").reverse().join("/");
  let replyMsg = `📦 <b>Wallet Compras — Conferência Registrada</b>\n`;
  replyMsg += `👤 <b>Conferente:</b> <i>${senderName}</i>\n`;
  replyMsg += `📅 <b>Data:</b> <code>${dataFmt}</code>\n\n`;

  if (persistidos.length > 0) {
    replyMsg += `✅ <b>Itens Computados com Sucesso:</b>\n`;
    for (const p of persistidos) {
      const isZero = p.tipo === "confirmado_zero" || p.quantidade === 0;
      const qtdStr = isZero ? `<b>0</b> <i>(esgotado/zerado)</i>` : `<b>${p.quantidade}</b>`;
      replyMsg += `• ${p.produto_nome} (${p.fornecedor_nome}): ${qtdStr}\n`;
    }
    replyMsg += `\n`;
  }

  const inconsistentes = itens.filter((i) => i.tipo_informacao === "inconsistente" || i.tipo_informacao === "pendente");
  if (inconsistentes.length > 0) {
    replyMsg += `⚠️ <b>Itens que precisam de confirmação numérica:</b>\n`;
    for (const inc of inconsistentes) {
      replyMsg += `• ${inc.produto_nome}: <i>${inc.motivo_inconsistencia || "Não foi informada quantidade precisa"}</i>\n`;
    }
    replyMsg += `\n`;
  }

  for (const [fornNome, statusPed] of pedidosAfetadosMap.entries()) {
    if (statusPed.itens_pendentes === 0) {
      replyMsg += `🎯 <b>Fornecedor ${fornNome}:</b>\n`;
      replyMsg += `✨ <i>Todos os itens foram conferidos! O pedido sugerido está pronto no Painel de Compras para aprovação da diretoria.</i>\n\n`;
    } else if (typeof statusPed.itens_pendentes === "number" && statusPed.itens_pendentes > 0) {
      replyMsg += `⏳ <b>Fornecedor ${fornNome}:</b> Restam <b>${statusPed.itens_pendentes}</b> de ${statusPed.total_itens} produto(s) para conferir.\n\n`;
    }
  }

  replyMsg += `<i>Os dados foram salvos no banco PostgreSQL da Rodo Point.</i>`;

  await sendReply(replyMsg);
  return new Response("OK", { status: 200, headers: corsHeaders });
}
