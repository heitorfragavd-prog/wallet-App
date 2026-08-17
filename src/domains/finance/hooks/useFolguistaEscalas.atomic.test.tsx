import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFolguistaEscalas } from './useFolguistaEscalas';

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ activeWorkspace: { id: 'workspace-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/integrations/supabase/client';

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useFolguistaEscalas atomico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const queryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(queryChain as never);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'escala-1', error: null } as never);
  });

  it('registra e cancela escala por RPC sem inserir ou excluir custo diretamente', async () => {
    const { result } = renderHook(() => useFolguistaEscalas('colaborador-1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addEscala.mutateAsync({
        colaborador_id: 'colaborador-1',
        data: '2026-08-17',
        turno: 'integral',
        valor_diaria: 100,
        bateu_meta: true,
        valor_meta: 20,
        observacao: 'Teste',
      });
      await result.current.deleteEscala.mutateAsync('escala-1');
    });

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_escala_folguista', {
      p_colaborador_id: 'colaborador-1',
      p_data: '2026-08-17',
      p_turno: 'integral',
      p_valor_diaria: 100,
      p_bateu_meta: true,
      p_valor_meta: 20,
      p_observacao: 'Teste',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_escala_e_recalcular_acerto', {
      p_escala_id: 'escala-1',
      p_motivo: 'Escala cancelada pelo usuario',
    });
    expect(supabase.from).not.toHaveBeenCalledWith('colaborador_custos');
  });
});
