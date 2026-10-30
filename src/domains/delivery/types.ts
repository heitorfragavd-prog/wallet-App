/**
 * Wallet Delivery Growth — Tipos Canônicos de Domínio
 * Suporte a múltiplos canais (iFood, 99Food, Delivery Direto), KDS operacional e simulador de precificação.
 */

export type DeliveryChannelType = 'ifood' | '99food' | 'direct' | 'whatsapp';

export type DeliveryChannelStatus = 'active' | 'inactive' | 'pending_auth' | 'error';

export type MarketplaceConnectionState =
  | 'not_configured'
  | 'credentials_present_unverified'
  | 'authenticating'
  | 'authenticated'
  | 'awaiting_homologation'
  | 'homologated'
  | 'disconnected'
  | 'error';

export type DeliveryOrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type DeliveryPaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'cash'
  | 'marketplace_online'
  | 'voucher';

export type DeliveryPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'refunded'
  | 'failed';

export interface DeliveryChannel {
  id: string;
  workspace_id: string;
  channel_type: DeliveryChannelType;
  display_name: string;
  is_active: boolean;
  status: DeliveryChannelStatus;
  commission_rate: number; // Ex: 0.23 (23%)
  fixed_fee: number;       // Ex: 0.00 ou 1.50
  auto_accept_orders: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DeliveryOrderItem {
  id: string;
  order_id: string;
  catalog_item_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string | null;
  options?: Array<{ name: string; quantity: number; price: number }>;
  checked?: boolean; // Para o checklist do KDS
  is_verified_in_kds?: boolean;
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  created_at?: string;
}

export interface DeliveryOrder {
  id: string;
  workspace_id: string;
  channel_id: string;
  channel_order_id: string;
  display_id: string;
  customer_name: string;
  customer_phone?: string | null;
  delivery_address?: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  commission_amount: number;
  net_amount: number;
  status: DeliveryOrderStatus;
  payment_method: DeliveryPaymentMethod;
  payment_status: DeliveryPaymentStatus;
  notes?: string | null;
  kds_notes?: string | null;
  is_demo?: boolean;
  preparation_started_at?: string | null;
  ready_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  items?: DeliveryOrderItem[];
}

export interface DeliveryCatalogItem {
  id: string;
  workspace_id: string;
  channel_id?: string | null;
  external_id?: string | null;
  name: string;
  description?: string | null;
  in_store_price: number;
  channel_price: number;
  unit_cost_cmv: number;
  packaging_cost: number;
  is_available: boolean;
  target_margin_percent?: number | null;
  category?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ── Capacidades Declaradas de Conectores ──────────────────────────────
export type ConnectorCapabilityStatus =
  | 'available'
  | 'unauthorized'
  | 'unsupported'
  | 'awaiting_homologation'
  | 'temporarily_unavailable';

export interface ConnectorCapabilityDetail {
  status: ConnectorCapabilityStatus;
  notes?: string;
}

export interface ConnectorCapabilities {
  can_fetch_orders: ConnectorCapabilityDetail;
  can_accept_orders: ConnectorCapabilityDetail;
  can_update_status: ConnectorCapabilityDetail;
  can_sync_menu: ConnectorCapabilityDetail;
  can_update_stock: ConnectorCapabilityDetail;
  can_cancel_order: ConnectorCapabilityDetail;
  can_fetch_reviews: ConnectorCapabilityDetail;
}

// ── Simulador de Precificação de Delivery ─────────────────────────────
export interface PricingSimulationInput {
  base_cost_cmv: number;       // CMV unitário dos insumos (ex: R$ 8.50)
  in_store_price: number;      // Preço de venda no balcão (ex: R$ 25.00)
  channel_type: DeliveryChannelType;
  channel_commission_rate: number; // Comissão do canal (ex: 0.23 para 23%)
  payment_fee_rate: number;    // Taxa de pagamento/gateway (ex: 0.032 para 3.2%)
  packaging_cost: number;      // Custo de embalagem específica para entrega (ex: R$ 2.50)
  fixed_order_fee?: number;    // Taxa fixa por pedido se houver (ex: R$ 0.00)
  target_margin_percent?: number; // Margem líquida desejada (ex: 35)
  proposed_channel_price?: number; // Preço sugerido para testar margem resultante
}

export interface PricingSimulationResult {
  channel_type: DeliveryChannelType;
  in_store_price: number;
  channel_price: number;
  commission_amount: number;
  payment_fee_amount: number;
  fixed_order_fee: number;
  packaging_cost: number;
  base_cost_cmv: number;
  total_channel_deductions: number;
  net_payout: number;
  contribution_margin_amount: number;
  contribution_margin_percent: number;
  in_store_margin_amount: number;
  in_store_margin_percent: number;
  recommended_price_to_match_in_store_margin: number;
  recommended_price_to_match_target_margin: number;
  markup_recommended_percent: number;
  margin_gap_amount: number; // Diferença em R$ entre margem no canal vs balcão
}

export interface ChannelPricingComparison {
  in_store: {
    price: number;
    cmv: number;
    packaging: number;
    margin_amount: number;
    margin_percent: number;
  };
  channels: Record<DeliveryChannelType, PricingSimulationResult>;
}
