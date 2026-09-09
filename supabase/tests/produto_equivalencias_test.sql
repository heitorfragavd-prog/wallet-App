-- ============================================================
-- WALLET APP — Correção de Integridade de Produtos — Fase 1: pgTAP Schema Test Suite (Hardened & Complete)
-- Test File: supabase/tests/produto_equivalencias_test.sql
-- Total Asserts: 46
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(46);

-- ─── 1. VERIFICAÇÃO DE ESTRUTURA (11 ASSERTS) ─────────────────
select has_table('public', 'produto_equivalencias', 'Tabela produto_equivalencias existe');
select col_not_null('public', 'produto_equivalencias', 'user_id', 'user_id é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'workspace_id', 'workspace_id é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'cnpj_fornecedor_normalizado', 'cnpj_fornecedor_normalizado é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'codigo_produto_fornecedor', 'codigo_produto_fornecedor é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'produto_eyemobile_uuid', 'produto_eyemobile_uuid é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'fator_conversao', 'fator_conversao é NOT NULL');
select col_default('public', 'produto_equivalencias', 'fator_conversao', null, 'fator_conversao NÃO tem valor DEFAULT (exige informação explícita)');
select col_default('public', 'produto_equivalencias', 'confirmado_por_usuario', 'false', 'confirmado_por_usuario tem DEFAULT false (fail-safe)');

select col_has_check('public', 'produto_equivalencias', 'fator_conversao', 'fator_conversao possui CHECK');
select col_has_check('public', 'produto_equivalencias', 'cnpj_fornecedor_normalizado', 'cnpj_fornecedor_normalizado possui CHECK de dígitos');

-- ─── 2. VERIFICAÇÃO DE HISTORICO_CUSTO_PRODUTO (2 ASSERTS) ────
select has_column('public', 'historico_custo_produto', 'produto_eyemobile_uuid', 'historico_custo_produto possui coluna produto_eyemobile_uuid');
select col_is_null('public', 'historico_custo_produto', 'produto_eyemobile_uuid', 'produto_eyemobile_uuid é nullable para compatibilidade legada');

-- ─── 3. ÍNDICES E UNICIDADE (2 ASSERTS) ───────────────────────
select has_index('public', 'produto_equivalencias', 'unq_produto_equivalencia_fornecedor', 'Possui constraint UNIQUE para workspace + cnpj + codigo');
select has_index('public', 'produto_equivalencias', 'idx_produto_equivalencias_reverso', 'Possui índice reverso (workspace_id, produto_eyemobile_uuid)');

-- ─── 4. GATILHOS E RLS STATUS (4 ASSERTS) ─────────────────────
select has_trigger('public', 'produto_equivalencias', 'trg_produto_equivalencias_updated_at', 'Trigger de updated_at existe');
select has_trigger('public', 'produto_equivalencias', 'trg_validar_produto_equivalencia_tenant', 'Trigger de validação multi-tenant de equivalências existe');
select has_trigger('public', 'historico_custo_produto', 'trg_validar_historico_custo_produto_tenant', 'Trigger de validação multi-tenant de histórico de custo existe');
select table_is_rls_active('public', 'produto_equivalencias', 'RLS está ativo em produto_equivalencias');

-- ─── 5. SETUP DE DADOS PARA TESTES FUNCIONAIS ─────────────────
insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com', 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com', 'authenticated', 'authenticated', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'admin-member@example.com', 'authenticated', 'authenticated', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.com', 'authenticated', 'authenticated', now(), now());

insert into public.workspaces (id, user_id, nome, tipo)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Workspace A', 'bar'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Workspace B', 'bar'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Workspace C (User 2)', 'bar');

-- Membro admin no Workspace A
insert into public.workspace_members (workspace_id, user_id, role, active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'admin', true);

insert into public.produtos_eyemobile (id, user_id, workspace_id, eyemobile_id, codigo, descricao, preco_venda, estoque_atual)
values
  ('eeeeeeee-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eye-1', 'SKU-001', 'Cerveja Lata 350ml', 8.00, 100),
  ('eeeeeeee-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eye-2', 'SKU-002', 'Vinho Garrafa 750ml', 45.00, 20),
  ('eeeeeeee-0003-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'eye-3', 'SKU-003', 'Whisky 1L', 120.00, 10);

-- ─── 6. TESTES DE INVARIANTES DO SCHEMA (CENÁRIOS A A N) (15 ASSERTS) ──
-- 20. Cenário A: Cria equivalência válida
select lives_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    fornecedor_nome, descricao_fornecedor, unidade_fornecedor,
    produto_eyemobile_uuid, fator_conversao, origem_matching
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-100',
    'Distribuidora Ambev', 'Cerveja Lata CX 12', 'CX',
    'eeeeeeee-0001-0000-0000-000000000001', 12.000000, 'sugestao_ia'
  );
  $$,
  'Cenário A: Cria equivalência válida com sucesso'
);

