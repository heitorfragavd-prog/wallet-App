/**
 * Tipos de Domínio para Conciliação PDV -> Carteira (Fatia 1)
 */

export type PdvReconciliationStatus = 'pendente' | 'conciliada' | 'estornada' | 'falha';

export interface PdvConciliacao {
  id: string;
  workspace_id: string;
  external_transaction_id: string;
  wallet_id: string;
  gross_amount_cents: number; // BIGINT mapeado como number/int seguro
  fee_cents: number;
  net_amount_cents: number;
  occurred_at: string;
  payment_method: string;
  metadata: Record<string, unknown>;
  status: PdvReconciliationStatus;
  reconciled_by?: string | null;
  transacao_receita_id?: string | null;
  transacao_taxa_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconcilePdvTransactionParams {
  p_external_id: string;
  p_wallet_id: string;
  p_gross_amount_cents: number;
  p_fee_cents: number;
  p_net_amount_cents: number;
  p_occurred_at: string; // ISO-8601 string
  p_payment_method: string;
  p_metadata?: Record<string, unknown>;
}

export interface ReconcilePdvTransactionResult {
  success: boolean;
  status: 'reconciled' | 'already_reconciled';
  idempotent: boolean;
  conciliacao_id: string;
  workspace_id: string;
  external_id: string;
  gross_amount_cents?: number;
  fee_cents?: number;
  net_amount_cents: number;
  transacao_receita_id?: string | null;
  transacao_taxa_id?: string | null;
}
