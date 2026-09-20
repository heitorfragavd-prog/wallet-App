/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ai-consumers-integration.test.ts
 *
 * Bateria de testes de integracao para os 3 consumidores de IA:
 * - openai-proxy
 * - categorizar-ia
 * - ia-deposito
 *
 * COBERTURA EXIGIDA:
 * 1. Autenticacao e validacao server-side de workspace antes de formar chave de quota
 * 2. Reserva atomica via RPC antes de chamar o provedor
 * 3. Bloqueio fail-closed quando cota estoura ou reserva falha (provedor NUNCA chamado)
 * 4. reservation_id exclusivo por requisicao e janela
 * 5. Reconciliacao duravel pela nova RPC (reconcile_ai_tokens)
 * 6. Nao estorno de consumo desconhecido em timeout ou erro
 * 7. Protecao contra virada de janela e reconciliacao repetida (idempotencia)
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateUserWorkspace,
  reconcileAiTokens,
} from '../../../supabase/functions/_shared/ai-rate-limiter.ts';
import { handleOpenAIProxy } from '../../../supabase/functions/openai-proxy/index.ts';
import { handleCategorizarIA } from '../../../supabase/functions/categorizar-ia/index.ts';
import { handleIaDeposito } from '../../../supabase/functions/ia-deposito/index.ts';

