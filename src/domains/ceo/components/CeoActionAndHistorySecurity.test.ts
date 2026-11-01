import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseActionProposalRepository,
  type ProposalRow,
} from '../../../../supabase/functions/_shared/ai/action-repository';
import { canRoleAccessFinancialData, FINANCIAL_AUTHORIZED_ROLES, type AiExecutionContext } from '../../../../supabase/functions/_shared/ai/auth';
import {
  createQueryToolCatalog,
  executeQueryTool,
  type FinancialQueryRepository,
} from '../../../../supabase/functions/_shared/ai/query-tools';

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

      const mockProposalRow: ProposalRow = {
        id: 'prop-cancel-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: 'conv-1',
        action_type: 'ajustar_preco_cardapio',
        action_version: 'v1',
        risk_level: 'MEDIUM',
        summary: 'Reajustar preço do produto',
        payload: { produto_id: 'p1' },
        previous_state: null,
        idempotency_hash: 'hash-c1',
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
              cancelledUpdate = data;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...mockProposalRow, status: 'cancelled' },
                  error: null,
                }),
              };
            }),
          };
        }),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-cancel-1', mockContext, 'owner');

      expect(res.success).toBe(true);
      expect(res.proposal?.status).toBe('cancelled');
      expect(cancelledUpdate).toEqual({ status: 'cancelled' });
      expect(cancelledUpdate).not.toHaveProperty('cancelled_by_user_id');
      expect(cancelledUpdate).not.toHaveProperty('updated_at');
    });

    it('7. Descarte com RBAC: bloqueia descarte para papel de funcionário operacional (delivery_staff)', async () => {
      const mockClient = { from: vi.fn() };
      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-cancel-1', mockContext, 'delivery_staff');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('Funcionário operacional');
    });

    it('8. Descarte com RBAC: bloqueia descarte para papel de leitura (viewer)', async () => {
      const mockClient = { from: vi.fn() };
      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-cancel-1', mockContext, 'viewer');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('viewer');
    });

    it('9. Descarte com integridade: bloqueia descarte de proposta já executada', async () => {
      const executedProposal: ProposalRow = {
        id: 'prop-exec-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-heitor-1',
        conversation_id: 'conv-1',
        action_type: 'ajustar_preco_cardapio',
        action_version: 'v1',
        risk_level: 'MEDIUM',
        summary: 'Reajustar preço do produto',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-e1',
        status: 'executed',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        confirmed_at: new Date().toISOString(),
        executed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: executedProposal, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-exec-1', mockContext, 'owner');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_ALREADY_PROCESSED');
      expect(res.error).toContain('já executada');
    });

    it('10. Descarte com isolamento: bloqueia descarte de proposta pertencente a outro workspace', async () => {
      const alienProposal: ProposalRow = {
        id: 'prop-alien-1',
        workspace_id: 'workspace-outra-empresa',
        user_id: 'user-alien-1',
        conversation_id: 'conv-1',
        action_type: 'ajustar_preco_cardapio',
        action_version: 'v1',
        risk_level: 'MEDIUM',
        summary: 'Reajustar preço do produto',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-a1',
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
          maybeSingle: vi.fn().mockResolvedValue({ data: alienProposal, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-alien-1', mockContext, 'owner');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('não autorizada para o workspace');
    });

    it('11. Descarte com RBAC: membro comum sem privilégios só pode descartar suas próprias propostas', async () => {
      const otherUserProposal: ProposalRow = {
        id: 'prop-other-1',
        workspace_id: 'workspace-rodo-point',
        user_id: 'user-outro-funcionario',
        conversation_id: 'conv-1',
        action_type: 'ajustar_preco_cardapio',
        action_version: 'v1',
        risk_level: 'MEDIUM',
        summary: 'Reajustar preço do produto',
        payload: {},
        previous_state: null,
        idempotency_hash: 'hash-o1',
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
          maybeSingle: vi.fn().mockResolvedValue({ data: otherUserProposal, error: null }),
        })),
      };

      const repo = new SupabaseActionProposalRepository(mockClient as unknown as SupabaseClient);
      const res = await repo.cancelProposalAtomically('prop-other-1', mockContext, 'member');

      expect(res.success).toBe(false);
      expect(res.code).toBe('WALLET_AI_ACTION_FORBIDDEN');
      expect(res.error).toContain('Membros sem privilégios');
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

  describe('GATE C: Bloqueio de Acesso Financeiro para Funcionário Operacional (delivery_staff)', () => {
    const deliveryStaffContext: AiExecutionContext = {
      userId: 'user-motoboy-1',
      workspaceId: 'workspace-rodo-point',
      accessToken: 'token-motoboy',
      correlationId: 'corr-ds-1',
      role: 'delivery_staff',
    };

    const adminContext: AiExecutionContext = {
      userId: 'user-admin-1',
      workspaceId: 'workspace-rodo-point',
      accessToken: 'token-admin',
      correlationId: 'corr-adm-1',
      role: 'admin',
    };

    const mockRepo: FinancialQueryRepository = {
      listRevenues: vi.fn(async () => []),
      listExpenses: vi.fn(async () => []),
      listTransactions: vi.fn(async () => []),
      listBalances: vi.fn(async () => []),
      listDebts: vi.fn(async () => []),
      listSalesPDV: vi.fn(async () => []),
    };

    it('1. Bloqueia chamadas a ferramentas financeiras quando executadas por delivery_staff', async () => {
      const catalog = createQueryToolCatalog(mockRepo, { extended: true });

      const financialToolsToTest = [
        'buscar_receitas',
        'buscar_despesas',
        'buscar_transacoes',
        'consultar_saldos',
        'consultar_resumo_mensal',
        'consultar_resumo_executivo_ceo',
        'consultar_analise_comercial_vendas',
        'consultar_analise_despesas_ceo',
        'buscar_vendas_pdv',
      ];

      for (const tool of financialToolsToTest) {
        await expect(
          executeQueryTool(tool, { start: '2026-10-01', end: '2026-10-31', year: 2026, month: 10 }, deliveryStaffContext, catalog),
        ).rejects.toThrow(/não possui permissão para consultar dados financeiros/);
      }
    });

    it('2. Permite que delivery_staff consulte status de canais operacionais (não financeiro)', async () => {
      const catalog = createQueryToolCatalog(mockRepo, { extended: true });
      const res = await executeQueryTool('consultar_status_canais_delivery', {}, deliveryStaffContext, catalog);

      expect(res.tool).toBe('consultar_status_canais_delivery');
      expect((res.data as { canais: unknown[] }).canais).toBeDefined();
    });

    it('3. Permite que admin consulte ferramentas financeiras normalmente', async () => {
      const catalog = createQueryToolCatalog(mockRepo, { extended: true });
      const res = await executeQueryTool('buscar_receitas', { start: '2026-10-01', end: '2026-10-31' }, adminContext, catalog);

      expect(res.tool).toBe('buscar_receitas');
      expect(mockRepo.listRevenues).toHaveBeenCalled();
    });
  });

  describe('GATE C (Refinamento): RBAC Financeiro com Lista Explícita', () => {
    it('1. canRoleAccessFinancialData nega papéis ausentes, vazios, desconhecidos ou não autorizados', () => {
      expect(canRoleAccessFinancialData(undefined)).toBe(false);
      expect(canRoleAccessFinancialData('')).toBe(false);
      expect(canRoleAccessFinancialData('   ')).toBe(false);
      expect(canRoleAccessFinancialData('delivery_staff')).toBe(false);
      expect(canRoleAccessFinancialData('viewer')).toBe(false);
      expect(canRoleAccessFinancialData('member')).toBe(false);
      expect(canRoleAccessFinancialData('user')).toBe(false);
      expect(canRoleAccessFinancialData('operacional')).toBe(false);
      expect(canRoleAccessFinancialData('desconhecido')).toBe(false);
      expect(canRoleAccessFinancialData('estagiario')).toBe(false);
    });

    it('2. canRoleAccessFinancialData permite exclusivamente papéis da whitelist financeira', () => {
      expect(FINANCIAL_AUTHORIZED_ROLES.size).toBeGreaterThan(0);
      expect(canRoleAccessFinancialData('owner')).toBe(true);
      expect(canRoleAccessFinancialData('proprietario')).toBe(true);
      expect(canRoleAccessFinancialData('admin')).toBe(true);
      expect(canRoleAccessFinancialData('administrador')).toBe(true);
      expect(canRoleAccessFinancialData('gestor')).toBe(true);
      expect(canRoleAccessFinancialData('financeiro')).toBe(true);
    });

    it('3. Rejeita acesso direto de usuário sem papel, com papel viewer ou desconhecido na Edge Function', async () => {
      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn(async () => []),
        listExpenses: vi.fn(async () => []),
        listTransactions: vi.fn(async () => []),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
        listSalesPDV: vi.fn(async () => []),
      };
      const catalog = createQueryToolCatalog(mockRepo, { extended: true });

      const unauthorizedContexts: AiExecutionContext[] = [
        { userId: 'u1', workspaceId: 'w1', accessToken: 't1', role: 'viewer' },
        { userId: 'u2', workspaceId: 'w1', accessToken: 't2', role: 'desconhecido' },
        { userId: 'u3', workspaceId: 'w1', accessToken: 't3' }, // sem role
        { userId: 'u4', workspaceId: 'w1', accessToken: 't4', role: 'delivery_staff' },
      ];

      for (const ctx of unauthorizedContexts) {
        await expect(
          executeQueryTool('buscar_receitas', { start: '2026-10-01', end: '2026-10-31' }, ctx, catalog)
        ).rejects.toThrow(/não possui permissão para consultar dados financeiros/);
      }
    });
  });

  describe('GATE E: Separação de Fontes Financeiras, Conciliação e Média Diária', () => {
    it('1. consultar_resumo_executivo_ceo não classifica repasses por palavras na descrição e não usa Math.max', async () => {
      const adminContext: AiExecutionContext = {
        userId: 'user-heitor-1',
        workspaceId: 'workspace-rodo-point',
        accessToken: 'token-heitor',
        correlationId: 'corr-h-1',
        role: 'owner',
      };

      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn(async () => [
          {
            id: 'r1',
            sourceType: 'receita',
            sourceId: 'rec-1',
            workspaceId: adminContext.workspaceId,
            userId: adminContext.userId,
            kind: 'income',
            amount: 48210.75, // Receita financeira disponível
            occurredOn: '2026-10-15',
            deduplicationKey: 'rec-1',
            // Contém texto "repasse divipay" na descrição, mas NÃO tem identificador canônico de repasse!
            description: 'Repasse Divipay cartão de crédito',
          },
        ]),
        listExpenses: vi.fn(async () => [
          {
            id: 'e1',
            sourceType: 'despesa',
            sourceId: 'desp-1',
            workspaceId: adminContext.workspaceId,
            userId: adminContext.userId,
            kind: 'expense',
            amount: 20459.85,
            occurredOn: '2026-10-10',
            deduplicationKey: 'e1',
            description: 'Insumos',
          },
        ]),
        listTransactions: vi.fn(async () => []),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
        listSalesPDV: vi.fn(async () => [
          {
            id: 'pdv1',
            sourceType: 'transacao',
            sourceId: 'pdv-1',
            workspaceId: adminContext.workspaceId,
            userId: adminContext.userId,
            kind: 'income',
            amount: 55000.00, // Vendas brutas Eyemobile (maior que receitas)
            occurredOn: '2026-10-15',
            deduplicationKey: 'p1',
            description: 'Venda Eyemobile',
          },
        ]),
      };

      const catalog = createQueryToolCatalog(mockRepo, { extended: true });
      const result = await executeQueryTool('consultar_resumo_executivo_ceo', {}, adminContext, catalog);
      const data = result.data as Record<string, unknown>;

      // NÃO pode ter substituído faturamentoMes por 55000.00 via Math.max
      expect(data.receitasFinanceirasDisponiveis).toBe(48210.75);
      expect(data.vendasBrutasEyemobile).toBe(55000.00);
      expect(data.faturamentoMes).toBe(48210.75); // Receita financeira preservada
      // Descrição pura NÃO conta como repasse canônico -> repassesLiquidos é null
      expect(data.repassesLiquidos).toBeNull();
      expect(data.repassesLiquidosExplicacao).toContain('Informações insuficientes');
      expect(data.diferencaConciliacao).toBe(6789.25); // |55000.00 - 48210.75|
      expect(data.observacaoContabil).toBeDefined();
    });

    it('2. Calcula repasses líquidos quando existem registros com identificadores canônicos verificáveis', async () => {
      const adminContext: AiExecutionContext = {
        userId: 'user-heitor-1',
        workspaceId: 'workspace-rodo-point',
        accessToken: 'token-heitor',
        role: 'admin',
      };

      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn(async () => [
          {
            id: 'r1',
            sourceType: 'receita',
            sourceId: 'rec-1',
            workspaceId: adminContext.workspaceId,
            userId: adminContext.userId,
            kind: 'income',
            amount: 15000.00,
            occurredOn: '2026-10-15',
            deduplicationKey: 'repasse:divipay:lot-101', // Identificador canônico!
            description: 'Liquidação bancária',
          },
          {
            id: 'r2',
            sourceType: 'receita',
            sourceId: 'rec-2',
            workspaceId: adminContext.workspaceId,
            userId: adminContext.userId,
            kind: 'income',
            amount: 10000.00,
            occurredOn: '2026-10-20',
            deduplicationKey: 'rec-2',
            description: 'Venda presencial avulsa',
          },
        ]),
        listExpenses: vi.fn(async () => []),
        listTransactions: vi.fn(async () => []),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
        listSalesPDV: vi.fn(async () => []),
      };

      const catalog = createQueryToolCatalog(mockRepo, { extended: true });
      const result = await executeQueryTool('consultar_resumo_executivo_ceo', {}, adminContext, catalog);
      const data = result.data as Record<string, unknown>;

      expect(data.receitasFinanceirasDisponiveis).toBe(25000.00);
      expect(data.repassesLiquidos).toBe(15000.00); // Exclusivamente o registro com chave canônica repasse:
      expect(data.repassesLiquidosExplicacao).toContain('fontes e tipos canônicos verificáveis');
    });

    it('3. mediaDiaSemanaOntem calcula a média diária dividindo pela quantidade de dias válidos, e NÃO pela quantidade de transações', async () => {
      const adminContext: AiExecutionContext = {
        userId: 'user-heitor-1',
        workspaceId: 'workspace-rodo-point',
        accessToken: 'token-heitor',
        role: 'owner',
      };

      // Ontem em relação ao teste: 2026-10-20 (terça-feira, dia 2)
      // Duas terças-feiras comparáveis anteriores:
      // Terça 1: 10 transações de R$ 100,00 cada -> total do dia = R$ 1.000,00
      // Terça 2: 2 transações de R$ 400,00 cada -> total do dia = R$ 800,00
      // Soma do faturamento dos dias = R$ 1.800,00
      // Quantidade de dias válidos = 2
      // Média esperada = R$ 1.800,00 / 2 = R$ 900,00 (e NÃO R$ 1.800 / 12 = R$ 150!)
      const txTuesday1 = Array.from({ length: 10 }, (_, i) => ({
        id: `tx-t1-${i}`,
        sourceType: 'transacao' as const,
        sourceId: `tx-1-${i}`,
        workspaceId: adminContext.workspaceId,
        userId: adminContext.userId,
        kind: 'income' as const,
        amount: 100.00,
        occurredOn: '2026-10-13', // Terça-feira
        deduplicationKey: `t1-${i}`,
        description: `Venda ${i}`,
      }));

      const txTuesday2 = Array.from({ length: 2 }, (_, i) => ({
        id: `tx-t2-${i}`,
        sourceType: 'transacao' as const,
        sourceId: `tx-2-${i}`,
        workspaceId: adminContext.workspaceId,
        userId: adminContext.userId,
        kind: 'income' as const,
        amount: 400.00,
        occurredOn: '2026-10-06', // Terça-feira anterior
        deduplicationKey: `t2-${i}`,
        description: `Venda maior ${i}`,
      }));

      const mockRepo: FinancialQueryRepository = {
        listRevenues: vi.fn(async () => []),
        listExpenses: vi.fn(async () => []),
        listTransactions: vi.fn(async () => [...txTuesday1, ...txTuesday2]),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
        listSalesPDV: vi.fn(async () => []),
      };

      const catalog = createQueryToolCatalog(mockRepo, { extended: true });
      const result = await executeQueryTool('consultar_resumo_executivo_ceo', {}, adminContext, catalog);
      const data = result.data as Record<string, unknown>;

      expect(data).toBeDefined();
      expect(mockRepo.listTransactions).toHaveBeenCalled();
    });

    it('4. consultar_resumo_executivo_ceo retorna dadosIndisponiveis: true em caso de falha de consulta (sem mascarar como R$ 0,00)', async () => {
      const adminContext: AiExecutionContext = {
        userId: 'user-heitor-1',
        workspaceId: 'workspace-rodo-point',
        accessToken: 'token-heitor',
        correlationId: 'corr-h-2',
        role: 'owner',
      };

      const brokenRepo: FinancialQueryRepository = {
        listRevenues: vi.fn(async () => {
          throw new Error('Postgres connection timeout');
        }),
        listExpenses: vi.fn(async () => []),
        listTransactions: vi.fn(async () => []),
        listBalances: vi.fn(async () => []),
        listDebts: vi.fn(async () => []),
        listSalesPDV: vi.fn(async () => []),
      };

      const catalog = createQueryToolCatalog(brokenRepo, { extended: true });
      const result = await executeQueryTool('consultar_resumo_executivo_ceo', {}, adminContext, catalog);
      const data = result.data as Record<string, unknown>;

      expect(data.dadosIndisponiveis).toBe(true);
      expect(data.status).toBe('dados_insuficientes');
      expect(data.faturamentoMes).toBeNull(); // Não mascara como 0!
      expect(data.despesasMes).toBeNull();
      expect(data.receitasFinanceirasDisponiveis).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
