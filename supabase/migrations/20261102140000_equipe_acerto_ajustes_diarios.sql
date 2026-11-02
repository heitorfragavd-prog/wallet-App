-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261102140000_equipe_acerto_ajustes_diarios.sql
-- Domínio: Equipe / Centro RH Financeiro
-- Finalidade:
--   1. Adicionar colunas em public.colaborador_ajustes para rastreabilidade diária
--      (data_gasto, periodo_referencia_inicio/fim, valor_antecipado, valor_real, diferenca, status).
--   2. Garantir índice de unicidade para evitar dupla compensação do mesmo dia (colaborador_id, data_gasto).
--   3. Adicionar coluna detalhes (jsonb) em public.colaborador_acertos para recuperação de estado histórico.
--   4. Atualizar RPC public.gerar_acerto_semanal para persistir ajustes diários individualmente de forma idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Estrutura de auditoria diária em public.colaborador_ajustes
alter table public.colaborador_ajustes
  add column if not exists data_gasto date,
  add column if not exists periodo_referencia_inicio date,
  add column if not exists periodo_referencia_fim date,
  add column if not exists valor_antecipado numeric(12,2) default 0.00,
  add column if not exists valor_real numeric(12,2),
  add column if not exists diferenca numeric(12,2),
  add column if not exists status text not null default 'compensado';

alter table public.colaborador_ajustes
  drop constraint if exists colaborador_ajustes_status_check;

alter table public.colaborador_ajustes
  add constraint colaborador_ajustes_status_check
  check (status in ('pendente', 'compensado', 'cancelado'));

create unique index if not exists colaborador_ajustes_colab_data_gasto_idx
  on public.colaborador_ajustes (colaborador_id, data_gasto)
  where status <> 'cancelado' and data_gasto is not null;

create index if not exists colaborador_ajustes_periodo_idx
  on public.colaborador_ajustes (colaborador_id, periodo_referencia_inicio, periodo_referencia_fim);

-- 2. Snapshot de detalhes estruturados em public.colaborador_acertos
alter table public.colaborador_acertos
  add column if not exists detalhes jsonb default '{}'::jsonb;

