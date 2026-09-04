/**
 * DANFE Fiscal Service V2 — Módulo Reutilizável
 * 
 * Reutiliza o core determinístico de danfe-gemini-v2.ts sem duplicação de regras.
 * Suporta leitura de imagem/PDF via Gemini, validação matemática e multipágina.
 */

import {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
  parseFiscalNumber,
  formatNFeNumber,
  extractNFeNumberFromAccessKey,
  findAccessKeyInPayload,
  reconcileNFeNumber,
  type DanfeItemV2,
  type DanfeValidationResultV2,
} from "../danfe-gemini-v2.ts";

export {
  GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
  GEMINI_V2_PROMPT_TABELA,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
  parseFiscalNumber,
  formatNFeNumber,
  extractNFeNumberFromAccessKey,
  findAccessKeyInPayload,
  reconcileNFeNumber,
  type DanfeItemV2,
  type DanfeValidationResultV2,
};






export interface DanfeSessionState {
  chaveAcesso?: string | null;
  numeroNf?: string | null;
  fornecedor?: string | null;
  cnpjFornecedor?: string | null;
  dataEmissao?: string | null;
  valorProdutosDeclarado?: number;
  valorTotalNfDeclarado?: number;
  totalPaginas: number;
  paginasRecebidas: number[];
  itensAcumulados: DanfeItemV2[];
  workspaceId: string;
}

export interface ProcessDanfeInput {
  base64: string;
  mimeType: string;
  geminiApiKey: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  userId?: string;
  workspaceId: string;
  existingSession?: DanfeSessionState | null;
  fetchImpl?: typeof fetch;
  model?: string;
}

export interface ProcessDanfeOutput {
  success: boolean;
  status: "sucesso" | "parcial_multipagina" | "requer_revisao" | "erro";
  cabecalho?: {
    fornecedor?: string | null;
    cnpj_fornecedor?: string | null;
    numero_nf?: string | null;
    serie_nf?: string | null;
    data_emissao?: string | null;
    chave_acesso?: string | null;
    pagina_atual?: number;
    total_paginas?: number;
  };
  valores_totais?: {
    valor_produtos?: number;
    valor_total_nf?: number;
  };
  itens: DanfeItemV2[];
  validacao: DanfeValidationResultV2;
  mensagemFormatada: string;
  sessionState?: DanfeSessionState;
  metadata?: {
    providerPrimary: string;
    providerUsed: string;
    credentialSlot: "gemini_primary" | "gemini_backup" | "openai_fallback";
    fallbackUsed: boolean;
    fallbackCount: number;
    fallbackReason?: string;
    durationMs: number;
    correlationId: string;
  };
}

import {
  normalizeAndRotateImageMatrix,
  cropTableRegionMatrix,
  PROMPT_ORIENTACAO_DANFE,
} from "./danfe-visual-pipeline.ts";

export {
  normalizeAndRotateImageMatrix,
  cropTableRegionMatrix,
  PROMPT_ORIENTACAO_DANFE,
};

const DEFAULT_DANFE_MODEL = "gemini-3.6-flash";

export interface VisionCallOptions {
  prompt: string;
  mimeType: string;
  base64: string;
  geminiApiKey: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  model?: string;
  fetchFn: typeof fetch;
  timeoutMs?: number;
  correlationId?: string;
}

export interface VisionCallResponse {
  ok: boolean;
  status: number;
  text: string;
  providerUsed: "gemini" | "openai";
  credentialSlot: "gemini_primary" | "gemini_backup" | "openai_fallback";
  fallbackUsed: boolean;
  fallbackCount: number;
  fallbackReason?: string;
  durationMs: number;
}

