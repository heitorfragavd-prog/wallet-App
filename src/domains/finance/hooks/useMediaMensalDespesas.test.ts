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
    gte: vi.fn().mockReturnThis(),
    then: (resolve: (val: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

describe('useMediaMensalDespesas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula média mensal real dos últimos 6 meses somando despesas e transacoes', async () => {
    const mockDespesas = [
      { valor: 3000 },
      { valor: 3000 },
    ];
    const mockTransacoes = [
      { valor: 6000 },
    ];

    // Total = 6000 + 6000 = 12000. Média / 6 = 2000
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
      .mockReturnValueOnce(createMockQuery(mockTransacoes) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(2000);
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
});
