import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDRE } from './useDRE';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(() => ({
    activeWorkspace: { id: 'ws-dre-test', nome: 'Empresa DRE' },
  })),
}));

vi.mock('@/domains/divipay/services/DivipayService', () => ({
  divipayService: {
    listMovements: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { divipayService } from '@/domains/divipay/services/DivipayService';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const makeChain = (data: unknown[]) => ({
  select: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  range: vi.fn().mockResolvedValue({ data, error: null }),
});

describe('useDRE Hook & Demonstração do Resultado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula DRE gerencial com receitas, impostos, CMV estimado, EBITDA e lucro líquido', async () => {
    const mockReceitas = [{ valor: 10000, workspace_id: 'ws-dre-test' }];
    const mockTransReceitas = [{ valor: 0, workspace_id: 'ws-dre-test' }];
    const mockDespesas = [
      { valor: 1500, descricao: 'Aluguel', workspace_id: 'ws-dre-test', metodo_pagamento: 'boleto' },
      { valor: 500, descricao: 'Salários', workspace_id: 'ws-dre-test', metodo_pagamento: 'pix' },
      // Despesa de cartão (não deve compor despesa operacional direta)
      { valor: 800, descricao: 'Equipamento', workspace_id: 'ws-dre-test', cartao_id: 'card-1' },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'receitas') return makeChain(mockReceitas) as never;
      if (table === 'transacoes') return makeChain(mockTransReceitas) as never;
      if (table === 'despesas') return makeChain(mockDespesas) as never;
      if (table === 'fichas_tecnicas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as never;
      }
      return makeChain([]) as never;
    });

    const { result } = renderHook(() => useDRE(8, 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const dre = result.current.dre;
    expect(dre).toBeDefined();

    // 1. Receita Bruta: 10.000
    expect(dre.receitaBruta).toBe(10000);

    // 2. Impostos: ICMS Simples (7%) = 700, PIS/COFINS (3.65%) = 365, ISS (2%) = 200 -> Total = 1265
    expect(dre.impostosSimples).toBeCloseTo(700, 2);
    expect(dre.pisCofinsSobreReceita).toBeCloseTo(365, 2);
    expect(dre.issServicos).toBeCloseTo(200, 2);

    // 3. Receita Líquida: 10000 - 1265 = 8735
    expect(dre.receitaLiquida).toBeCloseTo(8735, 2);

    // 4. CMV estimado (30% da RB na ausência de fichas técnicas) = 3000
    expect(dre.cmv).toBeCloseTo(3000, 2);

    // 5. Lucro Bruto: 8735 - 3000 = 5735
    expect(dre.lucroBruto).toBeCloseTo(5735, 2);

    // 6. Despesas Operacionais: 1500 (aluguel) + 500 (salários) = 2000
    expect(dre.despesasOperacionais).toBeCloseTo(2000, 2);

    // Despesa de cartão separada = 800
    expect(dre.despesasCartao).toBeCloseTo(800, 2);

    // 7. EBITDA: 5735 - 2000 = 3735
    expect(dre.ebitda).toBeCloseTo(3735, 2);

    // 8. Depreciação (1% de 10000) = 100 -> LAIR = 3635
    expect(dre.depreciacao).toBeCloseTo(100, 2);
    expect(dre.lair).toBeCloseTo(3635, 2);

    // 9. IRPJ (15% de 3635) = 545.25 -> Lucro Líquido = 3089.75
    expect(dre.irpj).toBeCloseTo(545.25, 2);
    expect(dre.lucroLiquido).toBeCloseTo(3089.75, 2);

    // 10. Margens
    expect(dre.margemBruta).toBeCloseTo(57.35, 2);
    expect(dre.margemEbitda).toBeCloseTo(37.35, 2);
    expect(dre.margemLiquida).toBeCloseTo(30.9, 1);
  });

  it('não calcula IRPJ quando a empresa opera em prejuízo (LAIR <= 0)', async () => {
    const mockReceitas = [{ valor: 1000, workspace_id: 'ws-dre-test' }];
    const mockDespesas = [
      { valor: 5000, descricao: 'Despesa Alta', workspace_id: 'ws-dre-test', metodo_pagamento: 'pix' },
    ];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'receitas') return makeChain(mockReceitas) as never;
      if (table === 'transacoes') return makeChain([]) as never;
      if (table === 'despesas') return makeChain(mockDespesas) as never;
      if (table === 'fichas_tecnicas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as never;
      }
      return makeChain([]) as never;
    });

    const { result } = renderHook(() => useDRE(8, 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dre.lair).toBeLessThan(0);
    expect(result.current.dre.irpj).toBe(0);
    expect(result.current.dre.lucroLiquido).toBe(result.current.dre.lair);
  });

  it('filtra saques e transações não-liquidadas da Divipay para não inflar a receita', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'fichas_tecnicas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        } as never;
      }
      return makeChain([]) as never;
    });

    vi.mocked(divipayService.listMovements).mockResolvedValueOnce({
      items: [
        { type: 'PIX_IN', status: 'SETTLED', amountLiquid: 500, amount: 500 },
        // Saque: não é receita
        { type: 'SAQUE', status: 'SETTLED', amountLiquid: 300, amount: 300 },
        // Cancelado: não é receita
        { type: 'PIX_IN', status: 'CANCELED', amountLiquid: 200, amount: 200 },
      ] as never,
    });

    const { result } = renderHook(() => useDRE(8, 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Apenas os R$ 500 settled de PIX_IN entram na receita bruta
    expect(result.current.dre.receitaBruta).toBe(500);
  });
});
