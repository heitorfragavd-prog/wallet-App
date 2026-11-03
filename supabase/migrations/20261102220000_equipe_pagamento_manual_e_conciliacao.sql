-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261102220000_equipe_pagamento_manual_e_conciliacao.sql
-- Domínio: Equipe / Centro RH Financeiro
-- Finalidade:
--   1. Permitir registro auditado de pagamentos manuais e externos já realizados,
--      sem disparar transferências Pix duplicadas nem distorcer extratos.
--   2. Suportar conciliação atômica entre obrigações da Equipe e despesas pré-existentes
--      (como transferências externas Divipay ou TED/Pix manuais).
--   3. Ampliar suporte a tipos legítimos de remuneração ('adiantamento', 'bonificacao', 'outro').
--   4. Garantir idempotência estrita para jamais duplicar pagamentos ou despesas.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ampliar restrição de tipos de acerto para suportar remunerações e ajustes avulsos
alter table public.colaborador_acertos
  drop constraint if exists colaborador_acertos_tipo_check;

alter table public.colaborador_acertos
  add constraint colaborador_acertos_tipo_check check (
    tipo in (
      'semanal_funcionario',
      'semanal_folguista',
      'salario',
      'pro_labore',
      'adiantamento',
      'bonificacao',
      'outro'
    )
  );

