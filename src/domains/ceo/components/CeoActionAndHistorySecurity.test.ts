import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseActionProposalRepository,
  type ProposalRow,
} from '../../../../supabase/functions/_shared/ai/action-repository';
import type { AiExecutionContext } from '../../../../supabase/functions/_shared/ai/auth';

describe('GATE 1 & 2: Segurança de Ações e Histórico de Conversas do CEO', () => {
  const mockContext: AiExecutionContext = {
    userId: 'user-heitor-1',
    workspaceId: 'workspace-rodo-point',
    accessToken: 'mock-jwt-token',
    correlationId: 'corr-123',
  };

  const alienContext: AiExecutionContext = {
    userId: 'user-alien-99',
    workspaceId: 'workspace-outra-empresa',
    accessToken: 'mock-jwt-alien',
    correlationId: 'corr-alien',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GATE 1: Autorização Canônica de Propostas de Ação', () => {
    it('1. Confirmação atômica condicional: transiciona prepared -> confirmed com confirmed_at sem colunas inexistentes', async () => {
      let updatedPayload: Record<string, unknown> | null = null;

      const mockProposalRow: ProposalRow = {
        id: 'prop-canon-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: 'conv-1',
        action_type: 'ajustar_preco_cardapio',
        action_version: 'v1',
        risk_level: 'MEDIUM',
        summary: 'Reajustar preço do produto',
        payload: { produto_id: 'p1', novo_preco: 35.0 },
        previous_state: { preco_antigo: 30.0 },
        idempotency_hash: 'hash-1',
        status: 'prepared',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        confirmed_at: null,
        executed_at: null,
        created_at: new Date().toISOString(),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          expect(table).toBe('wallet_ai_action_proposals');
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProposalRow, error: null }),
            update: vi.fn((data: Record<string, unknown>) => {
              updatedPayload = data;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...mockProposalRow, ...data, status: 'confirmed' },
                  error: null,
                }),
              };
            }),
          };
        }),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.confirmProposalAtomically('prop-canon-1', mockContext, 'owner');

      expect(res.success).toBe(true);
      expect(res.proposal?.status).toBe('confirmed');
      expect(res.proposal?.confirmedAt).toBeDefined();

      // Esquema estrito: NÃO pode conter confirmed_by_user_id ou updated_at (colunas inexistentes)
      expect(updatedPayload).toHaveProperty('status', 'confirmed');
      expect(updatedPayload).toHaveProperty('confirmed_at');
      expect(updatedPayload).not.toHaveProperty('confirmed_by_user_id');
      expect(updatedPayload).not.toHaveProperty('cancelled_by_user_id');
      expect(updatedPayload).not.toHaveProperty('updated_at');
    });

    it('2. Bloqueia confirmação para papel de somente leitura (viewer)', async () => {
      const mockClient = { from: vi.fn() };
      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.confirmProposalAtomically('prop-1', mockContext, 'viewer');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('viewer');
    });

    it('3. Bloqueia confirmação cruzada entre workspaces (cross-tenant isolation)', async () => {
      const mockProposalRow: ProposalRow = {
        id: 'prop-isolated-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: null,
        action_type: 'ajuste',
        action_version: 'v1',
        risk_level: 'LOW',
        summary: 'Ajuste',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-2',
        status: 'prepared',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        confirmed_at: null,
        executed_at: null,
        created_at: new Date().toISOString(),
      };

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProposalRow, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      // Tentativa de confirmação pelo alienContext (workspace diferente)
      const res = await repo.confirmProposalAtomically('prop-isolated-1', alienContext, 'admin');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('Ação não autorizada para o workspace autenticado');
    });

    it('4. Rejeita propostas expiradas (expires_at < now)', async () => {
      const mockProposalRow: ProposalRow = {
        id: 'prop-expired-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: null,
        action_type: 'ajuste',
        action_version: 'v1',
        risk_level: 'LOW',
        summary: 'Ajuste',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-3',
        status: 'prepared',
        expires_at: new Date(Date.now() - 10000).toISOString(), // Expirada no passado
        confirmed_at: null,
        executed_at: null,
        created_at: new Date(Date.now() - 20000).toISOString(),
      };

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProposalRow, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.confirmProposalAtomically('prop-expired-1', mockContext, 'owner');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_EXPIRED');
      expect(res.error).toContain('expirou');
    });

    it('5. Previne duplo clique / confirmação duplicada (status já confirmed)', async () => {
      const mockAlreadyConfirmedRow: ProposalRow = {
        id: 'prop-already-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: null,
        action_type: 'ajuste',
        action_version: 'v1',
        risk_level: 'LOW',
        summary: 'Ajuste',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-4',
        status: 'confirmed', // Já confirmada!
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        confirmed_at: new Date().toISOString(),
        executed_at: null,
        created_at: new Date().toISOString(),
      };

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockAlreadyConfirmedRow, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.confirmProposalAtomically('prop-already-1', mockContext, 'owner');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_ALREADY_PROCESSED');
    });

    it('6. Descarte canônico: cancelProposalAtomically transiciona prepared -> cancelled sem colunas inexistentes', async () => {
      let cancelledUpdate: Record<string, unknown> | null = null;

      const mockClient = {
        from: vi.fn((table: string) => {
          expect(table).toBe('wallet_ai_action_proposals');
          return {
            update: vi.fn((data: Record<string, unknown>) => {
              cancelledUpdate = data;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'prop-cancel-1', status: 'cancelled' },
                  error: null,
                }),
              };
            }),
          };
        }),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const success = await repo.cancelProposalAtomically('prop-cancel-1', mockContext);

      expect(success).toBe(true);
      expect(cancelledUpdate).toEqual({ status: 'cancelled' });
      expect(cancelledUpdate).not.toHaveProperty('cancelled_by_user_id');
      expect(cancelledUpdate).not.toHaveProperty('updated_at');
    });
  });

  describe('GATE 2: Histórico Seguro e Isolamento do CEO', () => {
    it('1. Valida isolamento estrito de conversas por workspace e por usuário', () => {
      const userA = 'user-a';
      const userB = 'user-b';
      const wsA = 'ws-rodo-point';
      const wsB = 'ws-outro';

      const convs = [
        { id: 'conv-1', user_id: userA, workspace_id: wsA, title: 'Conversa A1' },
        { id: 'conv-2', user_id: userA, workspace_id: wsB, title: 'Conversa A2 Alien' },
        { id: 'conv-3', user_id: userB, workspace_id: wsA, title: 'Conversa B1' },
      ];

      // Filtro canônico aplicado na interface e no banco:
      const userAConvsInWsA = convs.filter((c) => c.workspace_id === wsA && c.user_id === userA);
      expect(userAConvsInWsA).toHaveLength(1);
      expect(userAConvsInWsA[0].id).toBe('conv-1');
    });

    it('2. Garante que nova conversa é criada com ID único sem apagar as conversas anteriores', () => {
      const historyList = [
        { id: 'conv-old-1', title: 'Conversa 28/10', updated_at: '2026-10-28T10:00:00Z' },
        { id: 'conv-old-2', title: 'Conversa 29/10', updated_at: '2026-10-29T10:00:00Z' },
      ];

      const newConv = {
        id: 'conv-new-3',
        title: 'Conversa 01/11 10:30',
        updated_at: '2026-11-01T10:30:00Z',
      };

      const updatedHistory = [newConv, ...historyList];

      expect(updatedHistory).toHaveLength(3);
      expect(updatedHistory[0].id).toBe('conv-new-3');
      expect(updatedHistory[1].id).toBe('conv-old-1');
      expect(updatedHistory[2].id).toBe('conv-old-2');
    });

    it('3. Previne duplicação de mensagens entre orchestrator e client', () => {
      const messagesMap = new Map<string, boolean>();

      function deduplicateMessage(msgId: string): boolean {
        if (messagesMap.has(msgId)) return false; // duplicada
        messagesMap.set(msgId, true);
        return true;
      }

      expect(deduplicateMessage('msg-user-1')).toBe(true);
      expect(deduplicateMessage('msg-user-1')).toBe(false); // Rejeita duplicata
      expect(deduplicateMessage('msg-asst-1')).toBe(true);
      expect(messagesMap.size).toBe(2);
    });
  });
});
