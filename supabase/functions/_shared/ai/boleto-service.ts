/**
 * Boleto Service — Extração e Formatação Segura de Boletos (Etapa 2.2A)
 * 
 * Pipeline:
 * Imagem/PDF -> Gemini 2.5 Flash / Failover OpenAI Vision -> Validação Determinística -> Proposta Revisável
 * 
 * Regras de Segurança:
 * - Nenhuma mutação de banco de dados (sem cadastro automático)
 * - Divergências marcam status: requer_revisao com explicação detalhada
 * - Não expõe chaves nem dados sensíveis em logs
 */

import {
  cleanDigits,
  validateLinhaDigitavel,
  reconcileBoleto,
  normalizeDate,
  parseBoletoAmount,
  type BoletoValidationResult,
} from "./boleto-validator.ts";

export interface ProcessBoletoInput {
  base64: string;
  mimeType: string;
  geminiApiKey: string;
  geminiApiKeyBackup?: string;
  openaiApiKey?: string;
  workspaceId: string;
  fetchImpl?: typeof fetch;
}

export interface BoletoExtractedData {
  banco?: string | null;
  beneficiario?: string | null;
  cnpj_cpf_beneficiario?: string | null;
  pagador?: string | null;
  cnpj_cpf_pagador?: string | null;
  data_vencimento?: string | null;
  valor?: number | string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  nosso_numero?: string | null;
  numero_documento?: string | null;
  agencia_codigo_beneficiario?: string | null;
  juros_multa?: number | null;
  desconto?: number | null;
  data_emissao?: string | null;
}

export interface ProcessBoletoOutput {
  success: boolean;
  status: "sucesso" | "requer_revisao";
  dados: BoletoExtractedData;
  validacao: BoletoValidationResult;
  mensagemFormatada: string;
  error?: string;
}

export const GEMINI_BOLETO_PROMPT = `Você é um especialista em leitura e extração de boletos bancários e guias de arrecadação brasileiras.

Analise esta imagem ou documento PDF de boleto e extraia os campos com máxima fidelidade e exatidão:

1. BANCO: Nome do banco e código (ex: "Itaú Unibanco (341)", "Banco do Brasil (001)", "Bradesco (237)", "Caixa", etc.)
2. BENEFICIÁRIO (CEDENTE): Transcreva EXATAMENTE os caracteres literais impressos no campo Beneficiário/Cedente do documento. NÃO altere letras, NÃO complete palavras por adivinhação, NÃO deduza nomes de empresas conhecidas e NÃO use conhecimento prévio. Se estiver visível apenas "SPAL INDUSTRIA BRASILEIRA DE", transcreva exatamente isso sem inventar caracteres.
3. CNPJ/CPF DO BENEFICIÁRIO: Apenas números ou formatado.
4. PAGADOR (SACADO): Nome da pessoa/empresa que deve pagar.
5. CNPJ/CPF DO PAGADOR: Se visível.
6. DATA DE VENCIMENTO: Data de vencimento no formato YYYY-MM-DD (ou DD/MM/YYYY).
7. VALOR DO DOCUMENTO: Valor nominal a ser pago (ex: 1250.00).
8. LINHA DIGITÁVEL: A sequência de 47 ou 48 dígitos que aparece no topo ou rodapé do boleto (com ou sem pontos/espaços).
9. CÓDIGO DE BARRAS: Sequência de 44 dígitos se estiver expressa numericamente.
10. NOSSO NÚMERO: Código de identificação do título.
11. NÚMERO DO DOCUMENTO / SEU NÚMERO: Número da fatura ou documento de referência.
12. AGÊNCIA / CÓDIGO BENEFICIÁRIO: Código da agência e conta do cedente.
13. DATA DO DOCUMENTO / EMISSÃO: Data de emissão se disponível.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "banco": "string ou null",
  "beneficiario": "string ou null",
  "cnpj_cpf_beneficiario": "string ou null",
  "pagador": "string ou null",
  "cnpj_cpf_pagador": "string ou null",
  "data_vencimento": "YYYY-MM-DD ou DD/MM/YYYY ou null",
  "valor": 0.00,
  "linha_digitavel": "string ou null",
  "codigo_barras": "string ou null",
  "nosso_numero": "string ou null",
  "numero_documento": "string ou null",
  "agencia_codigo_beneficiario": "string ou null",
  "data_emissao": "string ou null"
}`;

