/**
 * ai-rate-limiter.ts
 *
 * Controle compartilhado e atômico de Rate Limiting para Edge Functions de IA.
 * Utiliza o PostgreSQL (tabela rate_limits + RPC check_rate_limit) com row-level lock
 * e UPSERT atômico (ON CONFLICT) para garantir consistência entre múltiplos isolates do Deno.
 *
 * RECURSOS:
 * 1. Limite de Requisições por Minuto (RPM): default 20 req/min por chave.
 * 2. Orçamento de Tokens por Hora (TPH): acumula proporcionalmente o consumo exato
 *    de tokens (p_cost = tokensConsumed) contra o teto por workspace/usuário.
 * 3. Chave gerada exclusivamente no servidor: `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:rpm`.
 * 4. Fallback fail-closed em caso de erro crítico no banco de dados.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  currentCount: number;
  limit: number;
  reason?: string;
  reservationId?: string;
}

export interface RateLimitOptions {
  userId: string;
  workspaceId?: string;
  action?: string;
  maxRequestsPerMinute?: number;
  tokensConsumed?: number;
  reserveTokens?: number;
  reservationId?: string;
  maxTokensPerHour?: number;
}

function sanitizeKeyComponent(val?: string, fallback = "default"): string {
  if (!val || typeof val !== "string") return fallback;
  return val.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64) || fallback;
}

/**
 * Validação server-side de autorização de workspace.
 * Evita forja de workspaceId para consumo indevido de quotas ou acesso não autorizado.
 */
export async function validateUserWorkspace(
  supabaseAdmin: any,
  userId: string,
  workspaceId?: string | null
): Promise<{ valid: boolean; workspaceId?: string; error?: string }> {
  // Se não foi fornecido workspaceId ou for o padrão "personal", escopo pessoal seguro
  if (!workspaceId || workspaceId === "personal" || workspaceId === "null" || workspaceId === "undefined") {
    return { valid: true, workspaceId: "personal" };
  }

  const cleanWs = String(workspaceId).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cleanWs)) {
    return { valid: false, error: "Identificador de workspace inválido" };
  }

  if (!supabaseAdmin) {
    return { valid: false, error: "Cliente de banco de dados indisponível para validação de workspace" };
  }

  try {
    // 1. Verifica se o usuário é o proprietário do workspace
    const { data: ownerData, error: ownerError } = await supabaseAdmin
      .from("workspaces")
      .select("id")
      .eq("id", cleanWs)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ownerError && ownerData) {
      return { valid: true, workspaceId: ownerData.id };
    }

    // 2. Verifica se o usuário é membro ativo na tabela workspace_members
    try {
      const { data: memberData, error: memberError } = await supabaseAdmin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", cleanWs)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();

      if (!memberError && memberData) {
        return { valid: true, workspaceId: cleanWs };
      }
    } catch {
      // Ignora erro se workspace_members não estiver configurada no schema atual
    }

    return { valid: false, error: "Acesso negado: workspace não pertence ao usuário autenticado" };
  } catch (err: any) {
    console.error("[ai-rate-limiter] Erro ao validar permissão no workspace:", err);
    return { valid: false, error: "Erro interno ao validar workspace" };
  }
}