-- 21. Cenário A (default confirmado_por_usuario): deve ser false
select is(
  (
    select confirmado_por_usuario
    from public.produto_equivalencias
    where codigo_produto_fornecedor = 'PROD-FORN-100'
  ),
  false,
  'confirmado_por_usuario é false por default quando não especificado'
);

-- 22. Cenário B: Unicidade (mesmo workspace + CNPJ + codigo) deve falhar
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-100',
    'eeeeeeee-0001-0000-0000-000000000001', 6.000000
  );
  $$,
  '23505',
  null,
  'Cenário B: Rejeita duplicidade de chave (workspace + cnpj + codigo)'
);

-- 23. Cenário C: mesmo código de fornecedor em CNPJs diferentes é permitido
select lives_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '98765432000111', 'PROD-FORN-100',
    'eeeeeeee-0001-0000-0000-000000000001', 6.000000, true
  );
  $$,
  'Cenário C: Mesmo código em CNPJs diferentes é permitido'
);

-- 24. Cenário D: mesma chave fornecedor/código em workspaces diferentes é permitida
select lives_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
  ) values (
    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '12345678000190', 'PROD-FORN-100',
    'eeeeeeee-0002-0000-0000-000000000002', 12.000000, true
  );
  $$,
  'Cenário D: Mesma equivalência em workspaces diferentes é permitida'
);

-- 25. Cenário E: fator_conversao = 0 deve falhar
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-ZERO',
    'eeeeeeee-0001-0000-0000-000000000001', 0
  );
  $$,
  '23514',
  null,
  'Cenário E: Rejeita fator_conversao = 0'
);

-- 26. Cenário F: fator_conversao negativo deve falhar
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-NEG',
    'eeeeeeee-0001-0000-0000-000000000001', -5.0
  );
  $$,
  '23514',
  null,
  'Cenário F: Rejeita fator_conversao negativo'
);

-- 27. Cenário G: CNPJ com caracteres não numéricos deve falhar
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12.345.678/0001-90', 'PROD-FORN-300',
    'eeeeeeee-0001-0000-0000-000000000001', 1.0
  );
  $$,
  '23514',
  null,
  'Cenário G: Rejeita CNPJ com caracteres não numéricos'
);

-- 28. Cenário H: produto_eyemobile_uuid inexistente é rejeitado por FK
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-FK-ERR',
    '99999999-9999-9999-9999-999999999999', 1.0
  );
  $$,
  '23503',
  null,
  'Cenário H: FK rejeita produto_eyemobile_uuid inexistente'
);

-- 29. Cenário I: Cross-Workspace mismatch deve ser barrado pelo trigger
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', -- Workspace B
    '12345678000190', 'PROD-FORN-400',
    'eeeeeeee-0001-0000-0000-000000000001', -- Produto pertence ao Workspace A!
    1.0
  );
  $$,
  null,
  '%Workspace mismatch%',
  'Cenário I: Trigger rejeita vínculo com produto de outro workspace'
);

-- 30. Cenário J: Cross-User mismatch deve ser barrado pelo trigger
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-500',
    'eeeeeeee-0003-0000-0000-000000000003', -- Produto pertence ao User 2 / Workspace C!
    1.0
  );
  $$,
  null,
  '%Workspace mismatch%',
  'Cenário J: Trigger rejeita vínculo com produto de outro tenant/user'
);

-- 31. Cenário K: historico_custo_produto com produto_eyemobile_uuid válido
select lives_ok(
  $$
  insert into public.historico_custo_produto (
    user_id, workspace_id, produto_codigo, produto_descricao, custo_unitario,
    produto_eyemobile_uuid
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'PROD-FORN-100', 'Cerveja Lata', 3.50,
    'eeeeeeee-0001-0000-0000-000000000001'
  );
  $$,
  'Cenário K: historico_custo_produto aceita produto_eyemobile_uuid válido'
);

-- 32. Cenário L: historico_custo_produto legado aceita produto_eyemobile_uuid NULL
select lives_ok(
  $$
  insert into public.historico_custo_produto (
    user_id, workspace_id, produto_codigo, produto_descricao, custo_unitario,
    produto_eyemobile_uuid
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'LEGADO-SEM-UUID', 'Item Antigo', 10.00,
    null
  );
  $$,
  'Cenário L: historico_custo_produto legado aceita produto_eyemobile_uuid NULL'
);

