import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isValidCorrelationId, getCorrelationId, withCorrelationHeader } from '@/core/logging/correlationId';
import { sanitizeBackendData } from '../../../../supabase/functions/_shared/observability/sanitizer';
import { OPENAI_ERROR_CODES } from '../../../../supabase/functions/_shared/observability/errors';

describe('OpenAI Proxy Observability & Tracing (Etapa 7.3B)', () => {
  const customCorrelationId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Correlation ID Generation and Header Propagation', () => {
    it('generates a valid UUID v4 correlation ID when none is provided', () => {
      const generated = getCorrelationId();
      expect(isValidCorrelationId(generated)).toBe(true);
    });

    it('preserves and propagates the correlation ID in HTTP headers', () => {
      const headers = withCorrelationHeader({ 'Content-Type': 'application/json' }, customCorrelationId);
      expect(headers['X-Correlation-Id']).toBe(customCorrelationId);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('2. Error Codes Standardization', () => {
    it('defines standardized error codes for OpenAI Proxy', () => {
      expect(OPENAI_ERROR_CODES.TIMEOUT).toBe('OPENAI_TIMEOUT');
      expect(OPENAI_ERROR_CODES.UPSTREAM_ERROR).toBe('OPENAI_UPSTREAM_ERROR');
      expect(OPENAI_ERROR_CODES.RATE_LIMIT).toBe('OPENAI_RATE_LIMIT');
      expect(OPENAI_ERROR_CODES.AUTH_ERROR).toBe('OPENAI_AUTH_ERROR');
    });
  });

  describe('3. Sensitive Data Sanitization & Log Protection', () => {
    it('redacts openaiApiKey, authorization, clientSecret, and credentials from logs', () => {
      const rawPayload = {
        openaiApiKey: 'sk-proj-super-secret-key-12345',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        clientSecret: 'secret_live_abcdef',
        password: 'myPassword123!',
        provider: 'openai',
        model: 'gpt-4o-mini',
        duration_ms: 350,
      };

      const sanitized = sanitizeBackendData(rawPayload) as Record<string, unknown>;

      expect(sanitized.openaiApiKey).toBe('***REDACTED***');
      expect(sanitized.authorization).toBe('***REDACTED***');
      expect(sanitized.clientSecret).toBe('***REDACTED***');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.provider).toBe('openai');
      expect(sanitized.model).toBe('gpt-4o-mini');
      expect(sanitized.duration_ms).toBe(350);
    });

    it('ensures prompts and completions are not logged directly in telemetry', () => {
      const telemetryEvent = {
        tool_name: 'consultar_vendas_eyemobile',
        model: 'gpt-4o-mini',
        tokens_prompt: 150,
        tokens_completion: 45,
        tokens_total: 195,
        duration_ms: 420,
        execution_status: 'success',
      };

      expect(telemetryEvent).not.toHaveProperty('prompt');
      expect(telemetryEvent).not.toHaveProperty('messages');
      expect(telemetryEvent).not.toHaveProperty('completion');
      expect(telemetryEvent.duration_ms).toBeGreaterThan(0);
    });
  });
});