export interface VisionBoletoCallOptions {
  prompt: string;
  mimeType: string;
  base64: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  fetchFn: typeof fetch;
  timeoutMs?: number;
  correlationId?: string;
}

export interface VisionBoletoCallResponse {
  ok: boolean;
  status: number;
  text: string;
  providerUsed: "openai" | "gemini";
  credentialSlot: "openai_primary" | "gemini_backup" | "gemini_secondary";
  fallbackUsed: boolean;
  fallbackCount: number;
  fallbackReason?: string;
  durationMs: number;
}

/**
 * Chamada Vision especializada para Boletos com prioridade:
 * 1. OpenAI GPT-4o Vision (Primário)
 * 2. Google Gemini 3.7 Flash (Fallback com fail-closed)
 */
export async function callBoletoVisionWithFailover(options: VisionBoletoCallOptions): Promise<VisionBoletoCallResponse> {
  const { prompt, mimeType, base64, openaiApiKey, geminiApiKey, geminiApiKeyBackup, fetchFn, correlationId } = options;
  const timeoutMs = options.timeoutMs || 40000;
  const start = Date.now();

  let primaryStatus = 200;
  let primaryErrorReason: string | undefined;

  // ── 1. TENTATIVA 1: OpenAI GPT-4o Vision (Primário) ──
  if (openaiApiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const oResp = await fetchFn("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extraia os dados do boleto com fidelidade absoluta em JSON puro." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
              ],
            },
          ],
        }),
      });

      clearTimeout(timer);
      primaryStatus = oResp.status;

      if (oResp.ok) {
        const oJson = await oResp.json();
        const text = oJson.choices?.[0]?.message?.content || "";
        console.log(`[BOLETO_PROVIDER] correlation_id=${correlationId || 'anon'} provider=openai credential_slot=openai_primary fallback_count=0 fallback_reason=none`);
        return {
          ok: true,
          status: oResp.status,
          text,
          providerUsed: "openai",
          credentialSlot: "openai_primary",
          fallbackUsed: false,
          fallbackCount: 0,
          durationMs: Date.now() - start,
        };
      }

      primaryErrorReason = `openai_http_${primaryStatus}`;
    } catch (err: unknown) {
      primaryErrorReason = (err instanceof Error && err.name === "AbortError") ? "timeout" : "network_error";
    }
  } else {
    primaryErrorReason = "openai_api_key_missing";
  }

  // ── 2. TENTATIVA 2: Google Gemini 3.7 Flash (Fallback) ──
  const effectiveGeminiKey = geminiApiKey || geminiApiKeyBackup;
  if (effectiveGeminiKey) {
    console.log(`[BOLETO_PROVIDER] correlation_id=${correlationId || 'anon'} provider=gemini credential_slot=gemini_backup fallback_count=1 fallback_reason=${primaryErrorReason}`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const targetModel = "gemini-3.7-flash";
      const gResp = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${effectiveGeminiKey}`,
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
            },
          }),
        }
      );

      clearTimeout(timer);

      if (gResp.ok) {
        const gJson = await gResp.json();
        const text = gJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return {
          ok: true,
          status: gResp.status,
          text,
          providerUsed: "gemini",
          credentialSlot: "gemini_backup",
          fallbackUsed: true,
          fallbackCount: 1,
          fallbackReason: primaryErrorReason,
          durationMs: Date.now() - start,
        };
      }
    } catch (gemErr: unknown) {
      console.warn("[BOLETO_FAILOVER] Provedor fallback Gemini também falhou:", gemErr);
    }
  }

  // ── 3. FAIL-CLOSED: Nenhum provedor conseguiu responder ──
  return {
    ok: false,
    status: primaryStatus,
    text: "",
    providerUsed: "openai",
    credentialSlot: "openai_primary",
    fallbackUsed: false,
    fallbackCount: 1,
    fallbackReason: primaryErrorReason,
    durationMs: Date.now() - start,
  };
}

export interface FocusedBeneficiaryResult {
  beneficiario: string | null;
  provider: string;
  extraction_type: "focused";
}

/**
 * Realiza uma transcrição literal focalizada exclusivamente no campo Beneficiário/Cedente do documento.
 * Regra: Não altera linha, valor ou vencimento.
 */
export async function extractFocusedBeneficiary(params: {
  base64: string;
  mimeType: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<FocusedBeneficiaryResult> {
  const {
    base64,
    mimeType,
    openaiApiKey,
    geminiApiKey,
    timeoutMs = 25000,
    fetchImpl = fetch,
  } = params;

  const prompt = `Localize o campo Beneficiário ou Cedente.

Transcreva EXATAMENTE os caracteres impressos nesse campo.

Regras:
- copie literalmente;
- não complete razão social;
- não corrija nomes;
- não use conhecimento sobre empresas;
- não deduza texto cortado;
- preserve somente caracteres realmente visíveis;
- se não conseguir ler com segurança, retorne null.

Retorne JSON:
{
  "beneficiario": string | null
}`;

  // 1. Primário: OpenAI GPT-4o
  if (openaiApiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Extrator especialista em transcrição literal de documentos. Responda estritamente com JSON." },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
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

      clearTimeout(timer);

      if (resp.ok) {
        const json = await resp.json();
        const rawContent = json.choices?.[0]?.message?.content?.trim() || "";
        const parsed = JSON.parse(rawContent);
        const benef = typeof parsed.beneficiario === "string" && parsed.beneficiario.trim().length > 0
          ? parsed.beneficiario.trim()
          : null;

        return {
          beneficiario: benef,
          provider: "openai_gpt4o",
          extraction_type: "focused",
        };
      }
    } catch (err) {
      console.warn("[FOCUSED_BENEFICIARY] Falha na extração GPT-4o:", err);
    }
  }

  // 2. Fallback: Gemini 3.7 Flash
  if (geminiApiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const gResp = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${geminiApiKey}`,
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
            },
          }),
        }
      );

      clearTimeout(timer);

      if (gResp.ok) {
        const gJson = await gResp.json();
        const text = gJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = JSON.parse(text);
        const benef = typeof parsed.beneficiario === "string" && parsed.beneficiario.trim().length > 0
          ? parsed.beneficiario.trim()
          : null;

        return {
          beneficiario: benef,
          provider: "gemini_3.7_flash",
          extraction_type: "focused",
        };
      }
    } catch (err) {
      console.warn("[FOCUSED_BENEFICIARY] Falha no fallback Gemini:", err);
    }
  }

  return {
    beneficiario: null,
    provider: "none",
    extraction_type: "focused",
  };
}

