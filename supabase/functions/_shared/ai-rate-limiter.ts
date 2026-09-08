/**
 * ai-rate-limiter.ts
 *
 * Rate limiting em janela deslizante (sliding window) para Edge Functions de IA.
 * Previne ataques de negação de carteira (Denial of Wallet) e esgotamento de quota.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const userRequestMap = new Map<string, RateLimitEntry>();

// Limpa entradas antigas a cada 5 minutos
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [key, entry] of userRequestMap.entries()) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) {
      userRequestMap.delete(key);
    }
  }
}, 300000);

export function checkAiRateLimit(
  userId: string,
  maxRequestsPerMinute = 20
): { allowed: boolean; retryAfterSeconds?: number; currentCount: number; limit: number } {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minuto

  let entry = userRequestMap.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    userRequestMap.set(userId, entry);
  }

  // Filtrar requisições fora da janela de 1 minuto
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  if (entry.timestamps.length >= maxRequestsPerMinute) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + 60000 - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      currentCount: entry.timestamps.length,
      limit: maxRequestsPerMinute,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    currentCount: entry.timestamps.length,
    limit: maxRequestsPerMinute,
  };
}

/**
 * Sanitiza texto de entrada contra breakout de delimitadores de prompt.
 * Não substitui a separação de papéis (system/user), mas adiciona defesa em profundidade.
 */
export function sanitizeDelimiters(input: string): string {
  if (!input) return "";
  return input.replace(/<\/?(?:transacao|comprovante|instrucao|system|assistant|user)[^>]*>/gi, "");
}
