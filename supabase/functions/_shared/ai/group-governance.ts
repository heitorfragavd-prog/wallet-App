import type { AiExecutionContext } from "./auth.ts";
import type { ActionProposal } from "./action-types.ts";
import { createPreparedProposal } from "./action-gateway.ts";
import type { IActionProposalRepository } from "./action-repository.ts";
import type { QueryToolCatalog } from "./query-tools.ts";

export type OperationalGroupType =
  | "fechamento"
  | "nfe_boletos"
  | "contas_empresa"
  | "conversas_loja";

export interface GroupPermissions {
  ler: boolean;
  enviar_mensagens: boolean;
  enviar_documentos: boolean;
  confirmar_operacoes: boolean;
  gerenciar_grupo: boolean;
}

export const DEFAULT_GROUP_PERMISSIONS: GroupPermissions = {
  ler: true,
  enviar_mensagens: true,
  enviar_documentos: true,
  confirmar_operacoes: false,
  gerenciar_grupo: false,
};

export interface StandardGroupTemplate {
  tipo_grupo: OperationalGroupType;
  nome_grupo: string;
  descricao: string;
  ferramentas_permitidas: string[];
  dados_permitidos: string[];
  acoes_permitidas: string[];
  funcionalidades_autorizadas: string[];
  restritoAdmins: boolean;
}

export const STANDARD_GROUP_TEMPLATES: Record<OperationalGroupType, StandardGroupTemplate> = {
  fechamento: {
    tipo_grupo: "fechamento",
    nome_grupo: "Fechamento da Loja",
    descricao:
      "Conferência diária do fechamento de caixa, recepção de fotos/envelopes, validação de sobras e conciliação automática com o Eyemobile PDV.",
    ferramentas_permitidas: ["buscar_vendas_pdv", "buscar_transacoes", "consultar_resumo_mensal"],
    dados_permitidos: ["vendas", "fechamento", "eyemobile"],
    acoes_permitidas: ["extrair_fechamento", "conferir_sobra", "confirmar_fechamento_caixa"],
    funcionalidades_autorizadas: [
      "fechamento_caixa",
      "conferir_eyemobile",
      "receber_foto_envelope",
      "propostas_fechamento",
    ],
    restritoAdmins: false,
  },
  nfe_boletos: {
    tipo_grupo: "nfe_boletos",
    nome_grupo: "Notas Fiscais e Boletos",
    descricao:
      "Recebimento de boletos e DANFEs (fotos, PDFs e linhas digitáveis), identificação de fornecedores, detecção de duplicidades e preparação de propostas de dívidas/custos/estoque sem execução automática de pagamentos.",
    ferramentas_permitidas: ["consultar_dividas", "buscar_despesas", "consultar_estoque", "consultar_fornecedores"],
    dados_permitidos: ["boletos", "nfe", "fornecedores", "estoque"],
    acoes_permitidas: ["cadastrar_divida_boleto", "cadastrar_despesa_nf", "propor_atualizacao_custo"],
    funcionalidades_autorizadas: [
      "ocr_boletos",
      "ocr_danfe",
      "detector_duplicidade",
      "preparar_proposta_divida",
    ],
    restritoAdmins: false,
  },
  contas_empresa: {
    tipo_grupo: "contas_empresa",
    nome_grupo: "Contas da Empresa",
    descricao:
      "Acompanhamento de contas a pagar, saldos, Pix Divipay, fornecedores, despesas, conciliações e confirmações financeiras operacionais. Acesso exclusivo para proprietário e administradores autorizados.",
    ferramentas_permitidas: [
      "consultar_saldos",
      "consultar_dividas",
      "buscar_despesas",
      "buscar_receitas",
      "buscar_transacoes",
      "consultar_resumo_mensal",
      "buscar_vendas_pdv",
    ],
    dados_permitidos: ["saldos", "dividas", "despesas", "receitas", "pix", "fornecedores"],
    acoes_permitidas: ["confirmar_operacoes", "conciliar_pagamentos", "cadastrar_transacao"],
    funcionalidades_autorizadas: [
      "consultar_contas_saldos",
      "consultar_dividas_pagamentos",
      "conciliacao_pix",
      "confirmar_baixas",
    ],
    restritoAdmins: true,
  },
  conversas_loja: {
    tipo_grupo: "conversas_loja",
    nome_grupo: "Conversas da Loja",
    descricao:
      "Comunicação operacional da equipe: recados de turno, procedimentos, tarefas, ocorrências e rotina da loja sem exposição de dados financeiros confidenciais.",
    ferramentas_permitidas: ["consultar_validades", "consultar_rotinas"],
    dados_permitidos: ["rotinas", "ocorrencias", "procedimentos", "recados"],
    acoes_permitidas: ["registrar_recado", "registrar_ocorrencia"],
    funcionalidades_autorizadas: [
      "tarefas_turno",
      "procedimentos_operacionais",
      "registro_ocorrencias",
    ],
    restritoAdmins: false,
  },
};