-- 2. RPC para registrar pagamento manual ou conciliação externa com auditoria completa
create or replace function public.registrar_pagamento_colaborador_manual(
  p_colaborador_id uuid,
  p_tipo text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_valor numeric,
  p_data_pagamento timestamptz,
  p_origem text default 'manual',
  p_referencia text default null,
  p_comprovante_url text default null,
  p_observacoes text default null,
  p_despesa_id uuid default null,
  p_acerto_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_colaborador record;
  v_acerto record;
  v_pagamento_id uuid;
  v_despesa_id uuid;
  v_owner_id uuid;
  v_idempotency_key text;
  v_descricao_tipo text;
  v_natureza text;
begin
  -- Validações de parâmetros fundamentais
  if p_colaborador_id is null then
    raise exception 'Colaborador obrigatorio' using errcode = '22023';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero' using errcode = '22023';
  end if;

  if p_data_pagamento is null then
    raise exception 'Data do pagamento obrigatoria' using errcode = '22023';
  end if;

  if p_origem not in ('manual', 'divipay_externo', 'wallet_divipay') then
    raise exception 'Origem de pagamento invalida' using errcode = '22023';
  end if;

  -- Obter colaborador e verificar permissão no workspace
  select c.*, coalesce(w.user_id, auth.uid()) as owner_id
    into v_colaborador
  from public.colaboradores c
  join public.workspaces w on w.id = c.workspace_id
  where c.id = p_colaborador_id
  for update of c;

  if not found then
    raise exception 'Colaborador nao encontrado' using errcode = 'P0002';
  end if;

  v_owner_id := v_colaborador.owner_id;

  if not (
    coalesce(auth.role() = 'service_role', false)
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
    or public.tem_acesso_workspace(v_colaborador.workspace_id)
  ) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  -- Mapear descrição e natureza padrão
  case p_tipo
    when 'pro_labore' then
      v_descricao_tipo := 'Pró-labore';
      v_natureza := 'pro_labore';
    when 'salario' then
      v_descricao_tipo := 'Salário mensal';
      v_natureza := 'salario';
    when 'semanal_funcionario' then
      v_descricao_tipo := 'Acerto semanal transporte/metas';
      v_natureza := 'transporte';
    when 'semanal_folguista' then
      v_descricao_tipo := 'Acerto semanal folguista';
      v_natureza := 'diaria';
    when 'adiantamento' then
      v_descricao_tipo := 'Adiantamento';
      v_natureza := 'ajuste';
    when 'bonificacao' then
      v_descricao_tipo := 'Bonificação / Meta';
      v_natureza := 'meta';
    else
      v_descricao_tipo := 'Pagamento avulso';
      v_natureza := 'ajuste';
  end case;

  -- Localizar ou criar o acerto correspondente
  if p_acerto_id is not null then
    select * into v_acerto
    from public.colaborador_acertos
    where id = p_acerto_id
      and colaborador_id = p_colaborador_id
    for update;

    if not found then
      raise exception 'Acerto especificado nao encontrado' using errcode = 'P0002';
    end if;
  else
    select * into v_acerto
    from public.colaborador_acertos
    where colaborador_id = p_colaborador_id
      and tipo = p_tipo
      and periodo_inicio = p_periodo_inicio
      and periodo_fim = p_periodo_fim
    for update;
  end if;

  if found and v_acerto.id is not null then
    -- Se o acerto já está marcado como pago, verificar se o pagamento em colaborador_pagamentos já existe
    if v_acerto.status = 'pago' then
      select id into v_pagamento_id
      from public.colaborador_pagamentos
      where acerto_id = v_acerto.id
        and status = 'pago'
      limit 1;

      if v_pagamento_id is not null then
        return jsonb_build_object(
          'sucesso', true,
          'ja_registrado', true,
          'acerto_id', v_acerto.id,
          'pagamento_id', v_pagamento_id,
          'despesa_id', v_acerto.despesa_id
        );
      end if;
    end if;

    -- Atualiza acerto para pago
    update public.colaborador_acertos
    set status = 'pago',
        valor_total = p_valor,
        updated_at = now()
    where id = v_acerto.id
    returning * into v_acerto;
  else
    -- Criar novo acerto para este período/obrigação já liquidada
    insert into public.colaborador_acertos (
      workspace_id,
      colaborador_id,
      tipo,
      periodo_inicio,
      periodo_fim,
      vencimento,
      status,
      valor_total,
      pix_chave_snapshot,
      detalhes
    ) values (
      v_colaborador.workspace_id,
      p_colaborador_id,
      p_tipo,
      coalesce(p_periodo_inicio, p_data_pagamento::date),
      coalesce(p_periodo_fim, p_data_pagamento::date),
      coalesce(p_data_pagamento::date, p_periodo_inicio),
      'pago',
      p_valor,
      v_colaborador.pix_chave,
      jsonb_build_object(
        'origem_registro', 'manual_conciliacao',
        'observacoes', p_observacoes,
        'referencia', p_referencia
      )
    ) returning * into v_acerto;

    -- Registrar item descritivo no acerto
    insert into public.colaborador_acerto_itens (
      workspace_id,
      acerto_id,
      natureza,
      descricao,
      valor
    ) values (
      v_colaborador.workspace_id,
      v_acerto.id,
      v_natureza,
      v_descricao_tipo || ': ' || coalesce(p_observacoes, to_char(p_data_pagamento, 'DD/MM/YYYY')),
      p_valor
    );
  end if;

  -- Tratamento da Despesa Financeira
  v_despesa_id := coalesce(p_despesa_id, v_acerto.despesa_id);

  if v_despesa_id is not null then
    -- Concilia despesa pré-existente
    update public.despesas
    set status = 'pago',
        valor = p_valor,
        data = coalesce(data, p_data_pagamento::date),
        observacoes = coalesce(observacoes, '') ||
          case when observacoes is not null and length(observacoes) > 0 then ' | ' else '' end ||
          'Conciliado com Acerto Equipe (' || v_acerto.id::text || ')',
        updated_at = now()
    where id = v_despesa_id;

    update public.colaborador_acertos
    set despesa_id = v_despesa_id
    where id = v_acerto.id;
  else
    -- Cria despesa financeira liquidada correspondente ao pagamento
    insert into public.despesas (
      user_id,
      workspace_id,
      descricao,
      valor,
      data,
      status,
      observacoes
    ) values (
      v_owner_id,
      v_colaborador.workspace_id,
      v_descricao_tipo || ': ' || v_colaborador.nome,
      p_valor,
      p_data_pagamento::date,
      'pago',
      'Pagamento registrado via ledger da Equipe (' || p_origem || ')'
    ) returning id into v_despesa_id;

    update public.colaborador_acertos
    set despesa_id = v_despesa_id
    where id = v_acerto.id;
  end if;

  -- Criar registro em colaborador_pagamentos
  v_idempotency_key := 'manual:' || v_acerto.id::text || ':' ||
    coalesce(nullif(btrim(p_referencia), ''), extract(epoch from p_data_pagamento)::text);

  insert into public.colaborador_pagamentos (
    workspace_id,
    acerto_id,
    status,
    origem,
    valor,
    taxa,
    idempotency_key,
    divipay_external_id,
    comprovante_url,
    paid_at,
    created_at,
    updated_at
  ) values (
    v_colaborador.workspace_id,
    v_acerto.id,
    'pago',
    p_origem,
    p_valor,
    0.00,
    v_idempotency_key,
    case when p_origem = 'divipay_externo' then p_referencia else null end,
    p_comprovante_url,
    p_data_pagamento,
    now(),
    now()
  )
  on conflict (idempotency_key) do update set
    status = 'pago',
    paid_at = excluded.paid_at,
    valor = excluded.valor,
    comprovante_url = coalesce(excluded.comprovante_url, public.colaborador_pagamentos.comprovante_url),
    updated_at = now()
  returning id into v_pagamento_id;

  return jsonb_build_object(
    'sucesso', true,
    'ja_registrado', false,
    'acerto_id', v_acerto.id,
    'pagamento_id', v_pagamento_id,
    'despesa_id', v_despesa_id
  );
end;
$$;

-- Permissões da nova RPC
revoke all on function public.registrar_pagamento_colaborador_manual(
  uuid, text, date, date, numeric, timestamptz, text, text, text, text, uuid, uuid
) from public, anon;

grant execute on function public.registrar_pagamento_colaborador_manual(
  uuid, text, date, date, numeric, timestamptz, text, text, text, text, uuid, uuid
) to authenticated, service_role;
