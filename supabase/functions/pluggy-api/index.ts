/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-catch */
// Supabase Edge Function: pluggy-api
// Proxy seguro, autenticado e endurecido para a API da Pluggy (Open Finance).
// 
// Arquitetura de Autorização Estrita e Observabilidade Ponta a Ponta:
// 1. O JWT do usuário é validado no cliente de usuário (userClient) com Authorization: Bearer <token> e SUPABASE_ANON_KEY.
// 2. public.tem_acesso_workspace() é executada sob auth.uid() do usuário autenticado no userClient.
// 3. Validação estrita de clientUserId na Pluggy (GET /items/{id}) contra expectedClientUserId.
// 4. O cliente service_role (supabaseAdmin) é utilizado SOMENTE APÓS autorização confirmada
//    para garantir a integridade de escrita e leitura de pluggy_items, contas_usuario e transacoes.
// 5. Rastreamento distribuído via X-Correlation-Id, logs estruturados com duration_ms e códigos de erro padronizados:
//    - PLUGGY_TIMEOUT
//    - PLUGGY_UPSTREAM_ERROR
//    - PLUGGY_AUTH_ERROR
//    - PLUGGY_FORBIDDEN

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createBackendLogger,
  getCorrelationId,
  withCorrelationHeader,
  createErrorResponse,
  HTTP_STATUS,
} from "../_shared/observability/index.ts";

const logger = createBackendLogger("pluggy-api");

// ─── CÓDIGOS DE ERRO PADRONIZADOS DA INTEGRAÇÃO PLUGGY ───
export const PLUGGY_ERROR_CODES = {
  TIMEOUT: "PLUGGY_TIMEOUT",
  UPSTREAM_ERROR: "PLUGGY_UPSTREAM_ERROR",
  AUTH_ERROR: "PLUGGY_AUTH_ERROR",
  FORBIDDEN: "PLUGGY_FORBIDDEN",
} as const;

// ─── CONFIGURAÇÃO DE CORS COM ALLOWLIST ───
const ALLOWED_ORIGINS_DEFAULT = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
];

function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  const envAllowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = [...ALLOWED_ORIGINS_DEFAULT, ...envAllowed];

  return (
    allowList.includes(origin) ||
    origin.endsWith(".supabase.co") ||
    origin.endsWith(".lovable.app") ||
    origin.endsWith(".vercel.app")
  );
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = isOriginAllowed(origin);

  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : ALLOWED_ORIGINS_DEFAULT[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200, correlationId?: string) {
  const corrId = correlationId || getCorrelationId(req);
  return new Response(JSON.stringify({ ...body, correlation_id: corrId }), {
    status,
    headers: withCorrelationHeader(
      { ...getCorsHeaders(req), "Content-Type": "application/json" },
      corrId
    ),
  });
}

function maskId(id?: string | null): string {
  if (!id) return "NULL";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

// ─── GERAÇÃO DETERMINÍSTICA E NÃO-REVERSÍVEL DE clientUserId ───
async function generateClientUserId(userId: string, workspaceId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`wallet_pluggy_v1_${userId}_${workspaceId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `usr_${hashHex.slice(0, 28)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeout?: number } = {},
  logCtx?: { operation: string; correlationId?: string; maskedTarget?: string }
): Promise<Response> {
  const { timeout = 15000, ...fetchInit } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const startTime = performance.now();

  try {
    const resp = await fetch(url, { ...fetchInit, signal: controller.signal });
    const durationMs = Math.round(performance.now() - startTime);

    if (logCtx) {
      logger.info(`Chamada externa Pluggy: ${logCtx.operation}`, {
        source: "pluggy-api",
        operation: logCtx.operation,
        correlationId: logCtx.correlationId,
        metadata: {
          status: resp.status,
          duration_ms: durationMs,
          target: logCtx.maskedTarget,
        },
      });
    }

    return resp;
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - startTime);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("abort") || msg.includes("timeout");

    if (logCtx) {
      logger.error(`Falha na chamada externa Pluggy: ${logCtx.operation}`, {
        source: "pluggy-api",
        operation: logCtx.operation,
        correlationId: logCtx.correlationId,
        errorCode: isTimeout ? PLUGGY_ERROR_CODES.TIMEOUT : PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
        metadata: {
          duration_ms: durationMs,
          error: isTimeout ? "Timeout" : "Connection Error",
          target: logCtx.maskedTarget,
        },
      });
    }

    if (isTimeout) {
      const timeoutErr = new Error(`Tempo limite de ${timeout}ms excedido na conexão com a Pluggy.`);
      (timeoutErr as any).code = PLUGGY_ERROR_CODES.TIMEOUT;
      throw timeoutErr;
    }

    const upstreamErr = new Error(`Erro de conexão com a Pluggy: ${msg}`);
    (upstreamErr as any).code = PLUGGY_ERROR_CODES.UPSTREAM_ERROR;
    throw upstreamErr;
  } finally {
    clearTimeout(id);
  }
}

