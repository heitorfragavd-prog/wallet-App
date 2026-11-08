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
    in: vi.fn().mockReturnThis(),
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

  it('calcula média mensal real dos últimos 6 meses fechados via motor canônico', async () => {
    const mockDespesas = [
      { id: 'd1', valor: 3000, data: '2026-05-15', status: 'pago' },
      { id: 'd2', valor: 3000, data: '2026-06-15', status: 'pago' },
      { id: 'd3', valor: 3000, data: '2026-07-15', status: 'pago' },
      { id: 'd4', valor: 3000, data: '2026-08-15', status: 'pago' },
      { id: 'd5', valor: 3000, data: '2026-09-15', status: 'pago' },
      { id: 'd6', valor: 3000, data: '2026-10-15', status: 'pago' },
    ];
    const mockTransacoes = [
      { id: 't1', valor: 6000, data: '2026-10-20', tipo: 'despesa', status: 'pago' },
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

  it('não soma despesas e transações duplicadas que compartilham divipay_external_id', async () => {
    const externalId = 'divipay-transacao-123';
    const mockDespesas = [
      { id: 'd1', valor: 5000, data: '2026-09-15', status: 'pago', divipay_external_id: externalId },
    ];
    const mockTransacoes = [
      { id: 't1', valor: 5000, data: '2026-09-15', tipo: 'despesa', divipay_external_id: externalId },
    ];

    // Duplicidade confirmada: o motor canônico deve contabilizar apenas 5000 (1 vez), não 10000!
    // 1 mês com dados -> Média = 5000
    vi.mocked(supabase.from)
      .mockReturnValueOnce(createMockQuery(mockDespesas) as never)
      .mockReturnValueOnce(createMockQuery(mockTransacoes) as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMediaMensalDespesas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(5000);
  });

  it('exclui transferências internas entre contas próprias do cômputo da média operacional', async () => {
    const mockDespesas = [
      { id: 'd1', valor: 4000, data: '2026-10-10', status: 'pago' },
    ];
    const mockTransacoes = [
      {
        id: 't-transf',
        valor: 50000,
        data: '2026-10-12',
        tipo: 'transferencia',
        natureza_operacao: 'transferencia_interna',
        conta_id: 'conta-a',
        conta_destino_id: 'conta-b',
      },
    ];

    // Transferência interna de 50.000 é ignorada; considera apenas os 4.000 da despesa operacional
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
      { id: 'd1', valor: 5000, data: '2026-09-10', status: 'pago' },
      { id: 'd2', valor: 5000, data: '2026-10-10', status: 'pago' },
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
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: (resolve: (val: { data: null; error: { message: string } }) => void) =>
        resolve({ data: null, error: { message: 'Network or database error' } }),
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
