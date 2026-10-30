-- ==============================================================================
-- MIGRATION: 20261030010000_wallet_ceo_delivery_foundation.sql
-- Submódulos: Wallet CEO (Oportunidades & Experimentos) e Wallet Delivery Growth
-- Controle Granular de Acesso, Isolamento de Funcionários e Integridade de Workspace
-- ==============================================================================

BEGIN;

-- 0. AJUSTE DE CONSTRAINTS HISTÓRICAS PARA SUPORTE SEGURO A 'delivery_staff'
-- Permite que usuários com função operacional de cozinha e entrega existam sem violar constraints históricas
DO $$
BEGIN
  -- Em profiles:
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'delivery_staff'));

  -- Em workspace_members:
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_role_check'
  ) THEN
    ALTER TABLE public.workspace_members DROP CONSTRAINT workspace_members_role_check;
  END IF;
  ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('admin', 'member', 'delivery_staff'));
EXCEPTION
  WHEN undefined_table THEN
    -- Se tabelas não existirem no ambiente isolado inicial
    NULL;
END $$;

-- 1. FUNÇÕES AUXILIARES DE AUTORIZAÇÃO (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.tem_acesso_admin_workspace(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      p_workspace_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = p_workspace_id AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = p_workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active = true
            AND wm.role = 'admin'
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso_admin_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso_admin_workspace(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tem_acesso_operacional_workspace(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      p_workspace_id IS NOT NULL
      AND (
        public.tem_acesso_admin_workspace(p_workspace_id)
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = p_workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active = true
            AND wm.role IN ('member', 'delivery_staff')
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso_operacional_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso_operacional_workspace(uuid) TO authenticated, service_role;


-- 2. TABELA: wallet_growth_opportunities (Wallet CEO)
CREATE TABLE IF NOT EXISTS public.wallet_growth_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN (
    'commercial_growth',
    'operations_loss',
    'loss_waste',
    'profitability',
    'cmv_pricing',
    'people_productivity',
    'staff_productivity',
    'finance',
    'finance_margins',
    'customers_reputation',
    'strategy_lab',
    'growth_lab',
    'delivery_channels'
  )),
  title TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  estimated_financial_impact NUMERIC(12, 2) DEFAULT 0.00,
  confidence_score NUMERIC(3, 2) DEFAULT 0.80 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  status TEXT NOT NULL DEFAULT 'identificada' CHECK (status IN ('identificada', 'detected', 'em_experimento', 'implantada', 'descartada')),
  evidence_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  limitations_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_growth_opp_workspace_dept
  ON public.wallet_growth_opportunities(workspace_id, department, status);


-- 3. TABELA: wallet_commercial_experiments (Laboratório de Crescimento)
CREATE TABLE IF NOT EXISTS public.wallet_commercial_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.wallet_growth_opportunities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  department TEXT DEFAULT 'commercial_growth',
  target_kpi TEXT,
  baseline_value TEXT,
  current_value TEXT,
  target_value TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  responsible_person TEXT NOT NULL DEFAULT 'Gestão Rodo Point',
  target_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_results JSONB DEFAULT '{}'::jsonb,
  measured_financial_impact NUMERIC(12, 2) DEFAULT 0.00,
  decision TEXT CHECK (decision IN ('manter', 'ampliar', 'ajustar', 'interromper', 'pendente')) DEFAULT 'pendente',
  decision_rationale TEXT,
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'planned', 'em_andamento', 'active', 'concluido', 'completed', 'cancelado', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_experiments_workspace_status
  ON public.wallet_commercial_experiments(workspace_id, status);


-- 4. TABELA: delivery_channels (Canais de Entrega: iFood, 99Food, Direto)
CREATE TABLE IF NOT EXISTS public.delivery_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food', 'direto', 'whatsapp', 'outros')),
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_auth' CHECK (status IN ('active', 'inactive', 'pending_auth', 'error')),
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  payment_fee_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  fixed_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  auto_accept_orders BOOLEAN NOT NULL DEFAULT false,
  connection_state TEXT NOT NULL DEFAULT 'not_configured' CHECK (connection_state IN (
    'not_configured',
    'credentials_present_unverified',
    'authenticating',
    'authenticated',
    'awaiting_homologation',
    'homologated',
    'disconnected',
    'error'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_channel UNIQUE(workspace_id, channel_name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_channels_workspace
  ON public.delivery_channels(workspace_id, is_active);


-- 5. TABELA: delivery_orders (Central de Pedidos e KDS)
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.delivery_channels(id) ON DELETE RESTRICT,
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food', 'direto', 'whatsapp', 'outros')),
  external_order_id TEXT NOT NULL,
  display_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT 'Cliente',
  customer_phone TEXT,
  delivery_address TEXT,
  order_status TEXT NOT NULL DEFAULT 'received' CHECK (order_status IN (
    'novo', 'preparando', 'pronto', 'despachado', 'entregue', 'cancelado',
    'received', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'
  )),
  order_type TEXT NOT NULL DEFAULT 'delivery' CHECK (order_type IN ('delivery', 'retirada', 'balcao')),
  payment_method TEXT DEFAULT 'marketplace_online',
  payment_status TEXT DEFAULT 'paid',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  marketplace_discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  store_discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  commission_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_net_payout NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_cmv NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_prep_time_minutes INTEGER DEFAULT 20,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  preparation_started_at TIMESTAMPTZ,
  prepared_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  notes TEXT,
  kds_notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_channel_order UNIQUE(workspace_id, channel_name, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_kds
  ON public.delivery_orders(workspace_id, order_status, placed_at DESC);


-- 6. TABELA: delivery_order_items (Itens de Pedidos com Conferência KDS)
CREATE TABLE IF NOT EXISTS public.delivery_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1.000,
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  estimated_unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  options JSONB DEFAULT '[]'::jsonb,
  observations TEXT,
  is_verified_in_kds BOOLEAN NOT NULL DEFAULT false,
  verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_order
  ON public.delivery_order_items(order_id, workspace_id);


-- 7. TABELA: delivery_catalog_items (Simulador de Precificação e Cardápio)
CREATE TABLE IF NOT EXISTS public.delivery_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.delivery_channels(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  category TEXT DEFAULT 'Geral',
  in_store_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  channel_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  unit_cost_cmv NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  packaging_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  target_margin_percent NUMERIC(5, 2) DEFAULT 40.00,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_catalog_item UNIQUE(workspace_id, product_name, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_catalog_workspace
  ON public.delivery_catalog_items(workspace_id, is_available);

-- 7. CONCESSÃO DE PERMISSÕES BASE (GRANT) PARA authenticated E service_role
-- Permite que o runtime autenticado acesse as tabelas, sendo governado pelas políticas de RLS e triggers
GRANT ALL ON TABLE public.wallet_growth_opportunities TO authenticated, service_role;
GRANT ALL ON TABLE public.wallet_commercial_experiments TO authenticated, service_role;
GRANT ALL ON TABLE public.delivery_channels TO authenticated, service_role;
GRANT ALL ON TABLE public.delivery_orders TO authenticated, service_role;
GRANT ALL ON TABLE public.delivery_order_items TO authenticated, service_role;
GRANT ALL ON TABLE public.delivery_catalog_items TO authenticated, service_role;


-- ==============================================================================
-- 8. INTEGRIDADE ENTRE WORKSPACES E PROTEÇÃO CONTRA ADULTERAÇÃO (TRIGGERS)
-- ==============================================================================

-- A. Garante que um item de pedido pertença rigorosamente ao mesmo workspace do pedido
CREATE OR REPLACE FUNCTION public.check_delivery_order_item_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_order_workspace_id
  FROM public.delivery_orders
  WHERE id = NEW.order_id;

  IF v_order_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pedido referenciado (%) não encontrado para o item.', NEW.order_id;
  END IF;

  IF NEW.workspace_id <> v_order_workspace_id THEN
    RAISE EXCEPTION 'Violação de isolamento: item (ws: %) não coincide com o pedido (ws: %)', NEW.workspace_id, v_order_workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delivery_order_item_workspace ON public.delivery_order_items;
CREATE TRIGGER trg_check_delivery_order_item_workspace
BEFORE INSERT OR UPDATE ON public.delivery_order_items
FOR EACH ROW
EXECUTE FUNCTION public.check_delivery_order_item_workspace();

-- B. Impede que funcionários operacionais alterem dados financeiros ou canais de pedidos
CREATE OR REPLACE FUNCTION public.check_delivery_order_financial_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Permite se for service_role ou admin do workspace
  IF coalesce(auth.role() = 'service_role', false) OR public.tem_acesso_admin_workspace(NEW.workspace_id) THEN
    RETURN NEW;
  END IF;

  -- Se for delivery_staff/operador: impede alteração de valores financeiros, descontos ou workspace
  IF NEW.subtotal <> OLD.subtotal
     OR NEW.delivery_fee <> OLD.delivery_fee
     OR NEW.marketplace_discount <> OLD.marketplace_discount
     OR NEW.store_discount <> OLD.store_discount
     OR NEW.total_amount <> OLD.total_amount
     OR NEW.estimated_net_payout <> OLD.estimated_net_payout
     OR NEW.estimated_cmv <> OLD.estimated_cmv
     OR NEW.estimated_margin <> OLD.estimated_margin
     OR NEW.commission_amount <> OLD.commission_amount
     OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.workspace_id <> OLD.workspace_id
  THEN
    RAISE EXCEPTION 'Acesso negado: operador de delivery não tem permissão para alterar valores financeiros de pedidos.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delivery_order_financial_mutation ON public.delivery_orders;
CREATE TRIGGER trg_check_delivery_order_financial_mutation
BEFORE UPDATE ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.check_delivery_order_financial_mutation();

-- C. Impede que funcionários operacionais alterem preços ou custos de itens no KDS
CREATE OR REPLACE FUNCTION public.check_delivery_order_item_financial_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Permite se for service_role ou admin do workspace
  IF coalesce(auth.role() = 'service_role', false) OR public.tem_acesso_admin_workspace(NEW.workspace_id) THEN
    RETURN NEW;
  END IF;

  -- Se for delivery_staff/operador: só permite atualizar is_verified_in_kds
  IF NEW.unit_price <> OLD.unit_price
     OR NEW.total_price <> OLD.total_price
     OR NEW.estimated_unit_cost <> OLD.estimated_unit_cost
     OR NEW.product_name <> OLD.product_name
     OR NEW.quantity <> OLD.quantity
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.order_id <> OLD.order_id
  THEN
    RAISE EXCEPTION 'Acesso negado: operador de delivery só tem permissão para conferir itens no KDS.';
  END IF;

  -- Se estiver alterando is_verified_in_kds, registra operador e timestamp automaticamente
  IF NEW.is_verified_in_kds IS DISTINCT FROM OLD.is_verified_in_kds THEN
    IF NEW.is_verified_in_kds = true THEN
      NEW.verified_by_user_id := coalesce(auth.uid(), NEW.verified_by_user_id);
      NEW.verified_at := clock_timestamp();
    ELSE
      NEW.verified_by_user_id := NULL;
      NEW.verified_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delivery_order_item_financial_mutation ON public.delivery_order_items;
CREATE TRIGGER trg_check_delivery_order_item_financial_mutation
BEFORE UPDATE ON public.delivery_order_items
FOR EACH ROW
EXECUTE FUNCTION public.check_delivery_order_item_financial_mutation();

-- D. Impede despacho ou marcação como entregue de pedidos com itens pendentes de conferência (qualquer canal/RPC/PostgREST)
CREATE OR REPLACE FUNCTION public.check_delivery_order_dispatch_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unverified_count integer;
BEGIN
  -- Se o status está sendo alterado para 'dispatched' ou 'delivered'
  IF NEW.order_status IN ('dispatched', 'despachado', 'delivered', 'entregue') 
     AND (OLD.order_status IS NULL OR OLD.order_status NOT IN ('dispatched', 'despachado', 'delivered', 'entregue'))
  THEN
    SELECT count(*)
    INTO v_unverified_count
    FROM public.delivery_order_items
    WHERE order_id = NEW.id
      AND is_verified_in_kds = false;

    IF v_unverified_count > 0 THEN
      RAISE EXCEPTION 'Não é permitido despachar pedido com itens pendentes de conferência (itens não conferidos: %)', v_unverified_count;
    END IF;

    IF NEW.order_status IN ('dispatched', 'despachado') AND NEW.dispatched_at IS NULL THEN
      NEW.dispatched_at := clock_timestamp();
    END IF;
    IF NEW.order_status IN ('delivered', 'entregue') AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := clock_timestamp();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delivery_order_dispatch_checklist ON public.delivery_orders;
CREATE TRIGGER trg_check_delivery_order_dispatch_checklist
BEFORE INSERT OR UPDATE OF order_status ON public.delivery_orders
FOR EACH ROW
EXECUTE FUNCTION public.check_delivery_order_dispatch_checklist();


-- ==============================================================================
-- 9. POLÍTICAS DE ROW LEVEL SECURITY (RLS) RIGOROSAS
-- ==============================================================================

ALTER TABLE public.wallet_growth_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_commercial_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_catalog_items ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes
DROP POLICY IF EXISTS "wallet_growth_opportunities_admin_all" ON public.wallet_growth_opportunities;
DROP POLICY IF EXISTS "wallet_growth_opportunities_member_access" ON public.wallet_growth_opportunities;
DROP POLICY IF EXISTS "wallet_commercial_experiments_admin_all" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_member_access" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "delivery_channels_select_op" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_channels_write_admin" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_channels_member_access" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_catalog_items_select_op" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_catalog_items_write_admin" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_catalog_items_member_access" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_orders_select_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_insert_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_update_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_delete_admin" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_member_access" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_order_items_select_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_insert_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_update_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_delete_admin" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_member_access" ON public.delivery_order_items;

-- 1. wallet_growth_opportunities: EXCLUSIVO ADMIN / PROPRIETÁRIO (Zero acesso para delivery_staff)
CREATE POLICY "wallet_growth_opportunities_admin_all"
  ON public.wallet_growth_opportunities
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 2. wallet_commercial_experiments: EXCLUSIVO ADMIN / PROPRIETÁRIO (Zero acesso para delivery_staff)
CREATE POLICY "wallet_commercial_experiments_admin_all"
  ON public.wallet_commercial_experiments
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 3. delivery_channels: TABELA BASE EXCLUSIVA ADMIN (Zero vazamento de credenciais e taxas contratuais)
DROP POLICY IF EXISTS "delivery_channels_select_op" ON public.delivery_channels;
DROP POLICY IF EXISTS "delivery_channels_select_admin" ON public.delivery_channels;
CREATE POLICY "delivery_channels_select_admin"
  ON public.delivery_channels
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

CREATE POLICY "delivery_channels_write_admin"
  ON public.delivery_channels
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 4. delivery_catalog_items: TABELA BASE EXCLUSIVA ADMIN (Zero vazamento de CMV e margens de produto)
DROP POLICY IF EXISTS "delivery_catalog_items_select_op" ON public.delivery_catalog_items;
DROP POLICY IF EXISTS "delivery_catalog_items_select_admin" ON public.delivery_catalog_items;
CREATE POLICY "delivery_catalog_items_select_admin"
  ON public.delivery_catalog_items
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

CREATE POLICY "delivery_catalog_items_write_admin"
  ON public.delivery_catalog_items
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 5. delivery_orders: TABELA BASE EXCLUSIVA ADMIN (Zero vazamento de repasses, CMV e subtotal)
DROP POLICY IF EXISTS "delivery_orders_select_op" ON public.delivery_orders;
DROP POLICY IF EXISTS "delivery_orders_select_admin" ON public.delivery_orders;
CREATE POLICY "delivery_orders_select_admin"
  ON public.delivery_orders
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

CREATE POLICY "delivery_orders_insert_admin"
  ON public.delivery_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.tem_acesso_admin_workspace(workspace_id)
    OR coalesce(auth.role() = 'service_role', false)
  );

CREATE POLICY "delivery_orders_update_op"
  ON public.delivery_orders
  FOR UPDATE
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_orders_delete_admin"
  ON public.delivery_orders
  FOR DELETE
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

-- 6. delivery_order_items: TABELA BASE EXCLUSIVA ADMIN (Zero vazamento de preços unitários e CMV)
DROP POLICY IF EXISTS "delivery_order_items_select_op" ON public.delivery_order_items;
DROP POLICY IF EXISTS "delivery_order_items_select_admin" ON public.delivery_order_items;
CREATE POLICY "delivery_order_items_select_admin"
  ON public.delivery_order_items
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

CREATE POLICY "delivery_order_items_insert_admin"
  ON public.delivery_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.tem_acesso_admin_workspace(workspace_id)
    OR coalesce(auth.role() = 'service_role', false)
  );

CREATE POLICY "delivery_order_items_update_op"
  ON public.delivery_order_items
  FOR UPDATE
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_order_items_delete_admin"
  ON public.delivery_order_items
  FOR DELETE
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));


-- ==============================================================================
-- 10. VIEWS OPERACIONAIS DEDICADAS (SECURITY BARRIER — ZERO DADOS FINANCEIROS)
-- ==============================================================================

-- A. View Operacional de Pedidos KDS (Oculta subtotal, taxas, repasses, CMV e payloads)
DROP VIEW IF EXISTS public.v_delivery_orders_operacional CASCADE;
CREATE VIEW public.v_delivery_orders_operacional
WITH (security_barrier = true) AS
SELECT
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
  estimated_prep_time_minutes,
  placed_at,
  preparation_started_at,
  prepared_at,
  dispatched_at,
  delivered_at,
  cancelled_at,
  cancellation_reason,
  notes,
  kds_notes,
  is_demo,
  created_at,
  updated_at
FROM public.delivery_orders
WHERE public.tem_acesso_operacional_workspace(workspace_id);

GRANT SELECT ON public.v_delivery_orders_operacional TO authenticated, service_role;

-- B. View Operacional de Itens de Pedido KDS (Oculta unit_price, total_price e estimated_unit_cost)
DROP VIEW IF EXISTS public.v_delivery_order_items_operacional CASCADE;
CREATE VIEW public.v_delivery_order_items_operacional
WITH (security_barrier = true) AS
SELECT
  id,
  order_id,
  workspace_id,
  product_name,
  quantity,
  options,
  observations,
  is_verified_in_kds,
  verified_by_user_id,
  verified_at,
  created_at
FROM public.delivery_order_items
WHERE public.tem_acesso_operacional_workspace(workspace_id);

GRANT SELECT ON public.v_delivery_order_items_operacional TO authenticated, service_role;

-- C. View Operacional de Canais (Oculta config/chaves secretas, comissões contratuais e taxas)
DROP VIEW IF EXISTS public.v_delivery_channels_operacional CASCADE;
CREATE VIEW public.v_delivery_channels_operacional
WITH (security_barrier = true) AS
SELECT
  id,
  workspace_id,
  channel_name,
  display_name,
  is_active,
  status,
  connection_state,
  auto_accept_orders,
  created_at,
  updated_at
FROM public.delivery_channels
WHERE public.tem_acesso_operacional_workspace(workspace_id);

GRANT SELECT ON public.v_delivery_channels_operacional TO authenticated, service_role;

-- D. View Operacional de Cardápio/Catálogo (Oculta in_store_price, channel_price, unit_cost_cmv e margens)
DROP VIEW IF EXISTS public.v_delivery_catalog_operacional CASCADE;
CREATE VIEW public.v_delivery_catalog_operacional
WITH (security_barrier = true) AS
SELECT
  id,
  workspace_id,
  channel_id,
  product_name,
  category,
  is_available,
  created_at,
  updated_at
FROM public.delivery_catalog_items
WHERE public.tem_acesso_operacional_workspace(workspace_id);

GRANT SELECT ON public.v_delivery_catalog_operacional TO authenticated, service_role;


-- ==============================================================================
-- 11. RPCS TRANSACIONAIS ATÔMICAS E SEGURAS (OPERACIONAL & INTEGRADOR)
-- ==============================================================================

-- A. rpc_listar_pedidos_kds: Lista pedidos operacionais ativos e itens conferidos sem vazamento financeiro
CREATE OR REPLACE FUNCTION public.rpc_listar_pedidos_kds(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.tem_acesso_operacional_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado ao workspace %', p_workspace_id;
  END IF;

  SELECT coalesce(jsonb_agg(o_row ORDER BY o_row->>'placed_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id', o.id,
        'workspace_id', o.workspace_id,
        'channel_id', o.channel_id,
        'channel_name', o.channel_name,
        'external_order_id', o.external_order_id,
        'display_id', o.display_id,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'delivery_address', o.delivery_address,
        'order_status', o.order_status,
        'order_type', o.order_type,
        'payment_method', o.payment_method,
        'payment_status', o.payment_status,
        'estimated_prep_time_minutes', o.estimated_prep_time_minutes,
        'placed_at', o.placed_at,
        'preparation_started_at', o.preparation_started_at,
        'prepared_at', o.prepared_at,
        'dispatched_at', o.dispatched_at,
        'delivered_at', o.delivered_at,
        'cancelled_at', o.cancelled_at,
        'cancellation_reason', o.cancellation_reason,
        'notes', o.notes,
        'kds_notes', o.kds_notes,
        'is_demo', o.is_demo,
        'created_at', o.created_at,
        'updated_at', o.updated_at,
        'delivery_order_items', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'order_id', i.order_id,
              'workspace_id', i.workspace_id,
              'product_name', i.product_name,
              'quantity', i.quantity,
              'options', i.options,
              'observations', i.observations,
              'is_verified_in_kds', i.is_verified_in_kds,
              'verified_by_user_id', i.verified_by_user_id,
              'verified_at', i.verified_at,
              'created_at', i.created_at
            )
            ORDER BY i.created_at ASC
          )
          FROM public.delivery_order_items i
          WHERE i.order_id = o.id
        ), '[]'::jsonb)
      ) AS o_row
    FROM public.delivery_orders o
    WHERE o.workspace_id = p_workspace_id
      AND o.order_status NOT IN ('delivered', 'cancelled')
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_listar_pedidos_kds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_listar_pedidos_kds(uuid) TO authenticated, service_role;

-- B. rpc_criar_delivery_order_atomico: Criação atômica em transação única com idempotência por canal
CREATE OR REPLACE FUNCTION public.rpc_criar_delivery_order_atomico(
  p_order jsonb,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id uuid;
  v_channel_id uuid;
  v_channel_name text;
  v_external_order_id text;
  v_order_id uuid;
  v_existing_order_id uuid;
  v_item jsonb;
BEGIN
  v_workspace_id := (p_order->>'workspace_id')::uuid;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id obrigatório para criar pedido.';
  END IF;

  -- Valida privilégio de administrador ou service_role
  IF NOT (coalesce(auth.role() = 'service_role', false) OR public.tem_acesso_admin_workspace(v_workspace_id)) THEN
    RAISE EXCEPTION 'Acesso negado: criação de pedidos requer privilégio de administrador ou integrador.';
  END IF;

  v_channel_name := coalesce(p_order->>'channel_name', 'direto');
  v_external_order_id := coalesce(p_order->>'external_order_id', p_order->>'channel_order_id', 'ext-' || gen_random_uuid()::text);

  -- Resolução de channel_id
  IF p_order->>'channel_id' IS NOT NULL AND (p_order->>'channel_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_channel_id := (p_order->>'channel_id')::uuid;
  ELSE
    SELECT id INTO v_channel_id
    FROM public.delivery_channels
    WHERE workspace_id = v_workspace_id AND channel_name = v_channel_name
    LIMIT 1;
  END IF;

  -- Prevenção de duplicidade por canal (Idempotência)
  SELECT id INTO v_existing_order_id
  FROM public.delivery_orders
  WHERE workspace_id = v_workspace_id
    AND channel_name = v_channel_name
    AND external_order_id = v_external_order_id;

  IF v_existing_order_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'order_id', v_existing_order_id,
      'message', 'Pedido já existente (idempotência preservada).'
    );
  END IF;

  -- ID canônico UUID
  IF p_order->>'id' IS NOT NULL AND (p_order->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_order_id := (p_order->>'id')::uuid;
  ELSE
    v_order_id := gen_random_uuid();
  END IF;

  -- Inserção atômica do cabeçalho
  INSERT INTO public.delivery_orders (
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
    subtotal,
    delivery_fee,
    marketplace_discount,
    store_discount,
    commission_amount,
    total_amount,
    estimated_net_payout,
    estimated_cmv,
    estimated_margin,
    notes,
    kds_notes,
    is_demo,
    placed_at
  ) VALUES (
    v_order_id,
    v_workspace_id,
    v_channel_id,
    v_channel_name,
    v_external_order_id,
    coalesce(p_order->>'display_id', '#' || right(v_external_order_id, 4)),
    coalesce(p_order->>'customer_name', 'Cliente'),
    p_order->>'customer_phone',
    p_order->>'delivery_address',
    coalesce(p_order->>'order_status', p_order->>'status', 'received'),
    coalesce(p_order->>'order_type', 'delivery'),
    coalesce(p_order->>'payment_method', 'marketplace_online'),
    coalesce(p_order->>'payment_status', 'paid'),
    coalesce((p_order->>'subtotal')::numeric, 0.00),
    coalesce((p_order->>'delivery_fee')::numeric, 0.00),
    coalesce((p_order->>'marketplace_discount')::numeric, 0.00),
    coalesce((p_order->>'store_discount')::numeric, coalesce((p_order->>'discount')::numeric, 0.00)),
    coalesce((p_order->>'commission_amount')::numeric, 0.00),
    coalesce((p_order->>'total_amount')::numeric, 0.00),
    coalesce((p_order->>'estimated_net_payout')::numeric, coalesce((p_order->>'net_amount')::numeric, 0.00)),
    coalesce((p_order->>'estimated_cmv')::numeric, 0.00),
    coalesce((p_order->>'estimated_margin')::numeric, 0.00),
    p_order->>'notes',
    p_order->>'kds_notes',
    coalesce((p_order->>'is_demo')::boolean, false),
    coalesce((p_order->>'placed_at')::timestamptz, (p_order->>'created_at')::timestamptz, now())
  );

  -- Inserção atômica dos itens
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.delivery_order_items (
        id,
        order_id,
        workspace_id,
        product_name,
        quantity,
        unit_price,
        total_price,
        estimated_unit_cost,
        options,
        observations,
        is_verified_in_kds
      ) VALUES (
        CASE
          WHEN (v_item->>'id') IS NOT NULL AND (v_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (v_item->>'id')::uuid
          ELSE gen_random_uuid()
        END,
        v_order_id,
        v_workspace_id,
        coalesce(v_item->>'product_name', v_item->>'name', 'Item'),
        coalesce((v_item->>'quantity')::numeric, 1.000),
        coalesce((v_item->>'unit_price')::numeric, 0.00),
        coalesce((v_item->>'total_price')::numeric, 0.00),
        coalesce((v_item->>'estimated_unit_cost')::numeric, 0.00),
        coalesce(v_item->'options', '[]'::jsonb),
        coalesce(v_item->>'observations', v_item->>'notes'),
        coalesce((v_item->>'is_verified_in_kds')::boolean, coalesce((v_item->>'checked')::boolean, false))
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_duplicate', false,
    'order_id', v_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_criar_delivery_order_atomico(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_criar_delivery_order_atomico(jsonb, jsonb) TO authenticated, service_role;

-- C. rpc_conferir_item_delivery: Registro de operador e timestamp na conferência do KDS
CREATE OR REPLACE FUNCTION public.rpc_conferir_item_delivery(
  p_item_id uuid,
  p_is_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id uuid;
  v_order_id uuid;
  v_rows_updated integer;
BEGIN
  SELECT workspace_id, order_id INTO v_workspace_id, v_order_id
  FROM public.delivery_order_items
  WHERE id = p_item_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Item de pedido % não encontrado.', p_item_id;
  END IF;

  IF NOT public.tem_acesso_operacional_workspace(v_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: operador não possui autorização no workspace %', v_workspace_id;
  END IF;

  UPDATE public.delivery_order_items
  SET
    is_verified_in_kds = p_is_verified,
    verified_by_user_id = CASE WHEN p_is_verified THEN auth.uid() ELSE NULL END,
    verified_at = CASE WHEN p_is_verified THEN now() ELSE NULL END
  WHERE id = p_item_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'Falha ao atualizar conferência do item % (linhas afetadas: %)', p_item_id, v_rows_updated;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'order_id', v_order_id,
    'is_verified', p_is_verified,
    'verified_by_user_id', CASE WHEN p_is_verified THEN auth.uid() ELSE NULL END,
    'verified_at', CASE WHEN p_is_verified THEN now() ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_conferir_item_delivery(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_conferir_item_delivery(uuid, boolean) TO authenticated, service_role;

-- D. rpc_atualizar_status_delivery_order: Transição de status KDS com bloqueio de despacho de itens não-conferidos
CREATE OR REPLACE FUNCTION public.rpc_atualizar_status_delivery_order(
  p_order_id uuid,
  p_novo_status text,
  p_kds_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id uuid;
  v_current_status text;
  v_unverified_count integer;
  v_rows_updated integer;
  v_now timestamptz := now();
BEGIN
  SELECT workspace_id, order_status INTO v_workspace_id, v_current_status
  FROM public.delivery_orders
  WHERE id = p_order_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado.', p_order_id;
  END IF;

  IF NOT public.tem_acesso_operacional_workspace(v_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: operador não possui permissão no workspace %', v_workspace_id;
  END IF;

  -- Bloqueio de Despacho (Gate E): Se o novo status for 'dispatched' ou 'delivered', exige conferência total
  IF p_novo_status IN ('dispatched', 'despachado', 'delivered', 'entregue') THEN
    SELECT count(*) INTO v_unverified_count
    FROM public.delivery_order_items
    WHERE order_id = p_order_id
      AND is_verified_in_kds = false;

    IF v_unverified_count > 0 THEN
      RAISE EXCEPTION 'Bloqueio de Expedição: pedido % possui % item(ns) pendente(s) de conferência.', p_order_id, v_unverified_count;
    END IF;
  END IF;

  UPDATE public.delivery_orders
  SET
    order_status = p_novo_status,
    kds_notes = coalesce(p_kds_notes, kds_notes),
    updated_at = v_now,
    preparation_started_at = CASE
      WHEN p_novo_status IN ('preparing', 'preparando') AND preparation_started_at IS NULL THEN v_now
      ELSE preparation_started_at
    END,
    prepared_at = CASE
      WHEN p_novo_status IN ('ready', 'pronto') AND prepared_at IS NULL THEN v_now
      ELSE prepared_at
    END,
    dispatched_at = CASE
      WHEN p_novo_status IN ('dispatched', 'despachado') AND dispatched_at IS NULL THEN v_now
      ELSE dispatched_at
    END,
    delivered_at = CASE
      WHEN p_novo_status IN ('delivered', 'entregue') AND delivered_at IS NULL THEN v_now
      ELSE delivered_at
    END,
    cancelled_at = CASE
      WHEN p_novo_status IN ('cancelled', 'cancelado') AND cancelled_at IS NULL THEN v_now
      ELSE cancelled_at
    END
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'Falha ao atualizar pedido % (linhas afetadas: %)', p_order_id, v_rows_updated;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', v_current_status,
    'new_status', p_novo_status,
    'updated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_atualizar_status_delivery_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_atualizar_status_delivery_order(uuid, text, text) TO authenticated, service_role;

-- E. rpc_despachar_pedido_kds: Helper de despacho com verificação prévia
CREATE OR REPLACE FUNCTION public.rpc_despachar_pedido_kds(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.rpc_atualizar_status_delivery_order(p_order_id, 'dispatched', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_despachar_pedido_kds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_despachar_pedido_kds(uuid) TO authenticated, service_role;

COMMIT;
