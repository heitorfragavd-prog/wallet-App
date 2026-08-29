/**
 * Correlation ID Helper for Frontend Distributed Tracing
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CORRELATION_HEADER = 'X-Correlation-Id';

export function isValidCorrelationId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export function getCorrelationId(candidate?: unknown): string {
  if (isValidCorrelationId(candidate)) {
    return (candidate as string).trim();
  }

  try {
    return crypto.randomUUID();
  } catch {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4() + '-4' + s4().substr(0, 3) + '-8' + s4().substr(0, 3) + '-' + s4() + s4() + s4();
  }
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