export const CEO_EXCLUSIVE_TOOL_NAMES = new Set([
  "consultar_resumo_executivo_ceo",
  "consultar_analise_despesas_ceo",
  "consultar_oportunidades_ceo",
  "propor_experimento_comercial",
]);

export const SENSITIVE_COMPANY_FINANCIAL_TOOLS = new Set([
  ...CEO_EXCLUSIVE_TOOL_NAMES,
  "consultar_saldos",
  "consultar_dividas",
  "buscar_despesas",
  "buscar_receitas",
  "buscar_transacoes",
  "consultar_resumo_mensal",
  "consultar_analise_comercial_vendas",
]);

export function normalizeOperationalGroupType(raw?: string | null): OperationalGroupType {
  const val = (raw || "").trim().toLowerCase();
  if (val === "fechamento" || val === "nfe_boletos" || val === "contas_empresa" || val === "conversas_loja") {
    return val;
  }
  if (val.includes("boleto") || val.includes("nota") || val.includes("nfe") || val.includes("danfe")) {
    return "nfe_boletos";
  }
  if (val.includes("conta") || val.includes("financeir") || val.includes("pix")) {
    return "contas_empresa";
  }
  if (val.includes("fechamento") || val.includes("caixa")) {
    return "fechamento";
  }
  return "conversas_loja";
}

export function normalizeGroupPermissions(raw?: Record<string, unknown> | null): GroupPermissions {
  const obj = raw || {};
  return {
    ler: obj.ler !== false,
    enviar_mensagens: obj.enviar_mensagens !== false,
    enviar_documentos: obj.enviar_documentos !== false,
    confirmar_operacoes: obj.confirmar_operacoes === true,
    gerenciar_grupo: obj.gerenciar_grupo === true,
  };
}

/**
 * Filtra estritamente as ferramentas disponíveis conforme o tipo de grupo operacional.
 * Nunca expõe ferramentas executivas do Wallet CEO em grupos e bloqueia dados financeiros
 * confidenciais no grupo Conversas da Loja.
 */
export function filterCatalogForGroup(
  catalog: QueryToolCatalog,
  groupType: OperationalGroupType,
  configuredTools?: string[] | null,
): QueryToolCatalog {
  const filtered: QueryToolCatalog = {};

  const allowedByGroupType: Record<OperationalGroupType, Set<string> | null> = {
    fechamento: new Set(["buscar_vendas_pdv", "buscar_transacoes", "consultar_resumo_mensal"]),
    nfe_boletos: new Set(["consultar_dividas", "buscar_despesas"]),
    contas_empresa: new Set([
      "consultar_saldos",
      "consultar_dividas",
      "buscar_despesas",
      "buscar_receitas",
      "buscar_transacoes",
      "consultar_resumo_mensal",
      "buscar_vendas_pdv",
    ]),
    conversas_loja: new Set<string>(),
  };

  const allowedSet = allowedByGroupType[groupType];
  const configuredSet =
    Array.isArray(configuredTools) && configuredTools.length > 0
      ? new Set(configuredTools.map((t) => String(t).trim()).filter(Boolean))
      : null;

  for (const [toolName, handler] of Object.entries(catalog)) {
    if (CEO_EXCLUSIVE_TOOL_NAMES.has(toolName)) continue;

    if (groupType === "conversas_loja" && SENSITIVE_COMPANY_FINANCIAL_TOOLS.has(toolName)) {
      continue;
    }

    if (allowedSet && !allowedSet.has(toolName)) {
      continue;
    }

    // Se houver whitelist explícita na configuração do grupo, aplica interseção (exceto tools de leitura padrão mapeadas)
    if (configuredSet && groupType !== "fechamento" && !configuredSet.has(toolName)) {
      // Mapeia nomes legados conhecidos
      const legacyMap: Record<string, string[]> = {
        buscar_vendas_pdv: ["consultar_vendas", "fechamento_caixa"],
        consultar_saldos: ["consultar_saldos"],
        consultar_dividas: ["consultar_dividas"],
        buscar_despesas: ["buscar_despesas"],
      };
      const aliases = legacyMap[toolName] || [];
      if (!aliases.some((alias) => configuredSet.has(alias))) {
        continue;
      }
    }

    filtered[toolName] = handler;
  }

  return filtered;
}

