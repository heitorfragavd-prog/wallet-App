/**
 * Edge Functions Backend Error Handler (Deno & TypeScript compatible)
 * 
 * Standardizes error responses with:
 * - Proper HTTP status codes (400, 401, 403, 404, 409, 429, 500, 502, 503, 504)
 * - Safe JSON envelope: { error: { code, message, correlation_id } }
 * - Never leaks stack traces, internal database queries, or private secrets
 * - Enriches response headers with X-Correlation-Id
 */

import { getCorrelationId, withCorrelationHeader } from './correlation.ts';

export interface StandardErrorPayload {
  error: {
    code: string;
    message: string;
    correlation_id: string;
  };
  success: false;
}

export interface ErrorResponseOptions {
  status?: number;
  message?: string;
  code?: string;
  correlationId?: string;
  corsHeaders?: Record<string, string>;
}

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const OPENAI_ERROR_CODES = {
  TIMEOUT: 'OPENAI_TIMEOUT',
  UPSTREAM_ERROR: 'OPENAI_UPSTREAM_ERROR',
  RATE_LIMIT: 'OPENAI_RATE_LIMIT',
  AUTH_ERROR: 'OPENAI_AUTH_ERROR',
} as const;

export const PLUGGY_ERROR_CODES = {
  TIMEOUT: 'PLUGGY_TIMEOUT',
  UPSTREAM_ERROR: 'PLUGGY_UPSTREAM_ERROR',
  AUTH_ERROR: 'PLUGGY_AUTH_ERROR',
  FORBIDDEN: 'PLUGGY_FORBIDDEN',
} as const;

/**
 * Derives a standard error code from HTTP status if not provided explicitly
 */
function deriveErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_ALLOWED';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'GATEWAY_TIMEOUT';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

/**
 * Creates a standardized, secure HTTP error response
 */
export function createErrorResponse(
  req: Request | null | undefined,
  options: ErrorResponseOptions = {}
): Response {
  const status = options.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const correlationId = options.correlationId || getCorrelationId(req);
  const code = options.code || deriveErrorCode(status);

  // Safe default user message without stack trace or technical internals
  const message = options.message || (status >= 500 ? 'Ocorreu um erro interno no processamento.' : 'Requisição inválida.');

  const body: StandardErrorPayload = {
    success: false,
    error: {
      code,
      message,
      correlation_id: correlationId,
    },
  };

  const headers = withCorrelationHeader(
    {
      'Content-Type': 'application/json',
      ...(options.corsHeaders || {}),
    },
    correlationId
  );

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}
