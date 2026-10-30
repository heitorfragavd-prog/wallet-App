import { describe, it, expect } from 'vitest';
import { IFoodConnector } from './connectors/ifood-connector';
import { NinetyNineConnector } from './connectors/ninety-nine-connector';

describe('Wallet Delivery Growth — Conectores de Marketplace', () => {
  describe('IFoodConnector', () => {
    const connector = new IFoodConnector();

    it('declara capacidades explícitas e requer credenciais para operações de pedidos', () => {
      // Sem credenciais
      const unauthCaps = connector.getCapabilities();
      expect(unauthCaps.can_fetch_orders.status).toBe('unauthorized');
      expect(unauthCaps.can_sync_menu.status).toBe('awaiting_homologation');
      expect(unauthCaps.can_fetch_reviews.status).toBe('unsupported');

      // Com credenciais presentes (não homologadas ao vivo)
      const unverifiedCaps = connector.getCapabilities({
        clientId: 'client-123',
        clientSecret: 'secret-456',
        merchantId: 'merchant-789',
      });
      expect(unverifiedCaps.can_fetch_orders.status).toBe('awaiting_homologation');
      expect(unverifiedCaps.can_accept_orders.status).toBe('awaiting_homologation');
      expect(unverifiedCaps.can_update_status.status).toBe('awaiting_homologation');
      expect(unverifiedCaps.can_sync_menu.status).toBe('awaiting_homologation');

      // Com credenciais homologadas
      const authCaps = connector.getCapabilities({
        clientId: 'client-123',
        clientSecret: 'secret-456',
        merchantId: 'merchant-789',
        isHomologated: true,
      });
      expect(authCaps.can_fetch_orders.status).toBe('available');
      expect(authCaps.can_accept_orders.status).toBe('available');
      expect(authCaps.can_update_status.status).toBe('available');
      expect(authCaps.can_sync_menu.status).toBe('awaiting_homologation');
    });

    it('normaliza payload de pedido bruto do iFood para estrutura canônica do Wallet App', () => {
      const rawIFoodPayload = {
        id: 'ord-ifood-9901',
        displayId: '9901',
        customer: {
          name: 'João Paulo Silva',
          phone: { number: '11987654321' },
        },
        delivery: {
          deliveryAddress: {
            formattedAddress: 'Rua Augusta, 1500, Apto 12',
          },
        },
        total: {
          subTotal: 60.0,
          deliveryFee: 8.0,
          discount: 0,
          orderAmount: 68.0,
        },
        payments: {
          methods: [{ method: 'PIX', value: 68.0 }],
        },
        items: [
          {
            id: 'item-1',
            name: 'X-Burger Artesanal',
            quantity: 2,
            unitPrice: 30.0,
            totalPrice: 60.0,
            observations: 'Sem maionese',
          },
        ],
        orderStatus: 'PLACED',
        createdAt: '2026-10-30T12:00:00Z',
      };

      const order = connector.mapIncomingOrder(rawIFoodPayload, 'ws-1', 'ch-ifood');

      expect(order.id).toBe('ord-ifood-9901');
      expect(order.display_id).toBe('#9901');
      expect(order.customer_name).toBe('João Paulo Silva');
      expect(order.delivery_address).toBe('Rua Augusta, 1500, Apto 12');
      expect(order.subtotal).toBe(60.0);
      expect(order.payment_method).toBe('pix');
      expect(order.payment_status).toBe('paid');
      expect(order.status).toBe('received');
      expect(order.items).toHaveLength(1);
      expect(order.items?.[0].name).toBe('X-Burger Artesanal');
      expect(order.items?.[0].quantity).toBe(2);
      expect(order.items?.[0].notes).toBe('Sem maionese');
      expect(order.commission_amount).toBeGreaterThan(0);
    });

    it('executa teste de conexão validando campos obrigatórios e não emitindo falso positivo', async () => {
      // Incompleto
      const failed = await connector.testConnection({});
      expect(failed.success).toBe(false);
      expect(failed.state).toBe('not_configured');
      expect(failed.message).toContain('obrigatórios');

      // Com credenciais presentes, mas sem homologação ativa (evita falso positivo)
      const unverified = await connector.testConnection({
        clientId: 'id-test',
        clientSecret: 'secret-test',
        merchantId: 'merchant-test',
      });
      expect(unverified.success).toBe(false);
      expect(unverified.isVerifiedLive).toBe(false);
      expect(unverified.state).toBe('credentials_present_unverified');
      expect(unverified.merchantName).toBeDefined();

      // Homologado
      const success = await connector.testConnection({
        clientId: 'id-test',
        clientSecret: 'secret-test',
        merchantId: 'merchant-test',
        isHomologated: true,
      });
      expect(success.success).toBe(true);
      expect(success.isVerifiedLive).toBe(true);
      expect(success.state).toBe('homologated');
    });
  });

  describe('NinetyNineConnector', () => {
    const connector = new NinetyNineConnector();

    it('declara capacidades para 99Food com suporte a status e espera de homologação de catálogo', () => {
      const caps = connector.getCapabilities({
        clientId: 'app-99-key',
        clientSecret: 'app-99-secret',
        merchantId: 'shop-99-1',
        isHomologated: true,
      });

      expect(caps.can_fetch_orders.status).toBe('available');
      expect(caps.can_sync_menu.status).toBe('awaiting_homologation');
      expect(caps.can_fetch_reviews.status).toBe('unsupported');
    });

    it('normaliza pedido recebido da 99Food', () => {
      const raw99Payload = {
        order_id: '99_order_7741',
        order_seq: '7741',
        user_info: {
          user_name: 'Camila Santos',
          phone: '11977778888',
        },
        delivery_info: {
          address: 'Alameda Santos, 200',
        },
        pay_amount: 45.0,
        goods_price: 45.0,
        pay_type: 'ONLINE_CARD',
        goods_list: [
          {
            id: 'g-1',
            goods_name: 'Prato Feito Especial',
            goods_count: 1,
            goods_price: 45.0,
          },
        ],
        status: '2', // CONFIRMED
      };

      const order = connector.mapIncomingOrder(raw99Payload, 'ws-1', 'ch-99');

      expect(order.id).toBe('99_order_7741');
      expect(order.display_id).toBe('#99-7741');
      expect(order.customer_name).toBe('Camila Santos');
      expect(order.payment_method).toBe('credit_card');
      expect(order.status).toBe('confirmed');
      expect(order.items?.[0].name).toBe('Prato Feito Especial');
    });
  });
});
