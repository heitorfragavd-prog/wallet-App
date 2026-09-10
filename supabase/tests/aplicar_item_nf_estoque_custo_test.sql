-- =========================================================================
-- SUITE DE TESTES POSTGRESQL 17: aplicar_item_nf_estoque_custo
-- Arquivo: supabase/tests/aplicar_item_nf_estoque_custo_test.sql
-- =========================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Garante roles de teste se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

-- Setup de IDs de teste
\set user_a '\'00000000-0000-0000-0000-000000000001\''
\set ws_a   '\'00000000-0000-0000-0000-000000000002\''
\set user_b '\'00000000-0000-0000-0000-000000000003\''
\set ws_b   '\'00000000-0000-0000-0000-000000000004\''

-- Limpeza e isolamento de fixtures
DELETE FROM public.historico_custo_produto WHERE workspace_id IN (:ws_a, :ws_b);
DELETE FROM public.nf_itens WHERE nf_id IN (SELECT id FROM public.notas_fiscais_compra WHERE workspace_id IN (:ws_a, :ws_b));
DELETE FROM public.notas_fiscais_compra WHERE workspace_id IN (:ws_a, :ws_b);
DELETE FROM public.produto_equivalencias WHERE workspace_id IN (:ws_a, :ws_b);
DELETE FROM public.produtos_eyemobile WHERE workspace_id IN (:ws_a, :ws_b);

-- -------------------------------------------------------------------------
-- 1. TESTE DE PERMISSÕES DE EXECUTE (P0)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
BEGIN
  -- Test anon
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.aplicar_item_nf_estoque_custo(
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      10, 5.0, 1
    );
    RAISE EXCEPTION 'FALHA: anon conseguiu executar RPC!';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- Test authenticated
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.aplicar_item_nf_estoque_custo(
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      10, 5.0, 1
    );
    RAISE EXCEPTION 'FALHA: authenticated conseguiu executar RPC!';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  -- Test service_role
  BEGIN
    SET LOCAL ROLE service_role;
    v_res := public.aplicar_item_nf_estoque_custo(
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      '00000000-0000-0000-0000-000000000010'::uuid,
      10, 5.0, 1
    );
    RESET ROLE;
    IF (v_res->>'code') IS NULL THEN
      RAISE EXCEPTION 'FALHA: service_role não recebeu resposta json válida!';
    END IF;
  END;
END $$;

-- -------------------------------------------------------------------------
-- SETUP DE DADOS BASE
-- -------------------------------------------------------------------------
INSERT INTO public.workspaces (id, user_id, nome)
VALUES (:ws_a, :user_a, 'Workspace Teste A')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.produtos_eyemobile (
  id, user_id, workspace_id, eyemobile_id, codigo, descricao, estoque_atual, custo_atual
) VALUES (
  '10000000-0000-0000-0000-000000000001', :user_a, :ws_a, 'EYE-100', 'SKU-100', 'Produto Base', 10, 5.00
);

INSERT INTO public.notas_fiscais_compra (
  id, user_id, workspace_id, fornecedor, cnpj_fornecedor, status
) VALUES (
  '20000000-0000-0000-0000-000000000001', :user_a, :ws_a, 'Fornecedor Teste', '12345678000190', 'pendente'
);

INSERT INTO public.nf_itens (
  id, nf_id, codigo_produto, descricao, quantidade, valor_unitario, status_estoque
) VALUES (
  '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'FORN-100', 'Item NF Teste', 2, 48.00, 'pendente'
);

INSERT INTO public.produto_equivalencias (
  id, user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
  produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
) VALUES (
  '40000000-0000-0000-0000-000000000001', :user_a, :ws_a, '12345678000190', 'FORN-100',
  '10000000-0000-0000-0000-000000000001', 12, true
);

