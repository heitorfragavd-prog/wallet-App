import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEquipeAcertos } from './useEquipeAcertos';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

function mockEmptyQuery() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  vi.mocked(supabase.from).mockReturnValue(chain as never);
}

describe('useEquipeAcertos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmptyQuery();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'result-id', error: null } as never);
  });

  it('gera acerto pela RPC atomica e invalida acertos e resumo', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEquipeAcertos('colaborador-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.gerarAcerto.mutateAsync({
        colaboradorId: 'colaborador-1',
        periodoInicio: '2026-08-17',
        periodoFim: '2026-08-23',
        itens: [{ natureza: 'diaria', descricao: 'Segunda', valor: 100, escala_id: 'escala-1' }],
      });
    });

    expect(supabase.rpc).toHaveBeenCalledWith('gerar_acerto_semanal', {
      p_colaborador_id: 'colaborador-1',
      p_periodo_inicio: '2026-08-17',
      p_periodo_fim: '2026-08-23',
      p_itens: [{ natureza: 'diaria', descricao: 'Segunda', valor: 100, escala_id: 'escala-1' }],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['equipe-acertos'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['equipe-resumo'] });
  });

  it('inicia pagamento e cancela escala somente por RPC', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useEquipeAcertos('colaborador-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.iniciarPagamento.mutateAsync({ acertoId: 'acerto-1', origem: 'wallet_divipay' });
      await result.current.cancelarEscala.mutateAsync({ escalaId: 'escala-1', motivo: 'Folguista desmarcou' });
    });

    expect(supabase.rpc).toHaveBeenCalledWith('iniciar_pagamento_acerto', {
      p_acerto_id: 'acerto-1',
      p_origem: 'wallet_divipay',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_escala_e_recalcular_acerto', {
      p_escala_id: 'escala-1',
      p_motivo: 'Folguista desmarcou',
    });
  });

  it('propaga erro da RPC sem invalidar o cache como sucesso', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('falha atomica') } as never);
    const { Wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEquipeAcertos('colaborador-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.gerarAcerto.mutateAsync({
        colaboradorId: 'colaborador-1',
        periodoInicio: '2026-08-17',
        periodoFim: '2026-08-23',
        itens: [{ natureza: 'diaria', descricao: 'Segunda', valor: 100 }],
      }),
    ).rejects.toThrow('falha atomica');
    expect(invalidate).not.toHaveBeenCalled();
  });
});

