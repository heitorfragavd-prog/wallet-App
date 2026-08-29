/**
 * Document Handler — Classificação e Despacho Automático de Documentos no Backend (Etapa 1.2)
 * 
 * Inspeciona visualmente a imagem/PDF via IA e despacha automaticamente para:
 * - process_boleto (Boleto Handler) com normalização automática de orientação
 * - process_danfe (Fiscal Handler) com normalização automática de orientação
 * - OUTRO (Fail-closed)
 * 
 * SEGURANÇA:
 * - Nenhuma mutação de banco de dados
 * - Workspace isolation obrigatório
 * - Normalização matricial de orientação (0°, 90°, 180°, 270°) antes do OCR
 * - Preservação de PDFs sem rotação matricial
 * - Fail-closed em caso de dúvida ou tipo "outro"
 */

import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import { handleFiscalHttpRequest } from "./fiscal-handler.ts";
import {
  callBoletoVisionWithFailover,
  processBoletoDocument,
  type ProcessBoletoOutput,
} from "../_shared/ai/boleto-service.ts";
import { calculateRotationNeeded } from "../_shared/danfe-extractor.ts";
import { normalizeAndRotateImageMatrix } from "../_shared/ai/danfe-visual-pipeline.ts";
import type { SupabaseClientLike } from "../wallet-ai-query/supabase-adapter.ts";

