import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import type {
  DivipayBalance,
  DivipayConfig,
  DivipayConfigInsert,
  DivipayConfigUpdate,
  DivipayMovement,
  DivipaySaque,
  DivipayTransacao,
  DivipayWebhookLog,
  CreatePixChargeParams,
  CreateWithdrawParams,
  ListMovementsParams,
  ListMovementsResult,
  PixKeyValidationResult,
  DivipayApiResponse,
} from "@/domains/divipay/types";

const COMPONENT = "DivipayService";

export class DivipayService {
  private async getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  }

  private async requireUser(): Promise<string> {
    const user = await this.getUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }
    return user.id;
  }

  private async invoke<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T> {
    logger.info(COMPONENT, `Invocando divipay-api: ${action}`, { action });

    const { data, error } = await supabase.functions.invoke("divipay-api", {
      body: { action, ...(params ?? {}) },
    });

    if (error) {
      logger.error(COMPONENT, `Erro ao invocar divipay-api (${action})`, { error: error.message });
      throw new Error(error.message || `Erro na ação ${action}`);
    }

    const response = data as DivipayApiResponse<T> | undefined;

    if (response && typeof response === "object" && "success" in response && response.success === false) {
      const message = response.error || response.message || `Falha na ação ${action}`;
      logger.error(COMPONENT, `Ação ${action} retornou erro`, { message });
      throw new Error(message);
    }

    const payload = response && "data" in response && response.data !== undefined ? response.data : (data as T);
    logger.info(COMPONENT, `Ação ${action} concluída com sucesso`);
    return payload;
  }

  async getBalance(): Promise<DivipayBalance[]> {
    const data = await this.invoke<unknown>("getBalance");
    // A API /api/me retorna um único objeto; normalizamos para array.
    let list: unknown[] = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (data && typeof data === "object") {
      list = [data];
    }

    return list.map((item): DivipayBalance => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: String(record.id ?? ""),
        name: String(record.name ?? record.nome ?? "Conta"),
        balance: this.toNumber(record.balance ?? record.saldo ?? 0),
        balanceBlocked: this.toNumber(record.balanceBlocked ?? record.balance_blocked ?? record.saldoBloqueado ?? 0),
        balanceLocked: this.toNumber(record.balanceLocked ?? record.balance_locked ?? record.saldoTravado ?? 0),
      };
    });
  }

  async createPixCharge(params: CreatePixChargeParams): Promise<{ transacao: DivipayTransacao; charge: unknown }> {
    const data = await this.invoke<{ transacao: DivipayTransacao; charge: unknown }>("createPixCharge", params as Record<string, unknown>);
    return data;
  }

  async cancelPixCharge(chargeId: string): Promise<{ success: boolean; id?: string }> {
    const data = await this.invoke<Record<string, unknown>>("cancelPixCharge", { chargeId });
    return {
      success: data?.success !== false,
      id: data?.id ? String(data.id) : chargeId,
    };
  }

  async validatePixKey(key: string): Promise<PixKeyValidationResult> {
    const data = await this.invoke<Record<string, unknown>>("validatePixKey", { key });
    const consultId = data?.consultId
      ? String(data.consultId)
      : data?.consult_id
        ? String(data.consult_id)
        : data?.consultToken
          ? String(data.consultToken)
          : undefined;
    return {
      valid: data?.valid === true || !!consultId,
      key: data?.key ? String(data.key) : key,
      keyType: data?.keyType ? String(data.keyType) : data?.key_type ? String(data.key_type) : undefined,
      ownerName: data?.name ? String(data.name) : data?.ownerName ? String(data.ownerName) : data?.owner_name ? String(data.owner_name) : undefined,
      ownerDocument: data?.document ? String(data.document) : data?.ownerDocument ? String(data.ownerDocument) : data?.owner_document ? String(data.owner_document) : undefined,
      consultId,
      error: data?.error ? String(data.error) : undefined,
    };
  }

  async createWithdraw(params: CreateWithdrawParams): Promise<{ transacao: DivipayTransacao; withdraw: unknown }> {
    return this.invoke<{ transacao: DivipayTransacao; withdraw: unknown }>("createWithdraw", params as Record<string, unknown>);
  }

  async listWithdraws(params?: { limit?: number; offset?: number }): Promise<{ items: DivipaySaque[]; hasMore: boolean }> {
    const data = await this.invoke<unknown>("listWithdraws", params as Record<string, unknown>);
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const rawItems = Array.isArray(data) ? data : (record.data as unknown[]) ?? (record.items as unknown[]) ?? [];

    const items: DivipaySaque[] = rawItems.map((item): DivipaySaque => {
      const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: String(r.id ?? ""),
        name: r.name ? String(r.name) : null,
        document: r.document ? String(r.document) : null,
        description: r.description ? String(r.description) : null,
        type: String(r.type ?? ""),
        amount: this.toNumber(r.amount ?? r.valor ?? 0),
        tax: this.toNumber(r.tax ?? r.taxa ?? 0),
        status: String(r.status ?? ""),
        lote: r.lote ? String(r.lote) : null,
        createdAt: r.createdAt ? String(r.createdAt) : r.created_at ? String(r.created_at) : r.date ? String(r.date) : null,
      };
    });

    const hasMore = !Array.isArray(data) && (record.has_more === true || record.hasMore === true);
    return { items, hasMore };
  }


  async listMovements(params: ListMovementsParams): Promise<ListMovementsResult> {
    const data = await this.invoke<Record<string, unknown>>("listMovements", params as Record<string, unknown>);
    const rawItems = Array.isArray(data) ? data : (data?.data as unknown[]) ?? (data?.items as unknown[]) ?? [];

    const items: DivipayMovement[] = rawItems.map((item): DivipayMovement => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: String(record.id ?? ""),
        transactionCode: String(record.transactionCode ?? record.transaction_code ?? record.code ?? ""),
        date: String(record.date ?? record.createdAt ?? record.created_at ?? ""),
        amount: this.toNumber(record.amount ?? record.valor ?? 0),
        amountLiquid: this.toNumber(record.amountLiquid ?? record.amount_liquid ?? record.liquidAmount ?? 0),
        taxes: this.toNumber(record.taxes ?? record.taxas ?? 0),
        type: String(record.type ?? record.tipo ?? ""),
        status: String(record.status ?? ""),
        description: record.description ? String(record.description) : record.descricao ? String(record.descricao) : record.title ? String(record.title) : null,
        payerName: record.payerName ? String(record.payerName) : record.payer_name ? String(record.payer_name) : null,
      };
    });

    return {
      items,
      nextCursor: data?.nextCursor ? String(data.nextCursor) : data?.next_cursor ? String(data.next_cursor) : null,
      hasMore: data?.hasMore === true || data?.has_more === true,
    };
  }

  async configureWebhook(): Promise<{ success: boolean; message?: string }> {
    return this.invoke<{ success: boolean; message?: string }>("configureWebhook");
  }

  async getConfig(): Promise<DivipayConfig | null> {
    const userId = await this.requireUser();
    const { data, error } = await supabase
      .from("divipay_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error(COMPONENT, "Erro ao carregar configuração Divipay", { error: error.message });
      throw error;
    }

    return data;
  }

  async saveConfig(config: Partial<DivipayConfigInsert> & Pick<DivipayConfigInsert, "client_id" | "client_secret" | "environment">): Promise<DivipayConfig> {
    const userId = await this.requireUser();
    const existing = await this.getConfig();

    const payload: DivipayConfigInsert = {
      user_id: userId,
      client_id: config.client_id,
      client_secret: config.client_secret,
      environment: config.environment,
      is_active: config.is_active ?? true,
      webhook_url: config.webhook_url ?? null,
      access_token: config.access_token ?? null,
      token_expires_at: config.token_expires_at ?? null,
    };

    if (existing) {
      const updatePayload: DivipayConfigUpdate = {
        client_id: config.client_id,
        client_secret: config.client_secret,
        environment: config.environment,
        is_active: config.is_active ?? existing.is_active,
        webhook_url: config.webhook_url ?? existing.webhook_url,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("divipay_config")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        logger.error(COMPONENT, "Erro ao atualizar configuração Divipay", { error: error.message });
        throw error;
      }

      return data;
    }

    const { data, error } = await supabase
      .from("divipay_config")
      .insert(payload)
      .select()
      .single();

    if (error) {
      logger.error(COMPONENT, "Erro ao criar configuração Divipay", { error: error.message });
      throw error;
    }

    return data;
  }

  async getTransacoes(filters?: { type?: string; startDate?: string; endDate?: string }): Promise<DivipayTransacao[]> {
    const userId = await this.requireUser();
    let query = supabase.from("divipay_transacoes").select("*").eq("user_id", userId);

    if (filters?.type) {
      query = query.eq("type", filters.type);
    }
    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      logger.error(COMPONENT, "Erro ao carregar transações Divipay", { error: error.message });
      throw error;
    }

    return data ?? [];
  }

  async getWebhookLogs(limit = 50): Promise<DivipayWebhookLog[]> {
    const { data, error } = await supabase
      .from("divipay_webhook_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(COMPONENT, "Erro ao carregar logs de webhook Divipay", { error: error.message });
      throw error;
    }

    return data ?? [];
  }

  private toNumber(value: unknown): number {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
  }
}

export const divipayService = new DivipayService();
