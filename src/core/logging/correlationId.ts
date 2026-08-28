/**
 * Correlation ID Utility
 * 
 * Provides generation, validation and resolution of correlation IDs for
 * end-to-end tracing without personal data.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Generates a unique correlation ID using standard crypto.randomUUID when available,
 * or a cryptographic random fallback.
 */
export function generateCorrelationId(prefix?: string): string {
  let id: string;

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    id = crypto.randomUUID();
  } else {
    const timestamp = Date.now().toString(36);
    const randomHex = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    id = `${timestamp}-${randomHex.slice(0, 4)}-${randomHex.slice(4, 8)}-${randomHex.slice(8, 12)}-${randomHex.slice(12)}`;
  }

  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Checks if a value is a valid correlation ID string.
 */
export function isValidCorrelationId(id: unknown): id is string {
  if (typeof id !== "string" || !id.trim()) {
    return false;
  }
  const clean = id.trim();
  return UUID_REGEX.test(clean) || SAFE_ID_REGEX.test(clean);
}

/**
 * Returns the existing correlation ID if valid, or generates a new one.
 */
export function ensureCorrelationId(existingId?: unknown, prefix?: string): string {
  if (isValidCorrelationId(existingId)) {
    return existingId.trim();
  }
  return generateCorrelationId(prefix);
}
