-- =========================================================================
-- test-ceo-delivery-foundation.sql
-- Bateria de Testes em PostgreSQL Real Isolado para Wallet CEO & Delivery
-- Cobre os 16 Cenários Normativos de Segurança, RLS, Vistas e RPCs
-- =========================================================================
\set ON_ERROR_STOP on

BEGIN;

-- 0. Setup de Infraestrutura Base (auth, users, profiles, workspaces)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true)::json->>'role', ''), 'anon');
$$ LANGUAGE sql STABLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT,
  organization_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'PJ',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  CONSTRAINT uq_workspace_member UNIQUE(workspace_id, user_id)
);

GRANT ALL ON TABLE public.profiles TO authenticated, service_role;
GRANT ALL ON TABLE public.workspaces TO authenticated, service_role;
GRANT ALL ON TABLE public.workspace_members TO authenticated, service_role;

-- 1. Executa a migration de fundação CEO & Delivery
\ir ../supabase/migrations/20261030010000_wallet_ceo_delivery_foundation.sql

-- 2. Setup dos Atores de Teste
DO $$
DECLARE
  v_admin_id UUID := '11111111-1111-1111-1111-111111111111';
  v_staff_id UUID := '22222222-2222-2222-2222-222222222222';
  v_other_id UUID := '33333333-3333-3333-3333-333333333333';
  v_ws1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_ws2_id   UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
  -- Usuários auth
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_id, 'admin@rodopoint.com.br'),
    (v_staff_id, 'staff@rodopoint.com.br'),
    (v_other_id, 'attacker@outraempresa.com.br')
  ON CONFLICT (id) DO NOTHING;

  -- Perfis
  INSERT INTO public.profiles (user_id, name, role) VALUES
    (v_admin_id, 'Administrador Rodo Point', 'admin'),
    (v_staff_id, 'Cozinha Expedição', 'delivery_staff'),
    (v_other_id, 'Usuário de Outro Workspace', 'user')
  ON CONFLICT (user_id) DO NOTHING;

  -- Workspaces
  INSERT INTO public.workspaces (id, user_id, nome, tipo, is_default) VALUES
    (v_ws1_id, v_admin_id, 'Rodo Point Principal', 'PJ', true),
    (v_ws2_id, v_other_id, 'Outro Estabelecimento', 'PJ', true)
  ON CONFLICT (id) DO NOTHING;

  -- Membros
  INSERT INTO public.workspace_members (workspace_id, user_id, role, active) VALUES
    (v_ws1_id, v_admin_id, 'admin', true),
    (v_ws1_id, v_staff_id, 'delivery_staff', true),
    (v_ws2_id, v_other_id, 'admin', true)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END $$;

COMMIT;

-- =========================================================================
-- BATERIA DE CENÁRIOS 1 A 16
-- =========================================================================

-- CENÁRIO 1: Administrador cria canal com credenciais secretas, pedidos e itens com CMV
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ws1_id   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_ch_id    UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_ord_id   UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_it1_id   UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_it2_id   UUID := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
BEGIN
  -- Canal iFood com credenciais confidenciais
  INSERT INTO public.delivery_channels (
    id, workspace_id, channel_name, display_name, is_active, status,
    commission_rate, payment_fee_rate, fixed_fee, config
  ) VALUES (
    v_ch_id, v_ws1_id, 'ifood', 'iFood Loja 1', true, 'active',
    0.2300, 0.0320, 1.50, '{"client_id": "ifood_app_123", "client_secret": "SUPER_CONFIDENTIAL_SECRET"}'::jsonb
  );

  -- Item de cardápio com CMV e margem confidencial
  INSERT INTO public.delivery_catalog_items (
    workspace_id, channel_id, product_name, category, in_store_price, channel_price,
    unit_cost_cmv, packaging_cost, target_margin_percent, is_available
  ) VALUES (
    v_ws1_id, v_ch_id, 'X-Tudo Rodo Point', 'Lanches', 25.00, 32.00,
    10.50, 1.80, 42.00, true
  );

  -- Pedido com dados financeiros
  INSERT INTO public.delivery_orders (
    id, workspace_id, channel_id, channel_name, external_order_id, display_id,
    customer_name, customer_phone, order_status, subtotal, delivery_fee,
    commission_amount, total_amount, estimated_net_payout, estimated_cmv
  ) VALUES (
    v_ord_id, v_ws1_id, v_ch_id, 'ifood', 'ifood-test-101', '#101',
    'Cliente VIP', '11999999999', 'received', 50.00, 5.00,
    11.50, 55.00, 43.50, 15.00
  );

  -- Itens do pedido
  INSERT INTO public.delivery_order_items (
    id, order_id, workspace_id, product_name, quantity, unit_price, total_price, estimated_unit_cost, is_verified_in_kds
  ) VALUES
    (v_it1_id, v_ord_id, v_ws1_id, 'X-Tudo Rodo Point', 1.000, 32.00, 32.00, 10.50, false),
    (v_it2_id, v_ord_id, v_ws1_id, 'Refrigerante Lata', 2.000, 9.00, 18.00, 3.50, false);
