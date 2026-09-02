/**
 * Correlation ID Helper for Frontend Distributed Tracing
 */

const CORRELATION_ID_REGEX = /^[a-zA-Z0-9_-]{6,}$/;

export const CORRELATION_HEADER = 'X-Correlation-Id';

export function isValidCorrelationId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  return CORRELATION_ID_REGEX.test(trimmed);
}

export function generateCorrelationId(prefix?: string): string {
  let uuid: string;
  try {
    uuid = crypto.randomUUID();
  } catch {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    uuid = s4() + s4() + '-' + s4() + '-4' + s4().substring(0, 3) + '-8' + s4().substring(0, 3) + '-' + s4() + s4() + s4();
  }
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function ensureCorrelationId(candidate?: unknown, prefix?: string): string {
  if (isValidCorrelationId(candidate)) {
    return (candidate as string).trim();
  }
  return generateCorrelationId(prefix);
}

export function getCorrelationId(candidate?: unknown): string {
  return ensureCorrelationId(candidate);
}

export function withCorrelationHeader(
  headers: Record<string, string> = {},
  correlationId?: string
): Record<string, string> {
  const corrId = correlationId || getCorrelationId();
  return {
    ...headers,
    [CORRELATION_HEADER]: corrId,
  };
}
