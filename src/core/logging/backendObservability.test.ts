import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeBackendData,
  maskString,
} from '../../../supabase/functions/_shared/observability/sanitizer';
import {
  getCorrelationId,
  isValidCorrelationId,
  withCorrelationHeader,
  CORRELATION_HEADER,
} from '../../../supabase/functions/_shared/observability/correlation';
import {
  BackendLogger,
  createBackendLogger,
} from '../../../supabase/functions/_shared/observability/logger';
import {
  createErrorResponse,
  HTTP_STATUS,
} from '../../../supabase/functions/_shared/observability/errors';

describe('Backend Observability - Sanitizer', () => {
  it('should redact sensitive keys in objects', () => {
    const payload = {
      password: 'superSecretPassword123!',
      token: 'jwt.token.secret',
      apiKey: 'sk-123456789abcdef',
      authorization: 'Bearer secret_token',
      service_role_key: 'service_role_secret',
      safeField: 'hello world',
    };

    const sanitized = sanitizeBackendData(payload) as Record<string, unknown>;

    expect(sanitized.password).toBe('***REDACTED***');
    expect(sanitized.token).toBe('***REDACTED***');
    expect(sanitized.apiKey).toBe('***REDACTED***');
    expect(sanitized.authorization).toBe('***REDACTED***');
    expect(sanitized.service_role_key).toBe('***REDACTED***');
    expect(sanitized.safeField).toBe('hello world');
  });

  it('should mask CPF, CNPJ, credit card, email and phone numbers', () => {
    expect(maskString('123.456.789-01')).toBe('***.456.***-**');
    expect(maskString('12.345.678/0001-99')).toBe('**.345.***/****-**');
    expect(maskString('4111 2222 3333 4444')).toBe('****-****-****-4444');
    expect(maskString('usuario.teste@empresa.com.br')).toBe('u***e@empresa.com.br');
  });

  it('should handle circular references safely without throwing', () => {
    const circular: Record<string, unknown> = { name: 'test' };
    circular.self = circular;

    const result = sanitizeBackendData(circular) as Record<string, unknown>;
    expect(result.name).toBe('test');
    expect(result.self).toBe('[CIRCULAR_REF]');
  });
});

describe('Backend Observability - Correlation ID', () => {
  it('should extract existing valid X-Correlation-Id header', () => {
    const validUuid = '12345678-1234-4234-8234-123456789abc';
    const req = new Request('https://api.wallet.app/functions/v1/test', {
      headers: { [CORRELATION_HEADER]: validUuid },
    });

    const extracted = getCorrelationId(req);
    expect(extracted).toBe(validUuid);
  });

  it('should generate a fresh UUID if header is missing or invalid', () => {
    const req = new Request('https://api.wallet.app/functions/v1/test');
    const generated = getCorrelationId(req);

    expect(isValidCorrelationId(generated)).toBe(true);
  });

  it('should enrich response headers with X-Correlation-Id', () => {
    const correlationId = '12345678-1234-4234-8234-123456789abc';
    const headers = withCorrelationHeader({ 'Content-Type': 'application/json' }, correlationId);

    expect(headers[CORRELATION_HEADER]).toBe(correlationId);
    expect(headers['Content-Type']).toBe('application/json');
  });
});

describe('Backend Observability - Logger', () => {
  let logger: BackendLogger;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = createBackendLogger('test-function');
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should output structured JSON entry with correlation_id and source', () => {
    const entry = logger.info('Operation started', {
      operation: 'testOp',
      correlationId: 'corr-123',
      metadata: { items: 5 },
    });

    expect(entry.source).toBe('test-function');
    expect(entry.level).toBe('info');
    expect(entry.operation).toBe('testOp');
    expect(entry.correlation_id).toBe('corr-123');
    expect(infoSpy).toHaveBeenCalledTimes(1);

    const logged = JSON.parse(infoSpy.mock.calls[0][0]);
    expect(logged.source).toBe('test-function');
    expect(logged.message).toBe('Operation started');
    expect(logged.metadata.items).toBe(5);
  });

  it('should automatically sanitize metadata in log calls', () => {
    logger.error('Failed to authenticate', {
      operation: 'auth',
      metadata: {
        apiKey: 'secret-api-key',
        password: 'myPassword123',
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.metadata.apiKey).toBe('***REDACTED***');
    expect(logged.metadata.password).toBe('***REDACTED***');
  });
});

describe('Backend Observability - Error Response Standardizer', () => {
  it('should return safe standardized JSON error response with correlation_id and status', async () => {
    const correlationId = '12345678-1234-4234-8234-123456789abc';
    const req = new Request('https://api.wallet.app/functions/v1/test', {
      headers: { [CORRELATION_HEADER]: correlationId },
    });

    const response = createErrorResponse(req, {
      status: HTTP_STATUS.BAD_REQUEST,
      message: 'Invalid parameters provided.',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get(CORRELATION_HEADER)).toBe(correlationId);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('Invalid parameters provided.');
    expect(body.error.correlation_id).toBe(correlationId);
  });

  it('should not leak stack trace or SQL details on 500 error', async () => {
    const response = createErrorResponse(null, {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('Ocorreu um erro interno no processamento.');
    expect((body.error as Record<string, unknown>).stack).toBeUndefined();
  });
});