END $$;
COMMIT;

-- CENÁRIO 2: Staff operacional NÃO consegue SELECT na tabela base 'delivery_orders' (Zero vazamento)
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.delivery_orders;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 2]: delivery_staff teve acesso à tabela base delivery_orders (linhas retornadas: %)', v_count;
  END IF;
END $$;
COMMIT;

-- CENÁRIO 3: Staff operacional NÃO consegue SELECT na tabela base 'delivery_order_items'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.delivery_order_items;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 3]: delivery_staff teve acesso à tabela base delivery_order_items (linhas retornadas: %)', v_count;
  END IF;
END $$;
COMMIT;

-- CENÁRIO 4: Staff operacional NÃO consegue SELECT na tabela base 'delivery_channels' (Chaves secretas protegidas)
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.delivery_channels;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 4]: delivery_staff teve acesso à tabela base delivery_channels (linhas retornadas: %)', v_count;
  END IF;
END $$;
COMMIT;

-- CENÁRIO 5: Staff operacional NÃO consegue SELECT na tabela base 'delivery_catalog_items' (CMV protegido)
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.delivery_catalog_items;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 5]: delivery_staff teve acesso à tabela base delivery_catalog_items (linhas retornadas: %)', v_count;
  END IF;
END $$;
COMMIT;

-- CENÁRIO 6: Staff operacional CONSEGUE SELECT na view operacional 'v_delivery_orders_operacional'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
  v_row RECORD;
BEGIN
  SELECT count(*) INTO v_count FROM public.v_delivery_orders_operacional;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FALHA OPERACIONAL [CENÁRIO 6]: delivery_staff deveria enxergar 1 pedido na view operacional, mas encontrou %', v_count;
  END IF;

  SELECT * INTO v_row FROM public.v_delivery_orders_operacional LIMIT 1;
  IF v_row.customer_name <> 'Cliente VIP' OR v_row.display_id <> '#101' THEN
    RAISE EXCEPTION 'FALHA OPERACIONAL [CENÁRIO 6]: dados divergentes na view operacional.';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 7: Staff operacional CONSEGUE SELECT na view operacional 'v_delivery_order_items_operacional'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.v_delivery_order_items_operacional;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FALHA OPERACIONAL [CENÁRIO 7]: delivery_staff deveria enxergar 2 itens na view de itens, mas encontrou %', v_count;
  END IF;
END $$;
COMMIT;

-- CENÁRIO 8: Staff operacional é BLOQUEADO ao tentar mutar campos financeiros em 'delivery_orders'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ord_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.delivery_orders
    SET total_amount = 0.00
    WHERE id = v_ord_id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 8]: trigger não bloqueou mutação financeira por delivery_staff!';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 9: Staff operacional é BLOQUEADO ao tentar alterar preços em 'delivery_order_items'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_it1_id UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.delivery_order_items
    SET unit_price = 1.00
    WHERE id = v_it1_id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA [CENÁRIO 9]: trigger não bloqueou mutação de preço de item por delivery_staff!';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 10: Staff operacional CONSEGUE conferir itens via 'rpc_conferir_item_delivery'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_it1_id UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_res JSONB;
  v_verified BOOLEAN;
  v_staff_res UUID;
