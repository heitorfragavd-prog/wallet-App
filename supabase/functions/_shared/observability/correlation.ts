/**
 * Edge Functions Backend Correlation ID Helper (Deno & TypeScript compatible)
 * 
 * Handles extracting and propagating distributed tracing correlation IDs.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CORRELATION_HEADER = 'X-Correlation-Id';

/**
 * Validates whether a candidate string is a well-formed UUID
 */
export function isValidCorrelationId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Extracts correlation ID from incoming request headers or generates a fresh UUID.
 */
export function getCorrelationId(req?: Request | Headers | null): string {
  if (req) {
    const headers = req instanceof Request ? req.headers : req;
    const headerValue =
      headers.get(CORRELATION_HEADER) ||
      headers.get('x-correlation-id') ||
      headers.get('x-request-id');

    if (headerValue && isValidCorrelationId(headerValue)) {
      return headerValue.trim();
    }
  }

  // Generate safe cryptographically random UUID
  try {
    return crypto.randomUUID();
  } catch {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-4${s4().substr(0, 3)}-8${s4().substr(0, 3)}-${s4()}${s4()}${s4()}`;
  }
}

/**
 * Enriches headers with the active correlation ID.
 */
export function withCorrelationHeader(
  headers: Record<string, string> = {},
  correlationId: string
): Record<string, string> {
  return {
    ...headers,
    [CORRELATION_HEADER]: correlationId,
  };
}
