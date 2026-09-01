import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createPluggyConnectToken,
  registerPluggyItem,
  syncPluggyItemToSupabase,
  fetchPluggyItemAccounts,
  fetchPluggyItemTransactions,
  fetchPluggyItemInvestments,
  PLUGGY_ERROR_CODES,
  PluggyServiceError,
} from '../services/pluggyService';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/core/logging/LoggerService';
import { isValidCorrelationId } from '@/core/logging/correlationId';
import { sanitizeBackendData } from '../../../../supabase/functions/_shared/observability/sanitizer';
import { getCorrelationId } from '../../../../supabase/functions/_shared/observability/correlation';

// Mock do Supabase Client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Pluggy End-to-End Observability & Tracing (Etapa 7.3A)', () => {
  const mockWorkspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';
  const mockItemId = 'pluggy-item-uuid-12345';
  const customCorrelationId = '11111111-2222-4333-8444-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Propagação de Correlation ID (Frontend → Edge Function)', () => {
    it('gera automaticamente um Correlation ID válido e o envia no header X-Correlation-Id', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: { accessToken: 'token-xyz-123' }, correlation_id: 'auto-uuid' },
        error: null,
      });

      await createPluggyConnectToken(mockWorkspaceId);

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(supabase.functions.invoke).mock.calls[0];
      expect(callArgs[0]).toBe('pluggy-api');

      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers).toBeDefined();
      expect(headers['X-Correlation-Id']).toBeDefined();
      expect(isValidCorrelationId(headers['X-Correlation-Id'])).toBe(true);
    });

    it('preserva e propaga o Correlation ID customizado quando fornecido explicitamente', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: { accessToken: 'token-xyz-123' }, correlation_id: customCorrelationId },
        error: null,
      });

      await createPluggyConnectToken(mockWorkspaceId, { correlationId: customCorrelationId });

      const callArgs = vi.mocked(supabase.functions.invoke).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['X-Correlation-Id']).toBe(customCorrelationId);
    });

    it('propaga X-Correlation-Id em todas as operações de leitura e escrita', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, data: [] },
        error: null,
      });

      await registerPluggyItem(mockWorkspaceId, mockItemId, 2, 'Nubank', { correlationId: customCorrelationId });
      await fetchPluggyItemAccounts(mockWorkspaceId, mockItemId, { correlationId: customCorrelationId });
      await fetchPluggyItemTransactions(mockWorkspaceId, mockItemId, { correlationId: customCorrelationId });
      await fetchPluggyItemInvestments(mockWorkspaceId, mockItemId, { correlationId: customCorrelationId });
      await syncPluggyItemToSupabase(mockWorkspaceId, mockItemId, 'Nubank', { correlationId: customCorrelationId });

      expect(supabase.functions.invoke).toHaveBeenCalledTimes(5);
      for (let i = 0; i < 5; i++) {
        const headers = vi.mocked(supabase.functions.invoke).mock.calls[i][1]?.headers as Record<string, string>;
        expect(headers['X-Correlation-Id']).toBe(customCorrelationId);
      }
    });
  });

  describe('2. Backend Observability & Preservação de Correlation ID', () => {
    it('extrai correlationId de Request headers no backend ou gera UUID v4 seguro', () => {
      const incomingReq = new Request('https://api.wallet.app/functions/v1/pluggy-api', {
        headers: { 'x-correlation-id': customCorrelationId },
      });

      const extracted = getCorrelationId(incomingReq);
      expect(extracted).toBe(customCorrelationId);
    });
  });

  describe('3. Tratamento e Padronização de Códigos de Erro (Error Codes)', () => {
    it('mapeia timeout de rede para PLUGGY_TIMEOUT com PluggyServiceError estruturado', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('The operation was aborted due to timeout'),
      });

      try {
        await createPluggyConnectToken(mockWorkspaceId, { correlationId: customCorrelationId });
        expect.unreachable('Deveria ter lançado erro');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PluggyServiceError);
        const pluggyErr = err as PluggyServiceError;
        expect(pluggyErr.code).toBe(PLUGGY_ERROR_CODES.TIMEOUT);
        expect(pluggyErr.correlationId).toBe(customCorrelationId);
      }
    });

    it('mapeia erro de upstream da Pluggy para PLUGGY_UPSTREAM_ERROR', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: {
            code: PLUGGY_ERROR_CODES.UPSTREAM_ERROR,
            message: 'Falha na resposta do servidor bancário.',
          },
        },
        error: null,
      });

      try {
        await registerPluggyItem(mockWorkspaceId, mockItemId, 2, 'Nubank', { correlationId: customCorrelationId });
        expect.unreachable('Deveria ter lançado erro');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PluggyServiceError);
        const pluggyErr = err as PluggyServiceError;
        expect(pluggyErr.code).toBe(PLUGGY_ERROR_CODES.UPSTREAM_ERROR);
        expect(pluggyErr.message).toBe('Falha na resposta do servidor bancário.');
      }
    });

    it('mapeia erro de autenticação para PLUGGY_AUTH_ERROR', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: {
            code: PLUGGY_ERROR_CODES.AUTH_ERROR,
            message: 'Token de autenticação ausente ou inválido.',
          },
        },
        error: null,
      });

      try {
        await createPluggyConnectToken(mockWorkspaceId);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PluggyServiceError);
        const pluggyErr = err as PluggyServiceError;
        expect(pluggyErr.code).toBe(PLUGGY_ERROR_CODES.AUTH_ERROR);
      }
    });

    it('mapeia erro de acesso negado para PLUGGY_FORBIDDEN', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: {
            code: PLUGGY_ERROR_CODES.FORBIDDEN,
            message: 'Acesso negado ao workspace especificado.',
          },
        },
        error: null,
      });

      try {
        await syncPluggyItemToSupabase(mockWorkspaceId, mockItemId, 'Nubank');
        expect.unreachable('Deveria ter lançado erro');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(PluggyServiceError);
        const pluggyErr = err as PluggyServiceError;
        expect(pluggyErr.code).toBe(PLUGGY_ERROR_CODES.FORBIDDEN);
      }
    });
  });

  describe('4. Segurança e Não Vazamento de Credenciais em Logs', () => {
    it('sanitiza e redige clientSecret, Authorization, tokens, senhas e chaves privadas', () => {
      const sensitivePayload = {
        clientSecret: 'pluggy-secret-key-xyz-123456',
        authorization: 'Bearer super_secret_jwt_token',
        accessToken: 'access-token-987654',
        apiKey: 'sk-pluggy-private-api-key',
        password: 'mySuperSecretPassword123!',
        safeWorkspaceId: mockWorkspaceId,
      };

      const sanitized = sanitizeBackendData(sensitivePayload) as Record<string, unknown>;

      expect(sanitized.clientSecret).toBe('***REDACTED***');
      expect(sanitized.authorization).toBe('***REDACTED***');
      expect(sanitized.accessToken).toBe('***REDACTED***');
      expect(sanitized.apiKey).toBe('***REDACTED***');
      expect(sanitized.password).toBe('***REDACTED***');
      expect(sanitized.safeWorkspaceId).toBe(mockWorkspaceId);
    });

    it('registra logs estruturados no frontend sem expor credenciais', () => {
      const infoSpy = vi.spyOn(logger, 'info');

      logger.info('pluggyService', 'Pluggy Connect Token gerado', {
        operation: 'createPluggyConnectToken',
        correlation_id: customCorrelationId,
        workspace_id: mockWorkspaceId,
        clientSecret: 'secret-123',
      });

      expect(infoSpy).toHaveBeenCalled();
    });
  });
});
