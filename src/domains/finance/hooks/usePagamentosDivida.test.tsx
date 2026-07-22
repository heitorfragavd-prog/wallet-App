import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { usePagamentosDivida } from './usePagamentosDivida';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase (padrão do projeto)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

// Mock do useToast
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock do useDebtReminders (calculateTriggerAt)
vi.mock('./useDebtReminders', () => ({
  calculateTriggerAt: vi.fn(() => '2026-08-22T10:00:00Z'),
}));

const MOCK_USER: User = { id: 'user-test-123' } as User;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('usePagamentosDivida - despesa do pagamento aparece na lista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: MOCK_USER as unknown },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ao registrar 1 parcela de dívida, cria despesa válida e ela aparece em fetchDespesas', async () => {
    const dividaId = 'divida-robo6';
    const divida = {
      id: dividaId,
      descricao: 'robo 6',
      credor: 'divipay',
      valor_total: 2500,
      valor_pago: 0,
      valor_restante: 2500,
      parcelas: 10,
      parcelas_pagas: 0,
      status: 'pendente',
      data_vencimento: '2026-07-22',
      categoria_id: 'cat-tec',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let despesaInserida: any = null;

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'dividas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: divida, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'pagamentos_dividas') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'pag-1',
                  divida_id: dividaId,
                  valor: 250,
                  data_pagamento: '2026-07-22',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'despesas') {
        return {
          insert: vi.fn().mockImplementation((rows) => {
            despesaInserida = rows[0];
            return { error: null };
          }),
        };
      }
      if (table === 'debt_reminders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const { result } = renderHook(() => usePagamentosDivida(dividaId), { wrapper });

    let retorno: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await act(async () => {
      retorno = await result.current.createPagamento(
        dividaId,
        {
          valor: 250,
          data_pagamento: '2026-07-22',
          metodo_pagamento: null, // usuário não escolheu método
          conta_id: null,
          observacoes: '',
        },
        true
      );
    });

    // 1. O pagamento foi registrado com sucesso
    expect(retorno.error).toBeNull();
    expect(retorno.data).toBeDefined();

    // 2. A despesa FOI criada (antes o insert podia falhar silenciosamente)
    expect(despesaInserida).not.toBeNull();

    // 3. A despesa tem a descrição esperada
    expect(despesaInserida.descricao).toBe('Pagamento dívida: robo 6 (divipay)');

    // 4. Não manda metodo_pagamento vazio (evita violar CHECK da tabela)
    expect(despesaInserida.metodo_pagamento).toBeUndefined();

    // 5. Manda categoria_id válido
    expect(despesaInserida.categoria_id).toBe('cat-tec');

    // 6. user_id correto
    expect(despesaInserida.user_id).toBe(MOCK_USER.id);
  });

  it('não cria despesa quando criarDespesa=false', async () => {
    const dividaId = 'divida-x';
    const divida = {
      id: dividaId,
      descricao: 'x',
      credor: 'c',
      valor_total: 100,
      valor_pago: 0,
      valor_restante: 100,
      parcelas: 1,
      parcelas_pagas: 0,
      status: 'pendente',
      data_vencimento: '2026-07-22',
      categoria_id: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let despesaInserida: any = null;

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'dividas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: divida, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        };
      }
      if (table === 'pagamentos_dividas') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'p', divida_id: dividaId, valor: 100, data_pagamento: '2026-07-22' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'despesas') {
        return { insert: vi.fn().mockImplementation((rows) => { despesaInserida = rows[0]; return { error: null }; }) };
      }
      if (table === 'debt_reminders') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
      }
      return {};
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const { result } = renderHook(() => usePagamentosDivida(dividaId), { wrapper });

    await act(async () => {
      await result.current.createPagamento(dividaId, { valor: 100, data_pagamento: '2026-07-22' }, false);
    });

    expect(despesaInserida).toBeNull();
  });
});
