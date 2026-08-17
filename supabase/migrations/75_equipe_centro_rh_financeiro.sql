-- Centro de RH e Financeiro da Equipe
-- Ledger atomico, isolamento por workspace e pagamentos idempotentes.

create or replace function public.normalizar_chave_pix(p_chave text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when nullif(btrim(p_chave), '') is null then null
    when position('@' in p_chave) > 0 then lower(btrim(p_chave))
    else nullif(regexp_replace(lower(btrim(p_chave)), '[^a-z0-9]', '', 'g'), '')
  end;
$$;

alter table public.colaboradores
  drop constraint if exists colaboradores_tipo_check;

alter table public.colaboradores
  add constraint colaboradores_tipo_check
  check (tipo in ('funcionario', 'socio', 'folguista'));

alter table public.colaboradores
  add column if not exists foto_posicao text not null default '50% 15%',
  add column if not exists dia_pagamento smallint,
  add column if not exists valor_diaria numeric(12,2) not null default 100,
  add column if not exists valor_pro_labore numeric(12,2) not null default 0,
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists data_nascimento date,
  add column if not exists telefone text,
  add column if not exists email text,
  add column if not exists endereco text,
  add column if not exists pix_tipo text,
  add column if not exists pix_chave text,
  add column if not exists banco_nome text,
  add column if not exists banco_agencia text,
  add column if not exists banco_conta text,
  add column if not exists linha_onibus text,
  add column if not exists valor_passagem numeric(12,2) not null default 6.25,
  add column if not exists pix_chave_normalizada text generated always as
    (public.normalizar_chave_pix(pix_chave)) stored;

alter table public.colaboradores
  drop constraint if exists colaboradores_dia_pagamento_check,
  drop constraint if exists colaboradores_valor_diaria_check,
  drop constraint if exists colaboradores_valor_pro_labore_check;

alter table public.colaboradores
  add constraint colaboradores_dia_pagamento_check
    check (dia_pagamento is null or dia_pagamento between 1 and 28),
  add constraint colaboradores_valor_diaria_check check (valor_diaria >= 0),
  add constraint colaboradores_valor_pro_labore_check check (valor_pro_labore >= 0);

create unique index if not exists colaboradores_workspace_pix_unica
  on public.colaboradores (workspace_id, pix_chave_normalizada)
  where pix_chave_normalizada is not null;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

insert into public.workspace_members (workspace_id, user_id, role)
select id, user_id, 'admin'
from public.workspaces
on conflict (workspace_id, user_id) do update set active = true;

create or replace function public.sincronizar_proprietario_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, active)
  values (new.id, new.user_id, 'admin', true)
  on conflict (workspace_id, user_id)
  do update set role = 'admin', active = true, updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipe_workspace_owner_member on public.workspaces;
create trigger equipe_workspace_owner_member
after insert or update of user_id on public.workspaces
for each row execute function public.sincronizar_proprietario_workspace();

alter table public.colaborador_custos
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.colaborador_custos cc
set workspace_id = c.workspace_id
from public.colaboradores c
where c.id = cc.colaborador_id
  and cc.workspace_id is distinct from c.workspace_id;

alter table public.colaborador_custos
  alter column workspace_id set not null;

alter table public.colaborador_presencas
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.colaborador_presencas cp
set workspace_id = c.workspace_id
from public.colaboradores c
where c.id = cp.colaborador_id
  and cp.workspace_id is distinct from c.workspace_id;

alter table public.colaborador_presencas
  alter column workspace_id set not null;

alter table public.colaborador_escalas
  add column if not exists status text not null default 'programada',
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelamento_motivo text;

alter table public.colaborador_escalas
  drop constraint if exists colaborador_escalas_status_check;

alter table public.colaborador_escalas
  add constraint colaborador_escalas_status_check
  check (status in ('programada', 'realizada', 'cancelada'));

with duplicadas as (
  select id,
    row_number() over (
      partition by colaborador_id, data, turno
      order by created_at nulls last, id
    ) as ordem
  from public.colaborador_escalas
)
delete from public.colaborador_escalas e
using duplicadas d
where e.id = d.id and d.ordem > 1;

alter table public.colaborador_escalas
  drop constraint if exists colaborador_escalas_unica;

alter table public.colaborador_escalas
  add constraint colaborador_escalas_unica unique (colaborador_id, data, turno);