export async function callVisionWithFailover(options: VisionCallOptions): Promise<VisionCallResponse> {

  const { prompt, mimeType, base64, geminiApiKey, geminiApiKeyBackup, openaiApiKey, fetchFn, correlationId } = options;
  const geminiModel = options.model || DEFAULT_DANFE_MODEL;
  const timeoutMs = options.timeoutMs || 35000;
  const start = Date.now();

  let primaryStatus = 200;
  let primaryErrorReason: string | undefined;
  let fallbackCount = 0;

  // Helper para chamar a API do Gemini
  const executeGeminiCall = async (apiKey: string, slotName: "gemini_primary" | "gemini_backup"): Promise<{ ok: boolean; status: number; text: string; errorReason?: string }> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 1 },
            },
          }),
        },
      );

      clearTimeout(timer);
      const status = resp ? resp.status : 500;

      if (resp && resp.ok) {
        const json = await resp.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { ok: true, status: resp.status, text };
      }

      let reason = `gemini_http_${status}`;
      if (status === 429) reason = "rate_limit_429";
      else if (status === 401 || status === 403) reason = `auth_error_${status}`;
      else if (status >= 500) reason = `server_error_${status}`;

      return { ok: false, status, text: "", errorReason: reason };
    } catch (err: any) {
      if (err?.name === "AbortError" || String(err?.message).includes("timeout") || String(err?.message).includes("aborted")) {
        return { ok: false, status: 504, text: "", errorReason: "timeout" };
      }
      return { ok: false, status: 500, text: "", errorReason: `network_error` };
    }
  };

  // ── 1. TENTATIVA 1: Gemini Primário (GEMINI_API_KEY) ──
  if (geminiApiKey) {
    const resPrimary = await executeGeminiCall(geminiApiKey, "gemini_primary");
    primaryStatus = resPrimary.status;

    if (resPrimary.ok) {
      console.log(`[DANFE_PROVIDER] correlation_id=${correlationId || 'anon'} provider=gemini credential_slot=gemini_primary fallback_count=0 fallback_reason=none`);
      return {
        ok: true,
        status: resPrimary.status,
        text: resPrimary.text,
        providerUsed: "gemini",
        credentialSlot: "gemini_primary",
        fallbackUsed: false,
        fallbackCount: 0,
        durationMs: Date.now() - start,
      };
    }

    primaryErrorReason = resPrimary.errorReason;
  } else {
    primaryErrorReason = "gemini_api_key_missing";
  }

  // ── 2. TENTATIVA 2: Gemini Reserva (GEMINI_API_KEY_BACKUP) ──
  const isRecoverableInfrastructureError =
    primaryStatus === 429 ||
    primaryStatus === 401 ||
    primaryStatus === 403 ||
    primaryStatus >= 500 ||
    primaryErrorReason === "timeout" ||
    primaryErrorReason === "rate_limit_429" ||
    primaryErrorReason === "network_error" ||
    primaryErrorReason === "gemini_api_key_missing";

  let backupStatus = 500;
  let backupErrorReason: string | undefined;

  if (isRecoverableInfrastructureError && geminiApiKeyBackup) {
    fallbackCount = 1;
    console.log(`[DANFE_PROVIDER] correlation_id=${correlationId || 'anon'} provider=gemini credential_slot=gemini_backup fallback_count=1 fallback_reason=${primaryErrorReason}`);

    const resBackup = await executeGeminiCall(geminiApiKeyBackup, "gemini_backup");
    backupStatus = resBackup.status;

    if (resBackup.ok) {
      return {
        ok: true,
        status: resBackup.status,
        text: resBackup.text,
        providerUsed: "gemini",
        credentialSlot: "gemini_backup",
        fallbackUsed: true,
        fallbackCount: 1,
        fallbackReason: primaryErrorReason,
        durationMs: Date.now() - start,
      };
    }

    backupErrorReason = resBackup.errorReason;
  }

  // ── 3. TENTATIVA 3: OpenAI GPT-4o Vision (OPENAI_API_KEY) ──
  const isBackupAlsoRecoverable =
    backupStatus === 429 ||
    backupStatus === 401 ||
    backupStatus === 403 ||
    backupStatus >= 500 ||
    backupErrorReason === "timeout" ||
    backupErrorReason === "rate_limit_429" ||
    backupErrorReason === "network_error" ||
    !geminiApiKeyBackup;

  if (isRecoverableInfrastructureError && isBackupAlsoRecoverable && openaiApiKey) {
    fallbackCount = geminiApiKeyBackup ? 2 : 1;
    const reportedReason = backupErrorReason || primaryErrorReason;
    console.log(`[DANFE_PROVIDER] correlation_id=${correlationId || 'anon'} provider=openai credential_slot=openai_fallback fallback_count=${fallbackCount} fallback_reason=${reportedReason}`);

    try {
      const fallbackStart = Date.now();
      const openAiUrl = "https://api.openai.com/v1/chat/completions";

      const openAiResp = await fetchFn(openAiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extraia os dados deste documento fiscal com precisão estrita em JSON." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
        }),
      });

      if (openAiResp && openAiResp.ok) {
        const oJson = await openAiResp.json();
        const text = oJson.choices?.[0]?.message?.content || "";
        return {
          ok: true,
          status: 200,
          text,
          providerUsed: "openai",
          credentialSlot: "openai_fallback",
          fallbackUsed: true,
          fallbackCount,
          fallbackReason: reportedReason,
          durationMs: Date.now() - fallbackStart,
        };
      }
    } catch (openAiErr) {
      console.error("[DANFE_FAILOVER] Provedor fallback OpenAI também falhou:", openAiErr);
    }
  }

  // ── 4. FAIL-CLOSED: Todas as tentativas falharam ──
  return {
    ok: false,
    status: primaryStatus,
    text: "",
    providerUsed: "gemini",
    credentialSlot: "gemini_primary",
    fallbackUsed: false,
    fallbackCount,
    fallbackReason: primaryErrorReason,
    durationMs: Date.now() - start,
  };
}


