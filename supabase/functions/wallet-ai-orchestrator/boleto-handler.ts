/**
 * Boleto Handler — Processamento de Boletos no Backend (Etapa 2.2A)
 * 
 * Executa a extração determinística de Boletos com Gemini 2.5 Flash / Failover OpenAI
 * e autorização server-side obrigatória.
 * 
 * SEGURANÇA:
 * - Nenhuma mutação de banco de dados
 * - Workspace isolation obrigatório
 * - Nenhuma conta ou despesa cadastrada automaticamente
 */

import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import {
  processBoletoDocument,
  type ProcessBoletoOutput,
} from "../_shared/ai/boleto-service.ts";
import type { SupabaseClientLike } from "../wallet-ai-query/supabase-adapter.ts";

export interface BoletoHandlerDependencies {
  authDeps: AuthorizationDependencies;
  geminiApiKey: string;
  adminClient?: SupabaseClientLike;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleBoletoHttpRequest(
  request: Request,
  dependencies: BoletoHandlerDependencies,
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
    let body: Record<string, unknown>;
    try {
      body = await request.json();
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

    type DenoGlobal = { Deno?: { env: { get(key: string): string | undefined } } };
    const denoEnv = (globalThis as unknown as DenoGlobal).Deno?.env;
    const backupKey = denoEnv?.get("GEMINI_API_KEY_BACKUP");

    const openAiKey = (dependencies.authDeps as { openAiApiKey?: string })?.openAiApiKey || (
      denoEnv?.get("OPENAI_API_KEY")
    );

    // 2. Extração e Validação Determinística de Boleto
    const extractionResult: ProcessBoletoOutput = await processBoletoDocument({
      base64,
      mimeType,
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
  } catch (err: unknown) {
    const correlationId = (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
    ).slice(0, 8).toUpperCase();

    let status = 500;
    let errorCode = "boleto_processing_error";

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