create table if not exists public.colaborador_acertos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  tipo text not null check (tipo in ('semanal_funcionario', 'semanal_folguista', 'salario', 'pro_labore')),
  periodo_inicio date not null,
  periodo_fim date not null,
  vencimento date not null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'pendente', 'processando', 'pago', 'falhou', 'cancelado', 'ajustado')),
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  pix_chave_snapshot text,
  despesa_id uuid references public.despesas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colaborador_acertos_periodo_valido check (periodo_fim >= periodo_inicio),
  constraint colaborador_acertos_periodo_unico
    unique (colaborador_id, tipo, periodo_inicio, periodo_fim)
);

create table if not exists public.colaborador_acerto_itens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  acerto_id uuid not null references public.colaborador_acertos(id) on delete cascade,
  escala_id uuid references public.colaborador_escalas(id) on delete restrict,
  natureza text not null
    check (natureza in ('transporte', 'meta', 'diaria', 'salario', 'pro_labore', 'ajuste')),
  descricao text not null,
  valor numeric(12,2) not null check (valor <> 0),
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.colaborador_pagamentos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  acerto_id uuid not null references public.colaborador_acertos(id) on delete restrict,
  status text not null
    check (status in ('pendente', 'processando', 'pago', 'falhou', 'cancelado')),
  origem text not null check (origem in ('wallet_divipay', 'divipay_externo', 'manual')),
  valor numeric(12,2) not null check (valor > 0),
  taxa numeric(12,2) not null default 0 check (taxa >= 0),
  idempotency_key text not null unique,
  divipay_external_id text unique,
  comprovante_url text,
  erro_codigo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.colaborador_ajustes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  acerto_origem_id uuid references public.colaborador_acertos(id) on delete restrict,
  valor numeric(12,2) not null check (valor <> 0),
  motivo text not null,
  aplicado_em_acerto_id uuid references public.colaborador_acertos(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_members_user_active_idx
  on public.workspace_members (user_id, active, workspace_id);
create index if not exists colaborador_custos_workspace_data_idx
  on public.colaborador_custos (workspace_id, data, colaborador_id);
create index if not exists colaborador_presencas_workspace_data_idx
  on public.colaborador_presencas (workspace_id, data, colaborador_id);
create index if not exists colaborador_escalas_workspace_data_idx
  on public.colaborador_escalas (workspace_id, data, colaborador_id);
create index if not exists colaborador_acertos_workspace_status_vencimento_idx
  on public.colaborador_acertos (workspace_id, status, vencimento);
create index if not exists colaborador_acertos_colaborador_periodo_idx
  on public.colaborador_acertos (colaborador_id, periodo_inicio, periodo_fim);
create index if not exists colaborador_acerto_itens_acerto_idx
  on public.colaborador_acerto_itens (acerto_id, natureza);
create index if not exists colaborador_pagamentos_acerto_status_idx
  on public.colaborador_pagamentos (acerto_id, status, created_at desc);
create index if not exists colaborador_ajustes_pendentes_idx
  on public.colaborador_ajustes (colaborador_id, created_at)
  where aplicado_em_acerto_id is null;

create or replace function public.equipe_atualizar_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists equipe_workspace_members_updated_at on public.workspace_members;
create trigger equipe_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.equipe_atualizar_updated_at();

drop trigger if exists equipe_acertos_updated_at on public.colaborador_acertos;
create trigger equipe_acertos_updated_at
before update on public.colaborador_acertos
for each row execute function public.equipe_atualizar_updated_at();

drop trigger if exists equipe_pagamentos_updated_at on public.colaborador_pagamentos;
create trigger equipe_pagamentos_updated_at
before update on public.colaborador_pagamentos
for each row execute function public.equipe_atualizar_updated_at();

drop trigger if exists equipe_ajustes_updated_at on public.colaborador_ajustes;
create trigger equipe_ajustes_updated_at
before update on public.colaborador_ajustes
for each row execute function public.equipe_atualizar_updated_at();

create or replace function public.validar_workspace_equipe()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_colaborador uuid;
  v_workspace_relacionado uuid;
  v_colaborador_relacionado uuid;
begin
  if tg_table_name in ('colaborador_custos', 'colaborador_presencas', 'colaborador_escalas') then
    select c.workspace_id into v_workspace
    from public.colaboradores c
    where c.id = new.colaborador_id;

    if v_workspace is null or new.workspace_id is distinct from v_workspace then
      raise exception 'Workspace do registro difere do workspace do colaborador'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'colaborador_acertos' then
    select c.workspace_id into v_workspace
    from public.colaboradores c
    where c.id = new.colaborador_id;

    if v_workspace is null or new.workspace_id is distinct from v_workspace then
      raise exception 'Workspace do acerto difere do workspace do colaborador'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'colaborador_acerto_itens' then
    select a.workspace_id, a.colaborador_id
      into v_workspace, v_colaborador
    from public.colaborador_acertos a
    where a.id = new.acerto_id;

    if v_workspace is null or new.workspace_id is distinct from v_workspace then
      raise exception 'Workspace do item difere do workspace do acerto'
        using errcode = '23514';
    end if;

    if new.escala_id is not null then
      select e.workspace_id, e.colaborador_id
        into v_workspace_relacionado, v_colaborador_relacionado
      from public.colaborador_escalas e
      where e.id = new.escala_id;

      if v_workspace_relacionado is distinct from v_workspace
         or v_colaborador_relacionado is distinct from v_colaborador then
        raise exception 'Escala do item nao pertence ao mesmo colaborador e workspace'
          using errcode = '23514';
      end if;
    end if;

    if new.categoria_id is not null then
      select c.workspace_id into v_workspace_relacionado
      from public.categorias c
      where c.id = new.categoria_id;

      if v_workspace_relacionado is not null
         and v_workspace_relacionado is distinct from v_workspace then
        raise exception 'Categoria do item pertence a outro workspace'
          using errcode = '23514';
      end if;
    end if;

  elsif tg_table_name = 'colaborador_pagamentos' then
    select a.workspace_id into v_workspace
    from public.colaborador_acertos a
    where a.id = new.acerto_id;

    if v_workspace is null or new.workspace_id is distinct from v_workspace then
      raise exception 'Workspace do pagamento difere do workspace do acerto'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'colaborador_ajustes' then
    select c.workspace_id into v_workspace
    from public.colaboradores c
    where c.id = new.colaborador_id;

    if v_workspace is null or new.workspace_id is distinct from v_workspace then
      raise exception 'Workspace do ajuste difere do workspace do colaborador'
        using errcode = '23514';
    end if;

    if new.acerto_origem_id is not null then
      select a.workspace_id, a.colaborador_id
        into v_workspace_relacionado, v_colaborador_relacionado
      from public.colaborador_acertos a
      where a.id = new.acerto_origem_id;

      if v_workspace_relacionado is distinct from v_workspace
         or v_colaborador_relacionado is distinct from new.colaborador_id then
        raise exception 'Acerto de origem do ajuste e inconsistente'
          using errcode = '23514';
      end if;
    end if;

    if new.aplicado_em_acerto_id is not null then
      select a.workspace_id, a.colaborador_id
        into v_workspace_relacionado, v_colaborador_relacionado
      from public.colaborador_acertos a
      where a.id = new.aplicado_em_acerto_id;

      if v_workspace_relacionado is distinct from v_workspace
         or v_colaborador_relacionado is distinct from new.colaborador_id then
        raise exception 'Acerto de destino do ajuste e inconsistente'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists equipe_validar_custos on public.colaborador_custos;
create trigger equipe_validar_custos
before insert or update on public.colaborador_custos
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_presencas on public.colaborador_presencas;
create trigger equipe_validar_presencas
before insert or update on public.colaborador_presencas
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_escalas on public.colaborador_escalas;
create trigger equipe_validar_escalas
before insert or update on public.colaborador_escalas
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_acertos on public.colaborador_acertos;
create trigger equipe_validar_acertos
before insert or update on public.colaborador_acertos
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_itens on public.colaborador_acerto_itens;
create trigger equipe_validar_itens
before insert or update on public.colaborador_acerto_itens
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_pagamentos on public.colaborador_pagamentos;
create trigger equipe_validar_pagamentos
before insert or update on public.colaborador_pagamentos
for each row execute function public.validar_workspace_equipe();

drop trigger if exists equipe_validar_ajustes on public.colaborador_ajustes;
create trigger equipe_validar_ajustes
before insert or update on public.colaborador_ajustes
for each row execute function public.validar_workspace_equipe();

create or replace function public.validar_transicao_acerto()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'rascunho' and new.status in ('pendente', 'cancelado'))
    or (old.status = 'pendente' and new.status in ('processando', 'pago', 'cancelado'))
    or (old.status = 'processando' and new.status in ('pago', 'falhou'))
    or (old.status = 'falhou' and new.status in ('pendente', 'processando', 'pago', 'cancelado'))
    or (old.status = 'pago' and new.status = 'ajustado')
  ) then
    raise exception 'Transicao de status de % para % nao permitida', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists equipe_validar_transicao_acerto on public.colaborador_acertos;
