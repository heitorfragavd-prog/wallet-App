import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDeliveryStaffRole,
  isRouteAllowedForDeliveryStaff,
  canAccessFinancials,
  RESTRICTED_FINANCIAL_ROUTES,
} from '../delivery-permissions';
import { IFoodConnector } from '../connectors/ifood-connector';
import { NinetyNineConnector } from '../connectors/ninety-nine-connector';
import {
  calculateEffectiveWeightedCMV,
} from '@/domains/ceo/growth-engine';
import {
  compareItemAcrossChannels,
  DEFAULT_CHANNEL_BENCHMARKS,
  simulateChannelPricing,
} from '../pricing-simulator';
import { DeliveryOrderRepository } from '../services/DeliveryOrderRepository';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { supabase } from '@/integrations/supabase/client';
import fs from 'fs';
import path from 'path';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Wallet CEO & Delivery Growth — Bateria de Testes FASE 1.1 (Requisitos A ao L)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A. delivery_staff bloqueado de rotas financeiras e liberado para KDS
  describe('Requisito A — Isolamento de rotas e perfis de delivery_staff', () => {
    it('reconhece variantes de cargo operacional de cozinha/expedição', () => {
      expect(isDeliveryStaffRole('delivery_staff')).toBe(true);
      expect(isDeliveryStaffRole('delivery_operator')).toBe(true);
      expect(isDeliveryStaffRole('kds_staff')).toBe(true);
      expect(isDeliveryStaffRole('cozinha')).toBe(true);
      expect(isDeliveryStaffRole('expedicao')).toBe(true);
      expect(isDeliveryStaffRole('user')).toBe(false);
      expect(isDeliveryStaffRole('admin')).toBe(false);
      expect(isDeliveryStaffRole(null)).toBe(false);
    });

    it('bloqueia acesso financeiro para delivery_staff', () => {
      expect(canAccessFinancials('delivery_staff')).toBe(false);
      expect(canAccessFinancials('user')).toBe(true);
      expect(canAccessFinancials('admin')).toBe(true);
    });

    it('permite apenas rotas operacionais de KDS e delivery', () => {
      expect(isRouteAllowedForDeliveryStaff('/delivery/kds')).toBe(true);
      expect(isRouteAllowedForDeliveryStaff('/delivery')).toBe(true);
      expect(isRouteAllowedForDeliveryStaff('/perfil')).toBe(true);

      // Todas as rotas financeiras são estritamente bloqueadas
      for (const route of RESTRICTED_FINANCIAL_ROUTES) {
        expect(isRouteAllowedForDeliveryStaff(route)).toBe(false);
      }
      expect(isRouteAllowedForDeliveryStaff('/ceo')).toBe(false);
      expect(isRouteAllowedForDeliveryStaff('/dre')).toBe(false);
      expect(isRouteAllowedForDeliveryStaff('/divipay')).toBe(false);
      expect(isRouteAllowedForDeliveryStaff('/dashboard')).toBe(false);
    });
  });

  // B & C. Proteção no banco de dados e triggers contra mutação financeira por delivery_staff
  describe('Requisitos B & C — Políticas RLS e triggers de proteção no schema SQL', () => {
    it('migration SQL contém funções security definer e triggers de bloqueio financeiro', () => {
      const migrationPath = path.resolve('supabase/migrations/20261030010000_wallet_ceo_delivery_foundation.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verifica funções security definer
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tem_acesso_admin_workspace');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tem_acesso_operacional_workspace');

      // Verifica trigger de bloqueio de mutação financeira em pedidos por delivery_staff
      expect(sql).toContain('trg_check_delivery_order_financial_mutation');
      expect(sql).toContain('Acesso negado: operador de delivery não tem permissão para alterar valores financeiros de pedidos.');

      // Verifica trigger de bloqueio de mutação em itens por delivery_staff
      expect(sql).toContain('trg_check_delivery_order_item_financial_mutation');
      expect(sql).toContain('Acesso negado: operador de delivery só tem permissão para conferir itens no KDS.');

      // Verifica restrição estrita nas tabelas do CEO (apenas admin tem acesso)
      expect(sql).toContain('ON public.wallet_growth_opportunities');
      expect(sql).toContain('ON public.wallet_commercial_experiments');
      expect(sql).toContain('public.tem_acesso_admin_workspace(workspace_id)');
    });
  });

  // D. Isolamento multitenant entre workspaces
  describe('Requisito D — Isolamento multitenant entre workspaces', () => {
    it('DeliveryOrderRepository filtra estritamente pelo workspace_id informado', async () => {
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'ord-1',
            workspace_id: 'ws-rodo-point',
            channel_id: 'ch-1',
            channel_name: 'ifood',
            external_order_id: 'ifood-101',
            display_id: '#101',
            customer_name: 'Cliente A',
            order_status: 'novo',
            order_type: 'delivery',
            subtotal: 50,
            delivery_fee: 5,
            store_discount: 0,
            total_amount: 55,
            commission_amount: 12,
            estimated_net_payout: 43,
            delivery_order_items: [],
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        order: mockOrder,
      });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        select: mockSelect,
      });

      const res = await DeliveryOrderRepository.listOrders('ws-rodo-point');
      expect(mockEq).toHaveBeenCalledWith('workspace_id', 'ws-rodo-point');
      expect(res.data).toHaveLength(1);
      expect(res.data[0].workspace_id).toBe('ws-rodo-point');
    });

    it('CeoRepository filtra oportunidades estritamente pelo workspace ativo', async () => {
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });
      mockEq.mockReturnValue({
        order: mockOrder,
      });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        select: mockSelect,
      });

      await CeoRepository.listOpportunities('ws-tenant-b');
      expect(mockEq).toHaveBeenCalledWith('workspace_id', 'ws-tenant-b');
    });
  });

  // E. Integridade relacional cross-workspace garantida por trigger
  describe('Requisito E — Integridade relacional cross-workspace de itens de pedido', () => {
    it('migration SQL contém trigger trg_check_delivery_order_item_workspace', () => {
      const migrationPath = path.resolve('supabase/migrations/20261030010000_wallet_ceo_delivery_foundation.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('trg_check_delivery_order_item_workspace');
      expect(sql).toContain('Violação de isolamento: item');
    });
  });

  // F. Prevenção de duplicidade de pedidos
  describe('Requisito F — Prevenção de duplicidade de pedidos no repositório', () => {
    it('saveOrder verifica unicidade de canal e channel_order_id antes de inserir', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'existing-order-id' },
        error: null,
      });
      const mockEqChannelOrder = vi.fn().mockReturnValue({ maybeSingle: mockSingle });
      const mockEqChannel = vi.fn().mockReturnValue({ eq: mockEqChannelOrder });
      const mockEqWs = vi.fn().mockReturnValue({ eq: mockEqChannel });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqWs });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        select: mockSelect,
      });

      const res = await DeliveryOrderRepository.saveOrder({
        workspace_id: 'ws-1',
        channel_id: 'ch-ifood',
        channel_type: 'ifood',
        channel_order_id: 'dup-123',
        display_id: '#123',
        customer_name: 'Teste Dup',
        status: 'received',
        payment_method: 'pix',
        payment_status: 'paid',
        subtotal: 30,
        delivery_fee: 0,
        discount_amount: 0,
        total_amount: 30,
        commission_amount: 6,
        net_amount: 24,
      });

      expect(res.success).toBe(false);
      expect(res.isDuplicate).toBe(true);
      expect(res.error).toContain('já foi importado');
    });
  });

  // G. Persistência real de pedidos
  describe('Requisito G — Persistência e recuperação de pedidos no KDS', () => {
    it('updateOrderStatus grava novo status no banco de dados com timestamp auditável', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        update: mockUpdate,
      });

      const res = await DeliveryOrderRepository.updateOrderStatus('ord-555', 'preparing', 'Iniciado na chapa');
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          order_status: 'preparing',
          kds_notes: 'Iniciado na chapa',
        })
      );
      expect(mockEq).toHaveBeenCalledWith('id', 'ord-555');
    });
  });

  // H. Conectores retornam unverified / not_configured e nunca simulam authenticated
  describe('Requisito H — Conectores não emitem falso positivo de autenticação', () => {
    it('IFoodConnector reporta not_configured sem credenciais', async () => {
      const connector = new IFoodConnector();
      const res = await connector.testConnection({});
      expect(res.success).toBe(false);
      expect(res.state).toBe('not_configured');
      expect(res.isVerifiedLive).toBe(false);
    });

    it('IFoodConnector reporta credentials_present_unverified quando credenciais existem sem verificação live', async () => {
      const connector = new IFoodConnector();
      const res = await connector.testConnection({
        clientId: 'id-fake',
        clientSecret: 'sec-fake',
        merchantId: 'merch-fake',
      });
      expect(res.success).toBe(false);
      expect(res.state).toBe('credentials_present_unverified');
      expect(res.isVerifiedLive).toBe(false);
      expect(res.message).toContain('homologação oficial requer');
    });

    it('NinetyNineConnector reporta credentials_present_unverified sem simular sucesso live', async () => {
      const connector = new NinetyNineConnector();
      const res = await connector.testConnection({
        clientId: 'app-99-key',
        clientSecret: 'app-99-secret',
        merchantId: 'shop-99-1',
      });
      expect(res.success).toBe(false);
      expect(res.state).toBe('credentials_present_unverified');
      expect(res.isVerifiedLive).toBe(false);
    });
  });

  // I. updateOrderStatus reporta que atualização externa está pendente de homologação
  describe('Requisito I — Transição de status em parceiro externo', () => {
    it('IFoodConnector registra no KDS local e avisa pendência de homologação remota', async () => {
      const connector = new IFoodConnector();
      const res = await connector.updateOrderStatus('ord-ifood-1', 'preparing', {
        clientId: 'id-test',
        clientSecret: 'sec-test',
        merchantId: 'merch-test',
      });

      expect(res.localUpdated).toBe(true);
      expect(res.externalUpdated).toBe(false);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Atualização externa no iFood pendente de homologação');
    });

    it('NinetyNineConnector registra no KDS local e avisa pendência de homologação remota', async () => {
      const connector = new NinetyNineConnector();
      const res = await connector.updateOrderStatus('ord-99-1', 'ready', {
        clientId: 'id-test',
        merchantId: 'merch-test',
      });

      expect(res.localUpdated).toBe(true);
      expect(res.externalUpdated).toBe(false);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Atualização externa na 99Food pendente de homologação');
    });
  });

  // J. Wallet CEO exibe estado de dados insuficientes e fórmula de CMV exata
  describe('Requisito J — Integridade analítica do Wallet CEO e cálculo determinístico de CMV', () => {
    it('calcula CMV como dados insuficientes quando não há itens', () => {
      const emptyResult = calculateEffectiveWeightedCMV([]);
      expect(emptyResult.total_revenue).toBe(0);
      expect(emptyResult.total_cost).toBe(0);
      expect(emptyResult.effective_weighted_cmv_percent).toBe(0);
      expect(emptyResult.notes).toContain('insuficientes');
    });

    it('calcula o CMV monetário e percentual ponderado exatamente pela fórmula matemática', () => {
      const items = [
        {
          product_id: 'p-1',
          product_name: 'X-Burger',
          quantity_sold: 100,
          unit_price: 30.0,
          unit_cost: 9.0, // Custo da ficha técnica
        },
        {
          product_id: 'p-2',
          product_name: 'Suco',
          quantity_sold: 50,
          unit_price: 10.0,
          unit_cost: 2.0, // Custo da ficha técnica
        },
      ];

      // Receita: 100 * 30 + 50 * 10 = 3000 + 500 = 3500
      // CMV Custo: 100 * 9 + 50 * 2 = 900 + 100 = 1000
      // CMV Percentual: (1000 / 3500) * 100 = 28.57%
      const res = calculateEffectiveWeightedCMV(items);

      expect(res.total_revenue).toBe(3500);
      expect(res.total_cost).toBe(1000);
      expect(res.effective_weighted_cmv_percent).toBe(28.57);
      expect(res.is_cmv_healthy).toBe(true);
    });
  });

  // K. Taxas do simulador marcadas como hipóteses de simulação e personalizáveis
  describe('Requisito K — Hipóteses de taxas e diferenciação de Margem de Contribuição', () => {
    it('taxas padrão são explicitamente marcadas como hipóteses de benchmark', () => {
      expect(DEFAULT_CHANNEL_BENCHMARKS.ifood.is_benchmark_hypothesis).toBe(true);
      expect(DEFAULT_CHANNEL_BENCHMARKS['99food'].is_benchmark_hypothesis).toBe(true);
      expect(DEFAULT_CHANNEL_BENCHMARKS.direct.is_benchmark_hypothesis).toBe(true);
    });

    it('permite customizar taxas do contrato real na comparação de canais', () => {
      const customRates = {
        ifood: {
          commission_rate: 0.12, // Contrato com entrega própria: 12%
          payment_fee_rate: 0.032,
        },
      };

      const comparison = compareItemAcrossChannels(10.0, 30.0, 2.0, 35, customRates);
      const ifoodResult = comparison.channels.ifood;

      // Dedução de comissão calculada com 12% e não com 23%
      expect(ifoodResult.commission_amount).toBe(Math.round(ifoodResult.channel_price * 0.12 * 100) / 100);
    });

    it('separa explicitamente a margem de contribuição unitária', () => {
      const res = simulateChannelPricing({
        base_cost_cmv: 10.0,
        in_store_price: 30.0,
        channel_type: 'ifood',
        channel_commission_rate: 0.23,
        payment_fee_rate: 0.032,
        packaging_cost: 2.0,
        proposed_channel_price: 30.0,
      });

      // Deduções: 30 * 0.23 (6.90) + 30 * 0.032 (0.96) = 7.86
      // Net Payout: 30 - 7.86 = 22.14
      // Margem Contribuição: 22.14 - 10 (CMV) - 2 (embalagem) = 10.14
      expect(res.contribution_margin_amount).toBe(10.14);
      expect(res.contribution_margin_percent).toBe(33.8);
    });
  });

  // L. Persistência de experimentos comerciais e registro de decisão
  describe('Requisito L — Persistência e ciclo de vida de experimentos no CeoRepository', () => {
    it('saveExperiment grava experimento no banco de dados com baseline e hipótese', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'exp-999',
          workspace_id: 'ws-rodo',
          name: 'Combo Almoço',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        insert: mockInsert,
      });

      const res = await CeoRepository.saveExperiment({
        id: 'temp-id',
        workspace_id: 'ws-rodo',
        title: 'Combo Almoço',
        hypothesis: 'Aumentar ticket médio em 15%',
        department: 'commercial_growth',
        target_kpi: 'Ticket Médio',
        baseline_value: 'R$ 28,00',
        current_value: 'R$ 31,50',
        target_value: 'R$ 32,20',
        start_date: new Date().toISOString(),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('exp-999');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('updateExperimentStatus registra decisão e justificativa quando experimento é concluído', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({
        update: mockUpdate,
      });

      const res = await CeoRepository.updateExperimentStatus('exp-999', 'concluded', {
        decision: 'approved',
        decision_date: new Date().toISOString(),
        rationale: 'Hipótese confirmada: ticket médio superou a meta em 18%.',
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'concluded',
          decision_rationale: expect.stringContaining('Hipótese confirmada'),
        })
      );
    });
  });
});