export interface DocumentHandlerDependencies {
  authDeps: AuthorizationDependencies;
  geminiApiKey: string;
  adminClient?: SupabaseClientLike;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const PROMPT_CLASSIFICACAO_DOCUMENTO = `Você é um conferente especialista em documentos fiscais e bancários brasileiros.
Analise esta imagem/documento e retorne APENAS um JSON no seguinte formato:

REGRAS:
1. "tipo_documento":
   - "danfe": se for Nota Fiscal eletrônica (DANFE), cupom fiscal (NFC-e), nota de compra com tabela de itens ou fornecedor fiscal.
   - "boleto": se for Boleto Bancário de cobrança, fatura com código de barras, linha digitável ou ficha de compensação.
   - "outro": qualquer outro documento, foto comum, comprovante genérico ou texto não relacionado.
2. "orientacao_leitura":
   - Se o texto da folha estiver deitado ou lateral para ler, indique em "orientacao_leitura" quantos graus (90, 180, 270) a folha precisa girar no sentido horário para ficar perfeitamente vertical em pé (normal = 0).

Retorne APENAS um JSON no seguinte formato:
{
  "tipo_documento": "danfe" | "boleto" | "outro",
  "orientacao_leitura": 0 | 90 | 180 | 270,
  "confianca": 0.0 a 1.0,
  "motivo": "justificativa curta"
}`;

export async function handleDocumentHttpRequest(
  request: Request,
  dependencies: DocumentHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let context: AiExecutionContext | null = null;

  try {
    let body: Record<string, any>;
    try {
      body = await request.clone().json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json_body" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
    const base64 = typeof body.base64 === "string" ? body.base64 : "";
    const mimeType = typeof body.mime_type === "string" ? body.mime_type : "image/jpeg";
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : undefined;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "missing_workspace_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!base64) {
      return new Response(JSON.stringify({ error: "missing_file_base64" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 1. Autorização Server-Side Obrigatória
    context = await authorizeAiRequest(request, workspaceId, dependencies.authDeps);

    const openAiKey = (dependencies.authDeps as any)?.openAiApiKey || (
      typeof (globalThis as any).Deno !== "undefined"
        ? (globalThis as any).Deno.env.get("OPENAI_API_KEY")
        : undefined
    );

    const backupKey = typeof (globalThis as any).Deno !== "undefined"
      ? (globalThis as any).Deno.env.get("GEMINI_API_KEY_BACKUP")
      : undefined;

    // 2. Classificação Visual Canônica (Tipo + Orientação na mesma chamada)
    let tipoIdentificado: "danfe" | "boleto" | "outro" = "outro";
    let orientacaoDetectada: 0 | 90 | 180 | 270 = 0;

    try {
      const visionResult = await callBoletoVisionWithFailover({
        prompt: PROMPT_CLASSIFICACAO_DOCUMENTO,
        mimeType,
        base64,
        openaiApiKey: openAiKey,
        geminiApiKey: dependencies.geminiApiKey,
        geminiApiKeyBackup: backupKey,
        fetchFn: fetch,
        timeoutMs: 15000,
      });

      if (visionResult.ok && visionResult.text) {
        const jsonMatch = visionResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tipo_documento === "boleto" || parsed.tipo_documento === "danfe" || parsed.tipo_documento === "outro") {
            tipoIdentificado = parsed.tipo_documento;
          }
          orientacaoDetectada = calculateRotationNeeded(parsed.orientacao_leitura);
        }
      }
    } catch (err) {
      console.warn("[document-handler] Erro na classificação visual:", err);
    }

    // 3. Normalização de Orientação (somente para imagens raster, nunca PDF)
    let effectiveBase64 = base64;
    let effectiveMimeType = mimeType;

    const isRasterImage =
      mimeType.startsWith("image/") &&
      (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png" || mimeType === "image/webp");

    if (isRasterImage && orientacaoDetectada > 0) {
      try {
        console.log(`[document-handler] Aplicando rotação normalizadora de ${orientacaoDetectada}°...`);
        const matrixRes = await normalizeAndRotateImageMatrix(base64, orientacaoDetectada);
        if (matrixRes.rotated && matrixRes.base64) {
          effectiveBase64 = matrixRes.base64;
          effectiveMimeType = "image/jpeg";
          console.log(`[document-handler] Rotação de ${orientacaoDetectada}° aplicada com sucesso.`);
        }
      } catch (rotErr) {
        console.warn("[document-handler] Falha na rotação da imagem, mantendo original:", rotErr);
      }
    }

    // 4. Despacho para o pipeline correspondente com Payload Efetivamente Normalizado
    if (tipoIdentificado === "boleto") {
      const extractionResult: ProcessBoletoOutput = await processBoletoDocument({
        base64: effectiveBase64,
        mimeType: effectiveMimeType,
        geminiApiKey: dependencies.geminiApiKey,
        geminiApiKeyBackup: backupKey,
        openaiApiKey: openAiKey,
        workspaceId: context.workspaceId,
      });

      return new Response(
        JSON.stringify({
          success: extractionResult.success,
          status: extractionResult.status,
          mensagemFormatada: extractionResult.mensagemFormatada,
          dados: extractionResult.dados,
          validacao: extractionResult.validacao,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (tipoIdentificado === "danfe") {
      const normalizedRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          ...body,
          base64: effectiveBase64,
          mime_type: effectiveMimeType,
          conversation_id: conversationId,
        }),
      });

      return await handleFiscalHttpRequest(normalizedRequest, {
        authDeps: dependencies.authDeps,
        geminiApiKey: dependencies.geminiApiKey,
        adminClient: dependencies.adminClient,
      });
    }

    // 5. Fail-closed para OUTRO / Inconclusivo
    return new Response(
      JSON.stringify({
        success: false,
        tipo: "DESCONHECIDO",
        status: "desconhecido",
        mensagemFormatada: [
          `📎 **Documento Não Reconhecido**`,
          ``,
          `Não identifiquei este arquivo como uma Nota Fiscal (DANFE) ou Boleto Bancário com código de barras/linha digitável.`,
          `Para análise fiscal ou financeira, envie uma imagem ou PDF nítido de uma Nota Fiscal ou Boleto.`,
          ``,
          `🔒 *Nenhuma ação foi executada.*`,
        ].join("\n"),
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const correlationId = (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
    ).slice(0, 8).toUpperCase();

    let status = 500;
    let errorCode = "document_processing_error";

    if (err instanceof AiAuthorizationError) {
      status = err.status;
      errorCode = err.code;
    } else if (err instanceof Error) {
      errorCode = err.message;
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorCode,
        correlation_id: correlationId,
      }),
      {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
}