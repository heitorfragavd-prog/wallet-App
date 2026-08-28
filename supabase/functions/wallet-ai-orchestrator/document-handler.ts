/**
 * Document Handler — Classificação e Despacho Automático de Documentos no Backend (Etapa 1.2)
 * 
 * Inspeciona visualmente a imagem/PDF via IA e despacha automaticamente para:
 * - process_boleto (Boleto Handler)
 * - process_danfe (Fiscal Handler)
 * - OUTRO (Fail-closed)
 * 
 * SEGURANÇA:
 * - Nenhuma mutação de banco de dados
 * - Workspace isolation obrigatório
 * - Fail-closed em caso de dúvida ou tipo "outro"
 */

import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import { handleBoletoHttpRequest } from "./boleto-handler.ts";
import { handleFiscalHttpRequest } from "./fiscal-handler.ts";
import { callBoletoVisionWithFailover } from "../_shared/ai/boleto-service.ts";
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
Analise esta imagem/documento e identifique o tipo principal:
- "danfe": se for Nota Fiscal eletrônica (DANFE), cupom fiscal (NFC-e), nota de compra com tabela de itens ou fornecedor fiscal.
- "boleto": se for Boleto Bancário de cobrança, fatura com código de barras, linha digitável ou ficha de compensação.
- "outro": qualquer outro documento, foto comum, comprovante genérico ou texto não relacionado.

Retorne APENAS um JSON no seguinte formato:
{
  "tipo_documento": "danfe" | "boleto" | "outro",
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

    // 2. Classificação Visual Canônica
    let tipoIdentificado: "danfe" | "boleto" | "outro" = "outro";

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
        }
      }
    } catch (err) {
      console.warn("[document-handler] Erro na classificação visual:", err);
    }

    // 3. Despacho para o pipeline correspondente
    if (tipoIdentificado === "boleto") {
      return await handleBoletoHttpRequest(request, {
        authDeps: dependencies.authDeps,
        geminiApiKey: dependencies.geminiApiKey,
        adminClient: dependencies.adminClient,
      });
    }

    if (tipoIdentificado === "danfe") {
      return await handleFiscalHttpRequest(request, {
        authDeps: dependencies.authDeps,
        geminiApiKey: dependencies.geminiApiKey,
        adminClient: dependencies.adminClient,
      });
    }

    // 4. Fail-closed para OUTRO / Inconclusivo
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