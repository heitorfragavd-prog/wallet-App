/**
 * Sensitive Data Sanitizer
 * 
 * Redacts and masks credentials, tokens, sensitive personal information (PII)
 * and financial details from log entries.
 */

export const REDACTED_MARKER = '***REDACTED***';

/**
 * Keys that must have their values completely redacted.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password|passwd|pwd|senha/i,
  /token|jwt|bearer|authorization|cookie/i,
  /api[_-]?key|secret|service[_-]?role|private[_-]?key/i,
  /cvv|cvc|card[_-]?security|security[_-]?code/i,
  /session[_-]?token|refresh[_-]?token|access[_-]?token/i,
];

/**
 * Patterns inside string values that should be masked.
 */
const SENSITIVE_VALUE_PATTERNS = {
  // Credit card numbers (13 to 19 digits)
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g,
  
  // CPF (000.000.000-00 or 11 digits)
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  
  // CNPJ (00.000.000/0000-00 or 14 digits)
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Brazilian phone numbers ((11) 99999-9999 / +55 11 99999-9999)
  phone: /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-.\s]?\d{4}\b/g,
  
  // JWT / Bearer tokens
  bearerToken: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  jwt: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  
  // OpenAI / generic API keys (sk-..., etc.)
  apiKey: /\b(sk-[a-zA-Z0-9_-]{20,})\b/g,
};

/**
 * Checks if a key name is considered sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitizes a string value by masking regex patterns.
 */
export function sanitizeString(value: string): string {
  if (!value) return value;

  let sanitized = value;

  // Mask JWT & Bearer tokens first
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.bearerToken, `Bearer ${REDACTED_MARKER}`);
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.jwt, REDACTED_MARKER);
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.apiKey, REDACTED_MARKER);

  // Mask credit cards
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.creditCard, '****-****-****-****');

  // Mask CPF
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.cpf, '***.***.***-**');

  // Mask CNPJ
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.cnpj, '**.***.***/****-**');

  // Mask emails
  sanitized = sanitized.replace(SENSITIVE_VALUE_PATTERNS.email, (match) => {
    const parts = match.split('@');
    if (parts.length !== 2) return REDACTED_MARKER;
    const [local, domain] = parts;
    const prefix = local.length > 2 ? local.substring(0, 2) : local.charAt(0);
    return `${prefix}***@${domain}`;
  });

  return sanitized;
}

/**
 * Recursively sanitizes any data structure (objects, arrays, strings).
 * Protects against circular references.
 */
export function sanitizeData<T>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings
  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  // Handle primitives
  if (typeof data !== 'object') {
    return data;
  }

  // Check circular reference
  if (seen.has(data as object)) {
    return '[Circular]' as unknown as T;
  }
  seen.add(data as object);

  // Handle Error instances
  if (data instanceof Error) {
    const sanitizedError: Record<string, unknown> = {
      name: data.name,
      message: sanitizeString(data.message),
    };
    if (data.stack) {
      sanitizedError.stack = sanitizeString(data.stack);
    }
    return sanitizedError as unknown as T;
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, seen)) as unknown as T;
  }

  // Handle Objects
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key) && (typeof value !== 'object' || value === null)) {
      sanitized[key] = REDACTED_MARKER;
    } else {
      sanitized[key] = sanitizeData(value, seen);
    }
  }

  return sanitized as unknown as T;
}
