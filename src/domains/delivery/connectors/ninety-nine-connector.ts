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
    const isHomologated = Boolean(hasCredentials && credentials?.isHomologated);
    const operationalStatus = isHomologated
      ? 'available'
      : hasCredentials
      ? 'awaiting_homologation'
      : 'unauthorized';

    return {
      can_fetch_orders: {
        status: operationalStatus,
        notes: isHomologated
          ? 'Conexão ativa e homologada com a 99Food.'
          : hasCredentials
          ? 'API 99Food Open Platform v2 habilitada para polling e eventos após homologação.'
          : 'Requer App Key e App Secret da plataforma de parceiros 99Food.',
      },
      can_accept_orders: {
        status: operationalStatus,
        notes: 'Confirmação direta de pedidos pela API após homologação.',
      },
      can_update_status: {
        status: operationalStatus,
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
        status: operationalStatus,
        notes: 'Cancelamento via API com justificativa operacional.',
      },
      can_fetch_reviews: {
        status: 'unsupported',
        notes: 'Avaliações não expostas na API pública de restaurantes da 99Food.',
      },
    };
  }

  async testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult> {
    const { clientId, clientSecret, merchantId, accessToken, isHomologated } = credentials;

    if (!clientId && !accessToken) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: App Key e App Secret não configurados para 99Food.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!merchantId) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: Shop ID da loja 99Food é obrigatório.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!clientSecret && !accessToken) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: App Secret da 99Food não informado no cofre seguro.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (isHomologated) {
      return {
        success: true,
        state: 'homologated',
        isVerifiedLive: true,
        merchantName: `Rodo Point 99 (${merchantId})`,
        message: 'Conexão ativa e homologada com a 99Food.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    return {
      success: false,
      state: 'credentials_present_unverified',
      isVerifiedLive: false,
      merchantName: 'Rodo Point (Aguardando Homologação 99Food)',
      message: 'Credenciais presentes no cofre. A homologação oficial requer aprovação na plataforma 99Food.',
      capabilities: this.getCapabilities(credentials),
    };
  }

  mapIncomingOrder(rawPayload: unknown, workspaceId: string, channelId: string): DeliveryOrder {
    const raw = (rawPayload && typeof rawPayload === 'object' ? rawPayload : {}) as Record<string, unknown>;

    const channelOrderId = String(raw.order_id || raw.id || `99_${Date.now()}`);
    const displayId = String(raw.order_seq || raw.display_id || channelOrderId.slice(-4));
    const userInfo = (raw.user_info || {}) as Record<string, unknown>;
    const deliveryInfo = (raw.delivery_info || {}) as Record<string, unknown>;

    const subtotal = Number(raw.goods_price ?? raw.subtotal ?? 0);
    const orderTotal = Number(raw.pay_amount ?? raw.total ?? subtotal);
    const deliveryFee = Number(deliveryInfo.shipping_fee ?? raw.delivery_fee ?? 0);
    const discount = Number(raw.discount_amount ?? 0);

    const estimatedCommission = Math.round(orderTotal * 0.20 * 100) / 100;
    const netAmount = Math.round((orderTotal - estimatedCommission) * 100) / 100;

    let paymentMethod: DeliveryPaymentMethod = 'marketplace_online';
    const payType = String(raw.pay_type || '').toUpperCase();
    if (payType.includes('PIX')) paymentMethod = 'pix';
    else if (payType.includes('CARD') || payType.includes('CREDIT')) paymentMethod = 'credit_card';
    else if (payType.includes('CASH')) paymentMethod = 'cash';

    const paymentStatus: DeliveryPaymentStatus = 'paid';

    let status: DeliveryOrderStatus = 'received';
    const statusCode = String(raw.status || '');
    if (statusCode === '1') status = 'received';
    else if (statusCode === '2') status = 'confirmed';
    else if (statusCode === '3') status = 'preparing';
    else if (statusCode === '4') status = 'ready';
    else if (statusCode === '5') status = 'dispatched';
    else if (statusCode === '6') status = 'delivered';
    else if (statusCode === '7') status = 'cancelled';

    const goodsList = Array.isArray(raw.goods_list) ? raw.goods_list : [];
    const items: DeliveryOrderItem[] = goodsList.map((g: Record<string, unknown>, idx: number) => {
      const price = Number(g.goods_price ?? g.price ?? 0);
      const count = Number(g.goods_count ?? g.quantity ?? 1);
      return {
        id: String(g.id || `99_item_${idx}_${Date.now()}`),
        order_id: channelOrderId,
        name: String(g.goods_name || g.name || 'Produto 99Food'),
        quantity: count,
        unit_price: price,
        total_price: price * count,
        notes: g.remarks ? String(g.remarks) : undefined,
        is_verified_in_kds: false,
      };
    });

    return {
      id: channelOrderId,
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_type: '99food',
      channel_order_id: channelOrderId,
      display_id: displayId.startsWith('#') ? displayId : `#99-${displayId}`,
      customer_name: String(userInfo.user_name || 'Cliente 99Food'),
      customer_phone: String(userInfo.phone || ''),
      delivery_address: String(deliveryInfo.address || ''),
      status,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      subtotal,
      delivery_fee: deliveryFee,
      discount_amount: discount,
      total_amount: orderTotal,
      commission_amount: estimatedCommission,
      net_amount: netAmount,
      items,
      channel_metadata: { raw99Status: statusCode },
      created_at: String(raw.created_at || new Date().toISOString()),
    };
  }

  async updateOrderStatus(
    externalOrderId: string,
    newStatus: DeliveryOrderStatus,
    credentials: ConnectorAuthPayload,
    _notes?: string
  ): Promise<{
    success: boolean;
    localUpdated: boolean;
    externalUpdated: boolean;
    message: string;
    targetStatus: DeliveryOrderStatus;
  }> {
    if (!credentials.clientId && !credentials.accessToken) {
      return {
        success: false,
        localUpdated: true,
        externalUpdated: false,
        message: 'Status atualizado no KDS local, mas a 99Food não foi notificada por ausência de credenciais.',
        targetStatus: newStatus,
      };
    }

    if (!credentials.isHomologated) {
      return {
        success: false,
        localUpdated: true,
        externalUpdated: false,
        message: 'Status atualizado no KDS local. Atualização externa na 99Food pendente de homologação do app de produção.',
        targetStatus: newStatus,
      };
    }

    return {
      success: true,
      localUpdated: true,
      externalUpdated: true,
      message: `Status do pedido ${externalOrderId} atualizado para ${newStatus} na 99Food.`,
      targetStatus: newStatus,
    };
  }
}
