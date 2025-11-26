/**
 * Webhook Validation Utilities
 * 
 * Provides shared validation functions for webhook endpoints:
 * - Token/signature validation
 * - Payload sanitization (XSS, SQL injection protection)
 * - Schema validation
 */

/**
 * Result of webhook validation
 */
export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Generic payload validator interface
 */
export interface PayloadValidator<T> {
  validate(payload: unknown): { isValid: boolean; data?: T; errors?: string[] };
}

/**
 * Validates webhook token against expected secret
 * 
 * @param token - Token from webhook request
 * @param secret - Expected secret token
 * @returns true if token matches secret
 */
export function validateWebhookToken(token: string | null, secret: string): boolean {
  if (!token) {
    console.warn('Webhook validation failed: No token provided');
    return false;
  }

  if (!secret) {
    console.error('Webhook validation failed: No secret configured');
    return false;
  }

  const isValid = token === secret;
  
  if (!isValid) {
    console.warn('Webhook validation failed: Token mismatch');
  }

  return isValid;
}

/**
 * Patterns for detecting malicious content
 */
const MALICIOUS_PATTERNS = {
  // SQL injection patterns
  sqlInjection: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION\s+SELECT)/gi,
    /(--|\#|\/\*|\*\/)/g,
    /(\bOR\b\s+\d+\s*=\s*\d+)/gi,
    /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
  ],
  
  // XSS patterns
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // event handlers like onclick=
    /<img[^>]+src[^>]*>/gi,
  ],
  
  // Path traversal
  pathTraversal: [
    /\.\.\//g,
    /\.\.\\\/g,
  ],
};

/**
 * Checks if a string contains malicious patterns
 */
function containsMaliciousContent(value: string): boolean {
  // Check SQL injection patterns
  for (const pattern of MALICIOUS_PATTERNS.sqlInjection) {
    if (pattern.test(value)) {
      console.warn('Malicious SQL pattern detected:', value.substring(0, 50));
      return true;
    }
  }

  // Check XSS patterns
  for (const pattern of MALICIOUS_PATTERNS.xss) {
    if (pattern.test(value)) {
      console.warn('Malicious XSS pattern detected:', value.substring(0, 50));
      return true;
    }
  }

  // Check path traversal
  for (const pattern of MALICIOUS_PATTERNS.pathTraversal) {
    if (pattern.test(value)) {
      console.warn('Path traversal pattern detected:', value.substring(0, 50));
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes a string value by removing/escaping malicious content
 */
function sanitizeString(value: string, maxLength: number = 10000): string {
  // Check length to prevent DoS
  if (value.length > maxLength) {
    console.warn(`String exceeds max length (${maxLength}), truncating`);
    value = value.substring(0, maxLength);
  }

  // Remove null bytes
  value = value.replace(/\0/g, '');

  // HTML encode special characters to prevent XSS
  value = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return value;
}

/**
 * Sanitizes a value recursively
 */
function sanitizeValue(value: unknown, depth: number = 0): unknown {
  // Prevent deep recursion DoS
  if (depth > 10) {
    console.warn('Max recursion depth reached during sanitization');
    return null;
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Check for malicious content
    if (containsMaliciousContent(value)) {
      console.warn('Rejecting value with malicious content');
      return '[REJECTED: Malicious content detected]';
    }
    return sanitizeString(value);
  }

  // Handle numbers and booleans
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Limit array size to prevent DoS
    if (value.length > 1000) {
      console.warn('Array exceeds max size (1000), truncating');
      value = value.slice(0, 1000);
    }
    return value.map(item => sanitizeValue(item, depth + 1));
  }

  // Handle objects
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    let keyCount = 0;

    for (const [key, val] of Object.entries(value)) {
      // Limit number of keys to prevent DoS
      if (keyCount >= 100) {
        console.warn('Object exceeds max keys (100), truncating');
        break;
      }

      // Sanitize key
      const sanitizedKey = sanitizeString(key, 100);
      
      // Sanitize value
      sanitized[sanitizedKey] = sanitizeValue(val, depth + 1);
      
      keyCount++;
    }

    return sanitized;
  }

  // Unknown type - return null
  console.warn('Unknown type during sanitization:', typeof value);
  return null;
}

/**
 * Sanitizes webhook payload to prevent XSS and SQL injection
 * 
 * @param payload - Raw payload from webhook
 * @param validator - Optional schema validator
 * @returns Sanitized payload
 * @throws Error if payload contains malicious content or fails validation
 */
export function sanitizePayload<T>(
  payload: unknown,
  validator?: PayloadValidator<T>
): T {
  // Sanitize the payload
  const sanitized = sanitizeValue(payload) as T;

  // Validate against schema if provided
  if (validator) {
    const validation = validator.validate(sanitized);
    
    if (!validation.isValid) {
      const errors = validation.errors?.join(', ') || 'Unknown validation error';
      throw new Error(`Payload validation failed: ${errors}`);
    }

    return validation.data as T;
  }

  return sanitized;
}

/**
 * Validates required fields in payload
 */
export function validateRequiredFields(
  payload: Record<string, unknown>,
  requiredFields: string[]
): WebhookValidationResult {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!(field in payload) || payload[field] === null || payload[field] === undefined) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      isValid: false,
      error: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }

  return { isValid: true };
}

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Logs webhook validation failure
 */
export function logValidationFailure(
  reason: string,
  context?: Record<string, unknown>
): void {
  console.error('Webhook validation failed:', {
    reason,
    timestamp: new Date().toISOString(),
    ...context,
  });
}
