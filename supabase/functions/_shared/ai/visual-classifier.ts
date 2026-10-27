/**
 * Visual Classifier — Reconhecimento e Roteamento Multimodal de Documentos
 * 
 * Regras:
 * 1. Analisa exclusivamente o conteúdo visual via visão computacional multimodal.
 * 2. Failover inteligente:
 *    - Imagens (JPEG/PNG/WEBP): OpenAI GPT-4o-mini (Primário) -> Google Gemini (Fallback)
 *    - PDFs: Google Gemini (Primário nativo para PDF) -> OpenAI (Fallback se aplicável)
 * 3. Classificações permitidas: BOLETO | DANFE | COMPROVANTE | DESCONHECIDO.
 * 4. Tratamento explícito de falhas técnicas (401/403, 429, timeout, missing credentials)
 *    sem mascaramento como "imagem ilegível".
 * 5. Observabilidade segura (sem base64, tokens ou chaves em logs).
 */

export type VisualDocumentType = "BOLETO" | "DANFE" | "COMPROVANTE" | "DESCONHECIDO";

export interface VisualClassifierTechnicalError {
  code:
    | "MISSING_CREDENTIALS"
    | "AUTH_FAILED"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "MALFORMED_RESPONSE"
    | "PROVIDER_ERROR";
  status?: number;
  message: string;
}

export interface VisualClassificationEvidence {
  hasBarcodeOrLinhaDigitavel?: boolean;
  hasDanfeAccessKey?: boolean;
  hasReceiptProof?: boolean;
  detectedKeywords?: string[];
}

export interface VisualClassificationResult {
  documentType: VisualDocumentType;
  confidence: number;
  reasoning: string;
  evidence: VisualClassificationEvidence;
  providerUsed?: "openai" | "gemini";
  modelUsed?: string;
  durationMs: number;
  technicalError?: VisualClassifierTechnicalError;
}

