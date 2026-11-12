import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CeoOpportunitiesTab } from '@/domains/ceo/components/CeoOpportunitiesTab';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment, GrowthOpportunity } from '@/domains/ceo/types';

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('ETAPA 08 — PR A: Ciclo de Vida dos Experimentos Comerciais e Correção do Baseline', () => {
  const mockWorkspaceId = 'ws-rodo-point-test';

  const mockOpportunities: GrowthOpportunity[] = [
    {
      id: 'opp-combo-1',
      workspace_id: mockWorkspaceId,
      department: 'commercial_growth',
      title: 'Combo Expresso & Salgado Rodo Point',
      problem_description: 'Venda desarticulada de café e salgados matinais.',
      hypothesis: 'Oferecer combo café + salgado eleva o ticket médio.',
      recommended_action: 'Criar combo experimental no PDV com preço promocional.',
      estimated_financial_impact: null, // Sem custos cadastrados, não inventar número!
      confidence_score: 0.75,
      status: 'identificada',
      nature: 'hipotese_comercial',
      evidence_data: {
        source: 'eyemobile_items',
        has_sufficient_data: true,
      },
    },
  ];

  const mockExperiments: CommercialExperiment[] = [
    {
      id: 'exp-planejado-1',
      workspace_id: mockWorkspaceId,
      title: 'Teste Combo Café da Manhã',
      hypothesis: 'Aumentar pedidos com combos matinais',
      department: 'commercial_growth',
      target_kpi: 'Faturamento Incremental',
      baseline_value: 'R$ 22,00 ticket médio',
      current_value: 'Aguardando início',
      target_value: 'R$ 28,00',
      start_date: '2026-11-12',
      status: 'planejado',
      created_at: '2026-11-12T10:00:00Z',
      updated_at: '2026-11-12T10:00:00Z',
    },
    {
      id: 'exp-aprovado-1',
      workspace_id: mockWorkspaceId,
      title: 'Expansão Bebidas Geladas Almoço',
      hypothesis: 'Venda sugestiva eleva bebidas',
      department: 'commercial_growth',
      target_kpi: 'Taxa de conversão de bebidas',
      baseline_value: '18% dos pedidos',
      current_value: 'Aguardando início',
      target_value: '26% dos pedidos',
      start_date: '2026-11-12',
      status: 'aprovado',
      decision: 'aprovado',
      created_at: '2026-11-12T10:00:00Z',
      updated_at: '2026-11-12T10:00:00Z',
    },
    {
      id: 'exp-ativo-1',
      workspace_id: mockWorkspaceId,
      title: 'Sobremesa de Almoço Casada',
      hypothesis: 'Oferecer mini pudim com prato executivo',
      department: 'commercial_growth',
      target_kpi: 'Faturamento de sobremesas',
      baseline_value: 'R$ 150,00/dia',
      current_value: 'R$ 280,00/dia (+86%)',
      target_value: 'R$ 300,00/dia',
      start_date: '2026-11-01',
      status: 'em_andamento',
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-08T10:00:00Z',
    },
    {
      id: 'exp-concluido-1',
      workspace_id: mockWorkspaceId,
      title: 'Desconto de Happy Hour Rodo Point',
      hypothesis: 'Preço promocional pós-18h atrai motoristas',
      department: 'commercial_growth',
      target_kpi: 'Faturamento noturno',
      baseline_value: 'R$ 500,00/noite',
      current_value: 'R$ 820,00/noite',
      target_value: 'R$ 750,00/noite',
      start_date: '2026-10-15',
      end_date: '2026-11-05',
      status: 'concluido',
      decision: 'ampliar',
      decision_rationale: 'Resultado consistente e validado pela gestão.',
      measured_financial_impact: 4800.0,
      created_at: '2026-10-15T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Navegação e Contadores das 4 Sub-Abas', () => {
    it('renderiza as quatro abas com seus respectivos contadores corretos', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      expect(screen.getByRole('button', { name: /Oportunidades/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Experimentos/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Em Execução/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Concluídas/i })).toBeInTheDocument();

      // Experimentos planejados / aprovados = 2
      // Oportunidades = 1, Ativos = 1, Concluídos = 1
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('2. Criação do Experimento sem Baseline Arbitrário (Gate 0 & Gate 2)', () => {
    it('cria experimento com status "planejado" e baseline não hardcoded em 0', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });

      const saveSpy = vi.spyOn(CeoRepository, 'saveExperiment').mockResolvedValue({
        success: true,
        data: {
          id: 'exp-created-1',
          workspace_id: mockWorkspaceId,
          title: 'Combo Expresso & Salgado Rodo Point',
          hypothesis: 'Oferecer combo café + salgado eleva o ticket médio.',
          status: 'planejado',
          decision: 'pendente',
          created_at: '2026-11-12T10:00:00Z',
          updated_at: '2026-11-12T10:00:00Z',
          start_date: '2026-11-12',
        },
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      // Clica em "Ver Plano" na oportunidade
      const verPlanoBtn = await screen.findByRole('button', { name: /ver plano/i });
      fireEvent.click(verPlanoBtn);

      // Modal abre exibindo a ação e hipótese
      expect(screen.getByText(/Plano de Ação: Combo Expresso & Salgado/i)).toBeInTheDocument();

      // Clica em "Planejar Experimento"
      const planejarBtn = screen.getByRole('button', { name: /planejar experimento/i });
      fireEvent.click(planejarBtn);

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledTimes(1);
      });

      const savedPayload = saveSpy.mock.calls[0][0];
      expect(savedPayload.status).toBe('planejado');
      // Crucial: NUNCA inventar '0' como baseline
      expect(savedPayload.baseline_value).toBeUndefined();
      expect(savedPayload.title).toBe('Combo Expresso & Salgado Rodo Point');
    });
  });

  describe('3. Transição de Ciclo de Vida: Aprovação e Início da Execução', () => {
    it('permite aprovar um experimento planejado', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });
      const updateStatusSpy = vi.spyOn(CeoRepository, 'updateExperimentStatus').mockResolvedValue({
        success: true,
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      // Alterna para sub-aba "Experimentos"
      const expTabBtn = screen.getByRole('button', { name: /Experimentos/i });
      fireEvent.click(expTabBtn);

      // Localiza o card do experimento planejado
      expect(screen.getByText('Teste Combo Café da Manhã')).toBeInTheDocument();
      expect(screen.getByText('Planejado')).toBeInTheDocument();

      const aprovarBtn = screen.getByRole('button', { name: /aprovar/i });
      fireEvent.click(aprovarBtn);

      await waitFor(() => {
        expect(updateStatusSpy).toHaveBeenCalledWith(
          'exp-planejado-1',
          'aprovado',
          expect.objectContaining({ decision: 'aprovado' })
        );
      });
    });

    it('abre modal para iniciar execução e permite informar o baseline inicial', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });
      const updateSpy = vi.spyOn(CeoRepository, 'updateExperiment').mockResolvedValue({
        success: true,
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      // Alterna para sub-aba "Experimentos"
      const expTabBtn = screen.getByRole('button', { name: /Experimentos/i });
      fireEvent.click(expTabBtn);

      // Clica em "Iniciar Execução" no experimento aprovado
      const iniciarBtns = screen.getAllByRole('button', { name: /iniciar execução/i });
      fireEvent.click(iniciarBtns[1]); // exp-aprovado-1

      // Modal de confirmação de início deve abrir
      expect(screen.getByText('Iniciar Execução do Experimento')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /confirmar início/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          'exp-aprovado-1',
          expect.objectContaining({
            status: 'em_andamento',
            baseline_value: '18% dos pedidos',
          })
        );
      });
    });
  });

  describe('4. Conclusão e Avaliação Executiva', () => {
    it('permite concluir um experimento em andamento com decisão estratégica e impacto financeiro', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });
      const updateSpy = vi.spyOn(CeoRepository, 'updateExperiment').mockResolvedValue({
        success: true,
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      // Alterna para sub-aba "Em Execução"
      const emExecucaoTabBtn = screen.getByRole('button', { name: /Em Execução/i });
      fireEvent.click(emExecucaoTabBtn);

      expect(screen.getByText('Sobremesa de Almoço Casada')).toBeInTheDocument();
      expect(screen.getByText('Em Andamento')).toBeInTheDocument();

      const concluirBtn = screen.getByRole('button', { name: /concluir \/ avaliar/i });
      fireEvent.click(concluirBtn);

      expect(screen.getByText('Concluir e Avaliar Experimento')).toBeInTheDocument();

      const salvarConclusaoBtn = screen.getByRole('button', { name: /salvar conclusão/i });
      fireEvent.click(salvarConclusaoBtn);

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          'exp-ativo-1',
          expect.objectContaining({
            status: 'concluido',
            decision: 'manter',
          })
        );
      });
    });

    it('exibe corretamente experimentos concluídos com impacto financeiro e justificativa', async () => {
      vi.spyOn(CeoRepository, 'listOpportunities').mockResolvedValue({
        data: mockOpportunities,
        isConfigured: true,
      });

      await act(async () => {
        render(
          <CeoOpportunitiesTab
            workspaceId={mockWorkspaceId}
            experiments={mockExperiments}
          />
        );
      });

      // Alterna para sub-aba "Concluídas"
      const concluidasTabBtn = screen.getByRole('button', { name: /Concluídas/i });
      fireEvent.click(concluidasTabBtn);

      expect(screen.getByText('Desconto de Happy Hour Rodo Point')).toBeInTheDocument();
      expect(screen.getByText('Decisão: ampliar')).toBeInTheDocument();
      expect(screen.getByText(/Resultado consistente e validado/i)).toBeInTheDocument();
      expect(screen.getByText('R$ 4.800,00')).toBeInTheDocument();
    });
  });
});