export interface FocusedBoletoLineCandidate {
  linha_raw: string | null;
  linha_digits: string;
  digit_count: number;
  codigo_barras?: string | null;
  valor_visual?: number | null;
  vencimento_visual?: string | null;
  provider: "openai" | "gemini";
  attempt: number;
  region: "full_focused" | "lower_half" | "lower_third";
  latency_ms: number;
  field_lengths?: string;
}

export interface RegionCandidate {
  region: "full_focused" | "lower_half" | "lower_third";
  base64: string;
  original_width?: number;
  original_height?: number;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
}

export interface RecoverBoletoLineOptions {
  base64: string;
  mimeType: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  correlationId?: string;
  regionCandidates?: RegionCandidate[];
}

export interface RecoverBoletoLineResult {
  recovered: boolean;
  successfulCandidate?: FocusedBoletoLineCandidate;
  validationResult?: BoletoValidationResult;
  allCandidates: FocusedBoletoLineCandidate[];
  attemptsCount: number;
}

export const FOCUSED_BOLETO_LINE_PROMPT = `Você é um leitor óptico especializado em Ficha de Compensação de boletos bancários brasileiros.

Localize a LINHA DIGITÁVEL impressa na FICHA DE COMPENSAÇÃO (geralmente acima ou abaixo do código de barras).

Transcreva os 5 CAMPOS NUMÉRICOS EXATOS que compõem a linha digitável:
- campo1: exatamente 10 dígitos numéricos (primeiros 5 dígitos + ponto + 5 dígitos);
- campo2: exatamente 11 dígitos numéricos;
- campo3: exatamente 11 dígitos numéricos;
- dv_geral: exatamente 1 dígito numérico isolado (dígito verificador geral);
- campo5: exatamente 14 dígitos numéricos (fator de vencimento de 4 dígitos + valor nominal de 10 dígitos).

REGRAS RÍGIDAS DE TRANSCRIÇÃO:
1. Transcreva LITERALMENTE o que está visível no documento;
2. NÃO calcule;
3. NÃO corrija números;
4. NÃO complete dígitos ausentes;
5. NÃO use conhecimento de FEBRABAN para inferir dígitos;
6. Se algum campo não estiver legível, retorne null para esse campo;
7. ATENÇÃO ESPECIAL À FRONTEIRA ENTRE "dv_geral" E "campo5":
   - "dv_geral" e "campo5" são DOIS campos separados por espaço;
   - Exemplo conceitual: se estiver impresso "... [DV de 1 dígito] [campo5 de 14 dígitos]", certifique-se de capturar o DV em "dv_geral" (1 dígito) e todos os 14 dígitos em "campo5";
   - Mesmo que o DV seja "1" e o campo5 comece com "1" (ex: "... 1 15580000060247"), transcreva "dv_geral": "1" e "campo5": "15580000060247";
8. NÃO use o valor nominal ou datas impressas para deduzir/reconstruir o campo5; transcreva estritamente os caracteres impressos.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "campo1": "string de 10 dígitos numéricos ou null",
  "campo2": "string de 11 dígitos numéricos ou null",
  "campo3": "string de 11 dígitos numéricos ou null",
  "dv_geral": "string de 1 dígito numérico ou null",
  "campo5": "string de 14 dígitos numéricos ou null",
  "linha_digitavel": "string de 47 dígitos contínuos sem pontos/espaços ou null",
  "codigo_barras": "string de 44 dígitos se visíveis numericamente ou null",
  "valor_visual": 0.00,
  "vencimento_visual": "YYYY-MM-DD ou DD/MM/YYYY ou null"
}`;