export interface ClassifyDocumentVisuallyInput {
  base64: string;
  mimeType: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiApiKeyBackup?: string;
  correlationId?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador visual especializado em documentos financeiros e fiscais brasileiros.
Analise a imagem fornecida e determine a classificação correta entre exatamente 4 categorias:

1. "BOLETO":
   Boleto bancário de cobrança ou fatura contendo código de barras, linha digitável (47 ou 48 dígitos), vencimento, valor do documento, cedente/beneficiário e sacado/pagador.
   IMPORTANTE: Só classifique como BOLETO se houver evidência visual clara de um boleto de cobrança bancária pendente de pagamento (NÃO confunda com comprovante de pagamento já liquidado).

2. "DANFE":
   Documento Auxiliar da Nota Fiscal Eletrônica (DANFE, NFC-e, CF-e), contendo chave de acesso de 44 dígitos numéricos, CNPJ do emitente/destinatário, quadro de produtos/itens e impostos.

3. "COMPROVANTE":
   Comprovante de pagamento já efetuado, comprovante de transferência bancária ou PIX realizado, recibo de quitação. Indica uma transação já liquidada no passado, não um título a pagar.

4. "DESCONHECIDO":
   Fotografias do cotidiano, pessoas, animais, produtos soltos, capturas sem relação fiscal/financeira, ou imagens completamente borradas/ilegíveis sem elementos reconhecíveis.

Regras Estritas:
- NUNCA classifique como BOLETO sem evidência visual de código de barras ou linha digitável ou campos típicos de boleto.
- NUNCA invente informações.
- Responda ESTRITAMENTE um objeto JSON válido, sem texto adicional, no seguinte formato:
{
  "documentType": "BOLETO" | "DANFE" | "COMPROVANTE" | "DESCONHECIDO",
  "confidence": <número inteiro de 0 a 100>,
  "reasoning": "<explicação de uma linha sobre os elementos visuais detectados>",
  "evidence": {
    "hasBarcodeOrLinhaDigitavel": <boolean>,
    "hasDanfeAccessKey": <boolean>,
    "hasReceiptProof": <boolean>,
    "detectedKeywords": ["<palavras-chave identificadas>"]
  }
}`;

/**
 * Classifica um documento a partir de seu conteúdo visual usando modelos multimodais com failover.
 */
export async function classifyDocumentVisually(
  input: ClassifyDocumentVisuallyInput,
): Promise<VisualClassificationResult> {
  const start = Date.now();
  const fetchFn = input.fetchFn || globalThis.fetch.bind(globalThis);
  const timeoutMs = input.timeoutMs || 25000;
  const correlationId = input.correlationId || `vis_${Date.now()}`;
  const cleanBase64 = input.base64.replace(/^data:[^;]+;base64,/i, "").replace(/[\r\n\s]+/g, "");

  const hasOpenAi = Boolean(input.openaiApiKey?.trim());
  const effectiveGeminiKey = (input.geminiApiKey || input.geminiApiKeyBackup)?.trim();
  const hasGemini = Boolean(effectiveGeminiKey);

  // 1. Verificação de credenciais disponíveis
  if (!hasOpenAi && !hasGemini) {
    console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} error=missing_credentials`);
    return {
      documentType: "DESCONHECIDO",
      confidence: 0,
      reasoning: "Nenhuma credencial de visão multimodal configurada no ambiente.",
      evidence: {},
      durationMs: Date.now() - start,
      technicalError: {
        code: "MISSING_CREDENTIALS",
        message: "Chaves de API para provedores visuais (OpenAI/Gemini) ausentes.",
      },
    };
  }

  const isPdf = input.mimeType === "application/pdf";

  // Se for PDF, o Gemini tem suporte nativo para PDF em inlineData; caso contrário OpenAI é primário
  const order: ("openai" | "gemini")[] = isPdf
    ? (hasGemini ? ["gemini", "openai"] : ["openai"])
    : (hasOpenAi ? ["openai", "gemini"] : ["gemini"]);

  let lastTechnicalError: VisualClassifierTechnicalError | undefined;

  for (const provider of order) {
    if (provider === "openai" && hasOpenAi) {
      const res = await callOpenAiVision(
        cleanBase64,
        input.mimeType,
        input.openaiApiKey!,
        fetchFn,
        timeoutMs,
        correlationId,
      );

      if (res.result) {
        return {
          ...res.result,
          durationMs: Date.now() - start,
        };
      }
      lastTechnicalError = res.error;
    } else if (provider === "gemini" && hasGemini) {
      const res = await callGeminiVision(
        cleanBase64,
        input.mimeType,
        effectiveGeminiKey!,
        fetchFn,
        timeoutMs,
        correlationId,
      );

      if (res.result) {
        return {
          ...res.result,
          durationMs: Date.now() - start,
        };
      }
      lastTechnicalError = res.error;
    }
  }

  // Falha técnica definitiva em todos os provedores acionados
  console.error(
    `[VISUAL_CLASSIFIER] correlation_id=${correlationId} all_providers_failed code=${lastTechnicalError?.code} status=${lastTechnicalError?.status}`,
  );

  return {
    documentType: "DESCONHECIDO",
    confidence: 0,
    reasoning: lastTechnicalError?.message || "Falha técnica nos provedores visuais.",
    evidence: {},
    durationMs: Date.now() - start,
    technicalError: lastTechnicalError || {
      code: "PROVIDER_ERROR",
      message: "Falha de comunicação com os serviços de visão computacional.",
    },
  };
}

// ─── IMPLEMENTAÇÃO OPENAI VISION ────────────────────────────────────────────────

async function callOpenAiVision(
  base64: string,
  mimeType: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  correlationId: string,
): Promise<{ result?: VisualClassificationResult; error?: VisualClassifierTechnicalError }> {
  const model = "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Classifique o documento visual desta imagem com precisão estrita." },
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

    if (resp.status === 401 || resp.status === 403) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=openai status=${resp.status} error=auth_failed`);
      return {
        error: { code: "AUTH_FAILED", status: resp.status, message: "Falha de autenticação com a API OpenAI." },
      };
    }

    if (resp.status === 429) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=openai status=429 error=rate_limited`);
      return {
        error: { code: "RATE_LIMITED", status: 429, message: "Limite de requisições excedido na API OpenAI (HTTP 429)." },
      };
    }

    if (!resp.ok) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=openai status=${resp.status} error=http_error`);
      return {
        error: { code: "PROVIDER_ERROR", status: resp.status, message: `Erro HTTP ${resp.status} retornado pela OpenAI.` },
      };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return {
        error: { code: "MALFORMED_RESPONSE", message: "Resposta vazia retornada pela OpenAI." },
      };
    }

    const parsed = parseClassificationJson(content);
    if (!parsed) {
      return {
        error: { code: "MALFORMED_RESPONSE", message: "JSON inválido retornado pelo modelo OpenAI." },
      };
    }

    console.log(
      `[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=openai model=${model} doc_type=${parsed.documentType} confidence=${parsed.confidence}`,
    );

    return {
      result: {
        ...parsed,
        providerUsed: "openai",
        modelUsed: model,
        durationMs: 0,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = (err as Error)?.name === "AbortError";
    console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=openai error=${isTimeout ? "timeout" : "network"}`);
    return {
      error: {
        code: isTimeout ? "TIMEOUT" : "PROVIDER_ERROR",
        message: isTimeout ? `Tempo limite de ${timeoutMs}ms excedido na OpenAI.` : "Falha de rede na comunicação com a OpenAI.",
      },
    };
  }
}