export async function checkSharedRateLimit(
  supabaseAdmin: any,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const {
    userId,
    workspaceId,
    action = "ai_request",
    maxRequestsPerMinute = 20,
    tokensConsumed = 0,
    maxTokensPerHour = 50000,
  } = options;

  if (!userId || typeof userId !== "string") {
    return {
      allowed: false,
      currentCount: 0,
      limit: maxRequestsPerMinute,
      reason: "Identificador de usuário inválido",
    };
  }

  const cleanUser = sanitizeKeyComponent(userId);
  const cleanWs = sanitizeKeyComponent(workspaceId, "personal");
  const cleanAction = sanitizeKeyComponent(action);

  // 1. Verificação de Requisições por Minuto (RPM)
  const rpmBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:rpm`;

  try {
    const { data: rpmResult, error: rpmError } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: rpmBucketKey,
      p_max_requests: maxRequestsPerMinute,
      p_window_seconds: 60,
      p_cost: 1,
    });

    if (rpmError) {
      console.error("[ai-rate-limiter] Erro RPC ao verificar RPM:", rpmError);
      return {
        allowed: false,
        retryAfterSeconds: 30,
        currentCount: maxRequestsPerMinute,
        limit: maxRequestsPerMinute,
        reason: "Serviço temporariamente indisponível. Tente novamente em instantes.",
      };
    }

    const row = Array.isArray(rpmResult) ? rpmResult[0] : rpmResult;
    if (!row || !row.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: row?.retry_after_seconds || 60,
        currentCount: row?.current_count || maxRequestsPerMinute,
        limit: maxRequestsPerMinute,
        reason: "Limite de requisições excedido. Aguarde antes de enviar novas mensagens.",
      };
    }

    // 2. Verificação e Débito/Reserva de Tokens por Hora (TPH) com Idempotência
    const reserveTokens = options.reserveTokens ? Math.max(0, Math.round(options.reserveTokens)) : 0;
    const directTokens = options.tokensConsumed ? Math.max(0, Math.round(options.tokensConsumed)) : 0;
    let reservationId = options.reservationId;

    if (reserveTokens > 0 && maxTokensPerHour > 0) {
      const tokenBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:tph`;

      if (!reservationId) {
        reservationId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      // Tentativa primária: RPC atômica reserve_ai_tokens (com rastreamento de janela e idempotência)
      const { data: tokenResult, error: tokenError } = await supabaseAdmin.rpc("reserve_ai_tokens", {
        p_reservation_id: reservationId,
        p_key: tokenBucketKey,
        p_user_id: userId,
        p_workspace_id: workspaceId || null,
        p_action: action,
        p_reserved_tokens: reserveTokens,
        p_max_tokens_per_hour: maxTokensPerHour,
      });

      if (tokenError) {
        console.error("[ai-rate-limiter] Erro crítico na RPC reserve_ai_tokens:", tokenError);
        return {
          allowed: false,
          retryAfterSeconds: 60,
          currentCount: maxTokensPerHour,
          limit: maxTokensPerHour,
          reason: "Erro ao verificar cota de processamento de IA. Requisição bloqueada por segurança.",
        };
      }

      const tokenRow = Array.isArray(tokenResult) ? tokenResult[0] : tokenResult;
      if (!tokenRow || !tokenRow.allowed) {
        return {
          allowed: false,
          retryAfterSeconds: tokenRow?.retry_after_seconds || 300,
          currentCount: tokenRow?.current_count ?? maxTokensPerHour,
          limit: maxTokensPerHour,
          reason: "Orçamento de processamento de IA por hora atingido para este workspace.",
        };
      }
    } else if (directTokens > 0 && maxTokensPerHour > 0) {
      const tokenBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:tph`;
      const { data: tokenResult, error: tokenError } = await supabaseAdmin.rpc("check_rate_limit", {
        p_key: tokenBucketKey,
        p_max_requests: maxTokensPerHour,
        p_window_seconds: 3600,
        p_cost: directTokens,
      });

      if (tokenError) {
        console.error("[ai-rate-limiter] Erro crítico na RPC ao verificar TPH:", tokenError);
        return {
          allowed: false,
          retryAfterSeconds: 60,
          currentCount: maxTokensPerHour,
          limit: maxTokensPerHour,
          reason: "Erro ao verificar cota de processamento de IA. Requisição bloqueada por segurança.",
        };
      }

      const tokenRow = Array.isArray(tokenResult) ? tokenResult[0] : tokenResult;
      if (!tokenRow || !tokenRow.allowed) {
        return {
          allowed: false,
          retryAfterSeconds: tokenRow?.retry_after_seconds || 300,
          currentCount: tokenRow?.current_count ?? maxTokensPerHour,
          limit: maxTokensPerHour,
          reason: "Orçamento de processamento de IA por hora atingido para este workspace.",
        };
      }
    }

    return {
      allowed: true,
      currentCount: row.current_count,
      limit: maxRequestsPerMinute,
      reservationId: reservationId || undefined,
    };
  } catch (err: any) {
    console.error("[ai-rate-limiter] Exceção crítica:", err);
    return {
      allowed: false,
      retryAfterSeconds: 30,
      currentCount: maxRequestsPerMinute,
      limit: maxRequestsPerMinute,
      reason: "Erro interno ao validar cota de requisições.",
    };
  }
}

export async function reconcileAiTokens(
  supabaseAdmin: any,
  options: {
    userId: string;
    workspaceId?: string;
    action?: string;
    reservationId?: string;
    reservedTokens: number;
    actualTokensConsumed?: number;
    outcome?: "success" | "error" | "timeout" | "missing_usage";
  }
): Promise<{ status: string; deltaApplied?: number }> {
  const {
    userId,
    workspaceId,
    action = "ai_request",
    reservationId,
    reservedTokens,
    actualTokensConsumed,
    outcome = "success",
  } = options;

  if (!userId || !supabaseAdmin) return { status: "skipped" };

  // 1. Caminho único e durável: RPC reconcile_ai_tokens com idempotência e proteção de janela
  if (reservationId) {
    try {
      const { data, error } = await supabaseAdmin.rpc("reconcile_ai_tokens", {
        p_reservation_id: reservationId,
        p_actual_tokens: actualTokensConsumed != null ? Math.round(actualTokensConsumed) : null,
        p_outcome: outcome,
      });

      if (error) {
        console.error("[ai-rate-limiter] Erro na RPC reconcile_ai_tokens:", error);
        return { status: "error" };
      }

      if (data) {
        const row = Array.isArray(data) ? data[0] : data;
        return { status: row?.status || "reconciled", deltaApplied: row?.delta_applied };
      }
      return { status: "reconciled" };
    } catch (rpcErr) {
      console.error("[ai-rate-limiter] Exceção ao chamar reconcile_ai_tokens:", rpcErr);
      return { status: "exception" };
    }
  }

  // Se não houver reservationId, retenção conservadora para evitar estornos indevidos
  if (outcome === "timeout" || outcome === "missing_usage" || actualTokensConsumed == null) {
    return { status: "retained_conservative_estimate" };
  }

  return { status: "skipped_no_reservation" };
}

export function sanitizeAiInput(input: string, maxChars = 2000): string {
  if (!input || typeof input !== "string") return "";

  const trimmed = input.slice(0, maxChars);
  return trimmed
    .replace(/---+\s*(system|admin|assistant|prompt|instruction)/gi, "--- [sanitized]")
    .replace(/<\/?(system|instructions?|prompt)>/gi, "[sanitized]")
    .replace(/\[(system|assistant|admin)\]/gi, "[sanitized]");
}

// Fallback em memória para compatibilidade com consumidores legados ou testes unitários locais
const inMemoryFallbackBuckets = new Map<string, { count: number; windowStart: number }>();

export function checkAiRateLimit(
  userId: string,
  maxRequestsPerMinute = 20
): { allowed: boolean; retryAfterSeconds?: number; currentCount: number } {
  if (!userId) return { allowed: false, currentCount: 0 };
  const now = Date.now();
  const bucket = inMemoryFallbackBuckets.get(userId);
  if (!bucket || now - bucket.windowStart >= 60000) {
    inMemoryFallbackBuckets.set(userId, { count: 1, windowStart: now });
    return { allowed: true, currentCount: 1 };
  }
  if (bucket.count < maxRequestsPerMinute) {
    bucket.count++;
    return { allowed: true, currentCount: bucket.count };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + 60000 - now) / 1000));
  return { allowed: false, retryAfterSeconds, currentCount: bucket.count };
}