/**
 * Executa uma tentativa de extração focalizada de linha em um provedor e região específicos.
 */
async function executeFocusedLineAttempt(params: {
  provider: "openai" | "gemini";
  region: "full_focused" | "lower_half" | "lower_third";
  attempt: number;
  base64: string;
  mimeType: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<FocusedBoletoLineCandidate | null> {
  const { provider, region, attempt, base64, mimeType, apiKey, fetchImpl, timeoutMs } = params;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let rawJsonText = "";

    if (provider === "openai") {
      const resp = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Extrator especialista em transcrição literal de linha digitável bancária. Responda estritamente com JSON." },
            {
              role: "user",
              content: [
                { type: "text", text: FOCUSED_BOLETO_LINE_PROMPT },
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
      clearTimeout(timer);
      if (resp.ok) {
        const json = await resp.json();
        rawJsonText = json.choices?.[0]?.message?.content?.trim() || "";
      }
    } else if (provider === "gemini") {
      const resp = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: FOCUSED_BOLETO_LINE_PROMPT },
                  { inline_data: { mime_type: mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
            },
          }),
        }
      );
      clearTimeout(timer);
      if (resp.ok) {
        const gJson = await resp.json();
        rawJsonText = gJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
    }

    if (!rawJsonText) return null;

    const parsed = JSON.parse(rawJsonText.replace(/```json|```/g, "").trim());

    // 1. Extração segmentada por campos
    const c1 = parsed.campo1 ? cleanDigits(String(parsed.campo1)) : "";
    const c2 = parsed.campo2 ? cleanDigits(String(parsed.campo2)) : "";
    const c3 = parsed.campo3 ? cleanDigits(String(parsed.campo3)) : "";
    const dv = parsed.dv_geral ? cleanDigits(String(parsed.dv_geral)) : "";
    const c5 = parsed.campo5 ? cleanDigits(String(parsed.campo5)) : "";

    const fieldLengths = `${c1.length},${c2.length},${c3.length},${dv.length},${c5.length}`;

    let digits = "";
    let rawLinha: string | null = null;

    if (c1.length === 10 && c2.length === 11 && c3.length === 11 && dv.length === 1 && c5.length === 14) {
      digits = c1 + c2 + c3 + dv + c5;
      rawLinha = `${c1} ${c2} ${c3} ${dv} ${c5}`;
    } else {
      // 2. Compatibilidade com linha direta integral (se vier completa com 47 dígitos)
      const rawFallback = typeof parsed.linha_digitavel === "string" ? parsed.linha_digitavel.trim() : null;
      const digitsFallback = rawFallback ? cleanDigits(rawFallback) : "";
      if (digitsFallback.length === 47) {
        digits = digitsFallback;
        rawLinha = rawFallback;
      } else {
        digits = digitsFallback || (c1 + c2 + c3 + dv + c5);
        rawLinha = rawFallback || (digits.length > 0 ? digits : null);
      }
    }

    return {
      linha_raw: rawLinha,
      linha_digits: digits,
      digit_count: digits.length,
      codigo_barras: parsed.codigo_barras ? String(parsed.codigo_barras).trim() : null,
      valor_visual: parseBoletoAmount(parsed.valor_visual),
      vencimento_visual: parsed.vencimento_visual ? String(parsed.vencimento_visual).trim() : null,
      provider,
      attempt,
      region,
      latency_ms: Date.now() - start,
      field_lengths: fieldLengths,
    };
  } catch (err) {
    console.warn(`[BOLETO_RECOVERY_ATTEMPT_ERR] provider=${provider} region=${region} attempt=${attempt} err=${err}`);
    return null;
  }
}

