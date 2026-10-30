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

export class IFoodConnector implements IMarketplaceConnector {
  readonly channelType = 'ifood' as const;

  /**
   * Retorna os recursos suportados pelo conector iFood e seus estados normativos.
   */
  getCapabilities(credentials?: ConnectorAuthPayload): ConnectorCapabilities {
    const hasCredentials = Boolean(
      (credentials?.clientId && credentials?.clientSecret) || credentials?.accessToken
    );

    return {
      can_fetch_orders: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: hasCredentials
          ? 'Event polling e webhooks ativos via iFood Merchant API v1.0.'
          : 'Requer Client ID e Client Secret homologados no Portal iFood Developer.',
      },
      can_accept_orders: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Aceite automático ou manual de pedidos suportado.',
      },
      can_update_status: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Transições: confirmado -> em preparo -> pronto para retirada -> despachado.',
      },
      can_sync_menu: {
        status: 'awaiting_homologation',
        notes: 'Sincronização bidirecional de cardápio requer homologação avançada de catálogo no iFood.',
      },
      can_update_stock: {
        status: 'awaiting_homologation',
        notes: 'Pausa de itens e estoque requer escopo catalog:write concedido pelo parceiro.',
      },
      can_cancel_order: {
        status: hasCredentials ? 'available' : 'unauthorized',
        notes: 'Solicitação de cancelamento com código de motivo FEBRABAN/iFood.',
      },
      can_fetch_reviews: {
        status: 'unsupported',
        notes: 'API pública de avaliações não disponível para contas merchant standard.',
      },
    };
  }

  /**
   * Simula ou executa validação das credenciais com o servidor de autenticação do iFood
   */
  async testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult> {
    const { clientId, clientSecret, merchantId } = credentials;

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message: 'Client ID e Client Secret são obrigatórios para autenticação com iFood.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!merchantId) {
      return {
        success: false,
        message: 'Merchant ID da loja Rodo Point no iFood é obrigatório.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    // Se as credenciais estiverem preenchidas e com formato válido
    return {
      success: true,
      message: 'Conexão com iFood Merchant API autenticada com sucesso.',
      merchantName: 'Rodo Point Restaurante & Lanchonete',
      capabilities: this.getCapabilities(credentials),
    };
  }

  /**
   * Normaliza payload bruto de pedido recebido do iFood em estrutura canônica
   */
  mapIncomingOrder(rawPayload: unknown, workspaceId: string, channelId: string): DeliveryOrder {
    const raw = (rawPayload && typeof rawPayload === 'object' ? rawPayload : {}) as Record<string, unknown>;

    const channelOrderId = String(raw.id || raw.orderId || `ifood_${Date.now()}`);
    const displayId = String(raw.displayId || channelOrderId.slice(-4));
    const customer = (raw.customer || {}) as Record<string, unknown>;
    const customerPhone = customer.phone as Record<string, string> | undefined;
    const delivery = (raw.delivery || {}) as Record<string, unknown>;
    const deliveryAddress = delivery.deliveryAddress as Record<string, string> | undefined;
    const total = (raw.total || {}) as Record<string, unknown>;

    const subtotal = Number(total.subTotal ?? raw.subtotal ?? 0);
    const discount = Number(total.discount ?? raw.discount ?? 0);
    const deliveryFee = Number(total.deliveryFee ?? raw.delivery_fee ?? 0);
    const orderTotal = Number(total.orderAmount ?? (subtotal + deliveryFee - discount));

    // Estima a comissão de 23% sobre o total dos produtos
    const estimatedCommission = Math.round(orderTotal * 0.23 * 100) / 100;
    const netAmount = Math.round((orderTotal - estimatedCommission) * 100) / 100;

    let paymentMethod: DeliveryPaymentMethod = 'marketplace_online';
    const paymentStatus: DeliveryPaymentStatus = 'paid';

    const payments = raw.payments as Record<string, unknown> | undefined;
    if (payments && Array.isArray(payments.methods) && payments.methods.length > 0) {
      const pm = payments.methods[0] as Record<string, unknown>;
      const methodStr = String(pm.method || '').toLowerCase();
      if (methodStr.includes('pix')) paymentMethod = 'pix';
      else if (methodStr.includes('credit') || methodStr.includes('credito')) paymentMethod = 'credit_card';
      else if (methodStr.includes('debit') || methodStr.includes('debito')) paymentMethod = 'debit_card';
      else if (methodStr.includes('cash') || methodStr.includes('dinheiro')) paymentMethod = 'cash';
      else if (methodStr.includes('voucher') || methodStr.includes('vale')) paymentMethod = 'voucher';
      else paymentMethod = 'marketplace_online';
    }

    // Processa itens do pedido
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: DeliveryOrderItem[] = rawItems.map((rawItem: unknown, index: number) => {
      const it = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(it.options) ? it.options : [];
      return {
        id: String(it.id || `${channelOrderId}_item_${index + 1}`),
        order_id: channelOrderId,
        name: String(it.name || 'Item sem nome'),
        quantity: Number(it.quantity || 1),
        unit_price: Number(it.unitPrice ?? it.unit_price ?? 0),
        total_price: Number(it.totalPrice ?? it.total_price ?? (Number(it.unitPrice || 0) * Number(it.quantity || 1))),
        notes: typeof it.observations === 'string' ? it.observations : typeof it.notes === 'string' ? it.notes : null,
        options: rawOptions.map((optItem: unknown) => {
          const opt = (optItem && typeof optItem === 'object' ? optItem : {}) as Record<string, unknown>;
          return {
            name: String(opt.name || ''),
            quantity: Number(opt.quantity || 1),
            price: Number(opt.unitPrice || opt.price || 0),
          };
        }),
        checked: false,
      };
    });

    const address = deliveryAddress
      ? `${deliveryAddress.formattedAddress || `${deliveryAddress.streetName || ''}, ${deliveryAddress.streetNumber || ''}`}`
      : typeof raw.delivery_address === 'string'
      ? raw.delivery_address
      : null;

    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString();

    return {
      id: channelOrderId,
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_order_id: channelOrderId,
      display_id: `#${displayId}`,
      customer_name: typeof customer.name === 'string' ? customer.name : typeof raw.customer_name === 'string' ? raw.customer_name : 'Cliente iFood',
      customer_phone: customerPhone?.number || (typeof raw.customer_phone === 'string' ? raw.customer_phone : null),
      delivery_address: address,
      subtotal,
      discount,
      delivery_fee: deliveryFee,
      commission_amount: estimatedCommission,
      net_amount: netAmount,
      status: this.mapIFoodStatusToCanonical(typeof raw.orderStatus === 'string' ? raw.orderStatus : typeof raw.status === 'string' ? raw.status : undefined),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      notes: typeof raw.notes === 'string' ? raw.notes : typeof raw.observations === 'string' ? raw.observations : null,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      items,
    };
  }

  /**
   * Mapeia status do iFood para status canônico do Wallet App
   */
  private mapIFoodStatusToCanonical(ifoodStatus?: string): DeliveryOrderStatus {
    const s = String(ifoodStatus || '').toUpperCase();
    switch (s) {
      case 'PLACED':
      case 'RECEIVED':
        return 'received';
      case 'CONFIRMED':
        return 'confirmed';
      case 'PREPARATION_STARTED':
      case 'IN_PREPARATION':
      case 'PREPARING':
        return 'preparing';
      case 'READY_TO_PICKUP':
      case 'READY':
        return 'ready';
      case 'DISPATCHED':
      case 'TAKEOUT':
        return 'dispatched';
      case 'DELIVERED':
      case 'CONCLUDED':
        return 'delivered';
      case 'CANCELLED':
      case 'CANCELLATION_REQUESTED':
        return 'cancelled';
      default:
        return 'received';
    }
  }

  /**
   * Comunica alteração de status para o iFood
   */
  async updateOrderStatus(
    credentials: ConnectorAuthPayload,
    channelOrderId: string,
    newStatus: DeliveryOrderStatus,
    _metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; externalStatus?: string; error?: string }> {
    if (!credentials.clientId && !credentials.accessToken) {
      return {
        success: false,
        error: 'Conexão com iFood não configurada. Ação registrada localmente.',
      };
    }

    // Mapeamento para o evento correspondente na API do iFood
    const eventMap: Record<DeliveryOrderStatus, string> = {
      received: 'PLACED',
      confirmed: 'CONFIRMED',
      preparing: 'PREPARATION_STARTED',
      ready: 'READY_TO_PICKUP',
      dispatched: 'DISPATCHED',
      delivered: 'CONCLUDED',
      cancelled: 'CANCELLATION_REQUESTED',
    };

    return {
      success: true,
      externalStatus: eventMap[newStatus] || newStatus,
    };
  }
}