-- -------------------------------------------------------------------------
-- 2. TESTE DE VALIDAÇÃO DE PARÂMETROS (Fail-Closed)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    0, 4.0, 12
  );
  ASSERT (v_res->>'code' = 'invalid_parameters'), 'Quantidade 0 deve retornar invalid_parameters';

  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, -1.0, 12
  );
  ASSERT (v_res->>'code' = 'invalid_parameters'), 'Custo negativo deve retornar invalid_parameters';

  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, NULL
  );
  ASSERT (v_res->>'code' = 'invalid_parameters'), 'Fator esperado NULL deve retornar invalid_parameters';
END $$;

-- -------------------------------------------------------------------------
-- 3. TESTE ANTI-TOCTOU DO FATOR DE CONVERSÃO
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
  v_est numeric;
BEGIN
  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, 6
  );
  ASSERT (v_res->>'code' = 'equivalence_changed'), 'Divergência de fator deve retornar equivalence_changed';

  SELECT estoque_atual INTO v_est FROM public.produtos_eyemobile WHERE id = '10000000-0000-0000-0000-000000000001';
  ASSERT (v_est = 10), 'Estoque não pode ter sido modificado após equivalence_changed';
END $$;

-- -------------------------------------------------------------------------
-- 4. TESTE DE PROCESSAMENTO COM SUCESSO
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
  v_est numeric;
  v_custo numeric;
  v_status text;
  v_hist_count integer;
BEGIN
  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, 12
  );
  ASSERT (v_res->>'success' = 'true' AND v_res->>'code' = 'processed'), 'Processamento válido deve retornar processed';

  SELECT estoque_atual, custo_atual INTO v_est, v_custo FROM public.produtos_eyemobile WHERE id = '10000000-0000-0000-0000-000000000001';
  ASSERT (v_est = 34), 'Estoque deve incrementar de 10 para 34 (10 + 24)';
  ASSERT (v_custo = 4.0), 'Custo deve atualizar para 4.0';

  SELECT status_estoque INTO v_status FROM public.nf_itens WHERE id = '30000000-0000-0000-0000-000000000001';
  ASSERT (v_status = 'processado'), 'status_estoque do item deve ser processado';

  SELECT count(*) INTO v_hist_count FROM public.historico_custo_produto WHERE produto_eyemobile_uuid = '10000000-0000-0000-0000-000000000001';
  ASSERT (v_hist_count = 1), 'Exatamente 1 registro deve ser inserido em historico_custo_produto';
END $$;

-- -------------------------------------------------------------------------
-- 5. TESTE DE IDEMPOTÊNCIA (processado e legado atualizado)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
  v_est numeric;
BEGIN
  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, 12
  );
  ASSERT (v_res->>'success' = 'true' AND v_res->>'code' = 'already_processed'), 'Item processado deve retornar already_processed';

  UPDATE public.nf_itens SET status_estoque = 'atualizado' WHERE id = '30000000-0000-0000-0000-000000000001';
  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, 12
  );
  ASSERT (v_res->>'success' = 'true' AND v_res->>'code' = 'already_processed'), 'Item legado atualizado deve retornar already_processed';

  SELECT estoque_atual INTO v_est FROM public.produtos_eyemobile WHERE id = '10000000-0000-0000-0000-000000000001';
  ASSERT (v_est = 34), 'Estoque não pode duplicar ao reprocessar';
END $$;

-- -------------------------------------------------------------------------
-- 6. TESTE DE ISOLAMENTO CROSS-TENANT
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_res jsonb;
BEGIN
  -- Reseta status do item para pendente para testar validação de tenant
  UPDATE public.nf_itens SET status_estoque = 'pendente' WHERE id = '30000000-0000-0000-0000-000000000001';

  v_res := public.aplicar_item_nf_estoque_custo(
    '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000099',
    '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    24, 4.0, 12
  );
  ASSERT (v_res->>'success' = 'false' AND v_res->>'code' = 'tenant_mismatch'), 'Tenant divergente deve retornar tenant_mismatch';
END $$;

ROLLBACK;