export function buildGroupSystemPrompt(
  basePrompt: string,
  groupType: OperationalGroupType,
  groupName?: string,
): string {
  const label = groupName || STANDARD_GROUP_TEMPLATES[groupType].nome_grupo;

  switch (groupType) {
    case "fechamento":
      return `${basePrompt}\n\n[CONTEXTO DE GRUPO OPERACIONAL: ${label} (FECHAMENTO DA LOJA)]\nEspecialidade: conferência diária de fechamento de caixa (Caixa 1, Caixa 2, dinheiro, Pix, débito, crédito, sobra/quebra) e conciliação com as vendas do Eyemobile PDV.\nRegras: apresente valores sempre com fonte verificável (Envelope/Informado vs Eyemobile PDV), aponte divergências ou sobras em R$ com precisão e nunca execute pagamentos automáticos.`;
    case "nfe_boletos":
      return `${basePrompt}\n\n[CONTEXTO DE GRUPO OPERACIONAL: ${label} (NOTAS FISCAIS E BOLETOS)]\nEspecialidade: leitura de boletos, DANFEs/NF-es, identificação de fornecedores, conferência de duplicidade e preparação de propostas pendentes (dívidas, custos, estoque).\nREGRA CRÍTICA: NUNCA execute pagamentos reais, Pix ou liquidações financeiras neste grupo.`;
    case "contas_empresa":
      return `${basePrompt}\n\n[CONTEXTO DE GRUPO OPERACIONAL: ${label} (CONTAS DA EMPRESA — ADMINISTRAÇÃO)]\nEspecialidade: acompanhamento gerencial de dívidas, pagamentos, Pix Divipay, fornecedores, despesas, saldos e conciliações operacionais.\nNota: o cérebro estratégico privado (Wallet CEO) permanece inacessível em grupos; alterações críticas exigem confirmação explícita.`;
    case "conversas_loja":
      return `${basePrompt}\n\n[CONTEXTO DE GRUPO OPERACIONAL: ${label} (CONVERSAS DA LOJA)]\nEspecialidade: rotina operacional da loja, recados entre turnos, tarefas, procedimentos internos e registro de ocorrências.\nSIGILO OBRIGATÓRIO: este grupo inclui equipe operacional. É PROIBIDO divulgar saldos bancários da empresa, lucro, DRE, faturamento consolidado, dívidas corporativas ou pagamentos confidenciais a fornecedores. Se alguém pedir dados financeiros confidenciais, recuse educadamente.`;
  }
}

