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
}

export interface RateLimitOptions {
  userId: string;
  workspaceId?: string;
  action?: string;
  maxRequestsPerMinute?: number;
  tokensConsumed?: number;
  maxTokensPerHour?: number;
}

function sanitizeKeyComponent(val?: string, fallback = "default"): string {
  if (!val || typeof val !== "string") return fallback;
  return val.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64) || fallback;
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

    // 2. Verificação e Débito Proporcional de Tokens por Hora (TPH)
    if (tokensConsumed > 0 && maxTokensPerHour > 0) {
      const tokenBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:tph`;
      const { data: tokenResult, error: tokenError } = await supabaseAdmin.rpc("check_rate_limit", {
        p_key: tokenBucketKey,
        p_max_requests: maxTokensPerHour, // Teto total de tokens por hora
        p_window_seconds: 3600,
        p_cost: Math.max(1, Math.round(tokensConsumed)), // Contabilização PROPORCIONAL exata
      });

      if (!tokenError) {
        const tokenRow = Array.isArray(tokenResult) ? tokenResult[0] : tokenResult;
        if (tokenRow && !tokenRow.allowed) {
          return {
            allowed: false,
            retryAfterSeconds: tokenRow.retry_after_seconds || 300,
            currentCount: tokenRow.current_count,
            limit: maxTokensPerHour,
            reason: "Orçamento de processamento de IA por hora atingido para este workspace.",
          };
        }
      }
    }

    return {
      allowed: true,
      currentCount: row.current_count,
      limit: maxRequestsPerMinute,
    };
  } catch (err: any) {
    console.error("[ai-rate-limiter] Exceção crítica:", err);
    return {
      allowed: false,
      retryAfterSeconds: 30,
      currentCount: maxRequestsPerMinute,
      limit: maxRequestsPerMinute,
      reason: "Erro ao validar cota de requisições.",
    };
  }
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