create trigger equipe_validar_transicao_acerto
before update of status on public.colaborador_acertos
for each row execute function public.validar_transicao_acerto();

create or replace function public.validar_transicao_pagamento()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'pendente' and new.status in ('processando', 'pago', 'falhou', 'cancelado'))
    or (old.status = 'processando' and new.status in ('pago', 'falhou', 'cancelado'))
  ) then
    raise exception 'Transicao de pagamento de % para % nao permitida', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists equipe_validar_transicao_pagamento on public.colaborador_pagamentos;
create trigger equipe_validar_transicao_pagamento
before update of status on public.colaborador_pagamentos
for each row execute function public.validar_transicao_pagamento();

create or replace function public.tem_acesso_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.active
        and wm.role = 'admin'
    );
$$;

revoke all on function public.tem_acesso_workspace(uuid) from public;
grant execute on function public.tem_acesso_workspace(uuid) to authenticated, service_role;

alter table public.workspace_members enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'workspace_members'
  loop
    execute format('drop policy %I on public.workspace_members', v_policy.policyname);
  end loop;
end;
$$;

create policy equipe_workspace_members_select on public.workspace_members
for select to authenticated
using (public.tem_acesso_workspace(workspace_id));

create policy equipe_workspace_members_insert on public.workspace_members
for insert to authenticated
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.user_id = auth.uid()
  )
);

