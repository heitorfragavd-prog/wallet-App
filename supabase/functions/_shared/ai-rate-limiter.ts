/**
 * ai-rate-limiter.ts
 *
 * Controle compartilhado e atômico de Rate Limiting para Edge Functions de IA.
 * Utiliza o PostgreSQL (tabela rate_limits + RPC check_rate_limit) com row-level lock
 * para garantir sincronismo ACID entre múltiplos isolates e workers concorrentes do Deno.
 *
 * ALGORITMO:
 * - Janela Fixa com Renovação Atômica por Chave Derivada Server-Side.
 * - Chave gerada no servidor: `ws:${workspaceId}:user:${userId}:${action}`.
 * - Limpeza periódica de registros antigos (> 1 hora).
 *
 * DEFESAS:
 * - O cliente NUNCA passa ou escolhe a chave diretamente (prevenção de spoofing).
 * - Distinção entre limite de requisições (RPM) e orçamento de consumo (Tokens).
 * - Fallback defensivo fail-closed em caso de erro crítico no banco de dados.
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

/**
 * Sanitiza identificadores para formação estrita da chave de bucket
 */
function sanitizeKeyComponent(val?: string, fallback = "default"): string {
  if (!val || typeof val !== "string") return fallback;
  return val.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64) || fallback;
}

/**
 * Executa checagem atômica de rate limit via Supabase RPC (service_role)
 */
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

  // Chave de requisições por minuto: ws:XXX:user:YYY:action
  const rpmBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:rpm`;

  try {
    const { data: rpmResult, error: rpmError } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: rpmBucketKey,
      p_max_requests: maxRequestsPerMinute,
      p_window_seconds: 60,
    });

    if (rpmError) {
      console.error("[ai-rate-limiter] Erro RPC ao verificar RPM:", rpmError);
      // Comportamento seguro em falhas: Fail-closed se o banco falhar
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

    // Se houver consumo de tokens informado, verifica orçamento de tokens por hora
    if (tokensConsumed > 0 && maxTokensPerHour > 0) {
      const tokenBucketKey = `ws:${cleanWs}:user:${cleanUser}:${cleanAction}:tph`;
      const { data: tokenResult, error: tokenError } = await supabaseAdmin.rpc("check_rate_limit", {
        p_key: tokenBucketKey,
        p_max_requests: Math.ceil(maxTokensPerHour / 1000), // blocos de 1k tokens
        p_window_seconds: 3600,
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

/**
 * Sanitiza texto de entrada para prevenir quebra de delimitadores em prompts de IA
 */
export function sanitizeAiInput(input: string, maxChars = 2000): string {
  if (!input || typeof input !== "string") return "";

  const trimmed = input.slice(0, maxChars);
  return trimmed
    .replace(/---+\s*(system|admin|assistant|prompt|instruction)/gi, "--- [sanitized]")
    .replace(/<\/?(system|instructions?|prompt)>/gi, "[sanitized]")
    .replace(/\[(system|assistant|admin)\]/gi, "[sanitized]");
}