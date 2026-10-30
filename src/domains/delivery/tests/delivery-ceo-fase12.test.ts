import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRouteAllowedForDeliveryStaff,
  canAccessFinancials,
  RESTRICTED_FINANCIAL_ROUTES,
  ALLOWED_DELIVERY_STAFF_ROUTES,
} from '../delivery-permissions';
import { calculateEffectiveWeightedCMV } from '@/domains/ceo/growth-engine';
import { DeliveryOrderRepository } from '../services/DeliveryOrderRepository';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { supabase } from '@/integrations/supabase/client';
import fs from 'fs';
import path from 'path';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('Wallet CEO & Delivery Growth — Bateria de Testes FASE 1.2 (Gates A ao I)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // GATE A & H: Proteção Contra Vazamento Financeiro e Views Operacionais no Schema
  // ============================================================================
  describe('Gate A — Schema SQL e Políticas RLS de Isolamento Financeiro', () => {
    it('migration SQL restringe tabelas base a administradores e expõe views operacionais security barrier', () => {
      const migrationPath = path.resolve('supabase/migrations/20261030010000_wallet_ceo_delivery_foundation.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Tabelas base com SELECT restrito a admin
      expect(sql).toContain('CREATE POLICY "delivery_channels_select_admin"');
      expect(sql).toContain('CREATE POLICY "delivery_catalog_items_select_admin"');
      expect(sql).toContain('CREATE POLICY "delivery_orders_select_admin"');
      expect(sql).toContain('CREATE POLICY "delivery_order_items_select_admin"');

      // 2. Views operacionais com security barrier
      expect(sql).toContain('CREATE VIEW public.v_delivery_orders_operacional');
      expect(sql).toContain('CREATE VIEW public.v_delivery_order_items_operacional');
      expect(sql).toContain('CREATE VIEW public.v_delivery_channels_operacional');
      expect(sql).toContain('CREATE VIEW public.v_delivery_catalog_operacional');
      expect(sql).toContain('WITH (security_barrier = true)');

      // 3. RPCs atômicas e de conferência
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_criar_delivery_order_atomico');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_conferir_item_delivery');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_atualizar_status_delivery_order');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_listar_pedidos_kds');

      // 4. Trigger de bloqueio de despacho para pedidos com itens pendentes
      expect(sql).toContain('CREATE TRIGGER trg_check_delivery_order_dispatch_checklist');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.check_delivery_order_dispatch_checklist');
    });

    it('rollback SQL remove todas as views, RPCs e triggers operacionais', () => {
      const rollbackPath = path.resolve('supabase/migrations/rollback/20261030010000_wallet_ceo_delivery_foundation.down.sql');
      expect(fs.existsSync(rollbackPath)).toBe(true);
      const sql = fs.readFileSync(rollbackPath, 'utf8');

      expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_despachar_pedido_kds');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_atualizar_status_delivery_order');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_conferir_item_delivery');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_criar_delivery_order_atomico');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_listar_pedidos_kds');
      expect(sql).toContain('DROP VIEW IF EXISTS public.v_delivery_orders_operacional');
      expect(sql).toContain('DROP TRIGGER IF EXISTS trg_check_delivery_order_dispatch_checklist');
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.check_delivery_order_dispatch_checklist');
    });
  });

  // ============================================================================
  // GATE B: Isolamento Estrito do Portal do Funcionário e Rotas
  // ============================================================================
  describe('Gate B — Isolamento de Rotas Operacionais vs Administrativas', () => {
    it('/delivery está fora das rotas permitidas para delivery_staff e dentro das restritas', () => {
      expect(ALLOWED_DELIVERY_STAFF_ROUTES).not.toContain('/delivery');
      expect(ALLOWED_DELIVERY_STAFF_ROUTES).toContain('/delivery/kds');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/delivery');

      expect(isRouteAllowedForDeliveryStaff('/delivery')).toBe(false);
      expect(isRouteAllowedForDeliveryStaff('/delivery/kds')).toBe(true);
      expect(isRouteAllowedForDeliveryStaff('/delivery/config')).toBe(false);
    });

    it('canAccessFinancials bloqueia delivery_staff e libera admin', () => {
      expect(canAccessFinancials('delivery_staff')).toBe(false);
      expect(canAccessFinancials('admin')).toBe(true);
      expect(canAccessFinancials('user')).toBe(true);
    });
  });

  // ============================================================================
  // GATE D & E: Bloqueio de Despacho com Itens Não-Conferidos e RPCs Atômicas
  // ============================================================================
  describe('Gates D & E — Conferência de Itens e Bloqueio de Despacho', () => {
    it('updateOrderStatus propaga erro de Bloqueio de Expedição para o chamador reverter UI', async () => {
      const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: 'P0001',
          message: 'Bloqueio de Expedição: pedido possui 2 item(ns) pendente(s) de conferência.',
        },
      });

      const res = await DeliveryOrderRepository.updateOrderStatus('ord-blocked-1', 'dispatched');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Bloqueio de Expedição');
      expect(mockRpc).toHaveBeenCalledWith('rpc_atualizar_status_delivery_order', expect.objectContaining({
        p_order_id: 'ord-blocked-1',
        p_novo_status: 'dispatched',
      }));
    });

    it('updateItemVerification chama rpc_conferir_item_delivery registrando conferência', async () => {
      const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
      mockRpc.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      const res = await DeliveryOrderRepository.updateItemVerification('item-uuid-1', true);
      expect(res.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('rpc_conferir_item_delivery', {
        p_item_id: 'item-uuid-1',
        p_is_verified: true,
      });
    });

    it('listOrders com { isStaff: true } consulta DIRETAMENTE v_delivery_orders_operacional sem consultar delivery_orders', async () => {
      const mockOpSelect = vi.fn();
      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

      const mockOpEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'ord-staff-direct',
              workspace_id: 'ws-rodo-point',
              channel_name: 'direto',
              display_id: '#KDS-01',
              customer_name: 'Cliente Balcão',
              order_status: 'preparing',
            },
          ],
          error: null,
        }),
      });
      mockOpSelect.mockReturnValue({ eq: mockOpEq });

      const mockItemsSelect = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            { id: 'it-staff-1', order_id: 'ord-staff-direct', product_name: 'Pastel de Carne', quantity: 2, is_verified_in_kds: false },
          ],
          error: null,
        }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'v_delivery_orders_operacional') return { select: mockOpSelect };
        if (table === 'v_delivery_order_items_operacional') return { select: mockItemsSelect };
        if (table === 'delivery_orders') {
          throw new Error('VIOLAÇÃO: delivery_orders não deve ser consultada por funcionários operacionais!');
        }
        return { select: vi.fn() };
      });

      const res = await DeliveryOrderRepository.listOrders('ws-rodo-point', { isStaff: true });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('ord-staff-direct');
      expect(res.data[0].subtotal).toBe(0);
      expect(res.data[0].commission_amount).toBe(0);
      expect(res.data[0].net_amount).toBe(0);
      expect(res.data[0].items?.[0].unit_price).toBe(0);
      expect(res.data[0].items?.[0].total_price).toBe(0);
      expect(res.data[0].items?.[0].checked).toBe(false);
    });

    it('listOrders faz fallback automático para v_delivery_orders_operacional se receber 42501 (RLS restriction)', async () => {
      const mockSelect = vi.fn();
      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

      // Primeira chamada para delivery_orders retorna 42501
      const mockEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42501', message: 'permission denied for table delivery_orders' },
        }),
      });
      mockSelect.mockReturnValue({ eq: mockEq });

      // Segunda chamada para v_delivery_orders_operacional retorna dados operacionais
      const mockOpSelect = vi.fn();
      const mockOpEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'ord-op-1',
              workspace_id: 'ws-test',
              channel_name: 'ifood',
              display_id: '#OP-1',
              customer_name: 'Cliente KDS',
              order_status: 'preparing',
            },
          ],
          error: null,
        }),
      });
      mockOpSelect.mockReturnValue({ eq: mockOpEq });

      // Terceira chamada para v_delivery_order_items_operacional
      const mockItemsSelect = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            { id: 'it-op-1', order_id: 'ord-op-1', product_name: 'Item KDS', quantity: 1, is_verified_in_kds: true },
          ],
          error: null,
        }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'delivery_orders') return { select: mockSelect };
        if (table === 'v_delivery_orders_operacional') return { select: mockOpSelect };
        if (table === 'v_delivery_order_items_operacional') return { select: mockItemsSelect };
        return { select: vi.fn() };
      });

      const res = await DeliveryOrderRepository.listOrders('ws-test');
      expect(res.data).toHaveLength(1);
      expect(res.data[0].display_id).toBe('#OP-1');
      expect(res.data[0].subtotal).toBe(0); // Zero vazamento financeiro
      expect(res.data[0].items?.[0].unit_price).toBe(0); // Zero vazamento de preço
      expect(res.data[0].items?.[0].checked).toBe(true);
    });

    it('createOrder falha atomicamente e NUNCA executa inserção sequencial se a RPC atômica falhar', async () => {
      const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

      // Simula erro na execução da RPC (ex: falha ao gravar itens em transação)
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { code: '23503', message: 'Foreign key violation em item' },
      });

      const mockInsert = vi.fn();
      mockFrom.mockReturnValue({ insert: mockInsert });

      const res = await DeliveryOrderRepository.createOrder({
        id: 'ord-atomic-fail',
        workspace_id: 'ws-atomic-test',
        channel_id: 'ifood-test',
        channel_order_id: 'ext-fail-99',
        display_id: '#FAIL-99',
        customer_name: 'Cliente Falha Atômica',
        subtotal: 50.0,
        discount: 0,
        delivery_fee: 5.0,
        commission_amount: 10.0,
        net_amount: 45.0,
        status: 'received',
        payment_method: 'marketplace_online',
        payment_status: 'paid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          {
            id: 'it-fail-1',
            order_id: 'ord-atomic-fail',
            name: 'Item Inválido',
            quantity: 1,
            unit_price: 50.0,
            total_price: 50.0,
          },
        ],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Foreign key violation');
      // Confirma que NENHUM cabeçalho foi inserido separadamente via insert() direto
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('createOrder preserva idempotência retornando erro explícito quando o pedido já foi importado', async () => {
      const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
      mockRpc.mockResolvedValueOnce({
        data: { success: true, is_duplicate: true, message: 'Pedido já importado neste canal.' },
        error: null,
      });

      const res = await DeliveryOrderRepository.createOrder({
        id: 'ord-dup-1',
        workspace_id: 'ws-rodo',
        channel_id: 'ifood-dup',
        channel_order_id: 'ext-dup-100',
        display_id: '#DUP-100',
        customer_name: 'Cliente Duplicado',
        subtotal: 30,
        discount: 0,
        delivery_fee: 0,
        commission_amount: 0,
        net_amount: 30,
        status: 'received',
        payment_method: 'marketplace_online',
        payment_status: 'paid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Pedido já importado');
    });
  });

  // ============================================================================
  // GATE F: Consistência de Experimentos do CEO
  // ============================================================================
  describe('Gate F — Persistência e Consistência de Experimentos do CEO', () => {
    it('createExperiment persiste no banco e retorna ID canônico gerado pelo Supabase', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'real-uuid-from-db-1234',
          workspace_id: 'ws-ceo',
          name: 'Experimento Combo',
          hypothesis: 'Aumentar ticket médio',
          department: 'commercial_growth',
          target_kpi: 'Margem',
          baseline_value: '0',
          current_value: '0',
          target_value: '10',
          start_date: '2026-10-30',
          status: 'planejado',
          decision: 'pendente',
          decision_rationale: 'Validar hipótese com público matutino',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      });

      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
      mockFrom.mockReturnValue({ insert: mockInsert });

      const res = await CeoRepository.saveExperiment({
        workspace_id: 'ws-ceo',
        title: 'Experimento Combo',
        hypothesis: 'Aumentar ticket médio',
        department: 'commercial_growth',
        decision_rationale: 'Validar hipótese com público matutino',
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('real-uuid-from-db-1234');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        decision_rationale: 'Validar hipótese com público matutino',
      }));
    });
  });

  // ============================================================================
  // GATE G: Inteligência Financeira e Validação de Cobertura de CMV
  // ============================================================================
  describe('Gate G — Validação de Cobertura e Métricas Financeiras', () => {
    it('calcula cobertura percentual e indica CMV parcial quando itens sem ficha existem', () => {
      // 2 itens com ficha técnica que geram R$ 60 de receita
      const mappedItems = [
        { product_name: 'Item A', quantity_sold: 2, unit_price: 20, unit_cost: 6 },
        { product_name: 'Item B', quantity_sold: 1, unit_price: 20, unit_cost: 7 },
      ];
      // Total de receita de todos os itens vendidos no período = R$ 100
      const totalRevenueContext = 100;

      const result = calculateEffectiveWeightedCMV(mappedItems, totalRevenueContext);
      expect(result.total_revenue).toBe(60);
      expect(result.coverage_percent).toBe(60);
      expect(result.is_partial_coverage).toBe(true);
      expect(result.notes).toContain('CMV ponderado parcial');
      expect(result.notes).toContain('60%');
      expect(result.effective_weighted_cmv_percent).toBe(31.67); // (19 / 60) * 100
    });

    it('indica cobertura integral (100%) quando todos os produtos possuem ficha', () => {
      const items = [
        { product_name: 'Item A', quantity_sold: 5, unit_price: 20, unit_cost: 6 },
      ];
      const result = calculateEffectiveWeightedCMV(items, 100);
      expect(result.coverage_percent).toBe(100);
      expect(result.is_partial_coverage).toBe(false);
      expect(result.is_cmv_healthy).toBe(true);
    });
  });
});
