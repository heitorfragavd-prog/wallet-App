-- ==============================================================================
-- MIGRATION: 20261030010000_wallet_ceo_delivery_foundation.sql
-- Submódulos: Wallet CEO (Oportunidades & Experimentos) e Wallet Delivery Growth
-- ==============================================================================

BEGIN;

-- 1. TABELA: wallet_growth_opportunities (Wallet CEO)
CREATE TABLE IF NOT EXISTS public.wallet_growth_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN (
    'commercial_growth',
    'operations_loss',
    'profitability',
    'people_productivity',
    'finance',
    'customers_reputation',
    'strategy_lab'
  )),
  title TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  estimated_financial_impact NUMERIC(12, 2) DEFAULT 0.00,
  confidence_score NUMERIC(3, 2) DEFAULT 0.80 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  status TEXT NOT NULL DEFAULT 'identificada' CHECK (status IN ('identificada', 'em_experimento', 'implantada', 'descartada')),
  evidence_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  limitations_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_growth_opp_workspace_dept
  ON public.wallet_growth_opportunities(workspace_id, department, status);

-- 2. TABELA: wallet_commercial_experiments (Laboratório de Crescimento)
CREATE TABLE IF NOT EXISTS public.wallet_commercial_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.wallet_growth_opportunities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  responsible_person TEXT NOT NULL,
  target_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_results JSONB DEFAULT '{}'::jsonb,
  measured_financial_impact NUMERIC(12, 2) DEFAULT 0.00,
  decision TEXT CHECK (decision IN ('manter', 'ampliar', 'ajustar', 'interromper', 'pendente')) DEFAULT 'pendente',
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_experiments_workspace
  ON public.wallet_commercial_experiments(workspace_id, status);

-- 3. TABELA: delivery_channels (Configuração de canais iFood, 99Food, Direto)
CREATE TABLE IF NOT EXISTS public.delivery_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food', 'direto', 'outros')),
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  integration_status TEXT NOT NULL DEFAULT 'simulado' CHECK (integration_status IN (
    'homologado',
    'aguardando_homologacao',
    'nao_autorizado',
    'nao_suportado',
    'simulado',
    'desconectado'
  )),
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  fixed_fee_per_order NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_processing_fee NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  config_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_channel UNIQUE(workspace_id, channel_name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_channels_workspace
  ON public.delivery_channels(workspace_id, is_active);

-- 4. TABELA: delivery_orders (Central de Pedidos e KDS)
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.delivery_channels(id) ON DELETE RESTRICT,
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food', 'direto', 'outros')),
  external_order_id TEXT NOT NULL,
  display_id TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT 'Cliente',
  customer_phone TEXT,
  order_status TEXT NOT NULL DEFAULT 'novo' CHECK (order_status IN ('novo', 'preparando', 'pronto', 'despachado', 'entregue', 'cancelado')),
  order_type TEXT NOT NULL DEFAULT 'delivery' CHECK (order_type IN ('delivery', 'retirada', 'balcao')),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  marketplace_discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  store_discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_net_payout NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_cmv NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  estimated_prep_time_minutes INTEGER DEFAULT 20,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- 5. TABELA: delivery_order_items (Itens de Pedidos com Conferência KDS)
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

-- 6. TABELA: delivery_catalog_items (Catálogo Multicanal & Preços)
CREATE TABLE IF NOT EXISTS public.delivery_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  internal_product_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Geral',
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food', 'direto', 'todos')),
  external_item_id TEXT,
  base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  channel_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  packaging_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  target_margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 35.00,
  is_available BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_catalog_workspace
  ON public.delivery_catalog_items(workspace_id, channel_name, is_available);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.wallet_growth_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_commercial_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_catalog_items ENABLE ROW LEVEL SECURITY;

-- Regra de Acesso Base: Usuário pertence ao workspace
-- Tabela: wallet_growth_opportunities (somente admin/gestor do workspace)
CREATE POLICY "wallet_growth_opportunities_member_access"
  ON public.wallet_growth_opportunities
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

-- Tabela: wallet_commercial_experiments
CREATE POLICY "wallet_commercial_experiments_member_access"
  ON public.wallet_commercial_experiments
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

-- Tabela: delivery_channels
CREATE POLICY "delivery_channels_member_access"
  ON public.delivery_channels
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

-- Tabela: delivery_orders (Acessível operacionalmente por membros do workspace)
CREATE POLICY "delivery_orders_member_access"
  ON public.delivery_orders
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

-- Tabela: delivery_order_items
CREATE POLICY "delivery_order_items_member_access"
  ON public.delivery_order_items
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

-- Tabela: delivery_catalog_items
CREATE POLICY "delivery_catalog_items_member_access"
  ON public.delivery_catalog_items
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT m.workspace_id FROM public.workspace_members m WHERE m.user_id = auth.uid()
    )
  );

COMMIT;
