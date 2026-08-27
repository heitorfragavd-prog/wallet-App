/**
 * Fiscal Handler — Processamento de Documentos Fiscais no Backend (Etapa 2.1b)
 * 
 * Executa o DANFE Fiscal Service V2 com Gemini no backend e realiza o merge atômico
 * de sessões multipágina no PostgreSQL via RPC merge_documento_sessao_page (com pg_advisory_xact_lock).
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
  validateDanfeMathV2,
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

    // 2. Processar Folha Atual via Gemini Fiscal Service V2 com Failover para OpenAI Vision
    const extractionResult: ProcessDanfeOutput = await processDanfeDocument({
      base64,
      mimeType,
      geminiApiKey: dependencies.geminiApiKey,
      openaiApiKey: (dependencies.authDeps as any)?.openAiApiKey || (typeof (globalThis as any).Deno !== "undefined" ? (globalThis as any).Deno.env.get("OPENAI_API_KEY") : undefined),
      workspaceId: context.workspaceId,
      existingSession: null, // Deixamos a RPC atômica gerenciar o merge de estado no banco
    });


    let finalOutput: ProcessDanfeOutput = extractionResult;

    // 3. Se for documento multipágina, executar Merge Atômico no PostgreSQL via RPC
    const totalPaginas = extractionResult.sessionState?.totalPaginas || extractionResult.cabecalho?.total_paginas || 1;
    const paginaAtual = extractionResult.cabecalho?.pagina_atual || 1;

    if (dependencies.adminClient && totalPaginas > 1) {
      try {
        const { data: mergeResult, error: rpcErr } = await (dependencies.adminClient.rpc as any)(
          "merge_documento_sessao_page",
          {
            p_user_id: context.userId,
            p_workspace_id: context.workspaceId,
            p_conversation_id: conversationId || null,
            p_chave_acesso: extractionResult.cabecalho?.chave_acesso || null,
            p_numero_nf: extractionResult.cabecalho?.numero_nf || null,
            p_fornecedor: extractionResult.cabecalho?.fornecedor || null,
            p_total_paginas: totalPaginas,
            p_pagina_atual: paginaAtual,
            p_itens_pagina: extractionResult.itens,
            p_valores_totais: extractionResult.valores_totais || {},
            p_cabecalho: extractionResult.cabecalho || {},
          },
        );

        if (!rpcErr && mergeResult?.dados_sessao) {
          const dadosSessao = mergeResult.dados_sessao as DanfeSessionState;
          const isConsolidada = mergeResult.status === "consolidada";
          const paginasRecebidas: number[] = mergeResult.paginas_recebidas || [];
          const paginasFaltantes: number[] = mergeResult.paginas_faltantes || [];

          if (!isConsolidada) {
            finalOutput = {
              success: true,
              status: "parcial_multipagina",
              cabecalho: extractionResult.cabecalho,
              valores_totais: extractionResult.valores_totais,
              itens: dadosSessao.itensAcumulados || [],
              validacao: { valido: true, somaItens: 0, valorProdutosDeclarado: dadosSessao.valorProdutosDeclarado || 0, diferenca: 0 },
              sessionState: dadosSessao,
              mensagemFormatada: [
                `📑 **Nota Fiscal Multipágina — Página ${paginaAtual} de ${totalPaginas} Recebida**`,
                ``,
                `• **Fornecedor:** ${dadosSessao.fornecedor || "Não identificado"}`,
                `• **Número NF:** ${dadosSessao.numeroNf || "S/N"}`,
                `• **Páginas Recebidas:** ${paginasRecebidas.join(", ")} de ${totalPaginas}`,
                `• **Páginas Faltantes:** ${paginasFaltantes.join(", ")}`,
                `• **Itens Acumulados nesta sessão:** ${(dadosSessao.itensAcumulados || []).length}`,
                ``,
                `Estou aguardando a página ${paginasFaltantes[0] || "seguinte"} para consolidar a nota e validar os totais fiscais.`,
                ``,
                `🔒 *Nenhuma alteração foi feita no estoque.*`,
              ].join("\n"),
            };
          } else {
            // Nota completa: todas as folhas recebidas! Validar matemática total
            const validacaoTotal = validateDanfeMathV2(
              dadosSessao.itensAcumulados || [],
              dadosSessao.valorProdutosDeclarado || 0,
            );

            finalOutput = {
              success: true,
              status: validacaoTotal.valido ? "sucesso" : "requer_revisao",
              cabecalho: dadosSessao.cabecalho || extractionResult.cabecalho,
              valores_totais: dadosSessao.valores_totais || extractionResult.valores_totais,
              itens: dadosSessao.itensAcumulados || [],
              validacao: validacaoTotal,
              sessionState: dadosSessao,
              mensagemFormatada: [
                `🧾 **Nota Fiscal Consolidada (${totalPaginas}/${totalPaginas} páginas)**`,
                ``,
                `• **Fornecedor:** ${dadosSessao.fornecedor || "Identificado"}`,
                `• **Número NF:** ${dadosSessao.numeroNf || "S/N"}`,
                `• **Total de Itens Reconciliados:** ${(dadosSessao.itensAcumulados || []).length}`,
                `• **Valor Total dos Produtos:** R$ ${(dadosSessao.valorProdutosDeclarado || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                `• **Status Fiscal:** ${validacaoTotal.valido ? "✅ Validação Matemática OK" : "⚠️ Requer Revisão (Divergência de valores)"}`,
                ``,
                `🔒 *Nenhuma alteração foi feita no estoque.*`,
              ].join("\n"),
            };
          }
        }
      } catch (rpcCatchErr) {
        console.warn("[fiscal-handler] Erro ao invocar RPC atômica merge_documento_sessao_page:", rpcCatchErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: finalOutput.status,
        mensagemFormatada: finalOutput.mensagemFormatada,
        cabecalho: finalOutput.cabecalho,
        valores_totais: finalOutput.valores_totais,
        itens: finalOutput.itens,
        validacao: finalOutput.validacao,
        sessionState: finalOutput.sessionState,
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
