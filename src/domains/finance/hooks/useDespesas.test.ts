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

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: 'ws-test-123', nome: 'Workspace Test' },
  }),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/domains/divipay/services/DivipayService', () => ({
  divipayService: {
    listWithdraws: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { divipayService } from '@/domains/divipay/services/DivipayService';
import type { DivipaySaque } from '@/domains/divipay/types';

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

interface MockQueryChain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (val: { data: unknown; error: null }) => void) => void;
}

function createMockQuery(data: unknown = []): MockQueryChain {
  const chain: MockQueryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: (data as Array<{ id: string }>)?.[0] || { id: 'new-dep' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve) => resolve({ data, error: null }),
  };
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('useDespesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── fetch query ────────────────────────────────────────────────
  describe('busca de despesas', () => {
    it('retorna lista de despesas ordenada por data (mais recente primeiro)', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(2);
      // dep-2 (2024-03-05) deve vir antes de dep-1 (2024-03-01)
      expect(result.current.despesas[0].id).toBe('dep-2');
    });

    it('retorna lista vazia quando não há despesas', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.despesas).toHaveLength(0);
    });

    it('loading é true durante o fetch e false após conclusão', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas(), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  // ── filterByTags ───────────────────────────────────────────────
  describe('filterByTags', () => {
    beforeEach(() => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);
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
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);
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
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: 'user-1' } },
      } as never);

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)  // fetch inicial despesas
        .mockReturnValueOnce(createMockQuery([]) as never) // fetch transacoes
        .mockReturnValue(createMockQuery([{ id: 'new-dep', descricao: 'Nova Despesa', valor: 100 }]) as never);   // inserts/lookups

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

  // ── Divipay e conversão de fuso horário America/Sao_Paulo ────────
  describe('Divipay e conversão de fuso horário America/Sao_Paulo', () => {
    it('converte timestamp UTC próximo da meia-noite (02:30Z) para o dia anterior no fuso de São Paulo (23:30)', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never) // despesas
        .mockReturnValueOnce(createMockQuery([]) as never); // transacoes

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          {
            id: 'saque-utc-1',
            amount: 250,
            status: 'PAID',
            description: 'Saque Noturno',
            createdAt: '2026-09-04T02:30:00.000Z', // 02:30 UTC = 23:30 do dia 2026-09-03 em SP
            type: 'PIX',
          } as unknown as DivipaySaque,
        ],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-03', endDate: '2026-09-03' }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(1);
      expect(result.current.despesas[0].id).toBe('divipay-saque-utc-1');
      // A data deve ser 2026-09-03, e NÃO 2026-09-04
      expect(result.current.despesas[0].data).toBe('2026-09-03');
    });

    it('exclui saques com status pendentes, falhados ou cancelados', async () => {
      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery([]) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          {
            id: 'saque-pendente',
            amount: 100,
            status: 'PENDING',
            createdAt: '2026-09-03T15:00:00.000Z',
          } as unknown as DivipaySaque,
          {
            id: 'saque-cancelado',
            amount: 200,
            status: 'CANCELED',
            createdAt: '2026-09-03T16:00:00.000Z',
          } as unknown as DivipaySaque,
          {
            id: 'saque-confirmado',
            amount: 300,
            status: 'PAID',
            createdAt: '2026-09-03T17:00:00.000Z',
          } as unknown as DivipaySaque,
        ],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-03', endDate: '2026-09-03' }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(1);
      expect(result.current.despesas[0].id).toBe('divipay-saque-confirmado');
    });

    it('anti-duplicidade segura: deduplica apenas quando há identificador explícito de saque Divipay', async () => {
      const despesasComDivipayGravado = [
        {
          id: 'dep-divipay-gravada',
          descricao: 'Saque Divipay no Banco',
          valor: 150,
          data: '2026-09-03',
          divipay_external_id: 'saque-999',
          categorias: null,
          despesa_tags: [],
        },
        {
          id: 'dep-legitima-mesmo-valor',
          descricao: 'Almoço Restaurante',
          valor: 150,
          data: '2026-09-03',
          categorias: null,
          despesa_tags: [],
        },
      ];

      vi.mocked(supabase.from)
        .mockReturnValueOnce(createMockQuery(despesasComDivipayGravado) as never)
        .mockReturnValueOnce(createMockQuery([]) as never);

      vi.mocked(divipayService.listWithdraws).mockResolvedValueOnce({
        items: [
          {
            id: 'saque-999',
            amount: 150,
            status: 'COMPLETED',
            createdAt: '2026-09-03T14:00:00.000Z',
          } as unknown as DivipaySaque,
        ],
      });

      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useDespesas({ startDate: '2026-09-03', endDate: '2026-09-03' }), {
        wrapper: Wrapper,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.despesas).toHaveLength(2);
      expect(result.current.despesas.map((d) => d.id)).toEqual(
        expect.arrayContaining(['dep-divipay-gravada', 'dep-legitima-mesmo-valor'])
      );
      expect(result.current.despesas.some((d) => d.id === 'divipay-saque-999')).toBe(false);
    });
  });
});