// ─── IMPLEMENTAÇÃO GEMINI VISION ────────────────────────────────────────────────

async function callGeminiVision(
  base64: string,
  mimeType: string,
  apiKey: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
  correlationId: string,
): Promise<{ result?: VisualClassificationResult; error?: VisualClassifierTechnicalError }> {
  // gemini-2.5-flash / gemini-1.5-flash
  const model = "gemini-2.5-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: CLASSIFIER_SYSTEM_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timer);

    if (resp.status === 401 || resp.status === 403) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=gemini status=${resp.status} error=auth_failed`);
      return {
        error: { code: "AUTH_FAILED", status: resp.status, message: "Falha de autenticação com a API Gemini." },
      };
    }

    if (resp.status === 429) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=gemini status=429 error=rate_limited`);
      return {
        error: { code: "RATE_LIMITED", status: 429, message: "Limite de requisições excedido na API Gemini (HTTP 429)." },
      };
    }

    if (!resp.ok) {
      console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=gemini status=${resp.status} error=http_error`);
      return {
        error: { code: "PROVIDER_ERROR", status: resp.status, message: `Erro HTTP ${resp.status} retornado pelo Gemini.` },
      };
    }

    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        error: { code: "MALFORMED_RESPONSE", message: "Resposta vazia retornada pelo Gemini." },
      };
    }

    const parsed = parseClassificationJson(rawText);
    if (!parsed) {
      return {
        error: { code: "MALFORMED_RESPONSE", message: "JSON inválido retornado pelo modelo Gemini." },
      };
    }

    console.log(
      `[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=gemini model=${model} doc_type=${parsed.documentType} confidence=${parsed.confidence}`,
    );

    return {
      result: {
        ...parsed,
        providerUsed: "gemini",
        modelUsed: model,
        durationMs: 0,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = (err as Error)?.name === "AbortError";
    console.warn(`[VISUAL_CLASSIFIER] correlation_id=${correlationId} provider=gemini error=${isTimeout ? "timeout" : "network"}`);
    return {
      error: {
        code: isTimeout ? "TIMEOUT" : "PROVIDER_ERROR",
        message: isTimeout ? `Tempo limite de ${timeoutMs}ms excedido no Gemini.` : "Falha de rede na comunicação com o Gemini.",
      },
    };
  }
}

// ─── PARSER E VALIDADOR ESTRITO DO JSON DE SAÍDA ────────────────────────────────

function parseClassificationJson(
  rawText: string,
): { documentType: VisualDocumentType; confidence: number; reasoning: string; evidence: VisualClassificationEvidence } | null {
  try {
    const sanitized = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const obj = JSON.parse(sanitized);
    if (!obj || typeof obj !== "object") return null;

    let docTypeRaw = String(obj.documentType || "").trim().toUpperCase();
    if (!["BOLETO", "DANFE", "COMPROVANTE", "DESCONHECIDO"].includes(docTypeRaw)) {
      docTypeRaw = "DESCONHECIDO";
    }

    const confidence = typeof obj.confidence === "number" && !isNaN(obj.confidence)
      ? Math.max(0, Math.min(100, Math.round(obj.confidence)))
      : (docTypeRaw === "DESCONHECIDO" ? 0 : 75);

    const evidence: VisualClassificationEvidence = {
      hasBarcodeOrLinhaDigitavel: Boolean(obj.evidence?.hasBarcodeOrLinhaDigitavel),
      hasDanfeAccessKey: Boolean(obj.evidence?.hasDanfeAccessKey),
      hasReceiptProof: Boolean(obj.evidence?.hasReceiptProof),
      detectedKeywords: Array.isArray(obj.evidence?.detectedKeywords)
        ? obj.evidence.detectedKeywords.map(String).slice(0, 10)
        : [],
    };

    let docType = docTypeRaw as VisualDocumentType;

    // Regra de segurança: só permite BOLETO se houver evidência visual concreta ou confiança >= 70
    if (docType === "BOLETO" && !evidence.hasBarcodeOrLinhaDigitavel && confidence < 70) {
      docType = "DESCONHECIDO";
    }

    return {
      documentType: docType,
      confidence,
      reasoning: String(obj.reasoning || "").trim() || "Classificação automatizada por visão computacional.",
      evidence,
    };
  } catch {
    return null;
  }
}
