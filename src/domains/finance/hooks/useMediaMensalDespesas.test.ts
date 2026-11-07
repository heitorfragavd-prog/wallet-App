import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useMediaMensalDespesas } from './useMediaMensalDespesas';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: { id: 'ws-test-123', nome: 'Workspace Test' },
  }),
}));

import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

function createMockQuery(data: unknown = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: (resolve: (val: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

describe('useMediaMensalDespesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula média mensal real dos últimos 6 meses fechados somando despesas e transacoes pagas', async () => {
    const mockDespesas = [
      { valor: 3000, data: '2026-05-15' },
      { valor: 3000, data: '2026-06-15' },
      { valor: 3000, data: '2026-07-15' },
      { valor: 3000, data: '2026-08-15' },
      { valor: 3000, data: '2026-09-15' },
      { valor: 3000, data: '2026-10-15' },
    ];
    const mockTransacoes = [
      { valor: 6000, data: '2026-10-20' },
    ];

    // Total = 18000 + 6000 = 24000. 6 meses distintos. Média / 6 = 4000
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
      .mockReturnValueOnce(createMockQuery(mockTransacoes) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(4000);
  });

  it('normaliza a média pelo número de meses distintos quando há menos de 6 meses', async () => {
    const mockDespesas = [
      { valor: 5000, data: '2026-09-10' },
      { valor: 5000, data: '2026-10-10' },
    ];

    // 2 meses distintos. Total 10000 / 2 = 5000
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
      .mockReturnValueOnce(createMockQuery([]) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(5000);
  });

  it('retorna 0 quando não há despesas nem transações nos 6 meses', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockQuery([]) as never)
      .mockReturnValueOnce(createMockQuery([]) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(0);
  });

  it('sinaliza isError como true quando a consulta do Supabase falha com erro', async () => {
    const errorQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: (resolve: (val: { data: null; error: { message: string } }) => void) =>
        resolve({ data: null, error: { message: 'column "fatura_id" does not exist' } }),
    };

    vi.mocked(supabase.from)
      .mockReturnValueOnce(errorQuery as never)
      .mockReturnValueOnce(createMockQuery([]) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
  });
});