export function getSaoPauloDateIso(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeBrDateToIso(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = trimmed.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binStr = atob(cleaned);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

export function sanitizeAttachmentFileName(name?: string | null, mimeType?: string | null): string {
  const extFromMime = (mimeType || "").includes("pdf")
    ? "pdf"
    : (mimeType || "").includes("png")
    ? "png"
    : (mimeType || "").includes("webp")
    ? "webp"
    : (mimeType || "").includes("xml")
    ? "xml"
    : "jpg";
  const raw = (name || `anexo-${Date.now()}.${extFromMime}`).trim();
  const clean = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  return clean || `anexo-${Date.now()}.${extFromMime}`;
}

export async function uploadGroupOrPrivateAttachment(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  workspaceId: string;
  userId: string;
  grupoId?: string | null;
  conversationId: string;
  fileName?: string | null;
  mimeType: string;
  bytes: Uint8Array;
  sourceChannel: "telegram" | "web";
}): Promise<{ storagePath: string; signedUrl: string | null; fileName: string }> {
  const safeName = sanitizeAttachmentFileName(params.fileName, params.mimeType);
  const storagePath = params.grupoId
    ? `groups/${params.workspaceId}/${params.grupoId}/${Date.now()}-${safeName}`
    : `${params.userId}/${params.workspaceId}/${params.conversationId}/${Date.now()}-${safeName}`;

  try {
    const storageApi = params.supabase?.storage?.from?.("chat-attachments");
    if (storageApi && typeof storageApi.upload === "function") {
      const { error: uploadErr } = await storageApi.upload(storagePath, params.bytes, {
        contentType: params.mimeType || "application/octet-stream",
        upsert: false,
      });
      if (!uploadErr && typeof storageApi.createSignedUrl === "function") {
        const { data: signed } = await storageApi.createSignedUrl(storagePath, 3600);
        return {
          storagePath,
          signedUrl: signed?.signedUrl ?? null,
          fileName: safeName,
        };
      }
      if (uploadErr) {
        console.warn("[group-governance] Falha no upload para chat-attachments:", uploadErr.message || uploadErr);
      }
    }
  } catch (err) {
    console.warn("[group-governance] Exceção ao salvar anexo:", err);
  }

  return { storagePath, signedUrl: null, fileName: safeName };
}

export async function recordAttachmentMetadata(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  messageId?: string | null;
  conversationId: string;
  workspaceId: string;
  grupoId?: string | null;
  uploadedBy?: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  sourceChannel: "telegram" | "web" | "system";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await params.supabase.from("wallet_ai_message_attachments").insert({
      message_id: params.messageId ?? null,
      conversation_id: params.conversationId,
      workspace_id: params.workspaceId,
      grupo_id: params.grupoId ?? null,
      uploaded_by: params.uploadedBy ?? null,
      bucket: "chat-attachments",
      storage_path: params.storagePath,
      file_name: params.fileName,
      mime_type: params.mimeType,
      file_size: params.fileSize ?? null,
      source_channel: params.sourceChannel,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.warn("[group-governance] Falha ao registrar wallet_ai_message_attachments:", err);
  }
}

export interface ParsedClosingEnvelope {
  dataFechamento: string;
  caixa1: Record<string, number>;
  caixa2: Record<string, number>;
  envelopeTotal: Record<string, number>;
  sobraInformada: number | null;
  observacao: string | null;
  extractionSource: "vision_llm" | "deterministic_text" | "partial";
}

function parseBrMoneyNumber(raw?: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[R$\s]/gi, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function extractCashClosingFromTextDeterministic(
  text?: string | null,
  fallbackDate?: string,
): ParsedClosingEnvelope | null {
  const input = (text || "").trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const hasClosingKeyword =
    /\b(fechamento|caixa|envelope|sobra|gaveta|sangria|dinheiro|pix|debito|débito|credito|crédito)\b/i.test(lower);
  if (!hasClosingKeyword) return null;

  const findVal = (regex: RegExp): number | null => {
    const m = input.match(regex);
    return m?.[1] ? parseBrMoneyNumber(m[1]) : null;
  };

  const dataFechamento = normalizeBrDateToIso(input) || fallbackDate || getSaoPauloDateIso();
  const dinheiro = findVal(/dinheiro[:\s-]*r?\$?\s*([\d.,]+)/i) ?? 0;
  const pix = findVal(/pix[:\s-]*r?\$?\s*([\d.,]+)/i) ?? 0;
  const debito = findVal(/d[eé]bito[:\s-]*r?\$?\s*([\d.,]+)/i) ?? 0;
  const credito = findVal(/cr[eé]dito[:\s-]*r?\$?\s*([\d.,]+)/i) ?? 0;
  const totalExplicit = findVal(/total(?:\s+geral|\s+envelope)?[:\s-]*r?\$?\s*([\d.,]+)/i);
  const sobra = findVal(/sobra[:\s-]*r?\$?\s*([\d.,-]+)/i);
  const c1Val = findVal(/caixa\s*1[:\s-]*r?\$?\s*([\d.,]+)/i);
  const c2Val = findVal(/caixa\s*2[:\s-]*r?\$?\s*([\d.,]+)/i);

  const computedTotal = Math.round((dinheiro + pix + debito + credito) * 100) / 100;
  const envelopeGrandTotal =
    totalExplicit !== null
      ? totalExplicit
      : computedTotal > 0
      ? computedTotal
      : Math.round(((c1Val ?? 0) + (c2Val ?? 0)) * 100) / 100;

  if (
    envelopeGrandTotal === 0 &&
    dinheiro === 0 &&
    pix === 0 &&
    debito === 0 &&
    credito === 0 &&
    sobra === null &&
    c1Val === null &&
    c2Val === null
  ) {
    return null;
  }

  return {
    dataFechamento,
    caixa1: c1Val !== null ? { total: c1Val } : {},
    caixa2: c2Val !== null ? { total: c2Val } : {},
    envelopeTotal: {
      dinheiro,
      pix,
      debito,
      credito,
      total: envelopeGrandTotal,
    },
    sobraInformada: sobra,
    observacao: input.slice(0, 400),
    extractionSource: "deterministic_text",
  };
}

export async function extractCashClosingWithVision(params: {
  base64: string;
  mimeType: string;
  caption?: string | null;
  openAiApiKey?: string;
  geminiApiKey?: string;
  fallbackDate?: string;
}): Promise<ParsedClosingEnvelope> {
  const defaultDate = normalizeBrDateToIso(params.caption) || params.fallbackDate || getSaoPauloDateIso();

  const prompt = `Você é o auditor de fechamento de caixa da loja Rodo Point.
Extraia exclusivamente os valores reais legíveis nesta imagem de folha/envelope de fechamento de caixa${
    params.caption ? ` (legenda enviada: "${params.caption}")` : ""
  }.
NUNCA invente números que não estejam claramente escritos. Se um campo não aparecer, use 0 ou null.
Responda APENAS JSON válido no formato:
{
  "data_fechamento": "YYYY-MM-DD",
  "caixa1": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "total": 0 },
  "caixa2": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "total": 0 },
  "envelope_total": { "dinheiro": 0, "debito": 0, "credito": 0, "pix": 0, "total": 0 },
  "sobra_informada": null,
  "observacao": "resumo curto dos valores lidos"
}`;

  let parsedJson: Record<string, unknown> | null = null;

  if (params.openAiApiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${params.mimeType || "image/jpeg"};base64,${params.base64}` },
                },
              ],
            },
          ],
        }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content === "string") {
          parsedJson = JSON.parse(content) as Record<string, unknown>;
        }
      }
    } catch (err) {
      console.warn("[group-governance] Falha Vision OpenAI fechamento:", err);
    }
  }

  if (!parsedJson && params.geminiApiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${params.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: params.mimeType || "image/jpeg", data: params.base64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, response_mime_type: "application/json" },
          }),
        },
      );
      if (resp.ok) {
        const json = await resp.json();
        const textOut = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof textOut === "string") {
          parsedJson = JSON.parse(textOut) as Record<string, unknown>;
        }
      }
    } catch (err) {
      console.warn("[group-governance] Falha Vision Gemini fechamento:", err);
    }
  }

  const captionFallback = extractCashClosingFromTextDeterministic(params.caption, defaultDate);
  if (!parsedJson) {
    return (
      captionFallback || {
        dataFechamento: defaultDate,
        caixa1: {},
        caixa2: {},
        envelopeTotal: { dinheiro: 0, pix: 0, debito: 0, credito: 0, total: 0 },
        sobraInformada: null,
        observacao: params.caption || "Foto recebida sem leitura numérica automática.",
        extractionSource: "partial",
      }
    );
  }

  const toNumMap = (raw: unknown): Record<string, number> => {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = Math.round(n * 100) / 100;
    }
    return out;
  };

  const c1 = toNumMap(parsedJson.caixa1);
  const c2 = toNumMap(parsedJson.caixa2);
  const env = toNumMap(parsedJson.envelope_total);
  const sobraParsed =
    parsedJson.sobra_informada !== null && parsedJson.sobra_informada !== undefined && Number.isFinite(Number(parsedJson.sobra_informada))
      ? Math.round(Number(parsedJson.sobra_informada) * 100) / 100
      : captionFallback?.sobraInformada ?? null;

  const calcEnvTotal =
    Number(env.total || 0) > 0
      ? Number(env.total)
      : Math.round(((env.dinheiro || 0) + (env.pix || 0) + (env.debito || 0) + (env.credito || 0)) * 100) / 100;

  return {
    dataFechamento:
      normalizeBrDateToIso(typeof parsedJson.data_fechamento === "string" ? parsedJson.data_fechamento : null) ||
      defaultDate,
    caixa1: c1,
    caixa2: c2,
    envelopeTotal: {
      dinheiro: env.dinheiro || 0,
      pix: env.pix || 0,
      debito: env.debito || 0,
      credito: env.credito || 0,
      total: calcEnvTotal,
    },
    sobraInformada: sobraParsed,
    observacao:
      typeof parsedJson.observacao === "string"
        ? parsedJson.observacao
        : captionFallback?.observacao ?? null,
    extractionSource: "vision_llm",
  };
}

export async function processFechamentoGrupoTurn(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  workspaceId: string;
  userId: string;
  userRole: string;
  grupoId: string;
  conversationId: string;
  chatId?: string | number | null;
  attachmentPath?: string | null;
  text?: string | null;
  imageBase64?: string | null;
  mimeType?: string | null;
  openAiApiKey?: string;
  geminiApiKey?: string;
  proposalRepo?: IActionProposalRepository;
}): Promise<{
  handled: boolean;
  responseText: string;
  fechamentoId?: string;
  proposal?: ActionProposal;
}> {
  const parsed = params.imageBase64
    ? await extractCashClosingWithVision({
        base64: params.imageBase64,
        mimeType: params.mimeType || "image/jpeg",
        caption: params.text,
        openAiApiKey: params.openAiApiKey,
        geminiApiKey: params.geminiApiKey,
      })
    : extractCashClosingFromTextDeterministic(params.text);

  if (!parsed) {
    return { handled: false, responseText: "" };
  }

  // Consulta vendas reais do dia no workspace (Eyemobile PDV / transações de receita)
  const { data: daySales } = await params.supabase
    .from("transacoes")
    .select("valor, metodo_pagamento, observacoes, descricao")
    .eq("workspace_id", params.workspaceId)
    .eq("tipo", "receita")
    .eq("data", parsed.dataFechamento);

  const eyeTotals: Record<string, number> = {
    dinheiro: 0,
    pix: 0,
    debito: 0,
    credito: 0,
    outros: 0,
    total: 0,
  };

  for (const row of daySales || []) {
    const valCents = Math.round(Number(row.valor || 0) * 100);
    const mp = String(row.metodo_pagamento || "").toLowerCase();
    if (mp.includes("dinheiro") || mp === "cash") {
      eyeTotals.dinheiro += valCents;
    } else if (mp.includes("pix")) {
      eyeTotals.pix += valCents;
    } else if (mp.includes("deb")) {
      eyeTotals.debito += valCents;
    } else if (mp.includes("cred")) {
      eyeTotals.credito += valCents;
    } else {
      eyeTotals.outros += valCents;
    }
    eyeTotals.total += valCents;
  }

  for (const k of Object.keys(eyeTotals)) {
    eyeTotals[k] = Math.round(eyeTotals[k]) / 100;
  }

  const envelopeTotalNum = Number(parsed.envelopeTotal.total || 0);
  const diferencaTotal = Math.round((envelopeTotalNum - eyeTotals.total) * 100) / 100;
  const sobraFinal =
    parsed.sobraInformada !== null
      ? parsed.sobraInformada
      : parsed.envelopeTotal.dinheiro > 0
      ? Math.round((parsed.envelopeTotal.dinheiro - eyeTotals.dinheiro) * 100) / 100
      : diferencaTotal;

  let fechamentoId: string | undefined;
  try {
    const { data: inserted } = await params.supabase
      .from("fechamentos_caixa")
      .insert({
        user_id: params.userId,
        workspace_id: params.workspaceId,
        grupo_id: params.grupoId,
        conversation_id: params.conversationId,
        chat_id: params.chatId ? Number(params.chatId) : null,
        data_fechamento: parsed.dataFechamento,
        caixa1: parsed.caixa1,
        caixa2: parsed.caixa2,
        total: parsed.envelopeTotal,
        envelope_total: parsed.envelopeTotal,
        eyemobile_total: eyeTotals,
        sobra: sobraFinal,
        status: "pendente_conferencia",
        anexo_path: params.attachmentPath ?? null,
        observacao: parsed.observacao,
      })
      .select("id")
      .single();

    fechamentoId = inserted?.id;
  } catch (err) {
    console.warn("[group-governance] Falha ao gravar fechamentos_caixa:", err);
  }

  let createdProposal: ActionProposal | undefined;
  if (fechamentoId && params.proposalRepo) {
    try {
      const ctx: AiExecutionContext = {
        userId: params.userId,
        workspaceId: params.workspaceId,
        userRole: params.userRole,
        channel: "telegram",
      };
      const prepared = createPreparedProposal(ctx, {
        actionType: "confirmar_fechamento_caixa",
        summary: `Confirmar Fechamento de Caixa (${parsed.dataFechamento}) — Envelope R$ ${envelopeTotalNum.toFixed(2)} vs Eyemobile R$ ${eyeTotals.total.toFixed(2)}`,
        payload: {
          fechamento_id: fechamentoId,
          data_fechamento: parsed.dataFechamento,
          envelope_total: envelopeTotalNum,
          eyemobile_total: eyeTotals.total,
          sobra: sobraFinal,
          observacao: parsed.observacao || "",
        },
        conversationId: params.conversationId,
      });
      prepared.grupoId = params.grupoId;
      await params.proposalRepo.saveProposal(prepared);
      createdProposal = prepared;
    } catch (propErr) {
      console.warn("[group-governance] Falha ao preparar proposta de fechamento:", propErr);
    }
  }

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateBr = parsed.dataFechamento.split("-").reverse().join("/");

  const diffLabel =
    Math.abs(sobraFinal) <= 2
      ? "✅ Dentro da tolerância"
      : sobraFinal > 0
      ? `📈 Sobra apurada: ${fmt(sobraFinal)}`
      : `⚠️ Falta / divergência: ${fmt(sobraFinal)}`;

  const lines = [
    `🧾 **Conferência de Fechamento — ${dateBr}**`,
    ``,
    `📦 **Informado / Envelope:** ${fmt(envelopeTotalNum)}`,
    `• Dinheiro: ${fmt(parsed.envelopeTotal.dinheiro || 0)} | Pix: ${fmt(parsed.envelopeTotal.pix || 0)}`,
    `• Débito: ${fmt(parsed.envelopeTotal.debito || 0)} | Crédito: ${fmt(parsed.envelopeTotal.credito || 0)}`,
    ``,
    `🖥️ **Sistema (Eyemobile / Vendas do dia):** ${fmt(eyeTotals.total)} (${(daySales || []).length} vendas)`,
    `• Dinheiro: ${fmt(eyeTotals.dinheiro)} | Pix: ${fmt(eyeTotals.pix)}`,
    `• Débito: ${fmt(eyeTotals.debito)} | Crédito: ${fmt(eyeTotals.credito)}`,
    ``,
    `📊 **Resultado:** ${diffLabel}`,
    `⏳ **Status:** Pendente de conferência — confirme abaixo para homologar este fechamento.`,
  ];

  return {
    handled: true,
    responseText: lines.join("\n"),
    fechamentoId,
    proposal: createdProposal,
  };
}
