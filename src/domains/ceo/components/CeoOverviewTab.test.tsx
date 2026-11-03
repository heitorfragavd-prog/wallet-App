import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CeoOverviewTab } from './CeoOverviewTab';
import { CeoExecutiveKpis } from '../services/CeoFinancialMetricsService';

vi.mock('@/domains/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
  }),
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/domains/ia/hooks/useWalletIA', () => ({
  useWalletIA: () => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    clearChat: vi.fn(),
    loadHistory: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        ...chainable,
        insert: vi.fn().mockReturnValue(chainable),
        update: vi.fn().mockReturnValue(chainable),
      })),
    },
  };
});

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

const mockEmptyKpis: CeoExecutiveKpis = {
  faturamentoMes: 0,
  crescimentoMesPercent: null,
  faturamentoHoje: 0,
  crescimentoHojePercent: null,
  faturamentoOntem: 0,
  ticketMedioMes: null,
  crescimentoTicketMedioPercent: null,
  pedidosMes: 0,
  crescimentoPedidosPercent: null,
  despesasMes: 0,
  resultadoOperacional: 0,
  margemOperacionalPercent: null,
  pontoEquilibrioMensal: 0,
  distanciaPontoEquilibrioPercent: 0,
  projecaoFaturamentoFimMes: 0,
  metaFaturamentoMensal: null,
  atingimentoMetaPercent: null,
  mediaVendasDiaSemana: [],
  tendenciaFaturamento: 'estavel',
  dadosIndisponiveis: false,
  erroMensagem: null,
  timestampCalculo: new Date().toISOString(),
  periodoRotulo: '01/11 a 02/11/2026',
  periodoAnteriorRotulo: '01/10 a 02/10/2026',
};

const mockFinancialKpis: CeoExecutiveKpis = {
  faturamentoMes: 125000.5,
  crescimentoMesPercent: 12.5,
  faturamentoHoje: 4200.0,
  crescimentoHojePercent: 5.0,
  faturamentoOntem: 4000.0,
  ticketMedioMes: 45.2,
  crescimentoTicketMedioPercent: 3.1,
  pedidosMes: 2765,
  crescimentoPedidosPercent: 8.4,
  despesasMes: 85000.0,
  resultadoOperacional: 40000.5,
  margemOperacionalPercent: 32.0,
  pontoEquilibrioMensal: 70000.0,
  distanciaPontoEquilibrioPercent: 78.5,
  projecaoFaturamentoFimMes: 160000.0,
  metaFaturamentoMensal: 150000.0,
  atingimentoMetaPercent: 83.3,
  mediaVendasDiaSemana: [],
  tendenciaFaturamento: 'alta',
  dadosIndisponiveis: false,
  erroMensagem: null,
  timestampCalculo: new Date().toISOString(),
  periodoRotulo: '01/11 a 02/11/2026',
  periodoAnteriorRotulo: '01/10 a 02/10/2026',
};

describe('CeoOverviewTab — Renderização Real e Tolerância a Falhas', () => {
  it('deve reproduzir a falha ou renderizar com KPIs vazios sem estourar ErrorBoundary', () => {
    const onNavigateToPlan = vi.fn();
    render(
      <CeoOverviewTab
        workspaceId="test-workspace-id"
        kpis={mockEmptyKpis}
        onNavigateToPlan={onNavigateToPlan}
      />
    );

    expect(screen.getByText('Briefing Executivo Quantitativo')).toBeInTheDocument();
  });

  it('deve renderizar com dados financeiros reais e exibir as seções quantitativas do briefing', () => {
    const onNavigateToPlan = vi.fn();
    render(
      <CeoOverviewTab
        workspaceId="test-workspace-id"
        kpis={mockFinancialKpis}
        onNavigateToPlan={onNavigateToPlan}
      />
    );

    expect(screen.getByText('Briefing Executivo Quantitativo')).toBeInTheDocument();
    expect(screen.getByText(/Faturamento e Receita/i)).toBeInTheDocument();
  });
});