BEGIN
  v_res := public.rpc_conferir_item_delivery(v_it1_id, true);
  IF NOT (v_res->>'success')::boolean THEN
    RAISE EXCEPTION 'FALHA OPERACIONAL [CENÁRIO 10]: rpc_conferir_item_delivery retornou erro.';
  END IF;

  SELECT is_verified_in_kds, verified_by_user_id INTO v_verified, v_staff_res
  FROM public.delivery_order_items WHERE id = v_it1_id;

  IF NOT v_verified OR v_staff_res <> '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'FALHA DE AUDITORIA [CENÁRIO 10]: operador e timestamp não registrados corretamente.';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 11: Violação cross-workspace de itens é estritamente bloqueada por trigger
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ord_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_ws2_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_failed BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO public.delivery_order_items (
      order_id, workspace_id, product_name, quantity, unit_price, total_price
    ) VALUES (
      v_ord_id, v_ws2_id, 'Item de Outro Workspace', 1.000, 10.00, 10.00
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA DE ISOLAMENTO [CENÁRIO 11]: trigger trg_check_delivery_order_item_workspace não impediu inserção cross-workspace!';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 12: Criação atômica e idempotente via 'rpc_criar_delivery_order_atomico'
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ws1_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_order_json JSONB;
  v_items_json JSONB;
  v_res1 JSONB;
  v_res2 JSONB;
BEGIN
  v_order_json := jsonb_build_object(
    'workspace_id', v_ws1_id,
    'channel_name', 'direto',
    'external_order_id', 'manual-atomic-999',
    'display_id', '#DIR-999',
    'customer_name', 'Cliente Balcão Atômico',
    'subtotal', 40.00,
    'total_amount', 40.00,
    'net_amount', 40.00
  );

  v_items_json := jsonb_build_array(
    jsonb_build_object('product_name', 'Hambúrguer Caseiro', 'quantity', 1, 'unit_price', 30.00, 'total_price', 30.00),
    jsonb_build_object('product_name', 'Suco Natural', 'quantity', 1, 'unit_price', 10.00, 'total_price', 10.00)
  );

  -- 1ª Execução: Inserção com sucesso
  v_res1 := public.rpc_criar_delivery_order_atomico(v_order_json, v_items_json);
  IF NOT (v_res1->>'success')::boolean OR (v_res1->>'is_duplicate')::boolean THEN
    RAISE EXCEPTION 'FALHA [CENÁRIO 12]: rpc_criar_delivery_order_atomico falhou na primeira inserção.';
  END IF;

  -- 2ª Execução: Idempotência garantida (is_duplicate = true)
  v_res2 := public.rpc_criar_delivery_order_atomico(v_order_json, v_items_json);
  IF NOT (v_res2->>'success')::boolean OR NOT (v_res2->>'is_duplicate')::boolean THEN
    RAISE EXCEPTION 'FALHA [CENÁRIO 12]: idempotência não preservada em duplicata do canal.';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 13: Bloqueio de Despacho se houver itens pendentes de conferência
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ord_id UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_it2_id UUID := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_failed BOOLEAN := false;
BEGIN
  -- O item 1 foi conferido no Cenário 10, mas o item 2 continua pendente (is_verified_in_kds = false)
  BEGIN
    PERFORM public.rpc_atualizar_status_delivery_order(v_ord_id, 'dispatched');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'FALHA DE CONTROLE [CENÁRIO 13]: rpc permitiu despachar pedido com itens não-conferidos!';
  END IF;

  -- Confere o item restante
  PERFORM public.rpc_conferir_item_delivery(v_it2_id, true);

  -- Agora o despacho deve ser aceito
  PERFORM public.rpc_atualizar_status_delivery_order(v_ord_id, 'dispatched');
END $$;
COMMIT;

-- CENÁRIO 14: Tabelas do CEO bloqueiam integralmente acesso de delivery_staff
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_opp_count INTEGER;
  v_exp_count INTEGER;
BEGIN
  SELECT count(*) INTO v_opp_count FROM public.wallet_growth_opportunities;
  SELECT count(*) INTO v_exp_count FROM public.wallet_commercial_experiments;

  IF v_opp_count <> 0 OR v_exp_count <> 0 THEN
    RAISE EXCEPTION 'FALHA DE PRIVILÉGIO [CENÁRIO 14]: delivery_staff acessou dados estratégicos do CEO!';
  END IF;
END $$;
COMMIT;

-- CENÁRIO 15: Execução limpa do rollback
\ir ../supabase/migrations/rollback/20261030010000_wallet_ceo_delivery_foundation.down.sql

-- CENÁRIO 16: Verificação de ausência de artefatos órfãos após rollback
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
    'delivery_orders', 'delivery_order_items', 'delivery_channels', 'delivery_catalog_items',
    'wallet_growth_opportunities', 'wallet_commercial_experiments'
  )) THEN
    RAISE EXCEPTION 'FALHA DE ROLLBACK [CENÁRIO 16]: tabelas residuais encontradas após rollback!';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname IN (
    'v_delivery_orders_operacional', 'v_delivery_order_items_operacional',
    'v_delivery_channels_operacional', 'v_delivery_catalog_operacional'
  )) THEN
    RAISE EXCEPTION 'FALHA DE ROLLBACK [CENÁRIO 16]: views residuais encontradas após rollback!';
  END IF;
END $$;

\echo 'BATERIA DE TESTES DE HOMOLOGAÇÃO POSTGRESQL CONCLUÍDA COM SUCESSO (16 CENÁRIOS APROVADOS).'