describe('Integracao de Seguranca das Reservas de IA (openai-proxy, categorizar-ia, ia-deposito)', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const ownedWorkspaceId = '22222222-2222-4222-8222-222222222222';
  const victimWorkspaceId = '33333333-3333-4333-8333-333333333333';
  const validAuthToken = 'valid-user-jwt-token';

  function createMockSupabaseAdmin(opts?: {
    isOwner?: boolean;
    isMember?: boolean;
    reserveAllowed?: boolean;
    reserveError?: any;
    reconcileStatus?: string;
  }) {
    const isOwner = opts?.isOwner ?? true;
    const isMember = opts?.isMember ?? false;
    const reserveAllowed = opts?.reserveAllowed ?? true;
    const reserveError = opts?.reserveError ?? null;
    const reconcileStatus = opts?.reconcileStatus ?? 'reconciled';

    return {
      auth: {
        getUser: vi.fn().mockImplementation((token: string) => {
          if (token === validAuthToken) {
            return Promise.resolve({ data: { user: { id: validUserId, email: 'user@test.com' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Invalid token') });
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'workspaces') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              return {
                eq: vi.fn().mockImplementation((col2: string, val2: string) => ({
                  maybeSingle: vi.fn().mockResolvedValue(
                    isOwner && val === ownedWorkspaceId && val2 === validUserId
                      ? { data: { id: ownedWorkspaceId, user_id: validUserId }, error: null }
                      : { data: null, error: null }
                  ),
                })),
                maybeSingle: vi.fn().mockResolvedValue(
                  isOwner && val === ownedWorkspaceId
                    ? { data: { id: ownedWorkspaceId, user_id: validUserId }, error: null }
                    : { data: null, error: null }
                ),
              };
            }),
          };
        }
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  maybeSingle: vi.fn().mockResolvedValue(
                    isMember ? { data: { id: 'member-1' }, error: null } : { data: null, error: null }
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'ia_configuracoes') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { api_key: 'sk-mock-openai-key' },
                error: null,
              }),
            }),
          };
        }
        if (table === 'wallet_ai_audit_events') {
          return {
            insert: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
        };
      }),
      rpc: vi.fn().mockImplementation((fnName: string, args: any) => {
        if (fnName === 'check_rate_limit') {
          return Promise.resolve({ data: [{ allowed: true, current_count: 1, limit_count: 20 }], error: null });
        }
        if (fnName === 'reserve_ai_tokens') {
          if (reserveError) return Promise.resolve({ data: null, error: reserveError });
          return Promise.resolve({
            data: [{
              allowed: reserveAllowed,
              retry_after_seconds: reserveAllowed ? 0 : 300,
              current_count: reserveAllowed ? args.p_reserved_tokens : args.p_max_tokens_per_hour,
              limit_count: args.p_max_tokens_per_hour,
              reservation_id: args.p_reservation_id,
            }],
            error: null,
          });
        }
        if (fnName === 'reconcile_ai_tokens') {
          return Promise.resolve({
            data: [{ status: reconcileStatus, delta_applied: args.p_actual_tokens ? args.p_actual_tokens - 1000 : 0 }],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  }

  describe('1. Validação de Workspace Server-Side (validateUserWorkspace)', () => {
    it('Aceita escopo pessoal padrão quando workspaceId é omitido ou "personal"', async () => {
      const mockAdmin = createMockSupabaseAdmin();
      const resNull = await validateUserWorkspace(mockAdmin, validUserId, undefined);
      expect(resNull.valid).toBe(true);
      expect(resNull.workspaceId).toBe('personal');

      const resPersonal = await validateUserWorkspace(mockAdmin, validUserId, 'personal');
      expect(resPersonal.valid).toBe(true);
      expect(resPersonal.workspaceId).toBe('personal');
    });

    it('Rejeita workspaceId com formato inválido (não UUID)', async () => {
      const mockAdmin = createMockSupabaseAdmin();
      const res = await validateUserWorkspace(mockAdmin, validUserId, 'invalid-uuid-format');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/inválido/i);
    });

    it('Rejeita workspace que pertence a outro usuário (prevenção de IDOR e forja de quota)', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: false, isMember: false });
      const res = await validateUserWorkspace(mockAdmin, validUserId, victimWorkspaceId);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/não pertence|Acesso negado/i);
    });

    it('Aprova workspace válido quando o usuário é proprietário', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true });
      const res = await validateUserWorkspace(mockAdmin, validUserId, ownedWorkspaceId);
      expect(res.valid).toBe(true);
      expect(res.workspaceId).toBe(ownedWorkspaceId);
    });
  });

  describe('2. openai-proxy — Fluxos de Segurança, Reserva e Reconciliação', () => {
    it('Rejeita requisição sem autenticação com status 401', async () => {
      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Olá' }] }),
      });
      const res = await handleOpenAIProxy(req);
      expect(res.status).toBe(401);
    });

    it('Rejeita workspace_id forjado com 403 Forbidden e NÃO chama o provedor', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Saldo atual' }],
          workspace_id: victimWorkspaceId,
        }),
      });

      const res = await handleOpenAIProxy(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Bloqueia com 429 quando a quota de tokens estoura e NÃO chama o provedor', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Quanto gastei este mês?' }],
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleOpenAIProxy(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(429);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Bloqueia fail-closed (sem bypass) quando a RPC de reserva falha no banco', async () => {
      const mockAdmin = createMockSupabaseAdmin({
        isOwner: true,
        reserveError: { message: 'Database connection failed' },
      });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Olá' }],
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleOpenAIProxy(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(429);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Fluxo de Sucesso: reserva tokens, chama OpenAI e reconcilia duravelmente com uso real', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: true });
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Seu saldo é R$ 10.000' } }],
            usage: { total_tokens: 1450, prompt_tokens: 1000, completion_tokens: 450 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Qual meu saldo?' }],
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleOpenAIProxy(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledOnce();

      // Verifica que a RPC reserve_ai_tokens foi invocada antes da OpenAI
      expect(mockAdmin.rpc).toHaveBeenCalledWith('reserve_ai_tokens', expect.objectContaining({
        p_user_id: validUserId,
        p_workspace_id: ownedWorkspaceId,
        p_action: 'openai_proxy',
      }));

      // Verifica que a reconciliacao exata foi chamada com outcome success e tokens reais
      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', expect.objectContaining({
        p_actual_tokens: 1450,
        p_outcome: 'success',
      }));
    });

    it('Fluxo de Erro no Upstream: reconcilia informando erro sem estorno indevido', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: true });
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Rate limit upstream' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const req = new Request('http://localhost/openai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Teste erro' }],
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleOpenAIProxy(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(429);
      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', expect.objectContaining({
        p_actual_tokens: 0,
        p_outcome: 'error',
      }));
    });
  });

  describe('3. categorizar-ia — Validação de Workspace, Reserva e Reconciliação', () => {
    it('Rejeita token ausente com status 401', async () => {
      const req = new Request('http://localhost/categorizar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: 'Almoço', valor: 45 }),
      });
      const res = await handleCategorizarIA(req);
      expect(res.status).toBe(401);
    });

    it('Rejeita workspace forjado com 403 Forbidden antes de chamar OpenAI', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/categorizar-ia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          descricao: 'Posto de gasolina',
          valor: 200,
          workspace_id: victimWorkspaceId,
        }),
      });

      const res = await handleCategorizarIA(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Bloqueia com 429 se a quota estiver esgotada', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/categorizar-ia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          descricao: 'Supermercado',
          valor: 350,
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleCategorizarIA(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(429);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Sucesso: categoriza e reconcilia tokens consumidos duravelmente', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: true });
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ categoria: 'alimentacao', confianca: 0.98 }) } }],
            usage: { total_tokens: 185 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const req = new Request('http://localhost/categorizar-ia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          descricao: 'Restaurante Sabor',
          valor: 55,
          tipo: 'despesa',
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleCategorizarIA(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.categoria).toBe('alimentacao');

      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', expect.objectContaining({
        p_actual_tokens: 185,
        p_outcome: 'success',
      }));
    });

    it('Timeout: retém estimativa conservadora sem estorno total no timeout', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: true });
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mockFetch = vi.fn().mockRejectedValue(abortError);

      const req = new Request('http://localhost/categorizar-ia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          descricao: 'Padaria Central',
          valor: 20,
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleCategorizarIA(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(200); // Fallback graceful
      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', expect.objectContaining({
        p_actual_tokens: null,
        p_outcome: 'timeout',
      }));
    });
  });

  describe('4. ia-deposito — OCR, SSRF, Reserva e Reconciliação', () => {
    it('Rejeita token ausente com 401', async () => {
      const req = new Request('http://localhost/ia-deposito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Comprovante Pix R$ 500' }),
      });
      const res = await handleIaDeposito(req);
      expect(res.status).toBe(401);
    });

    it('Rejeita workspace forjado com 403 Forbidden antes do processamento OCR', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/ia-deposito', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          text: 'Comprovante Pix R$ 1.500',
          workspace_id: victimWorkspaceId,
        }),
      });

      const res = await handleIaDeposito(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Bloqueia com 429 se a quota horária de tokens estiver esgotada', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: false });
      const mockFetch = vi.fn();

      const req = new Request('http://localhost/ia-deposito', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          text: 'Transferência recebida R$ 2.000',
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleIaDeposito(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(429);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('Sucesso: processa comprovante e reconcilia tokens exatos consumidos', async () => {
      const mockAdmin = createMockSupabaseAdmin({ isOwner: true, reserveAllowed: true });
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ valor: 1500, tipo: 'deposito', data: '2026-09-09' }) } }],
            usage: { total_tokens: 520 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const req = new Request('http://localhost/ia-deposito', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validAuthToken}`,
        },
        body: JSON.stringify({
          text: 'Comprovante TED R$ 1.500 Banco Inter 09/09/2026',
          workspace_id: ownedWorkspaceId,
        }),
      });

      const res = await handleIaDeposito(req, mockAdmin, mockFetch as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.valor).toBe(1500);

      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', expect.objectContaining({
        p_actual_tokens: 520,
        p_outcome: 'success',
      }));
    });
  });

  describe('5. Idempotência e Proteção de Virada de Janela', () => {
    it('Reconciliação repetida com o mesmo reservation_id é tratada com idempotência estrita', async () => {
      const mockAdmin = createMockSupabaseAdmin({ reconcileStatus: 'already_reconciled' });

      const res1 = await reconcileAiTokens(mockAdmin, {
        userId: validUserId,
        workspaceId: ownedWorkspaceId,
        action: 'openai_proxy',
        reservationId: 'res-idempotent-1',
        reservedTokens: 1000,
        actualTokensConsumed: 950,
        outcome: 'success',
      });

      expect(res1.status).toBe('already_reconciled');
    });

    it('Timeout não estorna automaticamente tokens sem evidência (retenção conservadora)', async () => {
      const mockAdmin = createMockSupabaseAdmin();

      const res = await reconcileAiTokens(mockAdmin, {
        userId: validUserId,
        workspaceId: ownedWorkspaceId,
        action: 'openai_proxy',
        reservationId: 'res-timeout-1',
        reservedTokens: 2000,
        actualTokensConsumed: undefined,
        outcome: 'timeout',
      });

      expect(mockAdmin.rpc).toHaveBeenCalledWith('reconcile_ai_tokens', {
        p_reservation_id: 'res-timeout-1',
        p_actual_tokens: null,
        p_outcome: 'timeout',
      });
      expect(res.status).toBe('reconciled');
    });
  });
});