// ─── CACHE E GERENCIAMENTO DE API KEY DA PLUGGY EM MEMÓRIA ───
let cachedApiKey: { key: string; expiresAt: number } | null = null;
let authPromiseInFlight: Promise<string> | null = null;

async function getPluggyApiKey(forceRefresh = false, correlationId?: string): Promise<string> {
  if (!forceRefresh && cachedApiKey && cachedApiKey.expiresAt > Date.now() + 60_000) {
    return cachedApiKey.key;
  }

  if (authPromiseInFlight) {
    return authPromiseInFlight;
  }

  authPromiseInFlight = (async () => {
    try {
      const clientId = (Deno.env.get("PLUGGY_CLIENT_ID") ?? "").trim();
      const clientSecret = (Deno.env.get("PLUGGY_CLIENT_SECRET") ?? "").trim();

      if (!clientId || !clientSecret) {
        const err = new Error("Credenciais da Pluggy (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET) não configuradas no servidor.");
        (err as any).code = PLUGGY_ERROR_CODES.AUTH_ERROR;
        throw err;
      }

      let resp: Response;
      try {
        resp = await fetchWithTimeout(
          "https://api.pluggy.ai/auth",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, clientSecret }),
            timeout: 15000,
          },
          {
            operation: "auth",
            correlationId,
            maskedTarget: "https://api.pluggy.ai/auth",
          }
        );
      } catch (err: unknown) {
        throw err;
      }

      if (resp.status === 401 || resp.status === 403) {
        const err = new Error("Credenciais da Pluggy inválidas ou rejeitadas pelo provedor.");
        (err as any).code = PLUGGY_ERROR_CODES.AUTH_ERROR;
        throw err;
      }

      if (resp.status === 429) {
        const err = new Error("Limite de requisições da Pluggy atingido (Rate Limit 429). Tente novamente em instantes.");
        (err as any).code = "RATE_LIMIT_EXCEEDED";
        throw err;
      }

      const rawBody = await resp.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawBody);
      } catch {
        const err = new Error(`Resposta inválida da autenticação Pluggy (status ${resp.status}).`);
        (err as any).code = PLUGGY_ERROR_CODES.UPSTREAM_ERROR;
        throw err;
      }

      if (!resp.ok || !data.apiKey) {
        const errorMsg = data.message || data.error || data.detail || `Falha na autenticação Pluggy (status ${resp.status})`;
        const err = new Error(String(errorMsg));
        (err as any).code = PLUGGY_ERROR_CODES.AUTH_ERROR;
        throw err;
      }

      const apiKey = String(data.apiKey);
      const expiresInSec = typeof data.expiresIn === "number" ? data.expiresIn : 5400; // 90 min default
      cachedApiKey = { key: apiKey, expiresAt: Date.now() + expiresInSec * 1000 };
      return apiKey;
    } finally {
      authPromiseInFlight = null;
    }
  })();

  return authPromiseInFlight;
}