-- 33. Cenário M: historico_custo_produto cross-workspace é rejeitado pelo trigger
select throws_ok(
  $$
  insert into public.historico_custo_produto (
    user_id, workspace_id, produto_codigo, produto_descricao, custo_unitario,
    produto_eyemobile_uuid
  ) values (
    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', -- Workspace B
    'PROD-FORN-100', 'Cerveja Lata', 3.50,
    'eeeeeeee-0001-0000-0000-000000000001' -- Produto do Workspace A!
  );
  $$,
  null,
  '%Workspace mismatch%',
  'Cenário M: historico_custo_produto rejeita produto de outro workspace'
);

-- 34. Cenário N: historico_custo_produto cross-user é rejeitado pelo trigger
select throws_ok(
  $$
  insert into public.historico_custo_produto (
    user_id, workspace_id, produto_codigo, produto_descricao, custo_unitario,
    produto_eyemobile_uuid
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'PROD-FORN-100', 'Whisky', 120.00,
    'eeeeeeee-0003-0000-0000-000000000003' -- Produto do User 2 / Workspace C!
  );
  $$,
  null,
  '%Workspace mismatch%',
  'Cenário N: historico_custo_produto rejeita produto de outro usuário'
);

-- ─── 7. TESTES REAIS DE RLS (12 ASSERTS) ──────────────────────
-- Contexto A: OWNER (user 1)
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- 35. Owner SELECT
select results_eq(
  $$select count(*)::bigint from public.produto_equivalencias where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values (2::bigint)$$,
  'RLS: Owner consegue SELECT nas equivalências do seu workspace'
);

-- 36. Owner INSERT
select lives_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'RLS-OWNER-TEMP',
    'eeeeeeee-0001-0000-0000-000000000001', 1.0, true
  );
  $$,
  'RLS: Owner consegue INSERT no seu workspace'
);

-- 37. Owner UPDATE
select lives_ok(
  $$
  update public.produto_equivalencias
  set descricao_fornecedor = 'Atualizado pelo Owner'
  where codigo_produto_fornecedor = 'RLS-OWNER-TEMP';
  $$,
  'RLS: Owner consegue UPDATE no seu workspace'
);

-- 38. Owner DELETE
select lives_ok(
  $$
  delete from public.produto_equivalencias
  where codigo_produto_fornecedor = 'RLS-OWNER-TEMP';
  $$,
  'RLS: Owner consegue DELETE no seu workspace'
);

-- Contexto B: ADMIN DO WORKSPACE (user 3)
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

-- 39. Admin SELECT (permitido via tem_acesso_workspace)
select results_eq(
  $$select count(*)::bigint from public.produto_equivalencias where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values (2::bigint)$$,
  'RLS: Admin do workspace consegue SELECT compartilhado'
);

-- 40. Admin INSERT (rejeitado: mutação é owner-only)
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'RLS-ADMIN-FORBIDDEN',
    'eeeeeeee-0001-0000-0000-000000000001', 1.0
  );
  $$,
  '42501',
  null,
  'RLS: Admin não consegue INSERT (mutação owner-only)'
);

-- 41. Admin UPDATE (afeta 0 linhas: mutação owner-only)
select is_empty(
  $$
  update public.produto_equivalencias
  set descricao_fornecedor = 'Admin Mod'
  where codigo_produto_fornecedor = 'PROD-FORN-100'
  returning id;
  $$,
  'RLS: Admin não consegue UPDATE nas linhas do owner'
);

-- 42. Admin DELETE (afeta 0 linhas: mutação owner-only)
select is_empty(
  $$
  delete from public.produto_equivalencias
  where codigo_produto_fornecedor = 'PROD-FORN-100'
  returning id;
  $$,
  'RLS: Admin não consegue DELETE nas linhas do owner'
);

-- Contexto C: OUTSIDER (user 4)
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

-- 43. Outsider SELECT (não enxerga nada)
select results_eq(
  $$select count(*)::bigint from public.produto_equivalencias$$,
  $$values (0::bigint)$$,
  'RLS: Outsider não consegue SELECT nas equivalências'
);

-- 44. Outsider INSERT (rejeitado com 42501)
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'RLS-OUTSIDER-FORBIDDEN',
    'eeeeeeee-0001-0000-0000-000000000001', 1.0
  );
  $$,
  '42501',
  null,
  'RLS: Outsider não consegue INSERT'
);

-- 45. Outsider UPDATE (afeta 0 linhas)
select is_empty(
  $$
  update public.produto_equivalencias
  set descricao_fornecedor = 'Outsider Mod'
  returning id;
  $$,
  'RLS: Outsider não consegue UPDATE'
);

-- 46. Outsider DELETE (afeta 0 linhas)
select is_empty(
  $$
  delete from public.produto_equivalencias
  returning id;
  $$,
  'RLS: Outsider não consegue DELETE'
);

reset role;

rollback;
