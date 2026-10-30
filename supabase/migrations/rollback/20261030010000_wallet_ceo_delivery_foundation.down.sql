-- ==============================================================================
-- ROLLBACK: 20261030010000_wallet_ceo_delivery_foundation.down.sql
-- ==============================================================================

BEGIN;

-- 0. Remoção de RPCs e Views Operacionais
DROP FUNCTION IF EXISTS public.rpc_despachar_pedido_kds(uuid);
DROP FUNCTION IF EXISTS public.rpc_atualizar_status_delivery_order(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_conferir_item_delivery(uuid, boolean);
DROP FUNCTION IF EXISTS public.rpc_criar_delivery_order_atomico(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.rpc_listar_pedidos_kds(uuid);

DROP VIEW IF EXISTS public.v_delivery_catalog_operacional CASCADE;
DROP VIEW IF EXISTS public.v_delivery_channels_operacional CASCADE;
DROP VIEW IF EXISTS public.v_delivery_order_items_operacional CASCADE;
DROP VIEW IF EXISTS public.v_delivery_orders_operacional CASCADE;

-- 1. Remoção de Tabelas e Políticas (com CASCADE para limpar dependências de RLS)
DROP POLICY IF EXISTS "delivery_order_items_delete_admin" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_update_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_insert_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_select_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_member_access" ON public.delivery_order_items;
DROP TABLE IF EXISTS public.delivery_order_items CASCADE;

DROP POLICY IF EXISTS "delivery_orders_delete_admin" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_update_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_insert_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_select_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_member_access" ON public.delivery_orders;
DROP TABLE IF EXISTS public.delivery_orders CASCADE;

DROP POLICY IF EXISTS "delivery_catalog_items_write_admin" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_catalog_items_select_op" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_catalog_items_member_access" ON public.delivery_catalog_items;
DROP TABLE IF EXISTS public.delivery_catalog_items CASCADE;

DROP POLICY IF EXISTS "delivery_channels_write_admin" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_channels_select_op" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_channels_member_access" ON public.delivery_channels;
DROP TABLE IF EXISTS public.delivery_channels CASCADE;

DROP POLICY IF EXISTS "wallet_commercial_experiments_admin_all" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_member_access" ON public.wallet_commercial_experiments;
DROP TABLE IF EXISTS public.wallet_commercial_experiments CASCADE;

DROP POLICY IF EXISTS "wallet_growth_opportunities_admin_all" ON public.wallet_growth_opportunities;
DROP POLICY IF EXISTS "wallet_growth_opportunities_member_access" ON public.wallet_growth_opportunities;
DROP TABLE IF EXISTS public.wallet_growth_opportunities CASCADE;

-- 2. Remoção de Triggers e Funções Auxiliares (CASCADE seguro)
DROP TRIGGER IF EXISTS trg_check_delivery_order_dispatch_checklist ON public.delivery_orders;
DROP TRIGGER IF EXISTS trg_check_delivery_order_item_workspace ON public.delivery_order_items;
DROP TRIGGER IF EXISTS trg_check_delivery_order_financial_mutation ON public.delivery_orders;
DROP TRIGGER IF EXISTS trg_check_delivery_order_item_financial_mutation ON public.delivery_order_items;

DROP FUNCTION IF EXISTS public.check_delivery_order_dispatch_checklist() CASCADE;
DROP FUNCTION IF EXISTS public.check_delivery_order_item_workspace() CASCADE;
DROP FUNCTION IF EXISTS public.check_delivery_order_financial_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.check_delivery_order_item_financial_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.tem_acesso_operacional_workspace(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tem_acesso_admin_workspace(uuid) CASCADE;

-- 3. Restauração das constraints históricas de perfil se necessário
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_role_check') THEN
    ALTER TABLE public.workspace_members DROP CONSTRAINT workspace_members_role_check;
    ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'member'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

COMMIT;
