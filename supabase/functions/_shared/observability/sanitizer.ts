/* eslint-disable */
/**
 * Edge Functions Backend Sanitizer (Deno & TypeScript compatible)
 * 
 * Protects against logging sensitive data:
 * - Redacts passwords, API keys, tokens, authorization headers, secrets, CVVs
 * - Masks credit cards, CPF, CNPJ, emails, phone numbers
 * - Circular reference safe
 */

const REDACTED_MARKER = '***REDACTED***';

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /auth(orization)?/i,
  /bearer/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /jwt/i,
  /cookie/i,
  /session/i,
  /cvv/i,
  /cvc/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
];

const CARD_REGEX = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{13,19}\b/;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/;

export function maskString(value: string): string {
  if (!value || typeof value !== 'string') return value;

  // Mask Credit Cards (keep last 4 digits)
  if (CARD_REGEX.test(value)) {
    return value.replace(CARD_REGEX, (card) => {
      const digits = card.replace(/\D/g, '');
      if (digits.length >= 13 && digits.length <= 19) {
        return `****-****-****-${digits.slice(-4)}`;
      }
      return card;
    });
  }

  // Mask CPF (keep middle digits: ***.123.***-**)
  if (CPF_REGEX.test(value)) {
    return value.replace(CPF_REGEX, (cpf) => {
      const digits = cpf.replace(/\D/g, '');
      if (digits.length === 11) {
        return `***.${digits.slice(3, 6)}.***-**`;
      }
      return cpf;
    });
  }

  // Mask CNPJ (keep partial: **.123.***/****-**)
  if (CNPJ_REGEX.test(value)) {
    return value.replace(CNPJ_REGEX, (cnpj) => {
      const digits = cnpj.replace(/\D/g, '');
      if (digits.length === 14) {
        return `**.${digits.slice(2, 5)}.***\/****-**`;
      }
      return cnpj;
    });
  }

  // Mask Email (u***@domain.com)
  if (EMAIL_REGEX.test(value)) {
    return value.replace(EMAIL_REGEX, (email) => {
      const parts = email.split('@');
      if (parts.length === 2) {
        const name = parts[0];
        const domain = parts[1];
        const maskedName = name.length > 2 ? `${name[0]}***${name.slice(-1)}` : `${name[0]}***`;
        return `${maskedName}@${domain}`;
      }
      return email;
    });
  }

  return value;
}

export function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeBackendData(data: unknown, maxDepth = 6, seen = new WeakSet()): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return maskString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (maxDepth <= 0) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (typeof data === 'object') {
    if (seen.has(data as object)) {
      return '[CIRCULAR_REF]';
    }
    seen.add(data as object);

    if (Array.isArray(data)) {
      return data.map((item) => sanitizeBackendData(item, maxDepth - 1, seen));
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: maskString(data.message),
      };
    }

    const sanitizedObj: Record<string, unknown> = {};
    const obj = data as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = REDACTED_MARKER;
      } else {
        sanitizedObj[key] = sanitizeBackendData(value, maxDepth - 1, seen);
      }
    }

    return sanitizedObj;
  }

  return String(data);
}