/**
 * Pipeline de auto-recuperação focalizada e fail-closed de linha digitável.
 *
 * Regras Rígidas:
 * 1. Cada candidato é 100% autônomo e integral — NUNCA misturar blocos de provedores diferentes.
 * 2. Validação determinística FEBRABAN após cada tentativa — encerra imediatamente no primeiro candidato matematicamente válido.
 * 3. Se nenhum candidato for válido, encerra com recovered=false (sem chutar nem afrouxar regras).
 *
 * Telemetria:
 * - CROP_ATTEMPT: region, original_width, original_height, crop_x, crop_y, crop_width, crop_height
 * - BOLETO_RECOVERY_ATTEMPT: provider, model, region, digit_count, validation_result, validation_errors, latency_ms
 * - BOLETO_RECOVERY_SUCCESS: provider, model, region, digit_count, valor_derivado, vencimento_derivado
 * - BOLETO_RECOVERY_FAILED: attempt_count, reason
 *
 * Segurança: NUNCA loga base64, imagem, API keys, tokens ou secrets.
 */
export async function recoverBoletoLineWithFailover(
  options: RecoverBoletoLineOptions
): Promise<RecoverBoletoLineResult> {
  const {
    base64,
    mimeType,
    openaiApiKey,
    geminiApiKey,
    geminiApiKeyBackup,
    fetchImpl = fetch,
    timeoutMs = 25000,
    correlationId = "none",
  } = options;

  const regions: RegionCandidate[] = options.regionCandidates && options.regionCandidates.length > 0
    ? options.regionCandidates
    : [{ region: "full_focused", base64 }];

  const allCandidates: FocusedBoletoLineCandidate[] = [];
  let attemptCounter = 0;

  const PROVIDER_MODELS: Record<string, string> = {
    openai: "gpt-4o",
    gemini: "gemini-3.7-flash",
  };

  console.log(`[BOLETO_RECOVERY] correlation_id=${correlationId} started candidate_regions=${regions.length}`);

  // ─── CROP_ATTEMPT — Telemetria das regiões candidatas ───
  for (const reg of regions) {
    if (reg.original_width !== undefined && reg.original_height !== undefined) {
      console.log(
        `[CROP_ATTEMPT] correlation_id=${correlationId} region=${reg.region} ` +
        `original_width=${reg.original_width} original_height=${reg.original_height} ` +
        `crop_x=${reg.crop_x ?? 0} crop_y=${reg.crop_y ?? 0} ` +
        `crop_width=${reg.crop_width ?? reg.original_width} crop_height=${reg.crop_height ?? reg.original_height}`
      );
    }
  }

  // ─── 1. TENTATIVAS COM OPENAI GPT-4O FOCALIZADO (Por Região Candidata) ───
  if (openaiApiKey) {
    for (const reg of regions) {
      attemptCounter++;
      const candidate = await executeFocusedLineAttempt({
        provider: "openai",
        region: reg.region,
        attempt: attemptCounter,
        base64: reg.base64,
        mimeType,
        apiKey: openaiApiKey,
        fetchImpl,
        timeoutMs,
      });

      if (candidate) {
        allCandidates.push(candidate);
        const valRes = validateLinhaDigitavel(candidate.linha_digits);

        const validationErrors = valRes.valido
          ? "none"
          : ([valRes.motivo, ...(valRes.erros || [])].filter(Boolean).join("; ") || "dv_fail");

        console.log(
          `[BOLETO_RECOVERY_ATTEMPT] correlation_id=${correlationId} attempt=${attemptCounter} ` +
          `provider=openai model=${PROVIDER_MODELS.openai} region=${reg.region} ` +
          `digit_count=${candidate.digit_count} field_lengths=${candidate.field_lengths || "none"} ` +
          `validation_result=${valRes.valido} validation_errors=${validationErrors} latency_ms=${candidate.latency_ms}`
        );

        if (valRes.valido) {
          console.log(
            `[BOLETO_RECOVERY_SUCCESS] correlation_id=${correlationId} ` +
            `attempt=${attemptCounter} provider=openai model=${PROVIDER_MODELS.openai} ` +
            `region=${reg.region} digit_count=${candidate.digit_count} ` +
            `valor_derivado=${valRes.valorDerivado ?? "null"} ` +
            `vencimento_derivado=${valRes.dataVencimentoDerivada ?? "null"}`
          );
          return {
            recovered: true,
            successfulCandidate: candidate,
            validationResult: valRes,
            allCandidates,
            attemptsCount: attemptCounter,
          };
        }
      } else {
        console.log(
          `[BOLETO_RECOVERY_ATTEMPT] correlation_id=${correlationId} attempt=${attemptCounter} ` +
          `provider=openai model=${PROVIDER_MODELS.openai} region=${reg.region} ` +
          `digit_count=0 validation_result=false ` +
          `validation_errors=candidate_null latency_ms=unknown`
        );
      }
    }
  }

  // ─── 2. TENTATIVAS COM GEMINI 3.7 FLASH FOCALIZADO (Fallback) ───
  const activeGeminiKey = geminiApiKey || geminiApiKeyBackup;
  if (activeGeminiKey) {
    for (const reg of regions) {
      attemptCounter++;
      const candidate = await executeFocusedLineAttempt({
        provider: "gemini",
        region: reg.region,
        attempt: attemptCounter,
        base64: reg.base64,
        mimeType,
        apiKey: activeGeminiKey,
        fetchImpl,
        timeoutMs,
      });

      if (candidate) {
        allCandidates.push(candidate);
        const valRes = validateLinhaDigitavel(candidate.linha_digits);

        const validationErrors = valRes.valido
          ? "none"
          : ([valRes.motivo, ...(valRes.erros || [])].filter(Boolean).join("; ") || "dv_fail");

        console.log(
          `[BOLETO_RECOVERY_ATTEMPT] correlation_id=${correlationId} attempt=${attemptCounter} ` +
          `provider=gemini model=${PROVIDER_MODELS.gemini} region=${reg.region} ` +
          `digit_count=${candidate.digit_count} field_lengths=${candidate.field_lengths || "none"} ` +
          `validation_result=${valRes.valido} validation_errors=${validationErrors} latency_ms=${candidate.latency_ms}`
        );

        if (valRes.valido) {
          console.log(
            `[BOLETO_RECOVERY_SUCCESS] correlation_id=${correlationId} ` +
            `attempt=${attemptCounter} provider=gemini model=${PROVIDER_MODELS.gemini} ` +
            `region=${reg.region} digit_count=${candidate.digit_count} ` +
            `valor_derivado=${valRes.valorDerivado ?? "null"} ` +
            `vencimento_derivado=${valRes.dataVencimentoDerivada ?? "null"}`
          );
          return {
            recovered: true,
            successfulCandidate: candidate,
            validationResult: valRes,
            allCandidates,
            attemptsCount: attemptCounter,
          };
        }
      } else {
        console.log(
          `[BOLETO_RECOVERY_ATTEMPT] correlation_id=${correlationId} attempt=${attemptCounter} ` +
          `provider=gemini model=${PROVIDER_MODELS.gemini} region=${reg.region} ` +
          `digit_count=0 validation_result=false ` +
          `validation_errors=candidate_null latency_ms=unknown`
        );
      }
    }
  }

  // ─── 3. FAIL-CLOSED — Sem sucesso ───
  const failReason =
    !openaiApiKey && !activeGeminiKey
      ? "no_api_keys"
      : attemptCounter === 0
      ? "no_attempts_made"
      : "all_candidates_invalid";

  console.log(
    `[BOLETO_RECOVERY_FAILED] correlation_id=${correlationId} ` +
    `attempt_count=${attemptCounter} reason=${failReason}`
  );

  return {
    recovered: false,
    allCandidates,
    attemptsCount: attemptCounter,
  };
}