// ─── HELPER PARA BUSCA DE TRANSAÇÕES POR CONTA (API v2, cursor-based) ───
async function fetchTransactionsForAccount(apiKey: string, accountId: string, correlationId?: string): Promise<any[]> {
  const allTxs: any[] = [];
  let url: string | null = `https://api.pluggy.ai/transactions?accountId=${encodeURIComponent(accountId)}&pageSize=500`;
  let pages = 0;
  const maxPages = 20; // Até 10.000 transações por conta

  while (url && pages < maxPages) {
    const resp = await fetchWithTimeout(
      url,
      {
        headers: { "X-API-KEY": apiKey },
        timeout: 20000,
      },
      {
        operation: "fetchTransactionsForAccount",
        correlationId,
        maskedTarget: `account=${maskId(accountId)} page=${pages + 1}`,
      }
    );

    if (!resp.ok) {
      logger.warn(`HTTP ${resp.status} ao buscar transações`, {
        operation: "fetchTransactionsForAccount",
        correlationId,
        metadata: { accountId: maskId(accountId), page: pages + 1, status: resp.status },
      });
      break;
    }

    const data = await resp.json().catch(() => ({}));
    const results = data.results || [];
    allTxs.push(...results);

    // Suporta tanto cursor v2 (next) quanto paginação v1 (page/totalPages)
    if (data.next) {
      url = data.next;
    } else if (data.totalPages && data.page < data.totalPages) {
      url = `https://api.pluggy.ai/transactions?accountId=${encodeURIComponent(accountId)}&pageSize=500&page=${data.page + 1}`;
    } else {
      url = null;
    }

    pages++;
    if (results.length === 0) break;
  }

  return allTxs;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const origin = req.headers.get("Origin");
  if (origin && !isOriginAllowed(origin)) {
    logger.warn("Origem CORS não autorizada", {
      correlationId,
      operation: "cors_check",
      metadata: { origin },
    });
    return createErrorResponse(req, {
      status: HTTP_STATUS.FORBIDDEN,
      code: PLUGGY_ERROR_CODES.FORBIDDEN,
      message: "Origem CORS não autorizada.",
      correlationId,
      corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return createErrorResponse(req, {
      status: HTTP_STATUS.METHOD_NOT_ALLOWED,
      message: `Método ${req.method} não permitido`,
      correlationId,
      corsHeaders,
    });
  }

  try {
    // 1. Extração do Token JWT do Usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return createErrorResponse(req, {
        status: HTTP_STATUS.UNAUTHORIZED,
        code: PLUGGY_ERROR_CODES.AUTH_ERROR,
        message: "Token de autenticação ausente.",
        correlationId,
        corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      logger.error("Configuração do Supabase ausente ou incompleta", {
        correlationId,
        operation: "env_check",
      });
      return createErrorResponse(req, {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        message: "Configuração do servidor ausente ou incompleta.",
        correlationId,
        corsHeaders,
      });
    }

    // 2. Cliente Autenticado com JWT do Usuário (NÃO usa service_role como fallback)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(req, {
        status: HTTP_STATUS.UNAUTHORIZED,
        code: PLUGGY_ERROR_CODES.AUTH_ERROR,
        message: "Usuário não autenticado ou token inválido.",
        correlationId,
        corsHeaders,
      });
    }

    const userId = user.id;

    // 3. Leitura e Validação do Payload
    const requestBody = await req.json().catch(() => ({}));
    const { action, workspace_id, itemId, ...params } = requestBody;

    if (!action) {
      return createErrorResponse(req, {
        status: HTTP_STATUS.BAD_REQUEST,
        message: "Parâmetro 'action' é obrigatório.",
        correlationId,
        corsHeaders,
      });
    }

    if (!workspace_id) {
      return createErrorResponse(req, {
        status: HTTP_STATUS.BAD_REQUEST,
        message: "Parâmetro 'workspace_id' é obrigatório.",
        correlationId,
        corsHeaders,
      });
    }

    // 4. Validação de Acesso ao Workspace no Contexto Real do Usuário (auth.uid() = userId)
    const { data: hasAccess } = await userClient
      .rpc("tem_acesso_workspace", { p_workspace_id: workspace_id })
      .maybeSingle();

    let authorized = hasAccess === true;

    if (!authorized) {
      const { data: wsDirect } = await userClient
        .from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .maybeSingle();

      if (wsDirect) {
        authorized = true;
      }
    }

    if (!authorized) {
      logger.warn("Acesso negado ao workspace", {
        correlationId,
        operation: "authorize_workspace",
        userId: maskId(userId),
        workspaceId: maskId(workspace_id),
      });
      return createErrorResponse(req, {
        status: HTTP_STATUS.FORBIDDEN,
        code: PLUGGY_ERROR_CODES.FORBIDDEN,
        message: "Acesso negado ao workspace especificado.",
        correlationId,
        corsHeaders,
      });
    }

    // 5. Inicialização do Cliente Service Role SOMENTE APÓS Autorização Confirmada
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 6. Execução das Ações Seguras
    switch (action) {
      // ─── GERAÇÃO DE CONNECT TOKEN COM CLIENT USER ID DERIVADO ───
      case "getConnectToken": {
        const apiKey = await getPluggyApiKey(false, correlationId);
        const clientUserId = await generateClientUserId(userId, workspace_id);

        let tokenRes: Response;
        try {
          tokenRes = await fetchWithTimeout(
            "https://api.pluggy.ai/connect_token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-KEY": apiKey,
              },
              body: JSON.stringify({
                options: {
                  clientUserId,
                },
              }),
              timeout: 15000,
            },
            {
              operation: "getConnectToken",
              correlationId,
              maskedTarget: "https://api.pluggy.ai/connect_token",
            }
          );
        } catch (err: any) {
          if (err.code === PLUGGY_ERROR_CODES.TIMEOUT) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.GATEWAY_TIMEOUT,
              code: PLUGGY_ERROR_CODES.TIMEOUT,
              message: "Tempo limite excedido ao comunicar com a Pluggy.",
              correlationId,
              corsHeaders,
            });
          }
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_GATEWAY,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: `Erro ao gerar Connect Token na Pluggy: ${err.message}`,
            correlationId,
            corsHeaders,
          });
        }

        if (tokenRes.status === 401) {
          const freshApiKey = await getPluggyApiKey(true, correlationId);
          tokenRes = await fetchWithTimeout(
            "https://api.pluggy.ai/connect_token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-KEY": freshApiKey,
              },
              body: JSON.stringify({ options: { clientUserId } }),
              timeout: 15000,
            },
            {
              operation: "getConnectToken_retry",
              correlationId,
              maskedTarget: "https://api.pluggy.ai/connect_token",
            }
          );
        }

        if (tokenRes.status === 429) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.RATE_LIMIT,
            code: "RATE_LIMIT_EXCEEDED",
            message: "Limite de requisições da Pluggy atingido.",
            correlationId,
            corsHeaders,
          });
        }

        const tokenData = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenData.accessToken) {
          const errDetail = tokenData.message || tokenData.error || "Falha ao gerar accessToken na Pluggy.";
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: String(errDetail),
            correlationId,
            corsHeaders,
          });
        }

        logger.info("Connect Token gerado com sucesso", {
          correlationId,
          operation: "getConnectToken",
          workspaceId: maskId(workspace_id),
        });

        return jsonResponse(req, { success: true, data: { accessToken: tokenData.accessToken } }, 200, correlationId);
      }

      // ─── REGISTRO E VALIDAÇÃO SERVER-SIDE DO ITEM ───
      case "registerItem": {
        if (!itemId) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            message: "Parâmetro 'itemId' é obrigatório.",
            correlationId,
            corsHeaders,
          });
        }

        const apiKey = await getPluggyApiKey(false, correlationId);

        // 1. Valida na API da Pluggy se o item existe de fato
        let itemVerifyRes: Response;
        try {
          itemVerifyRes = await fetchWithTimeout(
            `https://api.pluggy.ai/items/${encodeURIComponent(String(itemId))}`,
            {
              headers: { "X-API-KEY": apiKey },
              timeout: 15000,
            },
            {
              operation: "registerItem_verify",
              correlationId,
              maskedTarget: `items/${maskId(itemId)}`,
            }
          );
        } catch (err: any) {
          if (err.code === PLUGGY_ERROR_CODES.TIMEOUT) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.GATEWAY_TIMEOUT,
              code: PLUGGY_ERROR_CODES.TIMEOUT,
              message: "Tempo limite excedido ao validar Item na Pluggy.",
              correlationId,
              corsHeaders,
            });
          }
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_GATEWAY,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: `Erro ao consultar Item na Pluggy: ${err.message}`,
            correlationId,
            corsHeaders,
          });
        }

        if (!itemVerifyRes.ok) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: "Item Pluggy não encontrado ou inválido na instituição financeira.",
            correlationId,
            corsHeaders,
          });
        }

        const itemRemoteData = await itemVerifyRes.json().catch(() => ({}));
        const expectedClientUserId = await generateClientUserId(userId, workspace_id);
        const remoteClientUserId = itemRemoteData.clientUserId || itemRemoteData.user;

        // Validação estrita e obrigatória do clientUserId
        if (!remoteClientUserId) {
          logger.warn("Item não possui clientUserId retornado pela Pluggy", {
            correlationId,
            operation: "registerItem",
            metadata: { itemId: maskId(itemId) },
          });
          return createErrorResponse(req, {
            status: HTTP_STATUS.FORBIDDEN,
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: "Item Pluggy inválido: clientUserId ausente na instituição.",
            correlationId,
            corsHeaders,
          });
        }

        if (remoteClientUserId !== expectedClientUserId) {
          logger.warn("clientUserId mismatch", {
            correlationId,
            operation: "registerItem",
            metadata: { remote: maskId(remoteClientUserId), expected: maskId(expectedClientUserId) },
          });
          return createErrorResponse(req, {
            status: HTTP_STATUS.FORBIDDEN,
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: "O Item informado pertence a outra sessão ou usuário.",
            correlationId,
            corsHeaders,
          });
        }

        // 2. Proteção contra transferência indevida de ownership
        const { data: existingItem } = await supabaseAdmin
          .from("pluggy_items")
          .select("id, workspace_id, user_id, status, connector_name, item_id")
          .eq("item_id", String(itemId))
          .maybeSingle();

        if (existingItem) {
          if (existingItem.workspace_id !== workspace_id || existingItem.user_id !== userId) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.FORBIDDEN,
              code: PLUGGY_ERROR_CODES.FORBIDDEN,
              message: "Item já vinculado a outro usuário ou workspace.",
              correlationId,
              corsHeaders,
            });
          }
          // Idempotência: mesmo usuário e workspace retorna sucesso
          return jsonResponse(req, {
            success: true,
            data: {
              id: existingItem.id,
              item_id: existingItem.item_id,
              status: existingItem.status,
              connector_name: existingItem.connector_name,
            },
          }, 200, correlationId);
        }

        const connectorId = params.connectorId ? Number(params.connectorId) : (itemRemoteData.connector?.id ?? null);
        const connectorName = params.connectorName ? String(params.connectorName) : (itemRemoteData.connector?.name ?? null);

        // 3. Inserção com proteção final de UNIQUE(item_id)
        const { data: itemRecord, error: itemError } = await supabaseAdmin
          .from("pluggy_items")
          .insert({
            user_id: userId,
            workspace_id,
            item_id: String(itemId),
            connector_id: connectorId,
            connector_name: connectorName,
            client_user_id: expectedClientUserId,
            status: itemRemoteData.status || "UPDATED",
          })
          .select()
          .single();

        if (itemError) {
          if (itemError.code === "23505") {
            return createErrorResponse(req, {
              status: HTTP_STATUS.CONFLICT,
              message: "Este item já está registrado em outro contexto.",
              correlationId,
              corsHeaders,
            });
          }
          logger.error("Erro ao registrar item no banco", {
            correlationId,
            operation: "registerItem",
            metadata: { error: itemError.message },
          });
          return createErrorResponse(req, {
            status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            message: "Erro ao registrar Item no banco de dados.",
            correlationId,
            corsHeaders,
          });
        }

        logger.info("Item Pluggy registrado com sucesso", {
          correlationId,
          operation: "registerItem",
          metadata: { itemId: maskId(itemId), connectorName },
        });

        return jsonResponse(req, {
          success: true,
          data: {
            id: itemRecord.id,
            item_id: itemRecord.item_id,
            status: itemRecord.status,
            connector_name: itemRecord.connector_name,
          },
        }, 200, correlationId);
      }

      // ─── CONSULTA DE CONTAS SANITIZADAS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getAccounts": {
        if (!itemId) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            message: "Parâmetro 'itemId' é obrigatório.",
            correlationId,
            corsHeaders,
          });
        }

        const { data: itemValid } = await supabaseAdmin
          .from("pluggy_items")
          .select("id")
          .eq("item_id", String(itemId))
          .eq("workspace_id", workspace_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!itemValid) {
          logger.warn("Item não autorizado para consulta de contas", {
            correlationId,
            operation: "getAccounts",
            metadata: { itemId: maskId(itemId), userId: maskId(userId) },
          });
          return createErrorResponse(req, {
            status: HTTP_STATUS.FORBIDDEN,
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: "Item não encontrado ou não pertence a este workspace.",
            correlationId,
            corsHeaders,
          });
        }

        const apiKey = await getPluggyApiKey(false, correlationId);
        let accRes: Response;
        try {
          accRes = await fetchWithTimeout(
            `https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(String(itemId))}`,
            {
              headers: { "X-API-KEY": apiKey },
              timeout: 15000,
            },
            {
              operation: "getAccounts",
              correlationId,
              maskedTarget: `accounts?itemId=${maskId(itemId)}`,
            }
          );
        } catch (err: any) {
          if (err.code === PLUGGY_ERROR_CODES.TIMEOUT) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.GATEWAY_TIMEOUT,
              code: PLUGGY_ERROR_CODES.TIMEOUT,
              message: "Tempo limite excedido ao buscar contas na Pluggy.",
              correlationId,
              corsHeaders,
            });
          }
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_GATEWAY,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: `Erro ao buscar contas na Pluggy: ${err.message}`,
            correlationId,
            corsHeaders,
          });
        }

        if (!accRes.ok) {
          const errBody = await accRes.json().catch(() => ({}));
          return createErrorResponse(req, {
            status: accRes.status,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: errBody.message || `Erro ao buscar contas na Pluggy (HTTP ${accRes.status}).`,
            correlationId,
            corsHeaders,
          });
        }

        const accData = await accRes.json().catch(() => ({}));
        const rawAccounts = accData.results || accData.accounts || [];

        const sanitizedAccounts = rawAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: a.balance,
          currencyCode: a.currencyCode,
          number: a.number ? `****${String(a.number).slice(-4)}` : undefined,
        }));

        return jsonResponse(req, { success: true, data: sanitizedAccounts }, 200, correlationId);
      }

      // ─── CONSULTA DE TRANSAÇÕES PAGINADAS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getTransactions": {
        if (!itemId && !params.accountId) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            message: "Parâmetro 'itemId' ou 'accountId' é obrigatório.",
            correlationId,
            corsHeaders,
          });
        }

        // Valida ownership do item
        if (itemId) {
          const { data: itemValid } = await supabaseAdmin
            .from("pluggy_items")
            .select("id")
            .eq("item_id", String(itemId))
            .eq("workspace_id", workspace_id)
            .eq("user_id", userId)
            .maybeSingle();

          if (!itemValid) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.FORBIDDEN,
              code: PLUGGY_ERROR_CODES.FORBIDDEN,
              message: "Item não encontrado ou não pertence a este workspace.",
              correlationId,
              corsHeaders,
            });
          }
        }

        // Valida ownership da conta se accountId fornecido
        if (params.accountId) {
          const { data: accValid } = await supabaseAdmin
            .from("contas_usuario")
            .select("id")
            .eq("pluggy_account_id", String(params.accountId))
            .eq("workspace_id", workspace_id)
            .maybeSingle();

          if (!accValid) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.FORBIDDEN,
              code: PLUGGY_ERROR_CODES.FORBIDDEN,
              message: "Conta não encontrada ou não pertence a este workspace.",
              correlationId,
              corsHeaders,
            });
          }
        }

        const apiKey = await getPluggyApiKey(false, correlationId);

        // Se accountId fornecido, busca por conta; senão busca todas contas do item
        let allTransactions: any[] = [];
        if (params.accountId) {
          allTransactions = await fetchTransactionsForAccount(apiKey, String(params.accountId), correlationId);
        } else {
          // Fallback: busca contas do item e itera
          const accRes = await fetchWithTimeout(
            `https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(String(itemId))}`,
            {
              headers: { "X-API-KEY": apiKey },
              timeout: 15000,
            },
            {
              operation: "getTransactions_fetchAccounts",
              correlationId,
              maskedTarget: `accounts?itemId=${maskId(itemId)}`,
            }
          );
          const accData = accRes.ok ? await accRes.json().catch(() => ({})) : {};
          const accounts = accData.results || accData.accounts || [];
          for (const acc of accounts) {
            if (!acc.id) continue;
            const txs = await fetchTransactionsForAccount(apiKey, String(acc.id), correlationId);
            allTransactions.push(...txs);
          }
        }

        const sanitizedTransactions = allTransactions.map((t: any) => ({
          id: t.id,
          accountId: t.accountId,
          description: t.description,
          amount: t.amount,
          date: t.date,
          category: t.category,
          type: t.type,
          status: t.status,
          billId: t.billId || t.creditCardMetadata?.billId || null,
          installmentNumber: t.creditCardMetadata?.installmentNumber || null,
          totalInstallments: t.creditCardMetadata?.totalInstallments || null,
        }));

        return jsonResponse(req, {
          success: true,
          data: sanitizedTransactions,
          total: sanitizedTransactions.length,
        }, 200, correlationId);
      }

      // ─── CONSULTA DE INVESTIMENTOS SANITIZADOS COM VALIDAÇÃO DE OWNERSHIP ───
      case "getInvestments": {
        if (!itemId) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            message: "Parâmetro 'itemId' é obrigatório.",
            correlationId,
            corsHeaders,
          });
        }

        const { data: itemValid } = await supabaseAdmin
          .from("pluggy_items")
          .select("id")
          .eq("item_id", String(itemId))
          .eq("workspace_id", workspace_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!itemValid) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.FORBIDDEN,
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: "Item não encontrado ou não pertence a este workspace.",
            correlationId,
            corsHeaders,
          });
        }

        const apiKey = await getPluggyApiKey(false, correlationId);
        let invRes: Response;
        try {
          invRes = await fetchWithTimeout(
            `https://api.pluggy.ai/investments?itemId=${encodeURIComponent(String(itemId))}`,
            {
              headers: { "X-API-KEY": apiKey },
              timeout: 15000,
            },
            {
              operation: "getInvestments",
              correlationId,
              maskedTarget: `investments?itemId=${maskId(itemId)}`,
            }
          );
        } catch (err: any) {
          if (err.code === PLUGGY_ERROR_CODES.TIMEOUT) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.GATEWAY_TIMEOUT,
              code: PLUGGY_ERROR_CODES.TIMEOUT,
              message: "Tempo limite excedido ao buscar investimentos na Pluggy.",
              correlationId,
              corsHeaders,
            });
          }
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_GATEWAY,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: `Erro ao buscar investimentos na Pluggy: ${err.message}`,
            correlationId,
            corsHeaders,
          });
        }

        if (!invRes.ok) {
          const errBody = await invRes.json().catch(() => ({}));
          return createErrorResponse(req, {
            status: invRes.status,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: errBody.message || `Erro ao buscar investimentos na Pluggy (HTTP ${invRes.status}).`,
            correlationId,
            corsHeaders,
          });
        }

        const invData = await invRes.json().catch(() => ({}));
        const rawInvestments = invData.results || invData.investments || [];

        const sanitizedInvestments = rawInvestments.map((inv: any) => ({
          id: inv.id,
          name: inv.name,
          value: inv.value,
          type: inv.type,
          currencyCode: inv.currencyCode,
        }));

        return jsonResponse(req, { success: true, data: sanitizedInvestments }, 200, correlationId);
      }

      // ─── SINCRONIZAÇÃO IDEMPOTENTE DE CONTAS E TRANSAÇÕES ───
      case "syncItem": {
        if (!itemId) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_REQUEST,
            message: "Parâmetro 'itemId' é obrigatório.",
            correlationId,
            corsHeaders,
          });
        }

        const expectedClientUserId = await generateClientUserId(userId, workspace_id);

        // Confere se o item pertence a outro workspace
        const { data: existingItem } = await supabaseAdmin
          .from("pluggy_items")
          .select("id, workspace_id, user_id")
          .eq("item_id", String(itemId))
          .maybeSingle();

        if (existingItem && (existingItem.workspace_id !== workspace_id || existingItem.user_id !== userId)) {
          return createErrorResponse(req, {
            status: HTTP_STATUS.FORBIDDEN,
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: "Item já vinculado a outro workspace.",
            correlationId,
            corsHeaders,
          });
        }

        // Garante que o item está registrado no workspace
        if (!existingItem) {
          await supabaseAdmin.from("pluggy_items").insert({
            user_id: userId,
            workspace_id,
            item_id: String(itemId),
            connector_name: params.connectorName ? String(params.connectorName) : null,
            client_user_id: expectedClientUserId,
            status: "UPDATED",
          });
        }

        const apiKey = await getPluggyApiKey(false, correlationId);

        // 1. Busca contas na Pluggy
        let accRes: Response;
        try {
          accRes = await fetchWithTimeout(
            `https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(String(itemId))}`,
            {
              headers: { "X-API-KEY": apiKey },
              timeout: 15000,
            },
            {
              operation: "syncItem_fetchAccounts",
              correlationId,
              maskedTarget: `accounts?itemId=${maskId(itemId)}`,
            }
          );
        } catch (err: any) {
          if (err.code === PLUGGY_ERROR_CODES.TIMEOUT) {
            return createErrorResponse(req, {
              status: HTTP_STATUS.GATEWAY_TIMEOUT,
              code: PLUGGY_ERROR_CODES.TIMEOUT,
              message: "Tempo limite excedido ao sincronizar contas da Pluggy.",
              correlationId,
              corsHeaders,
            });
          }
          return createErrorResponse(req, {
            status: HTTP_STATUS.BAD_GATEWAY,
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: `Erro ao buscar contas na Pluggy: ${err.message}`,
            correlationId,
            corsHeaders,
          });
        }

        const accData = accRes.ok ? await accRes.json().catch(() => ({})) : {};
        const accountsList = accData.results || accData.accounts || [];

        // 2. Busca categorias existentes do usuário para match
        const { data: categoriasExistentes } = await supabaseAdmin
          .from("categorias")
          .select("id, nome")
          .eq("user_id", userId);

        const catMap = new Map<string, string>();
        (categoriasExistentes || []).forEach((c: { id: string; nome?: string }) => {
          if (c.nome) catMap.set(c.nome.toLowerCase().trim(), c.id);
        });

        let syncedAccountsCount = 0;
        let syncedTxCount = 0;
        let totalTxFetched = 0;

        for (const acc of accountsList) {
          if (!acc.id) continue;

          let tipoConta = "conta_corrente";
          if (acc.type === "CREDIT") tipoConta = "cartao_credito";
          else if (acc.type === "SAVINGS") tipoConta = "poupanca";

          let nomeConta = acc.name || "Conta Bancária";
          const conn = (params.connectorName || "").trim();
          const accLower = (acc.name || "").toLowerCase();

          if (conn === "MeuPluggy" || conn.toLowerCase().includes("nu pagamentos") || conn.toLowerCase().includes("nubank")) {
            if (accLower.includes("nu pagamentos") || accLower.includes("nubank") || tipoConta === "conta_corrente") {
              nomeConta = "Nubank (Conta Corrente)";
            } else if (accLower === "gold") {
              nomeConta = "Nubank (Cartão Gold)";
            } else if (accLower === "platinum") {
              nomeConta = "Nubank (Cartão Platinum)";
            } else if (accLower === "black" || accLower.includes("ultravioleta")) {
              nomeConta = "Nubank (Ultravioleta)";
            } else if (tipoConta === "cartao_credito") {
              nomeConta = `Nubank (Cartão ${acc.name})`;
            } else {
              nomeConta = `Nubank (${acc.name})`;
            }
          } else if (conn) {
            nomeConta = `${conn} (${acc.name})`;
          }

          let diaFechamento = null;
          let diaVencimento = null;
          let limiteCredito = null;

          if (acc.creditData) {
            limiteCredito = acc.creditData.creditLimit ? Number(acc.creditData.creditLimit) : null;
            if (acc.creditData.balanceCloseDate) {
              const closeDay = parseInt(acc.creditData.balanceCloseDate.substring(8, 10));
              if (!isNaN(closeDay)) diaFechamento = closeDay;
            }
            if (acc.creditData.balanceDueDate) {
              const dueDay = parseInt(acc.creditData.balanceDueDate.substring(8, 10));
              if (!isNaN(dueDay)) diaVencimento = dueDay;
            }
          } else if (tipoConta === "cartao_credito") {
            limiteCredito = 5000;
            diaFechamento = 1;
            diaVencimento = 10;
          }

          // Inserção/Atualização idempotente no workspace
          const { data: existingAccount } = await supabaseAdmin
            .from("contas_usuario")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("pluggy_account_id", String(acc.id))
            .maybeSingle();

          let targetAccountId = existingAccount?.id;

          if (!targetAccountId) {
            const { data: novaConta, error: accErr } = await supabaseAdmin
              .from("contas_usuario")
              .insert({
                user_id: userId,
                workspace_id,
                pluggy_account_id: String(acc.id),
                nome: nomeConta,
                tipo: tipoConta,
                saldo_inicial: Math.abs(acc.balance || 0),
                saldo_atual: Math.abs(acc.balance || 0),
                limite_credito: limiteCredito,
                dia_fechamento: diaFechamento,
                dia_vencimento: diaVencimento,
                cor: tipoConta === "cartao_credito" ? "#820AD1" : "#10B981",
              })
              .select("id")
              .single();

            if (accErr || !novaConta) {
              logger.error("Erro ao criar conta sincronizada", {
                correlationId,
                operation: "syncItem",
                metadata: { error: accErr?.message, accountName: nomeConta },
              });
              continue;
            }
            targetAccountId = novaConta.id;
          } else {
            await supabaseAdmin
              .from("contas_usuario")
              .update({
                saldo_atual: Math.abs(acc.balance || 0),
                limite_credito: limiteCredito,
                dia_fechamento: diaFechamento,
                dia_vencimento: diaVencimento,
              })
              .eq("id", targetAccountId);
          }

          syncedAccountsCount++;

          // ─── BUSCA TRANSAÇÕES DESTA CONTA ESPECÍFICA (v2 API, por accountId) ───
          const txList = await fetchTransactionsForAccount(apiKey, String(acc.id), correlationId);
          totalTxFetched += txList.length;

          logger.info("Transações sincronizadas para conta", {
            correlationId,
            operation: "syncItem",
            metadata: {
              accountName: nomeConta,
              tipoConta,
              pluggyAccId: maskId(acc.id),
              txCount: txList.length,
            },
          });

          for (const tx of txList) {
            if (!tx.id || tx.amount === undefined || !tx.date) continue;

            const isDespesa = tx.amount < 0 || tx.type === "DEBIT";
            const valorAbs = Math.abs(tx.amount || 0);
            const tipo = isDespesa ? "despesa" : "receita";
            const catNome = tx.category || (isDespesa ? "Despesas Diversas" : "Rendas Diversas");
            const catKey = catNome.toLowerCase().trim();

            let categoriaId = catMap.get(catKey);
            if (!categoriaId) {
              const { data: newCat } = await supabaseAdmin
                .from("categorias")
                .insert({
                  user_id: userId,
                  nome: catNome,
                  tipo,
                  cor: tipo === "receita" ? "#10B981" : "#F43F5E",
                  icone: "Tag",
                })
                .select("id")
                .single();

              if (newCat) {
                categoriaId = newCat.id;
                catMap.set(catKey, newCat.id);
              }
            }

            // Metadados de fatura e parcelas (específicos de cartão de crédito)
            const billId = tx.billId || tx.creditCardMetadata?.billId || null;
            const parcelaNumero = tx.creditCardMetadata?.installmentNumber || null;
            const parcelaTotal = tx.creditCardMetadata?.totalInstallments || null;
            const statusTransacao = tx.status || null; // PENDING | POSTED

            // Upsert: insere ou atualiza (PENDING → POSTED, billId atribuído, etc.)
            const txData = {
              user_id: userId,
              workspace_id,
              conta_id: targetAccountId,
              categoria_id: categoriaId || null,
              pluggy_transaction_id: String(tx.id),
              tipo,
              descricao: tx.description || "Transação Open Finance",
              valor: valorAbs,
              data: tx.date ? String(tx.date).substring(0, 10) : new Date().toISOString().substring(0, 10),
              metodo_pagamento: tipoConta === "cartao_credito" ? "cartao_credito" : "pix",
              observacoes: `Importado via Pluggy Open Finance (${catNome})`,
              status_transacao: statusTransacao,
              pluggy_bill_id: billId,
              parcela_numero: parcelaNumero,
              parcela_total: parcelaTotal,
            };

            // Tenta upsert: se pluggy_transaction_id já existe, atualiza campos relevantes
            const { data: existingTx } = await supabaseAdmin
              .from("transacoes")
              .select("id")
              .eq("workspace_id", workspace_id)
              .eq("pluggy_transaction_id", String(tx.id))
              .maybeSingle();

            if (existingTx) {
              // Atualiza campos que podem mudar (PENDING→POSTED, billId atribuído)
              await supabaseAdmin
                .from("transacoes")
                .update({
                  status_transacao: statusTransacao,
                  pluggy_bill_id: billId,
                  valor: valorAbs,
                  data: txData.data,
                  descricao: txData.descricao,
                })
                .eq("id", existingTx.id);
              syncedTxCount++;
            } else {
              const { error: insertTxErr } = await supabaseAdmin.from("transacoes").insert(txData);
              if (!insertTxErr) {
                syncedTxCount++;
              } else {
                logger.warn("Erro ao inserir transação sincronizada", {
                  correlationId,
                  operation: "syncItem_insertTx",
                  metadata: { txId: maskId(tx.id), error: insertTxErr.message },
                });
              }
            }
          }
        }

        return jsonResponse(req, {
          success: true,
          data: {
            accountsCount: syncedAccountsCount,
            transactionsCount: syncedTxCount,
            investmentsCount: 0,
            totalTransactionsFetched: totalTxFetched,
          },
        }, 200, correlationId);
      }

      default:
        return createErrorResponse(req, {
          status: HTTP_STATUS.BAD_REQUEST,
          message: `Ação desconhecida: ${action}`,
          correlationId,
          corsHeaders,
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code || PLUGGY_ERROR_CODES.UPSTREAM_ERROR;
    const status = code === PLUGGY_ERROR_CODES.TIMEOUT ? HTTP_STATUS.GATEWAY_TIMEOUT : HTTP_STATUS.INTERNAL_SERVER_ERROR;

    logger.error("Erro inesperado na execução", {
      correlationId,
      operation: "serve_catch",
      errorCode: code,
      metadata: { error: msg },
    });

    return createErrorResponse(req, {
      status,
      code,
      message: msg,
      correlationId,
      corsHeaders,
    });
  }
});
