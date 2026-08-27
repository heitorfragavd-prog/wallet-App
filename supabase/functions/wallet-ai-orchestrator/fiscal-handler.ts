/**
 * Fiscal Handler — Processamento de Documentos Fiscais no Backend (Etapa 2.1b)
 * 
 * Executa o DANFE Fiscal Service V2 com Gemini no backend e persiste sessões multipágina no banco.
 */

import {
  AiAuthorizationError,
  authorizeAiRequest,
  type AiExecutionContext,
  type AuthorizationDependencies,
} from "../_shared/ai/auth.ts";
import {
  processDanfeDocument,
  type DanfeSessionState,
  type ProcessDanfeOutput,
} from "../_shared/ai/danfe-fiscal-service.ts";
import type { SupabaseClientLike } from "../wallet-ai-query/supabase-adapter.ts";

export interface FiscalHandlerDependencies {
  authDeps: AuthorizationDependencies;
  geminiApiKey: string;
  adminClient?: SupabaseClientLike;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleFiscalHttpRequest(
  request: Request,
  dependencies: FiscalHandlerDependencies,
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

  const startTime = Date.now();
  let context: AiExecutionContext | null = null;

  try {
    let body: Record<string, any>;
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
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : undefined;

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

    // 2. Recuperar Sessão Multipágina Persistida do Banco (se adminClient disponível)
    let existingSession: DanfeSessionState | null = null;
    let sessaoIdDb: string | null = null;

    if (dependencies.adminClient) {
      try {
        const { data: rows } = await (dependencies.adminClient.from("documento_sessoes") as any)
          .select("id, dados_sessao, total_paginas, paginas_recebidas, status")
          .eq("user_id", context.userId)
          .eq("workspace_id", context.workspaceId)
          .eq("status", "pendente")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (rows && rows.length > 0) {
          sessaoIdDb = rows[0].id;
          existingSession = rows[0].dados_sessao as DanfeSessionState;
        }
      } catch (dbErr) {
        console.warn("[fiscal-handler] Aviso ao buscar sessão multipágina no banco:", dbErr);
      }
    }

    // 3. Executar o DANFE Fiscal Service V2 com Gemini no Backend
    const result: ProcessDanfeOutput = await processDanfeDocument({
      base64,
      mimeType,
      geminiApiKey: dependencies.geminiApiKey,
      workspaceId: context.workspaceId,
      existingSession,
    });

    // 4. Persistir / Atualizar Estado da Sessão no Banco
    if (dependencies.adminClient && result.sessionState) {
      try {
        if (result.status === "parcial_multipagina") {
          if (sessaoIdDb) {
            await (dependencies.adminClient.from("documento_sessoes") as any)
              .update({
                paginas_recebidas: result.sessionState.paginasRecebidas,
                total_paginas: result.sessionState.totalPaginas,
                dados_sessao: result.sessionState,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessaoIdDb);
          } else {
            await (dependencies.adminClient.from("documento_sessoes") as any).insert({
              user_id: context.userId,
              workspace_id: context.workspaceId,
              conversation_id: conversationId,
              documento_tipo: "DANFE",
              chave_acesso: result.sessionState.chaveAcesso,
              numero_nf: result.sessionState.numeroNf,
              fornecedor: result.sessionState.fornecedor,
              total_paginas: result.sessionState.totalPaginas,
              paginas_recebidas: result.sessionState.paginasRecebidas,
              dados_sessao: result.sessionState,
              status: "pendente",
            });
          }
        } else if (sessaoIdDb) {
          // Sessão finalizada / consolidada
          await (dependencies.adminClient.from("documento_sessoes") as any)
            .update({
              status: "consolidada",
              dados_sessao: result.sessionState,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sessaoIdDb);
        }
      } catch (persistErr) {
        console.warn("[fiscal-handler] Erro ao persistir sessão multipágina no banco:", persistErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: result.status,
        mensagemFormatada: result.mensagemFormatada,
        cabecalho: result.cabecalho,
        valores_totais: result.valores_totais,
        itens: result.itens,
        validacao: result.validacao,
        sessionState: result.sessionState,
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
    let errorCode = "fiscal_processing_error";

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
