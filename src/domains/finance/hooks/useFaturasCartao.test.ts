import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  determinarFaturaParaData,
  calcularPeriodoFatura,
  useFaturasCartao,
} from './useFaturasCartao';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
    },
  },
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(() => ({
    activeWorkspace: { id: 'ws-123', nome: 'Workspace Principal' },
  })),
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useFaturasCartao & Cálculo de Ciclo de Faturas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('determinarFaturaParaData', () => {
    it('atribui ao mês atual se a compra ocorreu até o dia de fechamento', () => {
      // Fechamento no dia 15; compra no dia 10
      const res = determinarFaturaParaData('2026-05-10', 15);
      expect(res).toEqual({ mes_fatura: 5, ano_fatura: 2026 });
    });

    it('atribui ao mês atual se a compra ocorreu exatamente no dia de fechamento', () => {
      const res = determinarFaturaParaData('2026-05-15', 15);
      expect(res).toEqual({ mes_fatura: 5, ano_fatura: 2026 });
    });

    it('projeta para o mês seguinte se a compra ocorreu após o dia de fechamento', () => {
      // Fechamento no dia 15; compra no dia 16
      const res = determinarFaturaParaData('2026-05-16', 15);
      expect(res).toEqual({ mes_fatura: 6, ano_fatura: 2026 });
    });

    it('projeta para o próximo ano se a compra ocorreu após o fechamento em dezembro', () => {
      // Fechamento no dia 20; compra dia 25 de dezembro
      const res = determinarFaturaParaData('2026-12-25', 20);
      expect(res).toEqual({ mes_fatura: 1, ano_fatura: 2027 });
    });

    it('usa dia padrão 22 quando o dia de fechamento não for informado ou for inválido', () => {
      const res1 = determinarFaturaParaData('2026-08-20', null);
      expect(res1).toEqual({ mes_fatura: 8, ano_fatura: 2026 });

      const res2 = determinarFaturaParaData('2026-08-25', undefined);
      expect(res2).toEqual({ mes_fatura: 9, ano_fatura: 2026 });
    });
  });

  describe('calcularPeriodoFatura', () => {
    it('calcula datas com vencimento no mesmo mês quando dia_vencimento > dia_fechamento', () => {
      // Cartão com fechamento dia 10, vencimento dia 20; Mês 8 (Agosto) de 2026
      const res = calcularPeriodoFatura(
        { dia_fechamento: 10, dia_vencimento: 20 },
        8,
        2026
      );

      expect(res.data_inicio).toBe('2026-07-10');
      expect(res.data_fechamento).toBe('2026-08-10');
      expect(res.data_vencimento).toBe('2026-08-20');
    });

    it('calcula vencimento no mês seguinte quando dia_vencimento <= dia_fechamento', () => {
      // Cartão com fechamento dia 25, vencimento dia 5; Mês 8 (Agosto) de 2026
      const res = calcularPeriodoFatura(
        { dia_fechamento: 25, dia_vencimento: 5 },
        8,
        2026
      );

      expect(res.data_inicio).toBe('2026-07-25');
      expect(res.data_fechamento).toBe('2026-08-25');
      // Vencimento rola para 05/09/2026
      expect(res.data_vencimento).toBe('2026-09-05');
    });

    it('suporta receber diaFechamento diretamente como número', () => {
      const res = calcularPeriodoFatura(15, 4, 2026);
      expect(res.data_fechamento).toBe('2026-04-15');
      expect(res.data_inicio).toBe('2026-03-15');
    });
  });

  describe('useFaturasCartao Hook', () => {
    it('busca faturas do Supabase com sucesso filtrando por cartao e workspace', async () => {
      const mockFaturas = [
        {
          id: 'fat-1',
          cartao_id: 'card-1',
          workspace_id: 'ws-123',
          mes_fatura: 8,
          ano_fatura: 2026,
          valor_total: 1250.5,
          status: 'fechada',
          data_vencimento: '2026-08-20',
        },
      ];

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: mockFaturas, error: null }).then(resolve),
      };

      vi.mocked(supabase.from).mockReturnValue(chain as never);

      const { result } = renderHook(() => useFaturasCartao('card-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.faturas).toEqual(mockFaturas);
    });

    it('trata erro de banco retornando array vazio sem quebrar', async () => {
      const errorChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'Network error' } }).then(resolve, reject),
      };

      vi.mocked(supabase.from).mockReturnValue(errorChain as never);

      const { result } = renderHook(() => useFaturasCartao('card-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.faturas).toEqual([]);
    });
  });
});
