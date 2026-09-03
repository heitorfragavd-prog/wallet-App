import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConciliacao } from './useConciliacao';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(() => ({
    activeWorkspace: { id: 'ws-conciliacao-1', nome: 'Workspace Principal' },
  })),
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const makeMockQuery = (data: unknown[]) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockResolvedValue({ data, error: null }),
});

describe('useConciliacao Hook & Conciliação Automática', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca lançamentos de receitas, despesas e transações e separa pendentes e conciliados', async () => {
    const mockReceitas = [
      { id: 'rec-1', descricao: 'Venda Consultoria', valor: 3000, data: '2026-08-10', conciliado: true, metodo_pagamento: 'pix' },
    ];
    const mockDespesas = [
      { id: 'desp-1', descricao: 'Aluguel Escritorio', valor: 1500, data: '2026-08-05', conciliado: false, metodo_pagamento: 'boleto' },
    ];
    const mockTransacoes = [
      { id: 'tx-1', descricao: 'Aluguel Ago', valor: 1500, data: '2026-08-06', conciliado: false, metodo_pagamento: 'pix', tipo: 'despesa' },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'receitas') return makeMockQuery(mockReceitas) as never;
      if (table === 'despesas') return makeMockQuery(mockDespesas) as never;
      if (table === 'transacoes') return makeMockQuery(mockTransacoes) as never;
      return makeMockQuery([]) as never;
    });

    const { result } = renderHook(() => useConciliacao('2026-08'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lancamentos).toHaveLength(3);
    expect(result.current.conciliados).toHaveLength(1);
    expect(result.current.conciliados[0].id).toBe('rec-1');

    expect(result.current.pendentes).toHaveLength(2);
  });

  it('marcarConciliado atualiza o status no banco com isolamento de workspace', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'despesas') {
        return {
          ...makeMockQuery([]),
          update: mockUpdate,
        } as never;
      }
      return makeMockQuery([]) as never;
    });

    const { result } = renderHook(() => useConciliacao('2026-08'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.marcarConciliado({
        id: 'desp-1',
        fonte: 'despesas',
        conciliado: true,
      });
    });

    expect(mockUpdate).toHaveBeenCalledWith({ conciliado: true });
  });

  it('conciliarAutomaticamente encontra pares entre fontes diferentes por valor (± R$ 0,02) e proximidade de data (± 3 dias)', async () => {
    const mockDespesas = [
      { id: 'desp-match', descricao: 'Posto Gasolina', valor: 150.00, data: '2026-08-10', conciliado: false, metodo_pagamento: 'cartao' },
    ];
    const mockTransacoes = [
      // Diferença de R$ 0.01 e 1 dia de distância
      { id: 'tx-match', descricao: 'Posto Shell', valor: 150.01, data: '2026-08-11', conciliado: false, metodo_pagamento: 'debito', tipo: 'despesa' },
    ];

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'receitas') return makeMockQuery([]) as never;
      if (table === 'despesas') {
        return {
          ...makeMockQuery(mockDespesas),
          update: mockUpdate,
        } as never;
      }
      if (table === 'transacoes') {
        return {
          ...makeMockQuery(mockTransacoes),
          update: mockUpdate,
        } as never;
      }
      return makeMockQuery([]) as never;
    });

    const { result } = renderHook(() => useConciliacao('2026-08'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let matches = 0;
    await act(async () => {
      matches = await result.current.conciliarAutomaticamente();
    });

    expect(matches).toBe(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
