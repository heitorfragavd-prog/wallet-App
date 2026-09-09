-- ============================================================
-- WALLET APP — SUBETAPA 9.1: pgTAP Schema Test Suite
-- Test File: supabase/tests/produto_equivalencias_test.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

-- 1. Verificação de Estrutura
select has_table('public', 'produto_equivalencias', 'Tabela produto_equivalencias existe');
select col_not_null('public', 'produto_equivalencias', 'user_id', 'user_id é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'workspace_id', 'workspace_id é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'cnpj_fornecedor_normalizado', 'cnpj_fornecedor_normalizado é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'codigo_produto_fornecedor', 'codigo_produto_fornecedor é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'produto_eyemobile_uuid', 'produto_eyemobile_uuid é NOT NULL');
select col_not_null('public', 'produto_equivalencias', 'fator_conversao', 'fator_conversao é NOT NULL');
select col_default('public', 'produto_equivalencias', 'fator_conversao', null, 'fator_conversao NÃO tem valor DEFAULT (exige informação explícita)');

select col_has_check('public', 'produto_equivalencias', 'fator_conversao', 'fator_conversao possui CHECK');
select col_has_check('public', 'produto_equivalencias', 'cnpj_fornecedor_normalizado', 'cnpj_fornecedor_normalizado possui CHECK de dígitos');

-- 2. Verificação de Integridade em historico_custo_produto
select has_column('public', 'historico_custo_produto', 'produto_eyemobile_uuid', 'historico_custo_produto possui coluna produto_eyemobile_uuid');
select col_is_null('public', 'historico_custo_produto', 'produto_eyemobile_uuid', 'produto_eyemobile_uuid é nullable para compatibilidade legada');

-- 3. Índices e Unicidade
select has_index('public', 'produto_equivalencias', 'unq_produto_equivalencia_fornecedor', 'Possui constraint UNIQUE para workspace + cnpj + codigo');
select has_index('public', 'produto_equivalencias', 'idx_produto_equivalencias_reverso', 'Possui índice reverso (workspace_id, produto_eyemobile_uuid)');

-- 4. Gatilhos
select has_trigger('public', 'produto_equivalencias', 'trg_produto_equivalencias_updated_at', 'Trigger de updated_at existe');
select has_trigger('public', 'produto_equivalencias', 'trg_validar_produto_equivalencia_tenant', 'Trigger de validação multi-tenant existe');

-- 5. RLS
select table_is_rls_active('public', 'produto_equivalencias', 'RLS está ativo em produto_equivalencias');

-- 6. Setup de Dados para Testes Funcionais
insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'user1@example.com', 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'user2@example.com', 'authenticated', 'authenticated', now(), now());

insert into public.workspaces (id, user_id, nome, tipo)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Workspace A', 'bar'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Workspace B', 'bar'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Workspace C (User 2)', 'bar');

insert into public.produtos_eyemobile (id, user_id, workspace_id, eyemobile_id, codigo, descricao, preco_venda, estoque_atual)
values
  ('eeeeeeee-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eye-1', 'SKU-001', 'Cerveja Lata 350ml', 8.00, 100),
  ('eeeeeeee-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eye-2', 'SKU-002', 'Vinho Garrafa 750ml', 45.00, 20),
  ('eeeeeeee-0003-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'eye-3', 'SKU-003', 'Whisky 1L', 120.00, 10);

-- 7. Cenário A: Cria equivalência válida
select lives_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    fornecedor_nome, descricao_fornecedor, unidade_fornecedor,
    produto_eyemobile_uuid, fator_conversao, origem_matching, confirmado_por_usuario
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-100',
    'Distribuidora Ambev', 'Cerveja Lata CX 12', 'CX',
    'eeeeeeee-0001-0000-0000-000000000001', 12.000000, 'manual', true
  );
  $$,
  'Cenário A: Cria equivalência válida com sucesso'
);

-- 8. Cenário B: Unicidade (mesmo workspace + CNPJ + codigo) deve falhar
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

-- 9. Cenário E & F: fator_conversao <= 0 deve falhar
select throws_ok(
  $$
  insert into public.produto_equivalencias (
    user_id, workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor,
    produto_eyemobile_uuid, fator_conversao
  ) values (
    '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12345678000190', 'PROD-FORN-200',
    'eeeeeeee-0001-0000-0000-000000000001', 0
  );
  $$,
  '23514',
  null,
  'Cenário E: Rejeita fator_conversao = 0'
);

-- 10. Cenário G: CNPJ com caracteres não numéricos deve falhar
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

-- 11. Cenário I: Cross-Workspace mismatch deve ser barrado pelo trigger
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

-- 12. Cenário J: Cross-User mismatch deve ser barrado pelo trigger
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

-- 13. Cenário K: historico_custo_produto com produto_eyemobile_uuid válido
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

-- 14. Cenário L: historico_custo_produto legado aceita produto_eyemobile_uuid NULL
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

rollback;