-- 3. Atualização da RPC public.gerar_acerto_semanal com persistência diária individual
create or replace function public.gerar_acerto_semanal(
  p_colaborador_id uuid,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_itens jsonb,
  p_ajustes_diarios jsonb default '[]'::jsonb,
  p_detalhes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_colaborador record;
  v_acerto record;
  v_item record;
  v_ajuste_rec record;
  v_tipo text;
  v_total numeric(12,2) := 0;
  v_despesa_id uuid;
  v_owner_id uuid;
  v_escala record;
begin
  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Periodo semanal invalido' using errcode = '22007';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O acerto precisa de ao menos um item' using errcode = '22023';
  end if;

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

  if not public.tem_acesso_workspace(v_colaborador.workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  if v_colaborador.status = 'demitido' then
    raise exception 'Colaborador desligado nao pode receber novo acerto' using errcode = '22023';
  end if;

  if v_colaborador.pix_chave_normalizada is null then
    raise exception 'Cadastre uma chave Pix valida antes de gerar o acerto' using errcode = '22023';
  end if;

  if v_colaborador.tipo = 'funcionario' then
    v_tipo := 'semanal_funcionario';
  elsif v_colaborador.tipo = 'folguista' then
    v_tipo := 'semanal_folguista';
  else
    raise exception 'Socio nao possui acerto semanal' using errcode = '22023';
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_itens) as item(
      natureza text,
      descricao text,
      valor numeric,
      escala_id uuid,
      categoria_id uuid
    )
  loop
    if v_item.natureza is null
       or v_item.natureza not in ('transporte', 'meta', 'diaria', 'ajuste') then
      raise exception 'Natureza de item semanal invalida' using errcode = '22023';
    end if;

    if v_colaborador.tipo = 'funcionario' and v_item.natureza = 'diaria' then
      raise exception 'Funcionario fixo nao recebe item de diaria' using errcode = '22023';
    end if;

    if v_colaborador.tipo = 'folguista' and v_item.natureza = 'transporte' then
      raise exception 'Folguista nao recebe item de transporte semanal' using errcode = '22023';
    end if;

    if nullif(btrim(v_item.descricao), '') is null or v_item.valor is null or v_item.valor = 0 then
      raise exception 'Descricao e valor nao nulo sao obrigatorios nos itens' using errcode = '22023';
    end if;

    if v_item.natureza = 'diaria' then
      if v_item.escala_id is null then
        raise exception 'Item de diaria exige escala' using errcode = '22023';
      end if;

      select e.* into v_escala
      from public.colaborador_escalas e
      where e.id = v_item.escala_id;

      if not found
         or v_escala.colaborador_id <> p_colaborador_id
         or v_escala.workspace_id <> v_colaborador.workspace_id
         or v_escala.data not between p_periodo_inicio and p_periodo_fim
         or v_escala.status = 'cancelada' then
        raise exception 'Escala do item de diaria e invalida' using errcode = '23514';
      end if;
    elsif v_item.escala_id is not null then
      raise exception 'Somente diaria pode referenciar uma escala' using errcode = '23514';
    end if;

    v_total := v_total + v_item.valor;
  end loop;

  if v_total <= 0 then
    raise exception 'O total do acerto deve ser maior que zero' using errcode = '22023';
  end if;

  select a.* into v_acerto
  from public.colaborador_acertos a
  where a.colaborador_id = p_colaborador_id
    and a.tipo = v_tipo
    and a.periodo_inicio = p_periodo_inicio
    and a.periodo_fim = p_periodo_fim
  for update;

  if found then
    if v_acerto.status in ('processando', 'pago', 'ajustado') then
      return v_acerto.id;
    end if;

    if v_acerto.status = 'cancelado' then
      raise exception 'Acerto cancelado nao pode ser recriado' using errcode = 'P0001';
    end if;

    delete from public.colaborador_acerto_itens where acerto_id = v_acerto.id;

    update public.colaborador_acertos
    set valor_total = v_total,
        vencimento = p_periodo_fim + 1,
        pix_chave_snapshot = v_colaborador.pix_chave,
        detalhes = coalesce(p_detalhes, detalhes),
        status = 'pendente',
        updated_at = now()
    where id = v_acerto.id;
  else
    insert into public.colaborador_acertos (
      workspace_id, colaborador_id, tipo, periodo_inicio, periodo_fim,
      vencimento, status, valor_total, pix_chave_snapshot, detalhes
    ) values (
      v_colaborador.workspace_id,
      p_colaborador_id,
      v_tipo,
      p_periodo_inicio,
      p_periodo_fim,
      p_periodo_fim + 1,
      'pendente',
      v_total,
      v_colaborador.pix_chave,
      coalesce(p_detalhes, '{}'::jsonb)
    ) returning * into v_acerto;
  end if;

  insert into public.colaborador_acerto_itens (
    workspace_id, acerto_id, escala_id, natureza, descricao, valor, categoria_id
  )
  select
    v_colaborador.workspace_id,
    v_acerto.id,
    item.escala_id,
    item.natureza,
    btrim(item.descricao),
    item.valor,
    item.categoria_id
  from jsonb_to_recordset(p_itens) as item(
    natureza text,
    descricao text,
    valor numeric,
    escala_id uuid,
    categoria_id uuid
  );

  -- Gravação individual dos ajustes diários com idempotência estrita
  if p_ajustes_diarios is not null and jsonb_typeof(p_ajustes_diarios) = 'array' and jsonb_array_length(p_ajustes_diarios) > 0 then
    -- Remove ajustes anteriores vinculados a este acerto pendente (permite atualização segura)
    delete from public.colaborador_ajustes
    where aplicado_em_acerto_id = v_acerto.id;

    for v_ajuste_rec in
      select *
      from jsonb_to_recordset(p_ajustes_diarios) as aj(
        data_gasto date,
        periodo_referencia_inicio date,
        periodo_referencia_fim date,
        valor_antecipado numeric,
        valor_real numeric,
        diferenca numeric,
        motivo text
      )
    loop
      if v_ajuste_rec.data_gasto is not null and v_ajuste_rec.diferenca is not null and v_ajuste_rec.diferenca <> 0 then
        -- Barramento de segurança: previne que o mesmo dia seja compensado em outro acerto ativo
        if exists (
          select 1 from public.colaborador_ajustes a
          join public.colaborador_acertos ac on ac.id = a.aplicado_em_acerto_id
          where a.colaborador_id = p_colaborador_id
            and a.data_gasto = v_ajuste_rec.data_gasto
            and a.status = 'compensado'
            and a.aplicado_em_acerto_id <> v_acerto.id
            and ac.status <> 'cancelado'
        ) then
          raise exception 'A diferenca do dia % ja foi compensada em outro acerto', to_char(v_ajuste_rec.data_gasto, 'DD/MM/YYYY')
            using errcode = '23505';
        end if;

        insert into public.colaborador_ajustes (
          workspace_id,
          colaborador_id,
          data_gasto,
          periodo_referencia_inicio,
          periodo_referencia_fim,
          valor_antecipado,
          valor_real,
          diferenca,
          valor,
          motivo,
          aplicado_em_acerto_id,
          status
        ) values (
          v_colaborador.workspace_id,
          p_colaborador_id,
          v_ajuste_rec.data_gasto,
          coalesce(v_ajuste_rec.periodo_referencia_inicio, v_ajuste_rec.data_gasto),
          coalesce(v_ajuste_rec.periodo_referencia_fim, v_ajuste_rec.data_gasto),
          coalesce(v_ajuste_rec.valor_antecipado, 0.00),
          coalesce(v_ajuste_rec.valor_real, 0.00),
          v_ajuste_rec.diferenca,
          v_ajuste_rec.diferenca,
          coalesce(v_ajuste_rec.motivo, 'Ajuste Uber ' || to_char(v_ajuste_rec.data_gasto, 'DD/MM/YYYY')),
          v_acerto.id,
          'compensado'
        )
        on conflict (colaborador_id, data_gasto) where status <> 'cancelado' and data_gasto is not null
        do update set
          valor_antecipado = excluded.valor_antecipado,
          valor_real = excluded.valor_real,
          diferenca = excluded.diferenca,
          valor = excluded.valor,
          motivo = excluded.motivo,
          aplicado_em_acerto_id = v_acerto.id,
          status = 'compensado',
          updated_at = now();
      end if;
    end loop;
  end if;

  v_despesa_id := v_acerto.despesa_id;

  if v_despesa_id is null then
    insert into public.despesas (
      user_id, workspace_id, descricao, valor, data, status, observacoes
    ) values (
      v_owner_id,
      v_colaborador.workspace_id,
      'Acerto equipe: ' || v_colaborador.nome || ' (' ||
        to_char(p_periodo_inicio, 'DD/MM/YYYY') || ' a ' || to_char(p_periodo_fim, 'DD/MM/YYYY') || ')',
      v_total,
      p_periodo_fim + 1,
      'pendente',
      'Obrigacao gerada pelo ledger da Equipe'
    ) returning id into v_despesa_id;

    update public.colaborador_acertos
    set despesa_id = v_despesa_id
    where id = v_acerto.id;
  else
    update public.despesas
    set valor = v_total,
        data = p_periodo_fim + 1,
        status = 'pendente',
        updated_at = now()
    where id = v_despesa_id;
  end if;

  return v_acerto.id;
end;
$$;

-- Versão de 4 argumentos para compatibilidade regressiva total
create or replace function public.gerar_acerto_semanal(
  p_colaborador_id uuid,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_itens jsonb
)
returns uuid
language sql
security definer
as $$
  select public.gerar_acerto_semanal(p_colaborador_id, p_periodo_inicio, p_periodo_fim, p_itens, '[]'::jsonb, '{}'::jsonb);
$$;
