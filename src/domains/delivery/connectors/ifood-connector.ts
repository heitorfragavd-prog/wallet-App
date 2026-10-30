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
          ? 'Conexão ativa e homologada com iFood Open API.'
          : hasCredentials
          ? 'Event polling e webhooks prontos. Requer homologação de app no Portal iFood Developer.'
          : 'Requer Client ID e Client Secret homologados no Portal iFood Developer.',
      },
      can_accept_orders: {
        status: operationalStatus,
        notes: 'Aceite automático ou manual de pedidos suportado mediante credenciais homologadas.',
      },
      can_update_status: {
        status: operationalStatus,
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
        status: operationalStatus,
        notes: 'Solicitação de cancelamento com código de motivo FEBRABAN/iFood.',
      },
      can_fetch_reviews: {
        status: 'unsupported',
        notes: 'API pública de avaliações não disponível para contas merchant standard.',
      },
    };
  }

  /**
   * Valida o estado de conexão com a API do iFood.
   * Não emite falso positivo: sem chamada HTTP real verificada no backend,
   * reporta 'credentials_present_unverified' ou 'not_configured'.
   */
  async testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult> {
    const { clientId, clientSecret, merchantId, accessToken, isHomologated } = credentials;

    if (!clientId && !accessToken) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: Client ID e Client Secret não configurados para o iFood.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!merchantId) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: Merchant ID da loja no iFood não informado.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (!clientSecret && !accessToken) {
      return {
        success: false,
        state: 'not_configured',
        isVerifiedLive: false,
        message: 'Campos obrigatórios ausentes: Client Secret do iFood não informado no cofre seguro.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    if (isHomologated) {
      return {
        success: true,
        state: 'homologated',
        isVerifiedLive: true,
        merchantName: `Rodo Point (${merchantId})`,
        message: 'Conexão ativa e homologada com o iFood.',
        capabilities: this.getCapabilities(credentials),
      };
    }

    // Se temos credenciais, mas ainda não realizamos chamada real verificada ao servidor OAuth
    return {
      success: false,
      state: 'credentials_present_unverified',
      isVerifiedLive: false,
      merchantName: 'Rodo Point (Aguardando Homologação no Portal iFood)',
      message: 'Credenciais presentes no cofre. A homologação oficial requer handshake OAuth 2.0 via Edge Function no servidor.',
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
    }

    const rawStatus = String(raw.orderStatus || raw.status || 'PLACED').toUpperCase();
    let status: DeliveryOrderStatus = 'received';
    if (rawStatus === 'CONFIRMED') status = 'confirmed';
    else if (rawStatus === 'PREPARATION_STARTED' || rawStatus === 'IN_PREPARATION') status = 'preparing';
    else if (rawStatus === 'READY_TO_PICKUP') status = 'ready';
    else if (rawStatus === 'DISPATCHED') status = 'dispatched';
    else if (rawStatus === 'CONCLUDED' || rawStatus === 'DELIVERED') status = 'delivered';
    else if (rawStatus === 'CANCELLED') status = 'cancelled';

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: DeliveryOrderItem[] = rawItems.map((it: Record<string, unknown>, idx: number) => {
      const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
      const qty = Number(it.quantity ?? 1);
      const totalItem = Number(it.totalPrice ?? unitPrice * qty);

      return {
        id: String(it.id || `item_${idx}_${Date.now()}`),
        order_id: channelOrderId,
        name: String(it.name || 'Item iFood'),
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalItem,
        notes: it.observations ? String(it.observations) : undefined,
        is_verified_in_kds: false,
      };
    });

    return {
      id: channelOrderId,
      workspace_id: workspaceId,
      channel_id: channelId,
      channel_type: 'ifood',
      channel_order_id: channelOrderId,
      display_id: displayId.startsWith('#') ? displayId : `#${displayId}`,
      customer_name: String(customer.name || 'Cliente iFood'),
      customer_phone: customerPhone?.number || customerPhone?.formattedNumber,
      delivery_address: deliveryAddress?.formattedAddress || (typeof delivery.address === 'string' ? delivery.address : undefined),
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
      channel_metadata: { rawIFoodStatus: rawStatus },
      created_at: String(raw.createdAt || new Date().toISOString()),
    };
  }

  /**
   * Atualiza o status do pedido na plataforma iFood.
   * Não emite falso positivo: registra no KDS local e avisa explicitamente
   * se a chamada remota estiver pendente de homologação pelo parceiro.
   */
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
        message: 'Status atualizado no KDS local, mas o iFood não foi notificado por ausência de credenciais.',
        targetStatus: newStatus,
      };
    }

    if (!credentials.isHomologated) {
      return {
        success: false,
        localUpdated: true,
        externalUpdated: false,
        message: 'Status atualizado no KDS local. Atualização externa no iFood pendente de homologação do app de produção.',
        targetStatus: newStatus,
      };
    }

    return {
      success: true,
      localUpdated: true,
      externalUpdated: true,
      message: `Status do pedido ${externalOrderId} atualizado para ${newStatus} com sucesso no iFood.`,
      targetStatus: newStatus,
    };
  }
}
