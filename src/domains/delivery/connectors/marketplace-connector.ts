import {
  DeliveryChannelType,
  DeliveryOrder,
  DeliveryOrderStatus,
  ConnectorCapabilities,
  MarketplaceConnectionState,
} from '../types';

export interface ConnectorAuthPayload {
  clientId?: string;
  clientSecret?: string;
  merchantId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  isHomologated?: boolean;
}

export interface ConnectorConnectionTestResult {
  success: boolean;
  state: MarketplaceConnectionState;
  message: string;
  capabilities: ConnectorCapabilities;
  merchantName?: string;
  isVerifiedLive: boolean;
}

export interface IMarketplaceConnector {
  readonly channelType: DeliveryChannelType;

  /**
   * Retorna as capacidades do conector com seus respectivos estados explícitos:
   * ('available' | 'unauthorized' | 'unsupported' | 'awaiting_homologation' | 'temporarily_unavailable')
   */
  getCapabilities(credentials?: ConnectorAuthPayload): ConnectorCapabilities;

  /**
   * Testa a autenticação e conectividade com a API externa do marketplace.
   * Não emite falso positivo: exige verificação real de chamadas no servidor ou reporta 'credentials_present_unverified'.
   */
  testConnection(credentials: ConnectorAuthPayload): Promise<ConnectorConnectionTestResult>;

  /**
   * Mapeia payload bruto de webhook ou polling da plataforma em uma DeliveryOrder canônica do Wallet App.
   */
  mapIncomingOrder(rawPayload: unknown, workspaceId: string, channelId: string): DeliveryOrder;

  /**
   * Atualiza o status do pedido na plataforma externa (confirmar, pronto para retirada, despacho, etc.)
   * Não emite falso positivo: se não houver envio real e verificado à API externa, reporta explicitamente
   * que a transição foi gravada apenas no KDS local.
   */
  updateOrderStatus(
    externalOrderId: string,
    newStatus: DeliveryOrderStatus,
    credentials: ConnectorAuthPayload,
    notes?: string
  ): Promise<{
    success: boolean;
    localUpdated: boolean;
    externalUpdated: boolean;
    message: string;
    targetStatus: DeliveryOrderStatus;
  }>;
}
