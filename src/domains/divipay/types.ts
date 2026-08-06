import type { Database } from "@/integrations/supabase/types";

export type DivipayConfig = Database["public"]["Tables"]["divipay_config"]["Row"];
export type DivipayConfigInsert = Database["public"]["Tables"]["divipay_config"]["Insert"];
export type DivipayConfigUpdate = Database["public"]["Tables"]["divipay_config"]["Update"];

export type DivipayTransacao = Database["public"]["Tables"]["divipay_transacoes"]["Row"];
export type DivipayTransacaoInsert = Database["public"]["Tables"]["divipay_transacoes"]["Insert"];
export type DivipayTransacaoUpdate = Database["public"]["Tables"]["divipay_transacoes"]["Update"];

export type DivipayWebhookLog = Database["public"]["Tables"]["divipay_webhook_logs"]["Row"];

export type DivipayEnvironment = "sandbox" | "production";

export interface DivipayBalance {
  id: string;
  name: string;
  balance: number;
  balanceBlocked: number;
  balanceLocked: number;
}

export interface DivipayMovement {
  id: string;
  transactionCode: string;
  date: string;
  amount: number;
  amountLiquid: number;
  taxes: number;
  type: string;
  status: string;
  description?: string | null;
  payerName?: string | null;
}

export interface CreatePixChargeParams {
  amount: number;
  description?: string;
  expirationSeconds?: number;
  client?: {
    name?: string;
    document?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreatePixChargeResult {
  id: string;
  transactionCode: string;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  status?: string;
  amount?: number;
  expirationDate?: string;
}

export interface CreateWithdrawParams {
  amount: number;
  keyPix: string;
  consultId?: string | null;
  description?: string;
}

export interface PixKeyValidationResult {
  valid: boolean;
  key?: string;
  keyType?: string;
  ownerName?: string;
  ownerDocument?: string;
  consultId?: string;
  error?: string;
}

export interface ListMovementsParams {
  initialDate: string;
  finalDate: string;
  status?: string | null;
  type?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface ListMovementsResult {
  items: DivipayMovement[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export interface DivipaySaque {
  id: string;
  name?: string | null;
  document?: string | null;
  description?: string | null;
  type: string;
  amount: number;
  tax: number;
  status: string;
  lote?: string | null;
  createdAt?: string | null;
  fileName?: string | null;
  billetCode?: string | null;
}

export interface DivipayApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

