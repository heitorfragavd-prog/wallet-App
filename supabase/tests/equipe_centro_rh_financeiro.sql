begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(38);

select has_table('public', 'workspace_members', 'workspace_members existe');
select has_table('public', 'colaborador_acertos', 'colaborador_acertos existe');
select has_table('public', 'colaborador_acerto_itens', 'colaborador_acerto_itens existe');
select has_table('public', 'colaborador_pagamentos', 'colaborador_pagamentos existe');
select has_table('public', 'colaborador_ajustes', 'colaborador_ajustes existe');
select col_is_unique('public', 'colaborador_pagamentos', 'divipay_external_id', 'ID externo Divipay e idempotente');
select has_function('public', 'gerar_acerto_semanal', array['uuid', 'date', 'date', 'jsonb'], 'RPC de geracao atomica existe');
select function_returns('public', 'gerar_acerto_semanal', array['uuid', 'date', 'date', 'jsonb'], 'uuid', 'RPC semanal retorna UUID estavel');
select has_function('public', 'iniciar_pagamento_acerto', array['uuid', 'text'], 'RPC de inicio de pagamento existe');
select has_function(
  'public', 'confirmar_pagamento_acerto',
  array['uuid', 'text', 'uuid', 'text', 'numeric', 'numeric', 'text'],
  'RPC de confirmacao de pagamento existe'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'colaboradores', 'colaborador_custos', 'colaborador_presencas',
        'colaborador_escalas', 'colaborador_acertos',
        'colaborador_acerto_itens', 'colaborador_pagamentos', 'colaborador_ajustes'
      )
      and (qual = 'true' or with_check = 'true')
  ),
  0,
  'Equipe nao possui politicas RLS globais para authenticated'
);

select policies_are(
  'public', 'colaboradores',
  array[
    'equipe_colaboradores_select', 'equipe_colaboradores_insert',
    'equipe_colaboradores_update', 'equipe_colaboradores_delete'
  ],
  'Colaboradores possui somente as quatro politicas seguras esperadas'
);

insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000a001', 'owner-a@example.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000a002', 'owner-b@example.invalid', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000a003', 'partner@example.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.workspaces (id, user_id, nome, tipo)
values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', 'Workspace A', 'PJ'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a002', 'Workspace B', 'PJ');

insert into public.colaboradores (
  id, workspace_id, user_id, nome, tipo, pix_tipo, pix_chave, salario_bruto
)
values
  (
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000b001',
    '00000000-0000-0000-0000-00000000a001',
    'Funcionario A', 'funcionario', 'cpf', '123.456.789-00', 2000
  ),
  (
    '00000000-0000-0000-0000-00000000c002',
    '00000000-0000-0000-0000-00000000b002',
    '00000000-0000-0000-0000-00000000a002',
    'Funcionario B', 'funcionario', 'email', 'outro@example.invalid', 2500
  );

select lives_ok(
  $setup$
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a003', 'admin');

    insert into public.colaboradores (
      id, workspace_id, user_id, nome, tipo, pix_tipo, pix_chave, valor_diaria
    ) values (
      '00000000-0000-0000-0000-00000000c003',
      '00000000-0000-0000-0000-00000000b001',
      '00000000-0000-0000-0000-00000000a001',
      'Folguista A', 'folguista', 'telefone', '+55 (11) 99999-0000', 100
    );

    insert into public.colaborador_escalas (
      id, colaborador_id, workspace_id, data, turno, valor_diaria, valor_total
    ) values (
      '00000000-0000-0000-0000-00000000d001',
      '00000000-0000-0000-0000-00000000c003',
      '00000000-0000-0000-0000-00000000b001',
      date '2026-08-17', 'integral', 100, 100
    );
  $setup$,
  'Folguista, membro e primeira escala sao aceitos'
);

select results_eq(
  $$select count(*)::bigint from public.colaboradores where tipo = 'folguista'$$,
  $$values (1::bigint)$$,
  'Folguista foi persistido'
);

