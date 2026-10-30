import { supabase } from '@/integrations/supabase/client';
import { DeliveryOrder, DeliveryOrderItem, DeliveryOrderStatus } from '../types';

export interface ListOrdersResult {
  data: DeliveryOrder[];
  isConfigured: boolean;
  error?: string;
}

export interface OrderMutationResult {
  success: boolean;
  error?: string;
}

/**
 * Mapeia status do banco para status de domínio
 */
function mapDbStatusToDomain(status?: string): DeliveryOrderStatus {
  const s = String(status || '').toLowerCase();
  if (s === 'novo' || s === 'received') return 'received';
  if (s === 'confirmado' || s === 'confirmed') return 'confirmed';
  if (s === 'preparando' || s === 'preparing') return 'preparing';
  if (s === 'pronto' || s === 'ready') return 'ready';
  if (s === 'despachado' || s === 'dispatched') return 'dispatched';
  if (s === 'entregue' || s === 'delivered') return 'delivered';
  if (s === 'cancelado' || s === 'cancelled') return 'cancelled';
  return 'received';
}

/**
 * Mapeia status de domínio para valor gravado no banco
 */
function mapDomainStatusToDb(status: DeliveryOrderStatus): string {
  return status;
}

export interface ListOrdersOptions {
  isStaff?: boolean;
  operationalOnly?: boolean;
}