create policy equipe_workspace_members_update on public.workspace_members
for update to authenticated
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.user_id = auth.uid()
  )
);

create policy equipe_workspace_members_delete on public.workspace_members
for delete to authenticated
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.user_id = auth.uid()
  )
);

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
  loop
    execute format('drop policy %I on public.workspaces', v_policy.policyname);
  end loop;
end;
$$;

create policy equipe_workspaces_select on public.workspaces
for select to authenticated
using (public.tem_acesso_workspace(id));

create policy equipe_workspaces_insert on public.workspaces
for insert to authenticated
with check (user_id = auth.uid());

create policy equipe_workspaces_update on public.workspaces
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy equipe_workspaces_delete on public.workspaces
for delete to authenticated
using (user_id = auth.uid());

do $$
declare
  v_table text;
  v_prefix text;
  v_policy record;
begin
  for v_table, v_prefix in
    select * from (values
      ('colaboradores', 'colaboradores'),
      ('colaborador_custos', 'custos'),
      ('colaborador_presencas', 'presencas'),
      ('colaborador_escalas', 'escalas'),
      ('colaborador_acertos', 'acertos'),
      ('colaborador_acerto_itens', 'acerto_itens'),
      ('colaborador_pagamentos', 'pagamentos'),
      ('colaborador_ajustes', 'ajustes')
    ) as equipe_tabelas(tabela, prefixo)
  loop
    execute format('alter table public.%I enable row level security', v_table);

    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = v_table
    loop
      execute format('drop policy %I on public.%I', v_policy.policyname, v_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.tem_acesso_workspace(workspace_id))',
      'equipe_' || v_prefix || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.tem_acesso_workspace(workspace_id))',
      'equipe_' || v_prefix || '_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.tem_acesso_workspace(workspace_id)) with check (public.tem_acesso_workspace(workspace_id))',
      'equipe_' || v_prefix || '_update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.tem_acesso_workspace(workspace_id))',
      'equipe_' || v_prefix || '_delete', v_table
    );
  end loop;
end;
$$;

grant select, insert, update, delete on table
  public.workspace_members,
  public.colaboradores,
  public.colaborador_custos,
  public.colaborador_presencas,
  public.colaborador_escalas,
  public.colaborador_acertos,
  public.colaborador_acerto_itens,
  public.colaborador_pagamentos,
  public.colaborador_ajustes
