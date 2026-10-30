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

  -- Para operadores de delivery: só permite atualizar is_verified_in_kds
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delivery_order_item_financial_mutation ON public.delivery_order_items;
CREATE TRIGGER trg_check_delivery_order_item_financial_mutation
BEFORE UPDATE ON public.delivery_order_items
FOR EACH ROW
EXECUTE FUNCTION public.check_delivery_order_item_financial_mutation();


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

-- 3. delivery_channels: Leitura para equipe operacional; Escrita/Deleção exclusiva admin
CREATE POLICY "delivery_channels_select_op"
  ON public.delivery_channels
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_channels_write_admin"
  ON public.delivery_channels
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 4. delivery_catalog_items: Leitura para equipe operacional; Modificação de preços/custos exclusiva admin
CREATE POLICY "delivery_catalog_items_select_op"
  ON public.delivery_catalog_items
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_catalog_items_write_admin"
  ON public.delivery_catalog_items
  FOR ALL
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- 5. delivery_orders: Leitura operacional; Inserção por admin/integrador; Atualização operacional (protegida por trigger); Deleção exclusiva admin
CREATE POLICY "delivery_orders_select_op"
  ON public.delivery_orders
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_orders_insert_op"
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

-- 6. delivery_order_items: Leitura operacional; Conferência operacional no KDS (protegida por trigger); Deleção exclusiva admin
CREATE POLICY "delivery_order_items_select_op"
  ON public.delivery_order_items
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_operacional_workspace(workspace_id));

CREATE POLICY "delivery_order_items_insert_op"
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

COMMIT;
