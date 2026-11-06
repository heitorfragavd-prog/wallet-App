import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDRE } from './useDRE';

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(() => ({
    activeWorkspace: { id: 'ws-dre-test', nome: 'Empresa DRE' },
  })),
}));

vi.mock('@/domains/ceo/services/CeoFinancialMetricsService', () => ({
  CeoFinancialMetricsService: {
    getRealNetProfit: vi.fn(),
  },
}));

import { CeoFinancialMetricsService } from '@/domains/ceo/services/CeoFinancialMetricsService';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useDRE Hook — Demonstração do Resultado Canônica e Unificada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcula DRE gerencial unificada com receitas reais, CMV auditado, despesas por competência e lucro líquido', async () => {
    vi.mocked(CeoFinancialMetricsService.getRealNetProfit).mockResolvedValue({
      periodoFormatado: 'Agosto de 2026',
      mes: 8,
      ano: 2026,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      faturamentoBruto: 10000,
      deducoesVendas: 0,
      receitaLiquida: 10000,
      cmvReal: 3200,
      cmvComprovado: 3200,
      cmvEstimado: 0,
      coberturaCustosPercent: 100,
      produtosComCustoQtd: 15,
      produtosTotalQtd: 15,
      produtosVendidosSemCusto: [],
      faturamentoVendasSemCusto: 0,
      lucroBruto: 6800,
      lucroBrutoComprovado: 6800,
      margemBrutaPercent: 68.0,
      despesasOperacionais: 2000,
      despesasOperacionaisPagas: 2000,
      despesasOperacionaisPendentes: 0,
      despesasPorCategoria: [],
      despesasExcluidasDuplicidade: {
        comprasEstoqueExcluidas: 1200,
        transferenciasInternas: 0,
        faturasCartaoDuplicadas: 0,
        retiradasSocios: 0,
      },
      resultadoOperacional: 4800,
      margemOperacionalPercent: 48.0,
      despesasFinanceiras: 300,
      tributosSobreResultado: 0,
      lucroLiquido: 4500,
      margemLiquidaPercent: 45.0,
      statusConfiabilidade: 'confirmado',
      motivoConfiabilidade: 'Auditado por NF',
      comparativoMesAnterior: {
        faturamentoMesAnterior: 9000,
        despesasMesAnterior: 1800,
        lucroLiquidoMesAnterior: 4000,
        variacaoValor: 500,
        variacaoPercent: 12.5,
        tendencia: 'crescimento',
      },
      evolucaoMensal: [],
      fatoresExplicativos: [],
      lancamentos: [],
    });

    const { result } = renderHook(() => useDRE(8, 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const dre = result.current.dre;
    expect(dre).toBeDefined();

    // 1. Receita Bruta real: 10.000
    expect(dre.receitaBruta).toBe(10000);

    // 2. Não deve aplicar alíquotas fictícias genéricas (7% ICMS, 3.65% PIS, etc.)
    expect(dre.impostosSimples).toBe(0);
    expect(dre.pisCofinsSobreReceita).toBe(0);
    expect(dre.issServicos).toBe(0);

    // 3. Receita Líquida real: 10.000
    expect(dre.receitaLiquida).toBe(10000);

    // 4. CMV real auditado por NF: 3.200 (não 3.000 arbitrário)
    expect(dre.cmv).toBe(3200);

    // 5. Lucro Bruto real: 6.800
    expect(dre.lucroBruto).toBe(6800);

    // 6. Despesas Operacionais e Financeiras
    expect(dre.despesasOperacionais).toBe(2000);
    expect(dre.despesasCartao).toBe(300);

    // 7. EBITDA: 4.800
    expect(dre.ebitda).toBe(4800);

    // 8. Lucro Líquido Real: 4.500
    expect(dre.lucroLiquido).toBe(4500);
    expect(dre.margemLiquida).toBe(45.0);

    // 9. Linha de tributos identificada com transparência sem alíquotas fictícias
    const linhaTributos = dre.linhas.find((l) => l.label.includes('Tributos sobre Vendas'));
    expect(linhaTributos).toBeDefined();
    expect(linhaTributos?.label).toContain('Pendente de apuração fiscal');
  });

  it('trata adequadamente quando a empresa opera com lucro negativo (prejuízo)', async () => {
    vi.mocked(CeoFinancialMetricsService.getRealNetProfit).mockResolvedValue({
      periodoFormatado: 'Agosto de 2026',
      mes: 8,
      ano: 2026,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      faturamentoBruto: 1000,
      deducoesVendas: 0,
      receitaLiquida: 1000,
      cmvReal: 800,
      cmvComprovado: 800,
      cmvEstimado: 0,
      coberturaCustosPercent: 100,
      produtosComCustoQtd: 5,
      produtosTotalQtd: 5,
      produtosVendidosSemCusto: [],
      faturamentoVendasSemCusto: 0,
      lucroBruto: 200,
      lucroBrutoComprovado: 200,
      margemBrutaPercent: 20.0,
      despesasOperacionais: 2500,
      despesasOperacionaisPagas: 2500,
      despesasOperacionaisPendentes: 0,
      despesasPorCategoria: [],
      despesasExcluidasDuplicidade: {
        comprasEstoqueExcluidas: 0,
        transferenciasInternas: 0,
        faturasCartaoDuplicadas: 0,
        retiradasSocios: 0,
      },
      resultadoOperacional: -2300,
      margemOperacionalPercent: -230.0,
      despesasFinanceiras: 50,
      tributosSobreResultado: 0,
      lucroLiquido: -2350,
      margemLiquidaPercent: -235.0,
      statusConfiabilidade: 'confirmado',
      motivoConfiabilidade: 'Prejuízo auditado',
      comparativoMesAnterior: {
        faturamentoMesAnterior: 0,
        despesasMesAnterior: 0,
        lucroLiquidoMesAnterior: 0,
        variacaoValor: 0,
        variacaoPercent: null,
        tendencia: 'estavel',
        mesAnteriorSemMovimentacao: true,
      },
      evolucaoMensal: [],
      fatoresExplicativos: [],
      lancamentos: [],
    });

    const { result } = renderHook(() => useDRE(8, 2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dre.ebitda).toBeLessThan(0);
    expect(result.current.dre.irpj).toBe(0);
    expect(result.current.dre.lucroLiquido).toBe(-2350);
  });
});