export async function processDanfeDocument(
  input: ProcessDanfeInput,
): Promise<ProcessDanfeOutput> {
  const fetchFn = input.fetchImpl || fetch;
  const model = input.model || DEFAULT_DANFE_MODEL;
  const effectiveOpenAiKey = input.openaiApiKey || (typeof (globalThis as any).Deno !== "undefined" ? (globalThis as any).Deno.env.get("OPENAI_API_KEY") : undefined);
  const effectiveGeminiBackupKey = input.geminiApiKeyBackup || (typeof (globalThis as any).Deno !== "undefined" ? (globalThis as any).Deno.env.get("GEMINI_API_KEY_BACKUP") : undefined);
  const correlationId = input.workspaceId || "anon";

  // Normalizar MIME type (suportar PDF e imagens corretamente)
  let cleanMimeType = "image/jpeg";
  const isPdf = input.mimeType === "application/pdf";
  if (isPdf) {
    cleanMimeType = "application/pdf";
  } else if (input.mimeType.startsWith("image/")) {
    cleanMimeType = input.mimeType;
  }

  // Sanitizar Base64: remover data URL prefix e caracteres de quebra de linha
  let cleanBase64 = String(input.base64 || "")
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/[\r\n\s]+/g, "");

  console.log(`[DANFE_FISCAL_SERVICE] Processando documento: mime=${cleanMimeType}, base64_len=${cleanBase64.length}, model=${model}`);

  if (!cleanBase64 || cleanBase64.length < 4) {
    console.warn("[DANFE_FISCAL_SERVICE] Base64 inválido ou vazio recebido");
    return {
      success: false,
      status: "erro",
      itens: [],
      validacao: { valido: false, somaItens: 0, valorReferencia: 0, diferenca: 0, status: "requer_revisao", toleranciaUtilizada: 0.05, totalItensComCamposIncompletos: 0 },
      mensagemFormatada: "⚠️ Não foi possível processar o arquivo anexado. Envie uma foto nítida ou PDF da Nota Fiscal.",
    };
  }

  // ── 0 & 1. Detecção de Orientação e Rotação Matricial (apenas para imagens) ──
  let rotationApplied: 0 | 90 | 180 | 270 = 0;
  let detectedRotation = 0;
  let orientationSource: "openai_proxy" | "gemini" | "openai" | "none" = "none";
  let docAnalysis: Record<string, any> | null = null;
  let originalWidth = 0;
  let originalHeight = 0;
  let rotatedWidth = 0;
  let rotatedHeight = 0;
  let fallbackUsedInAnyStep = false;
  let fallbackCountReported = 0;
  let fallbackReasonReported: string | undefined;
  let finalCredentialSlot: "gemini_primary" | "gemini_backup" | "openai_fallback" = "gemini_primary";
  let finalProviderUsed = "gemini";

  if (!isPdf) {
    // 1. Tentar detecção de orientação precisa com failover
    try {
      const orientCall = await callVisionWithFailover({
        prompt: PROMPT_ORIENTACAO_DANFE,
        mimeType: cleanMimeType,
        base64: cleanBase64,
        geminiApiKey: input.geminiApiKey,
        geminiApiKeyBackup: effectiveGeminiBackupKey,
        openaiApiKey: effectiveOpenAiKey,
        model,
        fetchFn,
        correlationId,
      });

      if (orientCall.ok && orientCall.text) {
        if (orientCall.fallbackUsed) {
          fallbackUsedInAnyStep = true;
          fallbackCountReported = Math.max(fallbackCountReported, orientCall.fallbackCount);
          fallbackReasonReported = orientCall.fallbackReason;
          finalCredentialSlot = orientCall.credentialSlot;
          finalProviderUsed = orientCall.providerUsed;
        }
        orientationSource = orientCall.providerUsed as any;

        const parsed = JSON.parse(orientCall.text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim());

        const degrees = Number(parsed?.orientacao_leitura ?? parsed?.orientacao ?? parsed?.rotacao);
        if ([90, 180, 270].includes(degrees)) {
          rotationApplied = degrees as 90 | 180 | 270;
          detectedRotation = degrees;
          console.log(`[DANFE_FISCAL_SERVICE] Orientação detectada: ${rotationApplied}°. Aplicando rotação matricial...`);
        } else {
          detectedRotation = 0;
          console.log(`[DANFE_FISCAL_SERVICE] Orientação normal (0°).`);
        }

        // Se a resposta contiver cabeçalho fiscal (ex: em mocks ou resposta direta), captura
        if (parsed?.cabecalho || parsed?.valores_totais) {
          docAnalysis = parsed;
        }
      }
    } catch (err) {
      console.warn("[DANFE_FISCAL_SERVICE] Falha na detecção de orientação, prosseguindo com original:", err);
    }

    // Normalização da matriz original (SEMPRE rotacionar e redimensionar antes de cabeçalho e crop)
    try {
      const matrixRes = await normalizeAndRotateImageMatrix(cleanBase64, rotationApplied);
      cleanBase64 = matrixRes.base64;
      originalWidth = matrixRes.width;
      originalHeight = matrixRes.height;
      rotatedWidth = matrixRes.width;
      rotatedHeight = matrixRes.height;
    } catch (mErr) {
      console.warn("[DANFE_FISCAL_SERVICE] Normalização matricial falhou:", mErr);
    }
  }

  // ── 2. Extração de Cabeçalho e Totais (SEMPRE sobre a imagem já rotacionada em pé) ──
  let headerHttpStatus = 200;
  let headerResponseLength = 0;

  if (!docAnalysis) {
    try {
      const headerCall = await callVisionWithFailover({
        prompt: GEMINI_V2_PROMPT_CABECALHO_E_TOTAIS,
        mimeType: cleanMimeType,
        base64: cleanBase64,
        geminiApiKey: input.geminiApiKey,
        geminiApiKeyBackup: effectiveGeminiBackupKey,
        openaiApiKey: effectiveOpenAiKey,
        model,
        fetchFn,
        correlationId,
      });

      headerHttpStatus = headerCall.status;
      if (headerCall.fallbackUsed) {
        fallbackUsedInAnyStep = true;
        fallbackCountReported = Math.max(fallbackCountReported, headerCall.fallbackCount);
        fallbackReasonReported = headerCall.fallbackReason;
        finalCredentialSlot = headerCall.credentialSlot;
        finalProviderUsed = headerCall.providerUsed;
      }

      if (headerCall.ok && headerCall.text) {
        headerResponseLength = headerCall.text.length;
        docAnalysis = JSON.parse(
          headerCall.text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim(),
        );
        console.log(`[DANFE_FISCAL_SERVICE] Cabeçalho extraído com sucesso (provider=${headerCall.providerUsed}, slot=${headerCall.credentialSlot}): fornecedor=${docAnalysis?.cabecalho?.fornecedor || docAnalysis?.fornecedor}, NF=${docAnalysis?.cabecalho?.numero_nf || docAnalysis?.numero_nf}`);
      }
    } catch (err) {
      console.error("[DANFE_FISCAL_SERVICE] Erro ao extrair cabeçalho:", err instanceof Error ? err.message : String(err));
    }
  }

  // ── 3. Recorte (Crop) Contínuo da Tabela com Fallback Garantido (0.24 - 0.90) ──
  let tableImageBase64 = cleanBase64;
  let cropSource: "detected" | "fallback" = "fallback";
  let topRatio = 0.24;
  let bottomRatio = 0.90;
  let cropWidth = rotatedWidth || originalWidth || 2048;
  let cropHeight = Math.floor((rotatedHeight || originalHeight || 2048) * (bottomRatio - topRatio));

  if (!isPdf) {
    const regiao = docAnalysis?.regiao_tabela_produtos;
    if (regiao && typeof regiao.top === "number" && regiao.top >= 0.05 && regiao.top <= 0.60) {
      topRatio = regiao.top;
      cropSource = "detected";
    }
    if (regiao && typeof regiao.bottom === "number" && regiao.bottom >= 0.50 && regiao.bottom <= 0.98) {
      bottomRatio = regiao.bottom;
    }

    try {
      const cropRes = await cropTableRegionMatrix(cleanBase64, topRatio, bottomRatio);
      tableImageBase64 = cropRes.base64;
      cropHeight = Math.floor((rotatedHeight || 2048) * (bottomRatio - topRatio));
      console.log(`[DANFE_FISCAL_SERVICE] Recorte da tabela aplicado (${cropSource}: top ${Math.round(topRatio * 100)}% - bottom ${Math.round(bottomRatio * 100)}%)`);
    } catch (err) {
      console.warn("[DANFE_FISCAL_SERVICE] Falha ao recortar tabela, usando imagem completa:", err);
    }
  }

  // ── 4. Extração de Itens da Tabela com Failover ───────────────────────────
  let rawItemsList: any[] = [];
  let productsHttpStatus = 200;
  let productsResponseLength = 0;

  try {
    const productsCall = await callVisionWithFailover({
      prompt: GEMINI_V2_PROMPT_TABELA,
      mimeType: cleanMimeType,
      base64: tableImageBase64,
      geminiApiKey: input.geminiApiKey,
      geminiApiKeyBackup: effectiveGeminiBackupKey,
      openaiApiKey: effectiveOpenAiKey,
      model,
      fetchFn,
      correlationId,
    });

    productsHttpStatus = productsCall.status;
    if (productsCall.fallbackUsed) {
      fallbackUsedInAnyStep = true;
      fallbackCountReported = Math.max(fallbackCountReported, productsCall.fallbackCount);
      fallbackReasonReported = productsCall.fallbackReason;
      finalCredentialSlot = productsCall.credentialSlot;
      finalProviderUsed = productsCall.providerUsed;
    }

    if (productsCall.ok && productsCall.text) {
      productsResponseLength = productsCall.text.length;
      const parsed = JSON.parse(
        productsCall.text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim(),
      );
      if (Array.isArray(parsed)) rawItemsList = parsed;
      else if (Array.isArray(parsed?.itens)) rawItemsList = parsed.itens;
      else if (Array.isArray(parsed?.produtos)) rawItemsList = parsed.produtos;
      console.log(`[DANFE_FISCAL_SERVICE] Tabela de itens extraída (provider=${productsCall.providerUsed}, slot=${productsCall.credentialSlot}): ${rawItemsList.length} itens brutos`);
    }
  } catch (err) {
    console.error("[DANFE_FISCAL_SERVICE] Erro ao extrair tabela:", err instanceof Error ? err.message : String(err));
  }


  // ── 5. Validação Estrutural Estrita de Produtos ───────────────────────────
  const itensValidados: DanfeItemV2[] = [];
  const discardReasons: string[] = [];

  for (const raw of rawItemsList) {
    const res = validateProductRowV2(raw);
    if (res.isValid && res.item) {
      itensValidados.push(res.item);
    } else if (res.motivo) {
      discardReasons.push(res.motivo);
    }
  }

  // Log detalhado [DANFE_TABLE_TRACE]
  console.log(
    `[DANFE_TABLE_TRACE] ` +
    `originalWidth=${originalWidth} originalHeight=${originalHeight} ` +
    `detectedRotation=${detectedRotation} rotationApplied=${rotationApplied} ` +
    `rotatedWidth=${rotatedWidth} rotatedHeight=${rotatedHeight} ` +
    `cropTop=${topRatio.toFixed(2)} cropBottom=${bottomRatio.toFixed(2)} ` +
    `cropWidth=${cropWidth} cropHeight=${cropHeight} ` +
    `rawItemsCount=${rawItemsList.length} parsedItemsCount=${rawItemsList.length} ` +
    `validatedItemsCount=${itensValidados.length} ` +
    `discardReasons="${discardReasons.slice(0, 3).join('; ') || 'none'}" ` +
    `fallbackUsed=${fallbackUsedInAnyStep} fallbackReason="${fallbackReasonReported || 'none'}" ` +
    `correlation_id=${input.workspaceId || 'anon'}`
  );


  // ── 4. Normalização Determinística de Cabeçalho e Totais (com Aliases) ────
  const rawCabecalho = docAnalysis?.cabecalho || docAnalysis || {};
  const rawTotais = docAnalysis?.valores_totais || docAnalysis?.totais || docAnalysis || {};

  const fornecedor = (
    rawCabecalho.fornecedor ||
    rawCabecalho.emitente ||
    rawCabecalho.razao_social ||
    rawCabecalho.nome_fornecedor ||
    docAnalysis?.fornecedor ||
    docAnalysis?.emitente ||
    docAnalysis?.razao_social ||
    null
  );

  const cnpjFornecedor = (
    rawCabecalho.cnpj_fornecedor ||
    rawCabecalho.cnpj_emitente ||
    rawCabecalho.cnpj ||
    docAnalysis?.cnpj_fornecedor ||
    docAnalysis?.cnpj_emitente ||
    docAnalysis?.cnpj ||
    null
  );

  const numeroNf = (
    rawCabecalho.numero_nf ||
    rawCabecalho.numero ||
    rawCabecalho.n_nf ||
    docAnalysis?.numero_nf ||
    docAnalysis?.numero ||
    docAnalysis?.n_nf ||
    null
  );

  const serieNf = (
    rawCabecalho.serie_nf ||
    rawCabecalho.serie ||
    docAnalysis?.serie_nf ||
    docAnalysis?.serie ||
    null
  );

  const dataEmissao = (
    rawCabecalho.data_emissao ||
    rawCabecalho.emissao ||
    docAnalysis?.data_emissao ||
    docAnalysis?.emissao ||
    null
  );

  const chaveAcesso = (
    findAccessKeyInPayload(rawCabecalho) ||
    findAccessKeyInPayload(docAnalysis) ||
    rawCabecalho.chave_acesso ||
    rawCabecalho.chave ||
    docAnalysis?.chave_acesso ||
    docAnalysis?.chave ||
    null
  );

  // Conciliação Determinística do Número da NF e Série com a Chave de Acesso Oficial (44 dígitos)
  const reconciledNfe = reconcileNFeNumber(numeroNf, serieNf, chaveAcesso, input.workspaceId || "anon", "wallet");
  const numeroNfFinal = reconciledNfe.numero_nf_formatado || formatNFeNumber(numeroNf) || numeroNf;
  const serieNfFinal = reconciledNfe.serie_nf || serieNf;


  const paginaAtual = Number(rawCabecalho.pagina_atual || docAnalysis?.pagina_atual) || 1;
  const totalPaginas = Number(rawCabecalho.total_paginas || docAnalysis?.total_paginas) || 1;

  // Parsing Monetário com parseFiscalNumber (suporta "1.105,25", "1105.25", 1105.25)
  const valorProdutosRaw = rawTotais.valor_produtos ?? rawTotais.total_produtos ?? rawTotais.valor_total_produtos ?? docAnalysis?.valor_produtos;
  const valorTotalNfRaw = rawTotais.valor_total_nf ?? rawTotais.valor_total ?? rawTotais.total_nota ?? docAnalysis?.valor_total_nf;

  const valorProdutosDeclaradoNF = valorProdutosRaw != null ? parseFiscalNumber(valorProdutosRaw) : 0;
  const valorTotalNf = valorTotalNfRaw != null ? parseFiscalNumber(valorTotalNfRaw) : valorProdutosDeclaradoNF;

  const cabecalhoConsolidado = {
    fornecedor,
    cnpj_fornecedor: cnpjFornecedor,
    numero_nf: numeroNfFinal,
    serie_nf: serieNfFinal,
    data_emissao: dataEmissao,
    chave_acesso: chaveAcesso,
    pagina_atual: paginaAtual,
    total_paginas: totalPaginas,
  };

  const valoresTotaisConsolidados = {
    valor_produtos: valorProdutosDeclaradoNF,
    valor_total_nf: valorTotalNf,
  };

  // ── 5. Gestão de Multipágina ─────────────────────────────────────────────
  let itensFinais: DanfeItemV2[] = itensValidados;
  let session: DanfeSessionState;

  if (input.existingSession && input.existingSession.workspaceId === input.workspaceId) {
    // Mescla itens da folha complementar
    session = {
      ...input.existingSession,
      fornecedor: input.existingSession.fornecedor || fornecedor,
      cnpjFornecedor: input.existingSession.cnpjFornecedor || cnpjFornecedor,
      numeroNf: input.existingSession.numeroNf || numeroNfFinal,
      dataEmissao: input.existingSession.dataEmissao || dataEmissao,
      valorProdutosDeclarado: input.existingSession.valorProdutosDeclarado || valorProdutosDeclaradoNF,
      valorTotalNfDeclarado: input.existingSession.valorTotalNfDeclarado || valorTotalNf,
      paginasRecebidas: Array.from(new Set([...input.existingSession.paginasRecebidas, paginaAtual])).sort((a, b) => a - b),
      itensAcumulados: reconcileAndDeduplicateV2(input.existingSession.itensAcumulados || [], itensValidados || []),
    };

    itensFinais = session.itensAcumulados;
  } else {
    // Nova sessão
    session = {
      chaveAcesso,
      numeroNf: numeroNfFinal,
      fornecedor,
      cnpjFornecedor,
      dataEmissao,
      valorProdutosDeclarado: valorProdutosDeclaradoNF,
      valorTotalNfDeclarado: valorTotalNf,
      totalPaginas,
      paginasRecebidas: [paginaAtual],
      itensAcumulados: itensFinais,
      workspaceId: input.workspaceId,
    };
  }

  // Verifica se faltam páginas
  const isMultipaginaPendente =
    session.totalPaginas > 1 && session.paginasRecebidas.length < session.totalPaginas;

  if (isMultipaginaPendente) {
    const paginasFaltantes = Array.from(
      { length: session.totalPaginas },
      (_, i) => i + 1,
    ).filter((p) => !session.paginasRecebidas.includes(p));

    const msg = [
      `🧾 **Nota Fiscal identificada (Multipágina)**`,
      ``,
      `• **Fornecedor:** ${session.fornecedor || "Não identificado"}`,
      `• **NF:** ${session.numeroNf || "Sem número"}`,
      `• **Páginas:** ${paginaAtual}/${session.totalPaginas}`,
      `• **Itens lidos nesta folha:** ${itensValidados.length}`,
      ``,
      `⏳ Recebi a página ${paginaAtual} de ${session.totalPaginas}.`,
      `Estou aguardando a página ${paginasFaltantes.join(", ")} para consolidar o documento completo.`,
      ``,
      `🔒 *Nenhuma alteração foi feita no estoque.*`,
    ].join("\n");

    return {
      success: true,
      status: "parcial_multipagina",
      cabecalho: { ...cabecalhoConsolidado, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
      valores_totais: valoresTotaisConsolidados,
      itens: itensFinais,
      validacao: {
        valido: false,
        status: "requer_revisao",
        somaItens: itensFinais.reduce((s, it) => s + it.valor_total, 0),
        valorReferencia: valorProdutosDeclaradoNF,
        diferenca: 0,
        toleranciaUtilizada: 0.05,
        motivo: "Aguardando páginas complementares da DANFE",
        totalItensComCamposIncompletos: 0,
      },
      mensagemFormatada: msg,
      sessionState: session,
    };
  }

  // ── 6. Validação Matemática Determinística ────────────────────────────────
  const valorProdutosCalculadoItens = +(itensFinais.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)).toFixed(2);
  const refProdutos = session.valorProdutosDeclarado || valorProdutosDeclaradoNF;
  const validacao = validateDanfeMathV2(itensFinais, refProdutos);

  const statusFinal: "sucesso" | "requer_revisao" = validacao.valido
    ? "sucesso"
    : "requer_revisao";

  const fmtCurrency = (val: number | null | undefined) =>
    val != null && !isNaN(Number(val))
      ? Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s+/g, " ")
      : "R$ 0,00";


  const dataEmissaoFormatada = (session.dataEmissao || dataEmissao)
    ? String(session.dataEmissao || dataEmissao).split("T")[0].split("-").reverse().join("/")
    : "Não identificada";

  const valorTotalNfFormatado = valorTotalNf > 0 ? fmtCurrency(valorTotalNf) : "Não identificado";
  const valorProdutosDeclaradoFormatado = refProdutos > 0 ? fmtCurrency(refProdutos) : "Não identificado";
  const somaItensFormatada = fmtCurrency(valorProdutosCalculadoItens);

  // Lista COMPLETA de todos os produtos (sem limitação artificial)
  const itensFormatados = itensFinais.map((it, idx) => {
    const qtd = it.quantidade != null ? `${it.quantidade} ${it.unidade || "UN"}` : "Qtd N/A";
    const vUnit = fmtCurrency(it.valor_unitario);
    const vTot = fmtCurrency(it.valor_total);
    const vLiq = fmtCurrency(it.custo_unitario_liquido || it.valor_unitario);
    return [
      `${idx + 1}. **${it.descricao || "Produto"}**`,
      `   📦 ${qtd} × ${vUnit}`,
      `   💰 Total: ${vTot} | Custo Líquido: **${vLiq}**`,
    ].join("\n");
  }).join("\n\n");

  const msgLines = [
    `📄 **Nota Fiscal de Compra Identificada!**`,
    ``,
    `🏢 **Fornecedor:** ${session.fornecedor || fornecedor || "Não identificado"}`,
    (session.cnpjFornecedor || cnpjFornecedor) ? `🔢 **CNPJ:** ${session.cnpjFornecedor || cnpjFornecedor}` : null,
    `📋 **NF:** ${session.numeroNf || numeroNf || "Sem número"}${serieNf ? ` (Série ${serieNf})` : ""}`,
    `📅 **Emissão:** ${dataEmissaoFormatada}`,
    `💵 **Valor Total da Nota:** ${valorTotalNfFormatado}`,
    `📄 **Valor dos Produtos na NF:** ${valorProdutosDeclaradoFormatado}`,
    `📦 **Itens:** ${itensFinais.length} produtos`,
    ``,
    itensFormatados || "  • Nenhum item identificado",
    ``,
    `────────────────`,
    `💰 **Soma dos produtos extraídos:** ${somaItensFormatada}`,
    `📄 **Valor dos produtos na NF:** ${valorProdutosDeclaradoFormatado}`,
    validacao.valido
      ? `✅ **Valores conferidos**`
      : `⚠️ **Requer Revisão:** ${validacao.motivo || "Divergência matemática"}`,
    ``,
    `🔒 *Nenhuma alteração foi feita no estoque.*`,
  ];

  return {
    success: true,
    status: statusFinal,
    cabecalho: { ...cabecalhoConsolidado, pagina_atual: paginaAtual, total_paginas: session.totalPaginas },
    valores_totais: { valor_produtos: refProdutos, valor_total_nf: valorTotalNf },
    itens: itensFinais,
    validacao,
    mensagemFormatada: msgLines.filter((l) => l !== null && l !== undefined).join("\n"),
    sessionState: session,
    metadata: {
      providerPrimary: "gemini",
      providerUsed: finalProviderUsed,
      credentialSlot: finalCredentialSlot,
      fallbackUsed: fallbackUsedInAnyStep,
      fallbackCount: fallbackCountReported,
      fallbackReason: fallbackReasonReported,
      durationMs: 0,
      correlationId: correlationId,
    },
  };
}