export class DeliveryOrderRepository {
  /**
   * Consulta pedidos operacionais diretamente das views protegidas (v_delivery_orders_operacional),
   * garantindo que nenhum valor financeiro (subtotal, taxas, repasses, CMV) seja entregue ao navegador do operador.
   */
  static async listOperationalOrders(workspaceId: string): Promise<ListOrdersResult> {
    if (!workspaceId) {
      return { data: [], isConfigured: true };
    }

    try {
      const { data: opOrders, error: opErr } = await supabase
        .from('v_delivery_orders_operacional')
        .select(`
          id,
          workspace_id,
          channel_id,
          channel_name,
          external_order_id,
          display_id,
          customer_name,
          customer_phone,
          delivery_address,
          order_status,
          order_type,
          payment_method,
          payment_status,
          notes,
          kds_notes,
          is_demo,
          preparation_started_at,
          prepared_at,
          dispatched_at,
          delivered_at,
          cancelled_at,
          cancellation_reason,
          placed_at,
          created_at,
          updated_at
        `)
        .eq('workspace_id', workspaceId)
        .order('placed_at', { ascending: false });

      if (opErr) {
        if (opErr.code === '42P01' || opErr.message?.includes('does not exist')) {
          return { data: [], isConfigured: false, error: 'View v_delivery_orders_operacional não migrada no banco de dados.' };
        }
        return { data: [], isConfigured: true, error: opErr.message };
      }

      const orderIds = (opOrders || []).map((o: Record<string, unknown>) => String(o.id));
      const itemsByOrderId: Record<string, DeliveryOrderItem[]> = {};

      if (orderIds.length > 0) {
        const { data: opItems, error: itemsErr } = await supabase
          .from('v_delivery_order_items_operacional')
          .select('id, order_id, product_name, quantity, observations, is_verified_in_kds, options')
          .in('order_id', orderIds);

        if (!itemsErr && opItems) {
          opItems.forEach((it: Record<string, unknown>) => {
            const ordId = String(it.order_id);
            if (!itemsByOrderId[ordId]) itemsByOrderId[ordId] = [];
            itemsByOrderId[ordId].push({
              id: String(it.id),
              order_id: ordId,
              name: String(it.product_name || 'Item'),
              quantity: Number(it.quantity || 1),
              unit_price: 0,
              total_price: 0,
              notes: it.observations ? String(it.observations) : null,
              checked: Boolean(it.is_verified_in_kds),
              is_verified_in_kds: Boolean(it.is_verified_in_kds),
              options: Array.isArray(it.options) ? it.options : [],
            });
          });
        }
      }

      const mappedOpOrders: DeliveryOrder[] = (opOrders || []).map((raw: Record<string, unknown>) => ({
        id: String(raw.id),
        workspace_id: String(raw.workspace_id),
        channel_id: String(raw.channel_id || raw.channel_name || 'direto'),
        channel_order_id: String(raw.external_order_id || ''),
        display_id: String(raw.display_id || ''),
        customer_name: String(raw.customer_name || 'Cliente'),
        customer_phone: raw.customer_phone ? String(raw.customer_phone) : null,
        delivery_address: raw.delivery_address ? String(raw.delivery_address) : null,
        subtotal: 0,
        discount: 0,
        delivery_fee: 0,
        commission_amount: 0,
        net_amount: 0,
        status: mapDbStatusToDomain(String(raw.order_status || '')),
        payment_method: 'marketplace_online',
        payment_status: 'paid',
        notes: raw.notes ? String(raw.notes) : null,
        kds_notes: raw.kds_notes ? String(raw.kds_notes) : null,
        is_demo: Boolean(raw.is_demo),
        preparation_started_at: raw.preparation_started_at ? String(raw.preparation_started_at) : null,
        ready_at: raw.prepared_at ? String(raw.prepared_at) : null,
        dispatched_at: raw.dispatched_at ? String(raw.dispatched_at) : null,
        delivered_at: raw.delivered_at ? String(raw.delivered_at) : null,
        cancelled_at: raw.cancelled_at ? String(raw.cancelled_at) : null,
        cancellation_reason: raw.cancellation_reason ? String(raw.cancellation_reason) : null,
        created_at: String(raw.placed_at || raw.created_at || new Date().toISOString()),
        updated_at: String(raw.updated_at || new Date().toISOString()),
        items: itemsByOrderId[String(raw.id)] || [],
      }));

      return { data: mappedOpOrders, isConfigured: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { data: [], isConfigured: true, error: errorMsg };
    }
  }

  /**
   * Consulta pedidos do workspace ativo persistidos no banco de dados.
   * Funcionários utilizam diretamente as views operacionais (zero vazamento financeiro).
   * Administradores utilizam a tabela gerencial completa.
   */
  static async listOrders(workspaceId: string, options?: ListOrdersOptions): Promise<ListOrdersResult> {
    if (!workspaceId) {
      return { data: [], isConfigured: true };
    }

    // 1. Se explicitamente solicitado como operacional / staff, usa diretamente a view operacional
    if (options?.isStaff === true || options?.operationalOnly === true) {
      return this.listOperationalOrders(workspaceId);
    }

    // 2. Se opções não foram passadas, verifica papel do usuário autenticado no workspace/profile
    if (options === undefined) {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: member } = await supabase
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', workspaceId)
            .eq('user_id', authData.user.id)
            .maybeSingle();

          if (member?.role === 'delivery_staff') {
            return this.listOperationalOrders(workspaceId);
          }

          if (!member) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', authData.user.id)
              .maybeSingle();

            if (profile?.role === 'delivery_staff') {
              return this.listOperationalOrders(workspaceId);
            }
          }
        }
      } catch {
        // Ignora erro de auth e segue para consulta padrão de administrador
      }
    }

    try {
      const { data: rawOrders, error } = await supabase
        .from('delivery_orders')
        .select(`
          id,
          workspace_id,
          channel_id,
          channel_name,
          external_order_id,
          display_id,
          customer_name,
          customer_phone,
          delivery_address,
          order_status,
          order_type,
          subtotal,
          delivery_fee,
          store_discount,
          marketplace_discount,
          total_amount,
          commission_amount,
          estimated_net_payout,
          notes,
          kds_notes,
          is_demo,
          preparation_started_at,
          prepared_at,
          dispatched_at,
          delivered_at,
          cancelled_at,
          cancellation_reason,
          placed_at,
          created_at,
          updated_at,
          delivery_order_items (
            id,
            product_name,
            quantity,
            unit_price,
            total_price,
            observations,
            is_verified_in_kds,
            options
          )
        `)
        .eq('workspace_id', workspaceId)
        .order('placed_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return { data: [], isConfigured: false, error: 'Tabela delivery_orders não migrada no banco de dados.' };
        }

        // Se o erro for de permissão (ex: delivery_staff tentando consultar tabela base restrita),
        // redireciona para a view operacional
        if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('violates row-level security')) {
          return this.listOperationalOrders(workspaceId);
        }

        return { data: [], isConfigured: true, error: error.message };
      }

      if (!rawOrders) {
        return { data: [], isConfigured: true };
      }

      const orders: DeliveryOrder[] = (rawOrders as Record<string, unknown>[]).map((raw) => {
        const rawItems = ((raw.delivery_order_items || []) as Record<string, unknown>[]);
        const items: DeliveryOrderItem[] = rawItems.map((it) => ({
          id: String(it.id),
          order_id: String(raw.id),
          name: String(it.product_name || 'Item'),
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          total_price: Number(it.total_price || 0),
          notes: it.observations ? String(it.observations) : null,
          checked: Boolean(it.is_verified_in_kds),
          is_verified_in_kds: Boolean(it.is_verified_in_kds),
        }));

        return {
          id: String(raw.id),
          workspace_id: String(raw.workspace_id),
          channel_id: String(raw.channel_id || raw.channel_name || 'direto'),
          channel_order_id: String(raw.external_order_id || ''),
          display_id: String(raw.display_id || ''),
          customer_name: String(raw.customer_name || 'Cliente'),
          customer_phone: raw.customer_phone ? String(raw.customer_phone) : null,
          delivery_address: raw.delivery_address ? String(raw.delivery_address) : null,
          subtotal: Number(raw.subtotal || 0),
          discount: Number(raw.store_discount || 0) + Number(raw.marketplace_discount || 0),
          delivery_fee: Number(raw.delivery_fee || 0),
          commission_amount: Number(raw.commission_amount || 0),
          net_amount: Number(raw.estimated_net_payout || 0),
          status: mapDbStatusToDomain(String(raw.order_status || '')),
          payment_method: 'marketplace_online',
          payment_status: 'paid',
          notes: raw.notes ? String(raw.notes) : null,
          preparation_started_at: raw.preparation_started_at ? String(raw.preparation_started_at) : null,
          ready_at: raw.prepared_at ? String(raw.prepared_at) : null,
          dispatched_at: raw.dispatched_at ? String(raw.dispatched_at) : null,
          delivered_at: raw.delivered_at ? String(raw.delivered_at) : null,
          cancelled_at: raw.cancelled_at ? String(raw.cancelled_at) : null,
          cancellation_reason: raw.cancellation_reason ? String(raw.cancellation_reason) : null,
          created_at: String(raw.placed_at || raw.created_at || new Date().toISOString()),
          updated_at: String(raw.updated_at || new Date().toISOString()),
          items,
        };
      });

      return { data: orders, isConfigured: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { data: [], isConfigured: false, error: errorMsg || 'Erro inesperado ao consultar pedidos.' };
    }
  }

  /**
   * Atualiza status operacional do pedido no KDS (idempotente e sem mutação de valores financeiros)
   */
  static async updateOrderStatus(
    orderId: string,
    nextStatus: DeliveryOrderStatus,
    kdsNotes?: string
  ): Promise<OrderMutationResult> {
    try {
      // 1. Tenta executar via RPC atômica que valida conferência de itens no despacho
      if (typeof supabase.rpc === 'function') {
        const { error: rpcErr } = await supabase.rpc('rpc_atualizar_status_delivery_order', {
          p_order_id: orderId,
          p_novo_status: mapDomainStatusToDb(nextStatus),
          p_kds_notes: kdsNotes || null,
        });

        if (!rpcErr) {
          return { success: true };
        }

        // Se o erro for de validação de negócio (ex: Bloqueio de Expedição), propaga diretamente
        if (rpcErr.message && rpcErr.message.includes('Bloqueio de Expedição')) {
          return { success: false, error: rpcErr.message };
        }
        // Se a função não existir (42883) ou não for mockada, faz fallback para update direto
        if (rpcErr.code !== '42883') {
          return { success: false, error: rpcErr.message };
        }
      }

      // 2. Fallback direto para tabela base (protegido por trigger no banco)
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        order_status: mapDomainStatusToDb(nextStatus),
        updated_at: now,
      };

      if (kdsNotes) {
        updates.kds_notes = kdsNotes;
      }

      if (nextStatus === 'preparing') {
        updates.preparation_started_at = now;
      } else if (nextStatus === 'ready') {
        updates.prepared_at = now;
      } else if (nextStatus === 'dispatched') {
        updates.dispatched_at = now;
      } else if (nextStatus === 'delivered') {
        updates.delivered_at = now;
      } else if (nextStatus === 'cancelled') {
        updates.cancelled_at = now;
      }

      const { error } = await supabase
        .from('delivery_orders')
        .update(updates)
        .eq('id', orderId);

      if (error) {
        if (error.code === '42P01') {
          return { success: false, error: 'Ambiente não migrado.' };
        }
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg || 'Erro ao atualizar status do pedido.' };
    }
  }

  /**
   * Atualiza status de conferência de um item do KDS
   */
  static async updateItemVerification(
    itemId: string,
    isVerified: boolean
  ): Promise<OrderMutationResult> {
    try {
      if (typeof supabase.rpc === 'function') {
        const { error: rpcErr } = await supabase.rpc('rpc_conferir_item_delivery', {
          p_item_id: itemId,
          p_is_verified: isVerified,
        });

        if (!rpcErr) {
          return { success: true };
        }
        if (rpcErr.code !== '42883') {
          return { success: false, error: rpcErr.message };
        }
      }

      const { error } = await supabase
        .from('delivery_order_items')
        .update({
          is_verified_in_kds: isVerified,
          verified_at: isVerified ? new Date().toISOString() : null,
        })
        .eq('id', itemId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg || 'Erro ao conferir item.' };
    }
  }

  /**
   * Insere um novo pedido real no banco de dados com seus itens, garantindo integridade de workspace
   */
  static async createOrder(order: DeliveryOrder): Promise<OrderMutationResult> {
    try {
      const isUuid = (val?: string) =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

      const channelName = order.channel_id.includes('ifood')
        ? 'ifood'
        : order.channel_id.includes('99')
        ? '99food'
        : 'direto';

      const orderPayload = {
        id: isUuid(order.id) ? order.id : undefined,
        workspace_id: order.workspace_id,
        channel_id: isUuid(order.channel_id) ? order.channel_id : undefined,
        channel_name: channelName,
        external_order_id: order.channel_order_id,
        display_id: order.display_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_address: order.delivery_address,
        order_status: mapDomainStatusToDb(order.status),
        order_type: 'delivery',
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        store_discount: order.discount,
        commission_amount: order.commission_amount,
        total_amount: order.subtotal + order.delivery_fee - order.discount,
        estimated_net_payout: order.net_amount,
        notes: order.notes,
        kds_notes: order.kds_notes,
        is_demo: Boolean(order.is_demo),
        placed_at: order.created_at,
      };

      const itemsPayload = (order.items || []).map((it) => ({
        id: isUuid(it.id) ? it.id : undefined,
        product_name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        observations: it.notes,
        is_verified_in_kds: Boolean(it.checked),
        options: it.options || [],
      }));

      // Criação estritamente atômica via RPC autorizada (sem fallback sequencial que possa gerar pedidos parciais)
      if (typeof supabase.rpc !== 'function') {
        return {
          success: false,
          error: 'Configuração inválida: cliente Supabase sem suporte a RPC atômica (rpc_criar_delivery_order_atomico).',
        };
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_criar_delivery_order_atomico', {
        p_order: orderPayload,
        p_items: itemsPayload,
      });

      if (rpcErr) {
        if (rpcErr.code === '42883') {
          return {
            success: false,
            error: 'Função rpc_criar_delivery_order_atomico não migrada no banco de dados.',
          };
        }
        return { success: false, error: rpcErr.message };
      }

      const res = rpcData as { success: boolean; is_duplicate?: boolean; message?: string; order_id?: string };
      if (!res?.success) {
        return { success: false, error: res?.message || 'Falha na criação atômica do pedido.' };
      }

      if (res.is_duplicate) {
        return { success: false, error: res.message || 'Pedido duplicado.' };
      }

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg || 'Erro ao criar pedido.' };
    }
  }

  /**
   * Salva um pedido verificando prevenção de duplicidade por canal + external_order_id
   */
  static async saveOrder(order: Partial<DeliveryOrder> & {
    workspace_id: string;
    channel_id: string;
    channel_order_id: string;
  }): Promise<{ success: boolean; isDuplicate?: boolean; orderId?: string; error?: string }> {
    try {
      const { data: existing } = await supabase
        .from('delivery_orders')
        .select('id')
        .eq('workspace_id', order.workspace_id)
        .eq('channel_id', order.channel_id)
        .eq('external_order_id', order.channel_order_id)
        .maybeSingle();

      if (existing) {
        return {
          success: false,
          isDuplicate: true,
          orderId: existing.id,
          error: `O pedido ${order.channel_order_id} já foi importado neste workspace.`,
        };
      }

      const res = await this.createOrder({
        id: order.id || `ord-${Date.now()}`,
        workspace_id: order.workspace_id,
        channel_id: order.channel_id,
        channel_order_id: order.channel_order_id,
        display_id: order.display_id || `#${order.channel_order_id.slice(-4)}`,
        customer_name: order.customer_name || 'Cliente',
        customer_phone: order.customer_phone || undefined,
        delivery_address: order.delivery_address || undefined,
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount || order.discount_amount || 0),
        delivery_fee: Number(order.delivery_fee || 0),
        commission_amount: Number(order.commission_amount || 0),
        net_amount: Number(order.net_amount || 0),
        status: order.status || 'received',
        payment_method: order.payment_method || 'marketplace_online',
        payment_status: order.payment_status || 'paid',
        notes: order.notes || undefined,
        created_at: order.created_at || new Date().toISOString(),
        items: order.items || [],
      });

      return {
        success: res.success,
        isDuplicate: false,
        error: res.error,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg || 'Erro ao persistir pedido.' };
    }
  }

  /**
   * Assina atualizações em tempo real no Supabase Realtime para a esteira do KDS
   */
  static subscribeToOrders(
    workspaceId: string,
    onOrdersChange: () => void
  ): () => void {
    if (!workspaceId) return () => {};

    try {
      const channel = supabase
        .channel(`kds-orders-${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'delivery_orders',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            onOrdersChange();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel).catch(() => {});
      };
    } catch {
      return () => {};
    }
  }
}
