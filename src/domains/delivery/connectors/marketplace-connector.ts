import {
  DeliveryChannelType,
  DeliveryOrder,
  DeliveryOrderStatus,
  ConnectorCapabilities,
} from '../types';

export interface ConnectorAuthPayload {
  clientId?: string;
  clientSecret?: string;
  merchantId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface ConnectorConnectionTestResult {
  success: boolean;
  message: string;
  capabilities: ConnectorCapabilities;
  merchantName?: string;
}

export interface IMarketplaceConnector {
  readonly channelType: DeliveryChannelType;

  /**
   * Retorna as capacidades do conector com seus respectivos estados explícitos:
   * ('available' | 'unauthorized' | 'unsupported' | 'awaiting_homologation' | 'temporarily_unavailable')
   */
  getCapabilities(): ConnectorCapabilities;

  /**
   * Testa a autenticação e conectividade com a API externa do marketplace.
   */
  testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult>;

  /**
   * Mapeia payload bruto de webhook ou polling da plataforma em uma DeliveryOrder canônica do Wallet App.
   */
  mapIncomingOrder(rawPayload: unknown, workspaceId: string, channelId: string): DeliveryOrder;

  /**
   * Atualiza o status do pedido na plataforma externa (confirmar, pronto para retirada, despacho, etc.)
   */
  updateOrderStatus(
    credentials: ConnectorAuthPayload,
    channelOrderId: string,
    newStatus: DeliveryOrderStatus,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; externalStatus?: string; error?: string }>;
}