/**
 * Formata a mensagem final apresentada ao usuário no chat da Wallet IA.
 */
export function formatBoletoMessage(
  dados: BoletoExtractedData,
  validacao: BoletoValidationResult,
): string {
  const lines: string[] = [];

  const valorStr = validacao.valorFinal > 0
    ? validacao.valorFinal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "Não identificado";

  const dataVencBr = validacao.dataVencimentoFinal
    ? normalizeDate(validacao.dataVencimentoFinal).formattedBr || validacao.dataVencimentoFinal
    : "Não identificada";

  const linhaDigitavelFmt = validacao.linhaDigitavel?.linhaFormatada || dados.linha_digitavel || "Não identificada";

  if (validacao.status === "validado") {
    lines.push(`📄 **Boleto Identificado e Validado**`);
    lines.push(``);
    if (validacao.bancoFinal) lines.push(`🏦 **Banco:** ${validacao.bancoFinal}`);
    if (validacao.beneficiarioFinal) lines.push(`🏢 **Beneficiário:** ${validacao.beneficiarioFinal}`);
    if (validacao.cnpjCpfBeneficiarioFinal) lines.push(`🧾 **CNPJ/CPF:** ${validacao.cnpjCpfBeneficiarioFinal}`);
    if (validacao.pagadorFinal) lines.push(`👤 **Pagador:** ${validacao.pagadorFinal}`);
    lines.push(`📅 **Vencimento:** ${dataVencBr}`);
    lines.push(`💰 **Valor:** R$ ${valorStr}`);
    lines.push(`🔢 **Linha digitável:** \`${linhaDigitavelFmt}\``);
    lines.push(``);
    lines.push(`✅ **Linha digitável e dados matematicamente validados.**`);
    lines.push(``);
    lines.push(`🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*`);
    lines.push(``);
    lines.push(`*Posso preparar este boleto para cadastro.*`);
  } else if (validacao.status === "validado_com_alerta") {
    lines.push(`📄 **Boleto Identificado e Validado**`);
    lines.push(``);
    if (validacao.bancoFinal) lines.push(`🏦 **Banco:** ${validacao.bancoFinal}`);
    if (validacao.beneficiarioFinal) lines.push(`🏢 **Beneficiário:** ${validacao.beneficiarioFinal}`);
    if (validacao.cnpjCpfBeneficiarioFinal) lines.push(`🧾 **CNPJ/CPF:** ${validacao.cnpjCpfBeneficiarioFinal}`);
    if (validacao.pagadorFinal) lines.push(`👤 **Pagador:** ${validacao.pagadorFinal}`);
    lines.push(`📅 **Vencimento:** ${dataVencBr}`);
    lines.push(`💰 **Valor:** R$ ${valorStr}`);
    lines.push(`🔢 **Linha digitável:** \`${linhaDigitavelFmt}\``);
    lines.push(``);
    lines.push(`✅ **Dados bancários validados pela linha digitável.**`);
    lines.push(`⚠️ *A leitura visual apresentou leve divergência decorrente de compressão da imagem. Foram assumidos os dados matematicamente comprovados.*`);
    lines.push(``);
    lines.push(`🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*`);
    lines.push(``);
    lines.push(`*Posso preparar este boleto para cadastro.*`);
  } else {
    lines.push(`📄 **Boleto Identificado (Requer Revisão)**`);
    lines.push(``);
    if (validacao.divergencias.length > 0) {
      lines.push(`⚠️ **Inconsistências encontradas:**`);
      for (const d of validacao.divergencias) {
        lines.push(`• ${d}`);
      }
      lines.push(``);
    }
    if (validacao.bancoFinal) lines.push(`🏦 **Banco:** ${validacao.bancoFinal}`);
    if (validacao.beneficiarioFinal) lines.push(`🏢 **Beneficiário:** ${validacao.beneficiarioFinal}`);
    if (validacao.cnpjCpfBeneficiarioFinal) lines.push(`🧾 **CNPJ/CPF:** ${validacao.cnpjCpfBeneficiarioFinal}`);
    if (validacao.pagadorFinal) lines.push(`👤 **Pagador:** ${validacao.pagadorFinal}`);
    lines.push(`📅 **Vencimento:** ${dataVencBr}`);
    lines.push(`💰 **Valor:** R$ ${valorStr}`);
    lines.push(`🔢 **Linha digitável:** \`${linhaDigitavelFmt}\``);
    lines.push(``);
    lines.push(`🔒 *Nenhuma conta ou despesa foi cadastrada ainda.*`);
    lines.push(``);
    lines.push(`*Revise os dados acima antes de prosseguir com o agendamento.*`);
  }

  return lines.join("\n");
}

