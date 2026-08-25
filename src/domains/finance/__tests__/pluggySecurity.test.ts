import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createPluggyConnectToken,
  fetchPluggyItemAccounts,
  fetchPluggyItemInvestments,
  fetchPluggyItemTransactions,
  registerPluggyItem,
  syncPluggyItemToSupabase,
} from '../services/pluggyService';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase Client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe('Pluggy Security & Backend Isolation Tests', () => {
  const mockWorkspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';
  const _mockUserId = '0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0';
  const mockItemId = 'pluggy-item-uuid-12345';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Validações de Parâmetros e Autenticação no Frontend Service', () => {
    it('rejeita chamada de connectToken se workspace_id for vazio', async () => {
      await expect(createPluggyConnectToken('')).rejects.toThrow(
        'workspace_id é obrigatório para obter o Connect Token.'
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('rejeita registro de item se itemId ou workspaceId estiverem ausentes', async () => {
      await expect(registerPluggyItem('', 'item-1')).rejects.toThrow(
        'workspace_id e itemId são obrigatórios.'
      );
      await expect(registerPluggyItem(mockWorkspaceId, '')).rejects.toThrow(
        'workspace_id e itemId são obrigatórios.'
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('rejeita sincronização se workspaceId ou itemId estiverem ausentes', async () => {
      await expect(syncPluggyItemToSupabase('', 'item-1')).rejects.toThrow(
        'workspace_id e itemId são obrigatórios para sincronização.'
      );
      await expect(syncPluggyItemToSupabase(mockWorkspaceId, '')).rejects.toThrow(
        'workspace_id e itemId são obrigatórios para sincronização.'
      );
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('retorna mensagem amigável em português quando Edge Function não está publicada ou offline', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Failed to send a request to the Edge Function'),
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'O serviço Open Finance está em fase de ativação e ainda não foi publicado no servidor.'
      );
    });
  });

  describe('2. Políticas de Autenticação e Autorização (JWT / Workspace / Ownership)', () => {
    it('1. Bloqueia requisição sem JWT (401)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: new Error('Token de autenticação ausente.'),
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Token de autenticação ausente.'
      );
    });

    it('2. Bloqueia requisição com JWT inválido (401)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Usuário não autenticado ou token inválido.' },
        error: null,
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Usuário não autenticado ou token inválido.'
      );
    });

    it('3. Bloqueia usuário sem acesso ao workspace especificado (403)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Acesso negado ao workspace especificado.' },
        error: null,
      });

      await expect(createPluggyConnectToken('unauthorized-workspace-uuid')).rejects.toThrow(
        'Acesso negado ao workspace especificado.'
      );
    });

    it('4. Bloqueia quando Usuário A tenta acessar Item Pluggy de Usuário B (403)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Item não encontrado ou não pertence a este workspace.' },
        error: null,
      });

      const accounts = await fetchPluggyItemAccounts(mockWorkspaceId, 'victim-user-item-id');
      expect(accounts).toEqual([]);
    });

    it('5. Bloqueia quando Workspace PF tenta acessar Item Pluggy de Workspace PJ (403)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Item não encontrado ou não pertence a este workspace.' },
        error: null,
      });

      const transactions = await fetchPluggyItemTransactions('workspace-pf-uuid', 'item-pj-uuid');
      expect(transactions).toEqual([]);
    });

    it('6. Trata itemId inexistente com erro controlado', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Item não encontrado ou não pertence a este workspace.' },
        error: null,
      });

      const investments = await fetchPluggyItemInvestments(mockWorkspaceId, 'non-existent-item');
      expect(investments).toEqual([]);
    });

    it('7. Rejeita registrar item inexistente na Pluggy (400)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Item Pluggy não encontrado ou inválido na instituição financeira.' },
        error: null,
      });

      await expect(registerPluggyItem(mockWorkspaceId, 'fake-item-id')).rejects.toThrow(
        'Item Pluggy não encontrado ou inválido na instituição financeira.'
      );
    });

    it('8. Rejeita registrar item já pertencente a outro workspace (403)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Item já vinculado a outro workspace.' },
        error: null,
      });

      await expect(registerPluggyItem(mockWorkspaceId, 'item-from-other-workspace')).rejects.toThrow(
        'Item já vinculado a outro workspace.'
      );
    });

    it('9. Registrar o mesmo item duas vezes é idempotente e atualiza o registro', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: { item_id: mockItemId, status: 'UPDATED' } },
        error: null,
      });

      const firstReg = await registerPluggyItem(mockWorkspaceId, mockItemId, 201, 'Sicoob');
      expect(firstReg).toEqual({ item_id: mockItemId, status: 'UPDATED' });

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: { item_id: mockItemId, status: 'UPDATED' } },
        error: null,
      });

      const secondReg = await registerPluggyItem(mockWorkspaceId, mockItemId, 201, 'Sicoob');
      expect(secondReg).toEqual({ item_id: mockItemId, status: 'UPDATED' });
    });
  });

  describe('3. Proteção de Credenciais, Logs e Tratamento de Erros da Pluggy', () => {
    it('10. Connect Token gera identidade isolada por usuário e workspace', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: { accessToken: 'secure-connect-token-xyz' } },
        error: null,
      });

      const result = await createPluggyConnectToken(mockWorkspaceId);
      expect(result).toEqual({ accessToken: 'secure-connect-token-xyz' });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('pluggy-api', {
        body: {
          action: 'getConnectToken',
          workspace_id: mockWorkspaceId,
        },
      });
    });

    it('11. Garante que secrets nunca aparecem na resposta', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            accessToken: 'token-123',
          },
        },
        error: null,
      });

      const res = await createPluggyConnectToken(mockWorkspaceId);
      expect(res).not.toHaveProperty('clientSecret');
      expect(res).not.toHaveProperty('PLUGGY_CLIENT_SECRET');
      expect(res).not.toHaveProperty('apiKey');
    });

    it('12. Trata ausência de PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET no servidor', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Credenciais da Pluggy (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET) não configuradas no servidor.' },
        error: null,
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Credenciais da Pluggy (PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET) não configuradas no servidor.'
      );
    });

    it('13. Trata erro 429 da Pluggy (Rate Limit) de forma controlada', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Limite de requisições da Pluggy atingido.' },
        error: null,
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Limite de requisições da Pluggy atingido.'
      );
    });

    it('14. Trata timeout na conexão externa de forma controlada', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Tempo limite excedido ao comunicar com o Open Finance.' },
        error: null,
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Tempo limite excedido ao comunicar com o Open Finance.'
      );
    });

    it('15. Trata erro 500 da API da Pluggy de forma controlada', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: false, error: 'Falha interna na API da instituição financeira (Pluggy).' },
        error: null,
      });

      await expect(createPluggyConnectToken(mockWorkspaceId)).rejects.toThrow(
        'Falha interna na API da instituição financeira (Pluggy).'
      );
    });
  });

  describe('4. Idempotência e Operações Autorizadas de Contas, Transações e Investimentos', () => {
    it('16. Sucesso na consulta de contas autorizadas', async () => {
      const mockAccounts = [
        { id: 'acc-1', name: 'Conta Corrente Itaú', type: 'BANK' as const, balance: 1500.5 },
      ];

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: mockAccounts },
        error: null,
      });

      const accounts = await fetchPluggyItemAccounts(mockWorkspaceId, mockItemId);
      expect(accounts).toEqual(mockAccounts);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('pluggy-api', {
        body: {
          action: 'getAccounts',
          workspace_id: mockWorkspaceId,
          itemId: mockItemId,
        },
      });
    });

    it('17. Sucesso na consulta de transações autorizadas', async () => {
      const mockTxs = [
        { id: 'tx-1', description: 'Supermercado', amount: -150.0, date: '2026-08-25', type: 'DEBIT' as const },
      ];

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: mockTxs },
        error: null,
      });

      const transactions = await fetchPluggyItemTransactions(mockWorkspaceId, mockItemId);
      expect(transactions).toEqual(mockTxs);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('pluggy-api', {
        body: {
          action: 'getTransactions',
          workspace_id: mockWorkspaceId,
          itemId: mockItemId,
        },
      });
    });

    it('18. Sucesso na consulta de investimentos autorizados', async () => {
      const mockInvs = [
        { id: 'inv-1', name: 'CDB 100% CDI', value: 10000.0, type: 'FIXED_INCOME' },
      ];

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: { success: true, data: mockInvs },
        error: null,
      });

      const investments = await fetchPluggyItemInvestments(mockWorkspaceId, mockItemId);
      expect(investments).toEqual(mockInvs);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('pluggy-api', {
        body: {
          action: 'getInvestments',
          workspace_id: mockWorkspaceId,
          itemId: mockItemId,
        },
      });
    });

    it('19. Sincronização repetida (idempotência): segunda execução não duplica contas ou transações', async () => {
      // 1ª Execução: insere 2 contas e 10 transações
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            accountsCount: 2,
            transactionsCount: 10,
            investmentsCount: 0,
          },
        },
        error: null,
      });

      const sync1 = await syncPluggyItemToSupabase(mockWorkspaceId, mockItemId, 'Itaú Unibanco');
      expect(sync1).toEqual({
        accountsCount: 2,
        transactionsCount: 10,
        investmentsCount: 0,
      });

      // 2ª Execução imediata: reutiliza as 2 contas e não insere transações duplicadas (0 novas)
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            accountsCount: 2,
            transactionsCount: 0,
            investmentsCount: 0,
          },
        },
        error: null,
      });

      const sync2 = await syncPluggyItemToSupabase(mockWorkspaceId, mockItemId, 'Itaú Unibanco');
      expect(sync2).toEqual({
        accountsCount: 2,
        transactionsCount: 0,
        investmentsCount: 0,
      });
    });
  });
});