to authenticated, service_role;

create or replace function public.gerar_acerto_semanal(
  p_colaborador_id uuid,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_colaborador record;
  v_acerto record;
  v_item record;
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

  select c.*, w.user_id as owner_id
    into v_colaborador
  from public.colaboradores c
  join public.workspaces w on w.id = c.workspace_id
  where c.id = p_colaborador_id
  for update of c;

  if not found then
    raise exception 'Colaborador nao encontrado' using errcode = 'P0002';
  end if;

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
        status = 'pendente'
    where id = v_acerto.id;
  else
    insert into public.colaborador_acertos (
      workspace_id, colaborador_id, tipo, periodo_inicio, periodo_fim,
      vencimento, status, valor_total, pix_chave_snapshot
    ) values (
      v_colaborador.workspace_id, p_colaborador_id, v_tipo,
      p_periodo_inicio, p_periodo_fim, p_periodo_fim + 1,
      'pendente', v_total, v_colaborador.pix_chave
    )
    returning * into v_acerto;
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
    insert into public.colaborador_acerto_itens (
      workspace_id, acerto_id, escala_id, natureza, descricao, valor, categoria_id
    ) values (
      v_colaborador.workspace_id, v_acerto.id, v_item.escala_id,
      v_item.natureza, btrim(v_item.descricao), v_item.valor, v_item.categoria_id
    );
  end loop;

  v_owner_id := v_colaborador.owner_id;
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

revoke all on function public.gerar_acerto_semanal(uuid, date, date, jsonb) from public;
grant execute on function public.gerar_acerto_semanal(uuid, date, date, jsonb)
  to authenticated, service_role;

create or replace function public.iniciar_pagamento_acerto(
  p_acerto_id uuid,
  p_origem text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acerto record;
  v_pagamento record;
  v_tentativa integer;
  v_idempotency_key text;
begin
  if p_origem not in ('wallet_divipay', 'manual') then
    raise exception 'Origem invalida para inicio de pagamento' using errcode = '22023';
  end if;

  select a.* into v_acerto
  from public.colaborador_acertos a
  where a.id = p_acerto_id
  for update;

  if not found then
    raise exception 'Acerto nao encontrado' using errcode = 'P0002';
  end if;

  if not public.tem_acesso_workspace(v_acerto.workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  select p.* into v_pagamento
  from public.colaborador_pagamentos p
  where p.acerto_id = p_acerto_id
    and p.status in ('pendente', 'processando')
  order by p.created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'pagamento_id', v_pagamento.id,
      'idempotency_key', v_pagamento.idempotency_key,
      'status', v_pagamento.status
    );
  end if;

  if v_acerto.status not in ('pendente', 'falhou') then
    raise exception 'Acerto nao esta disponivel para pagamento' using errcode = 'P0001';
  end if;

  if nullif(btrim(v_acerto.pix_chave_snapshot), '') is null and p_origem = 'wallet_divipay' then
    raise exception 'Acerto sem chave Pix valida' using errcode = '22023';
  end if;

  select count(*) + 1 into v_tentativa
  from public.colaborador_pagamentos
  where acerto_id = p_acerto_id;

  v_idempotency_key := 'equipe:' || p_acerto_id::text || ':' || lpad(v_tentativa::text, 3, '0');

  insert into public.colaborador_pagamentos (
    workspace_id, acerto_id, status, origem, valor, taxa, idempotency_key
  ) values (
    v_acerto.workspace_id, p_acerto_id, 'processando', p_origem,
    v_acerto.valor_total, 0, v_idempotency_key
  ) returning * into v_pagamento;

  update public.colaborador_acertos
  set status = 'processando'
  where id = p_acerto_id;

  return jsonb_build_object(
    'pagamento_id', v_pagamento.id,
    'idempotency_key', v_pagamento.idempotency_key,
    'status', v_pagamento.status
  );
end;
$$;

revoke all on function public.iniciar_pagamento_acerto(uuid, text) from public;
grant execute on function public.iniciar_pagamento_acerto(uuid, text)
  to authenticated, service_role;

create or replace function public.registrar_falha_pagamento(
  p_pagamento_id uuid,
  p_erro_codigo text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pagamento record;
begin
  select p.* into v_pagamento
  from public.colaborador_pagamentos p
  where p.id = p_pagamento_id
  for update;

  if not found then
    raise exception 'Pagamento nao encontrado' using errcode = 'P0002';
  end if;

  if not public.tem_acesso_workspace(v_pagamento.workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  if v_pagamento.status = 'falhou' then
    return v_pagamento.id;
  end if;

  if v_pagamento.status not in ('pendente', 'processando') then
    raise exception 'Pagamento nao aceita registro de falha' using errcode = 'P0001';
  end if;

  update public.colaborador_pagamentos
  set status = 'falhou',
      erro_codigo = left(coalesce(nullif(p_erro_codigo, ''), 'provider_error'), 100)
  where id = p_pagamento_id;

  update public.colaborador_acertos
  set status = 'falhou'
  where id = v_pagamento.acerto_id and status = 'processando';

  return p_pagamento_id;
end;
$$;

revoke all on function public.registrar_falha_pagamento(uuid, text) from public;
grant execute on function public.registrar_falha_pagamento(uuid, text)
  to authenticated, service_role;

create or replace function public.confirmar_pagamento_acerto(
  p_acerto_id uuid,
  p_divipay_external_id text,
  p_pagamento_id uuid,
  p_origem text,
  p_valor numeric,
  p_taxa numeric,
  p_comprovante_url text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acerto record;
  v_pagamento record;
  v_pagamento_existente record;
  v_valor numeric(12,2);
begin
  if nullif(btrim(p_divipay_external_id), '') is null then
    raise exception 'ID externo do Divipay e obrigatorio' using errcode = '22023';
  end if;

  if p_origem not in ('wallet_divipay', 'divipay_externo', 'manual') then
    raise exception 'Origem de pagamento invalida' using errcode = '22023';
  end if;

  if coalesce(p_taxa, 0) < 0 then
    raise exception 'Taxa de pagamento invalida' using errcode = '22023';
  end if;

  select p.* into v_pagamento_existente
  from public.colaborador_pagamentos p
  where p.divipay_external_id = btrim(p_divipay_external_id)
  for update;

  if found then
    if v_pagamento_existente.acerto_id <> p_acerto_id then
      raise exception 'ID externo ja vinculado a outro acerto' using errcode = '23505';
    end if;

    if not public.tem_acesso_workspace(v_pagamento_existente.workspace_id) then
      raise exception 'Acesso negado ao workspace' using errcode = '42501';
    end if;

    return v_pagamento_existente.id;
  end if;

  select a.* into v_acerto
  from public.colaborador_acertos a
  where a.id = p_acerto_id
  for update;

  if not found then
    raise exception 'Acerto nao encontrado' using errcode = 'P0002';
  end if;

  if not public.tem_acesso_workspace(v_acerto.workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  if v_acerto.status in ('pago', 'ajustado', 'cancelado') then
    raise exception 'Acerto finalizado nao aceita novo pagamento' using errcode = 'P0001';
  end if;

  v_valor := coalesce(p_valor, v_acerto.valor_total);
  if v_valor <> v_acerto.valor_total then
    raise exception 'Valor do pagamento difere do total do acerto' using errcode = '23514';
  end if;

  if p_pagamento_id is not null then
    select p.* into v_pagamento
    from public.colaborador_pagamentos p
    where p.id = p_pagamento_id
    for update;

    if not found or v_pagamento.acerto_id <> p_acerto_id then
      raise exception 'Tentativa de pagamento nao pertence ao acerto' using errcode = '23514';
    end if;

    if v_pagamento.status not in ('pendente', 'processando') then
      raise exception 'Tentativa de pagamento nao pode ser confirmada' using errcode = 'P0001';
    end if;

    update public.colaborador_pagamentos
    set status = 'pago',
        origem = p_origem,
        valor = v_valor,
        taxa = coalesce(p_taxa, 0),
        divipay_external_id = btrim(p_divipay_external_id),
        comprovante_url = p_comprovante_url,
        erro_codigo = null,
        paid_at = now()
    where id = p_pagamento_id
    returning * into v_pagamento;
  else
    insert into public.colaborador_pagamentos (
      workspace_id, acerto_id, status, origem, valor, taxa,
      idempotency_key, divipay_external_id, comprovante_url, paid_at
    ) values (
      v_acerto.workspace_id,
      p_acerto_id,
      'pago',
      p_origem,
      v_valor,
      coalesce(p_taxa, 0),
      'divipay-ext:' || btrim(p_divipay_external_id),
      btrim(p_divipay_external_id),
      p_comprovante_url,
      now()
    ) returning * into v_pagamento;
  end if;

  update public.colaborador_acertos
  set status = 'pago'
  where id = p_acerto_id;

  if v_acerto.despesa_id is not null then
    update public.despesas
    set status = 'pago', updated_at = now()
    where id = v_acerto.despesa_id;
  end if;

  return v_pagamento.id;
end;
$$;

revoke all on function public.confirmar_pagamento_acerto(uuid, text, uuid, text, numeric, numeric, text) from public;
grant execute on function public.confirmar_pagamento_acerto(uuid, text, uuid, text, numeric, numeric, text)
  to authenticated, service_role;

create or replace function public.cancelar_escala_e_recalcular_acerto(
  p_escala_id uuid,
  p_motivo text default 'Escala cancelada'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escala record;
  v_item record;
  v_acerto record;
  v_novo_total numeric(12,2);
begin
  select e.* into v_escala
  from public.colaborador_escalas e
  where e.id = p_escala_id
  for update;

  if not found then
    raise exception 'Escala nao encontrada' using errcode = 'P0002';
  end if;

  if not public.tem_acesso_workspace(v_escala.workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;

  if v_escala.status = 'cancelada' then
    select i.acerto_id into v_acerto.id
    from public.colaborador_acerto_itens i
    where i.escala_id = p_escala_id
    limit 1;
    return v_acerto.id;
  end if;

  select i.* into v_item
  from public.colaborador_acerto_itens i
  where i.escala_id = p_escala_id
  limit 1
  for update;

  if found then
    select a.* into v_acerto
    from public.colaborador_acertos a
    where a.id = v_item.acerto_id
    for update;

    if v_acerto.status = 'processando' then
      raise exception 'Nao e possivel cancelar escala com pagamento processando' using errcode = 'P0001';
    end if;
  end if;

  update public.colaborador_escalas
  set status = 'cancelada',
      cancelado_em = now(),
      cancelamento_motivo = left(coalesce(nullif(p_motivo, ''), 'Escala cancelada'), 300)
  where id = p_escala_id;

  if v_item.id is null then
    return null;
  end if;

  if v_acerto.status in ('pago', 'ajustado') then
    insert into public.colaborador_ajustes (
      workspace_id, colaborador_id, acerto_origem_id, valor, motivo
    ) values (
      v_acerto.workspace_id,
      v_acerto.colaborador_id,
      v_acerto.id,
      -abs(v_item.valor),
      left('Credito por cancelamento apos pagamento: ' || coalesce(p_motivo, 'Escala cancelada'), 500)
    );

    if v_acerto.status = 'pago' then
      update public.colaborador_acertos set status = 'ajustado' where id = v_acerto.id;
    end if;

    return v_acerto.id;
  end if;

  delete from public.colaborador_acerto_itens where id = v_item.id;

  select coalesce(sum(valor), 0) into v_novo_total
  from public.colaborador_acerto_itens
  where acerto_id = v_acerto.id;

  if v_novo_total <= 0 then
    update public.colaborador_acertos
    set valor_total = 0, status = 'cancelado'
    where id = v_acerto.id;

    if v_acerto.despesa_id is not null then
      update public.despesas
      set status = 'cancelado', updated_at = now()
      where id = v_acerto.despesa_id;
    end if;
  else
    update public.colaborador_acertos
    set valor_total = v_novo_total
    where id = v_acerto.id;

    if v_acerto.despesa_id is not null then
      update public.despesas
      set valor = v_novo_total, updated_at = now()
      where id = v_acerto.despesa_id;
    end if;
  end if;

  return v_acerto.id;
end;
$$;

revoke all on function public.cancelar_escala_e_recalcular_acerto(uuid, text) from public;
grant execute on function public.cancelar_escala_e_recalcular_acerto(uuid, text)
  to authenticated, service_role;

comment on table public.colaborador_acertos is
  'Obrigacoes financeiras imutaveis por colaborador e periodo.';
comment on table public.colaborador_acerto_itens is
  'Composicao contabil do acerto; transporte, meta, diaria, salario e pro-labore permanecem separados.';
comment on table public.colaborador_pagamentos is
  'Tentativas e confirmacoes idempotentes de pagamento da Equipe.';