/**
 * Processador principal de documento de Boleto.
 */
export async function processBoletoDocument(input: ProcessBoletoInput): Promise<ProcessBoletoOutput> {
  const fetchFn = input.fetchImpl || fetch;

  try {
    const cleanB64 = input.base64.replace(/^data:[^;]+;base64,/i, "").replace(/[\r\n\s]+/g, "");

    const visionResult = await callBoletoVisionWithFailover({
      prompt: GEMINI_BOLETO_PROMPT,
      mimeType: input.mimeType,
      base64: cleanB64,
      openaiApiKey: input.openaiApiKey,
      geminiApiKey: input.geminiApiKey,
      geminiApiKeyBackup: input.geminiApiKeyBackup,
      fetchFn,
      correlationId: input.workspaceId,
    });

    if (!visionResult.ok || !visionResult.text) {
      throw new Error(`Falha na extração visual do boleto (status: ${visionResult.status})`);
    }

    let parsedJson: Record<string, string | number | null | undefined> = {};
    try {
      const cleaned = visionResult.text.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "").trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      const match = visionResult.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsedJson = JSON.parse(match[0]);
        } catch {
          // ignora
        }
      }
    }

    const dados: BoletoExtractedData = {
      banco: parsedJson.banco || null,
      beneficiario: parsedJson.beneficiario || parsedJson.cedente || null,
      cnpj_cpf_beneficiario: parsedJson.cnpj_cpf_beneficiario || parsedJson.cnpj_beneficiario || null,
      pagador: parsedJson.pagador || parsedJson.sacado || null,
      cnpj_cpf_pagador: parsedJson.cnpj_cpf_pagador || parsedJson.cpf_cnpj_pagador || null,
      data_vencimento: parsedJson.data_vencimento || parsedJson.vencimento || null,
      valor: parsedJson.valor ?? parsedJson.valor_documento ?? null,
      linha_digitavel: parsedJson.linha_digitavel || parsedJson.linhaDigitavel || null,
      codigo_barras: parsedJson.codigo_barras || parsedJson.codigoBarras || null,
      nosso_numero: parsedJson.nosso_numero || null,
      numero_documento: parsedJson.numero_documento || null,
      agencia_codigo_beneficiario: parsedJson.agencia_codigo_beneficiario || null,
      juros_multa: parsedJson.juros_multa || null,
      desconto: parsedJson.desconto || null,
      data_emissao: parsedJson.data_emissao || null,
    };

    // Validação e Reconciliação Determinística
    const validacao = reconcileBoleto(dados);

    const mensagemFormatada = formatBoletoMessage(dados, validacao);

    const isSucesso = validacao.status === "validado" || validacao.status === "validado_com_alerta";

    return {
      success: true,
      status: isSucesso ? "sucesso" : "requer_revisao",
      dados,
      validacao,
      mensagemFormatada,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const fallbackMsg = [
      `📄 **Boleto Identificado**`,
      ``,
      `⚠️ *Não foi possível processar todos os dados deste boleto com segurança no momento.*`,
      ``,
      `🔒 *Nenhuma conta ou despesa foi cadastrada.*`,
    ].join("\n");

    return {
      success: false,
      status: "requer_revisao",
      dados: {},
      validacao: {
        valido: false,
        status: "requer_revisao",
        divergencias: [errorMsg],
        warnings: [],
        valorFinal: 0,
        valorSource: "ocr_visual",
        dataVencimentoFinal: null,
        vencimentoSource: "ocr_visual",
        beneficiarioFinal: null,
        cnpjCpfBeneficiarioFinal: null,
        pagadorFinal: null,
        cnpjCpfPagadorFinal: null,
        bancoFinal: null,
        motivo: errorMsg,
      },
      mensagemFormatada: fallbackMsg,
      error: errorMsg,
    };
  }
}
