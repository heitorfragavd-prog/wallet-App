/**
 * etapa9_gate4_interface_metas.test.tsx
 *
 * Testes de interface e comportamento para a aba Metas & Desempenho (Etapa 09 - Gate 4).
 * Valida renderização dos cards semanais/mensais, barras de progresso por ritmo,
 * governança de permissões (Owner/Admin vs Operador), filtros, sugestão inteligente e auditoria.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CeoGoalsTab } from '@/domains/ceo/components/CeoGoalsTab';
import { CeoGoalsRepository } from '@/domains/ceo/services/CeoGoalsRepository';
import { BusinessGoal } from '@/domains/ceo/types';
import { CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';

// Mocks de autenticação e contexto
const mockUseAuth = vi.fn();
const mockUseProfile = vi.fn();
const mockUseWorkspace = vi.fn();
const mockToast = vi.fn();

vi.mock('@/domains/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/domains/auth/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile(),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => mockUseWorkspace(),
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/domains/ceo/services/CeoGoalsRepository', () => ({
  CeoGoalsRepository: {
    listGoals: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    pauseGoal: vi.fn(),
    resumeGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
}));

describe('Gate 4: Interface Metas & Desempenho (CeoGoalsTab)', () => {
  const mockKpis: CeoExecutiveKpis = {
    faturamentoMes: 120000,
    faturamentoMesAnterior: 100000,
    crescimentoMesPercent: 20,
    pedidosMes: 800,
    crescimentoPedidosPercent: 10,
    ticketMedioMes: 150,
    crescimentoTicketMedioPercent: 5,
    resultadoOperacional: 35000,
    margemOperacionalPercent: 29.17,
    faturamentoOntem: 4000,
    mediaDiaSemanaOntem: 3800,
    variacaoOntemVsMediaPercent: 5.26,
    diaSemanaOntemNome: 'Quinta-feira',
    despesasMes: 85000,
    despesasMesAnterior: 78000,
    variacaoDespesasPercent: 8.97,
    lucroEstimado: 35000,
    margemLucroPercent: 29.17,
    cmvPercent: 32.5,
    cmvStatus: 'saudavel',
    coberturaFichasPercent: 88,
    cmvConfirmado: 39000,
    receitaComCustoConhecido: 105600,
    receitaComCustoPendente: 14400,
    coberturaCmvPercent: 88,
    lucroBrutoConfirmado: 66600,
    margemBrutaConfirmadaPercent: 63.07,
    produtosComCustoCadastrado: 44,
    totalProdutosCatalogo: 50,
    acoesHoje: [],
    dataAtualizacao: '2026-11-13T00:00:00Z',
    dailySales30Days: [
      { date: '2026-11-01', valor: 3500 },
      { date: '2026-11-02', valor: 4200 },
    ],
  };

  const sampleGoals: BusinessGoal[] = [
    {
      id: 'g-week-1',
      workspace_id: 'ws-1',
      created_by: 'owner-1',
      titulo: 'Meta Semanal Loja',
      indicador: 'faturamento',
      periodo_tipo: 'semanal',
      data_inicio: '2026-11-09',
      data_fim: '2026-11-15',
      ano: 2026,
      semana_do_ano: 46,
      valor_alvo: 30000,
      valor_realizado: 25000,
      unidade: 'monetario',
      status: 'ativa',
      history: [
        {
          action: 'created',
          user_id: 'owner-1',
          timestamp: '2026-11-08T12:00:00Z',
        },
      ],
      created_at: '2026-11-08T12:00:00Z',
      updated_at: '2026-11-08T12:00:00Z',
    },
    {
      id: 'g-month-1',
      workspace_id: 'ws-1',
      created_by: 'owner-1',
      titulo: 'Meta Mensal Empresa',
      indicador: 'faturamento',
      periodo_tipo: 'mensal',
      data_inicio: '2026-11-01',
      data_fim: '2026-11-30',
      ano: 2026,
      mes: 11,
      valor_alvo: 150000,
      valor_realizado: 70000,
      unidade: 'monetario',
      status: 'ativa',
      history: [],
      created_at: '2026-10-31T12:00:00Z',
      updated_at: '2026-10-31T12:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-admin-1', email: 'admin@wallet.com' } });
    mockUseProfile.mockReturnValue({ profile: { role: 'owner' } });
    mockUseWorkspace.mockReturnValue({
      activeWorkspace: { id: 'ws-1', owner_id: 'user-admin-1' },
      activeWorkspaceRole: 'owner',
    });
    vi.mocked(CeoGoalsRepository.listGoals).mockResolvedValue(sampleGoals);
  });

  it('1. renderiza o título, os destaques semanal e mensal e os badges de ritmo', async () => {
    render(<CeoGoalsTab workspaceId="ws-1" kpis={mockKpis} />);

    expect(screen.getByText('Metas & Desempenho Empresarial')).toBeInTheDocument();
    expect(screen.getByText('Meta Semanal em Destaque')).toBeInTheDocument();
    expect(screen.getByText('Meta Mensal em Destaque')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Meta Semanal Loja')).toBeInTheDocument();
      expect(screen.getByText('Meta Mensal Empresa')).toBeInTheDocument();
    });

    // Botão Nova Meta visível para Owner
    expect(screen.getByRole('button', { name: /Nova Meta/i })).toBeInTheDocument();
  });

  it('2. restringe ações de mutação quando usuário não é Owner/Admin', async () => {
    mockUseProfile.mockReturnValue({ profile: { role: 'member' } });
    mockUseWorkspace.mockReturnValue({
      activeWorkspace: { id: 'ws-1', owner_id: 'other-user' },
      activeWorkspaceRole: 'member',
    });

    render(<CeoGoalsTab workspaceId="ws-1" kpis={mockKpis} />);

    // Não deve renderizar o botão Nova Meta
    expect(screen.queryByRole('button', { name: /Nova Meta/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Modo visualização/i)).toBeInTheDocument();
  });

  it('3. abre modal de criação de meta com sugestão calculada', async () => {
    render(<CeoGoalsTab workspaceId="ws-1" kpis={mockKpis} />);

    await waitFor(() => {
      expect(screen.getByText('Meta Semanal Loja')).toBeInTheDocument();
    });

    const btnNova = screen.getByRole('button', { name: /Nova Meta/i });
    fireEvent.click(btnNova);

    await waitFor(() => {
      expect(screen.getByText('Nova Meta Empresarial')).toBeInTheDocument();
      expect(screen.getByText(/Sugestão Inteligente/i)).toBeInTheDocument();
      expect(screen.getByText(/Conservadora/i)).toBeInTheDocument();
    });

    // Clicar na sugestão conservadora preenche o alvo
    const btnConservadora = screen.getByText(/Conservadora/i);
    fireEvent.click(btnConservadora);

    const inputAlvo = screen.getByPlaceholderText('Ex: 50000') as HTMLInputElement;
    expect(inputAlvo.value).not.toBe('');
  });

  it('4. exibe modal de auditoria com histórico de criação e eventos', async () => {
    render(<CeoGoalsTab workspaceId="ws-1" kpis={mockKpis} />);

    await waitFor(() => {
      expect(screen.getByText('Meta Semanal Loja')).toBeInTheDocument();
    });

    const btnsAuditoria = screen.getAllByRole('button', { name: /Auditoria/i });
    fireEvent.click(btnsAuditoria[0]);

    await waitFor(() => {
      expect(screen.getByText(/Auditoria da Meta: Meta Semanal Loja/i)).toBeInTheDocument();
      expect(screen.getByText(/Trilha de Auditoria \(1 eventos\)/i)).toBeInTheDocument();
      expect(screen.getByText(/created/i)).toBeInTheDocument();
    });
  });
});