select throws_ok(
  $$
    insert into public.colaborador_escalas (
      colaborador_id, workspace_id, data, turno, valor_diaria, valor_total
    ) values (
      '00000000-0000-0000-0000-00000000c003',
      '00000000-0000-0000-0000-00000000b001',
      date '2026-08-17', 'integral', 100, 100
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "colaborador_escalas_unica"',
  'Escala duplicada no mesmo turno e recusada'
);

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select results_eq(
  $$select count(*)::bigint from public.colaboradores$$,
  $$values (2::bigint)$$,
  'Proprietario A enxerga somente sua equipe'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', true);
select results_eq(
  $$select count(*)::bigint from public.colaboradores$$,
  $$values (1::bigint)$$,
  'Proprietario B enxerga somente sua equipe'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', true);
select results_eq(
  $$select count(*)::bigint from public.colaboradores$$,
  $$values (2::bigint)$$,
  'Socia administradora enxerga a equipe compartilhada'
);

select throws_ok(
  $$insert into public.colaboradores (workspace_id, nome, tipo) values ('00000000-0000-0000-0000-00000000b002', 'Intruso', 'funcionario')$$,
  '42501',
  'new row violates row-level security policy for table "colaboradores"',
  'Membro do workspace A nao insere no workspace B'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);

select lives_ok(
  $$
    select public.gerar_acerto_semanal(
      '00000000-0000-0000-0000-00000000c003', date '2026-08-17', date '2026-08-23',
      jsonb_build_array(
        jsonb_build_object(
          'natureza', 'diaria', 'descricao', 'Segunda-feira', 'valor', 100,
          'escala_id', '00000000-0000-0000-0000-00000000d001'
        ),
        jsonb_build_object('natureza', 'meta', 'descricao', 'Meta semanal', 'valor', 20)
      )
    )
  $$,
  'Geracao semanal atomica conclui'
);

select results_eq(
  $$
    select public.gerar_acerto_semanal(
      '00000000-0000-0000-0000-00000000c003', date '2026-08-17', date '2026-08-23',
      '[{"natureza":"diaria","descricao":"Segunda-feira","valor":100,"escala_id":"00000000-0000-0000-0000-00000000d001"},{"natureza":"meta","descricao":"Meta semanal","valor":20}]'::jsonb
    ) = public.gerar_acerto_semanal(
      '00000000-0000-0000-0000-00000000c003', date '2026-08-17', date '2026-08-23',
      '[{"natureza":"diaria","descricao":"Segunda-feira","valor":100,"escala_id":"00000000-0000-0000-0000-00000000d001"},{"natureza":"meta","descricao":"Meta semanal","valor":20}]'::jsonb
    )
  $$,
  $$values (true)$$,
  'Repeticao da geracao retorna o mesmo UUID'
);

select results_eq($$select count(*)::bigint from public.colaborador_acertos$$, $$values (1::bigint)$$, 'Geracao repetida nao duplica acerto');
select results_eq($$select count(*)::bigint from public.colaborador_acerto_itens$$, $$values (2::bigint)$$, 'Geracao repetida nao duplica itens');
select results_eq(
  $$select count(*)::bigint from public.despesas where descricao like 'Acerto equipe:%'$$,
  $$values (1::bigint)$$,
  'Geracao repetida nao duplica conta a pagar'
);

select lives_ok(
  $$select public.iniciar_pagamento_acerto((select id from public.colaborador_acertos limit 1), 'wallet_divipay')$$,
  'Pagamento Divipay e iniciado'
);
select results_eq(
  $$select status from public.colaborador_acertos limit 1$$,
  $$values ('processando'::text)$$,
  'Acerto fica processando ate o webhook'
);

select lives_ok(
  $$select public.registrar_falha_pagamento((select id from public.colaborador_pagamentos order by created_at desc limit 1), 'provider_error')$$,
  'Falha do provedor e registrada'
);
select results_eq(
  $$select status from public.colaborador_acertos limit 1$$,
  $$values ('falhou'::text)$$,
  'Falha nao marca o acerto como pago'
);

select lives_ok(
  $$select public.iniciar_pagamento_acerto((select id from public.colaborador_acertos limit 1), 'wallet_divipay')$$,
  'Nova tentativa de pagamento e criada'
);
select results_eq(
  $$select count(*)::bigint from public.colaborador_pagamentos$$,
  $$values (2::bigint)$$,
  'Retentativa preserva o historico da falha'
);

select lives_ok(
  $$
    select public.confirmar_pagamento_acerto(
      (select id from public.colaborador_acertos limit 1), 'divipay-ext-001',
      (select id from public.colaborador_pagamentos where status = 'processando' limit 1),
      'wallet_divipay', 120, 3.50, null
    )
  $$,
  'Webhook confirma pagamento exato'
);
select results_eq($$select status from public.colaborador_acertos limit 1$$, $$values ('pago'::text)$$, 'Acerto confirmado fica pago');
select results_eq(
  $$select status from public.despesas where descricao like 'Acerto equipe:%' limit 1$$,
  $$values ('pago'::text)$$,
  'Conta a pagar vinculada tambem fica paga'
);
select results_eq(
  $$select count(*)::bigint from public.colaborador_pagamentos where divipay_external_id = 'divipay-ext-001'$$,
  $$values (1::bigint)$$,
  'ID externo aparece uma unica vez'
);

reset role;
select throws_ok(
  $$update public.colaborador_acertos set status = 'pendente' where status = 'pago'$$,
  'P0001',
  'Transicao de status de pago para pendente nao permitida',
  'Acerto pago nao volta para pendente'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select lives_ok(
  $$
    select public.confirmar_pagamento_acerto(
      (select id from public.colaborador_acertos limit 1), 'divipay-ext-001',
      (select id from public.colaborador_pagamentos where divipay_external_id = 'divipay-ext-001'),
      'wallet_divipay', 120, 3.50, null
    )
  $$,
  'Webhook repetido e idempotente'
);
select results_eq(
  $$select count(*)::bigint from public.colaborador_pagamentos$$,
  $$values (2::bigint)$$,
  'Webhook repetido nao duplica pagamento'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', true);
select results_eq(
  $$select count(*)::bigint from public.colaborador_pagamentos$$,
  $$values (0::bigint)$$,
  'Outro workspace nao enxerga pagamentos da equipe A'
);

reset role;
select * from finish();
rollback;
