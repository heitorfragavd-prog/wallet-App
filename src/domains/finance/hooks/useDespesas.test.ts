/**
 * useDespesas Hook Tests
 *
 * Tests fetch, mutations (create/update/delete), filterByTags
 * and searchDespesas using React Query + Vitest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDespesas } from './useDespesas';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

// ── Wrapper com QueryClient isolado por teste ─────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

// ── Dados de teste ────────────────────────────────────────────────

const mockDespesas = [
  {
    id: 'dep-1',
    descricao: 'Aluguel',
    valor: 1500,
    data: '2024-03-01',
    tipo: 'despesa',
    categorias: { nome: 'Moradia', cor: '#ff0000', icone: 'home' },
    despesa_tags: [{ tags: { id: 'tag-1', nome: 'fixed', cor: '#blue' } }],
    observacoes: null,
    conta_id: null,
    metodo_pagamento: null,
  },
  {
    id: 'dep-2',
    descricao: 'Supermercado',
    valor: 300,
    data: '2024-03-05',
    tipo: 'despesa',
    categorias: { nome: 'Alimentação', cor: '#00ff00', icone: 'shopping-cart' },
    despesa_tags: [],
    observacoes: 'compras da semana',
    conta_id: 'conta-1',
    metodo_pagamento: null,
  },
];

// ── Tests ─────────────────────────────────────────────────────────

describe('useDespesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── fetch query ────────────────────────────────────────────────
  describe('busca de despesas', () => {
    it('retorna lista de despesas ordenada por data (mais recente primeiro)', async () => {
      const selectChain = {
        select: vi.fn().mockResolvedValue({ data: mockDespesas, error: null }),
      };
      const transacoesChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(selectChain as never)
        .mockReturnValueOnce(transacoesChain as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(2);
      // dep-2 (2024-03-05) deve vir antes de dep-1 (2024-03-01)
      expect(result.current.despesas[0].id).toBe('dep-2');
    });

    it('retorna lista vazia quando não há despesas', async () => {
      const emptyChain = {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      const emptyTransacoes = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(emptyChain as never)
        .mockReturnValueOnce(emptyTransacoes as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.despesas).toHaveLength(0);
    });

    it('loading é true durante o fetch e false após conclusão', async () => {
      const slowChain = {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      const emptyTransacoes = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(slowChain as never)
        .mockReturnValueOnce(emptyTransacoes as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      // Inicialmente loading = true
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  // ── filterByTags ───────────────────────────────────────────────
  describe('filterByTags', () => {
    beforeEach(() => {
      const selectChain = {
        select: vi.fn().mockResolvedValue({ data: mockDespesas, error: null }),
      };
      const emptyTransacoes = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(supabase.from)
        .mockReturnValueOnce(selectChain as never)
        .mockReturnValueOnce(emptyTransacoes as never);
    });

    it('retorna apenas despesas que têm todas as tags informadas', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags(['fixed']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('dep-1');
    });

    it('retorna todas as despesas quando tagNames está vazio', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags([]);
      expect(filtered).toHaveLength(2);
    });

    it('retorna lista vazia quando nenhuma despesa tem a tag informada', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const filtered = result.current.filterByTags(['inexistente']);
      expect(filtered).toHaveLength(0);
    });
  });

  // ── searchDespesas ─────────────────────────────────────────────
  describe('searchDespesas', () => {
    beforeEach(() => {
      const selectChain = {
        select: vi.fn().mockResolvedValue({ data: mockDespesas, error: null }),
      };
      const emptyTransacoes = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(supabase.from)
        .mockReturnValueOnce(selectChain as never)
        .mockReturnValueOnce(emptyTransacoes as never);
    });

    it('encontra despesas por termo na descrição (case-insensitive)', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('aluguel');
      expect(found).toHaveLength(1);
      expect(found[0].descricao).toBe('Aluguel');
    });

    it('encontra despesas por termo na categoria', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('moradia');
      expect(found).toHaveLength(1);
    });

    it('retorna todas quando searchTerm está vazio', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('');
      expect(found).toHaveLength(2);
    });

    it('retorna vazio quando não há correspondência', async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const found = result.current.searchDespesas('xyz-inexistente');
      expect(found).toHaveLength(0);
    });
  });

  // ── createDespesa mutation ─────────────────────────────────────
  describe('createDespesa mutation', () => {
    it('invalida o cache de despesas apos criacao bem-sucedida', async () => {
      // Setup fetch
      const selectChain = {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      const emptyTransacoes = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Setup mutation
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-dep', descricao: 'Nova Despesa', valor: 100 },
          error: null,
        }),
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-1' } },
      } as never);

      vi.mocked(supabase.from)
        .mockReturnValueOnce(selectChain as never)  // fetch inicial
        .mockReturnValueOnce(emptyTransacoes as never) // fetch transacoes
        .mockReturnValueOnce(insertChain as never);   // insert

      const { Wrapper, qc } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

      await act(async () => {
        await result.current.createDespesa(
          {
            descricao: 'Nova Despesa',
            valor: 100,
            data: '2024-03-10',
            categoria_id: null,
            observacoes: null,
            conta_id: null,
            metodo_pagamento: null,
          },
          []
        );
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });
  });
});
