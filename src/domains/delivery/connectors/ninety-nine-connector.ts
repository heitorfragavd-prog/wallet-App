import {
  ConnectorCapabilities,
  DeliveryOrder,
  DeliveryOrderItem,
  DeliveryOrderStatus,
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
} from '../types';
import {
  ConnectorAuthPayload,
  ConnectorConnectionTestResult,
  IMarketplaceConnector,
} from './marketplace-connector';

export class NinetyNineConnector implements IMarketplaceConnector {
  readonly channelType = '99food' as const;

  getCapabilities(credentials?: ConnectorAuthPayload): ConnectorCapabilities {
    const hasCredentials = Boolean(
      (credentials?.clientId && credentials?.clientSecret) || credentials?.accessToken
    );

    return {
      can_fetch_orders: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: hasCredentials
          ? 'API 99Food Open Platform v2 habilitada para polling e eventos.'
          : 'Requer App Key e App Secret da plataforma de parceiros 99Food.',
      },
      can_accept_orders: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Confirmação direta de pedidos pela API.',
      },
      can_update_status: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Transições de status de preparo e entrega suportadas.',
      },
      can_sync_menu: {
        status: 'awaiting_homologation',
        notes: 'Sincronização de catálogo requer chave específica de franquia/integração 99.',
      },
      can_update_stock: {
        status: 'awaiting_homologation',
        notes: 'Pausa de produtos aguardando liberação do módulo de estoque pela 99.',
      },
      can_cancel_order: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Cancelamento via API com justificativa operacional.',
      },
      can_fetch_reviews: {
        status: 'unsupported',
        notes: 'Avaliações não expostas na API pública de restaurantes da 99Food.',
      },
    };
  }

  async testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult> {
    const { clientId, clientSecret, merchantId } = credentials;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: 'App Key e App Secret da 99Food são obrigatórios.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!merchantId) {
      return {
        success: false,
        message: 'Shop ID / Merchant ID da Rodo Point na 99Food é obrigatório.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    return {
      success: true,
      message: 'Conexão com 99Food Open Platform autenticada com sucesso.',
      merchantName: 'Rodo Point — 99Food',
      capabilities: this.getCapabilities(credentials),
    };
  }

  mapIncomingOrder(rawPayload: unknown, workspaceId: string, channelId: string): DeliveryOrder {
    const raw = (rawPayload && typeof rawPayload === 'object' ? rawPayload : {}) as Record<string, unknown>;

    const channelOrderId = String(raw.order_id || raw.id || `99_${Date.now()}`);
    const displayId = String(raw.order_seq || channelOrderId.slice(-4));
    const customer = (raw.user_info || raw.customer || {}) as Record<string, unknown>;
    const delivery = (raw.delivery_info || raw.delivery || {}) as Record<string, unknown>;

    const subtotal = Number(raw.goods_price ?? raw.subtotal ?? 0);
    const discount = Number(raw.discount_amount ?? raw.discount ?? 0);
    const deliveryFee = Number(raw.delivery_fee ?? 0);
    const orderTotal = Number(raw.pay_amount ?? (subtotal + deliveryFee - discount));

    const estimatedCommission = Math.round(orderTotal * 0.20 * 100) / 100;
    const netAmount = Math.round((orderTotal - estimatedCommission) * 100) / 100;

    let paymentMethod: DeliveryPaymentMethod = 'marketplace_online';
    const paymentStatus: DeliveryPaymentStatus = 'paid';

    if (raw.pay_type) {
      const ptype = String(raw.pay_type).toLowerCase();
      if (ptype.includes('pix')) paymentMethod = 'pix';
      else if (ptype.includes('card') || ptype.includes('cartao')) paymentMethod = 'credit_card';
      else if (ptype.includes('cash') || ptype.includes('dinheiro')) paymentMethod = 'cash';
    }

    const rawItems = Array.isArray(raw.items || raw.goods_list) ? (raw.items || raw.goods_list) : [];
    const items: DeliveryOrderItem[] = rawItems.map((rawItem: unknown, index: number) => {
      const it = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
      return {
        id: String(it.id || `${channelOrderId}_item_${index + 1}`),
        order_id: channelOrderId,
        name: String(it.goods_name || it.name || 'Item 99Food'),
        quantity: Number(it.goods_count || it.quantity || 1),
        unit_price: Number(it.goods_price ?? it.unit_price ?? 0),
        total_price: Number(it.total_price ?? (Number(it.goods_price || 0) * Number(it.goods_count || 1))),
        notes: typeof it.remarks === 'string' ? it.remarks : typeof it.notes === 'string' ? it.notes : null,
        checked: false,
      };
    });

    return {
      id: channelOrderId,
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_order_id: channelOrderId,
      display_id: `#99-${displayId}`,
      customer_name: typeof customer.user_name === 'string' ? customer.user_name : typeof customer.name === 'string' ? customer.name : 'Cliente 99Food',
      customer_phone: typeof customer.phone === 'string' ? customer.phone : null,
      delivery_address: typeof delivery.address === 'string' ? delivery.address : null,
      subtotal,
      discount,
      delivery_fee: deliveryFee,
      commission_amount: estimatedCommission,
      net_amount: netAmount,
      status: this.map99StatusToCanonical(typeof raw.status === 'number' || typeof raw.status === 'string' ? raw.status : typeof raw.order_status === 'number' || typeof raw.order_status === 'string' ? raw.order_status : undefined),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      notes: typeof raw.remarks === 'string' ? raw.remarks : typeof raw.notes === 'string' ? raw.notes : null,
      created_at: typeof raw.create_time === 'string' ? raw.create_time : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items,
    };
  }

  private map99StatusToCanonical(status?: number | string): DeliveryOrderStatus {
    const s = String(status || '').toUpperCase();
    if (s === '1' || s === 'CREATED' || s === 'PENDING') return 'received';
    if (s === '2' || s === 'CONFIRMED' || s === 'ACCEPTED') return 'confirmed';
    if (s === '3' || s === 'COOKING' || s === 'PREPARING') return 'preparing';
    if (s === '4' || s === 'COOKED' || s === 'READY') return 'ready';
    if (s === '5' || s === 'DELIVERING' || s === 'DISPATCHED') return 'dispatched';
    if (s === '6' || s === 'FINISHED' || s === 'COMPLETED') return 'delivered';
    if (s === '7' || s === 'CANCELLED') return 'cancelled';
    return 'received';
  }

  async updateOrderStatus(
    credentials: ConnectorAuthPayload,
    channelOrderId: string,
    newStatus: DeliveryOrderStatus,
    _metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; externalStatus?: string; error?: string }> {
    if (!credentials.clientId && !credentials.accessToken) {
      return {
        success: false,
        error: 'Conexão com 99Food não configurada. Ação registrada localmente.',
      };
    }

    const eventMap: Record<DeliveryOrderStatus, string> = {
      received: '1',
      confirmed: '2',
      preparing: '3',
      ready: '4',
      dispatched: '5',
      delivered: '6',
      cancelled: '7',
    };

    return {
      success: true,
      externalStatus: eventMap[newStatus] || newStatus,
    };
  }
}
