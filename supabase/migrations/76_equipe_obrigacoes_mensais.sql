-- Obrigações mensais da Equipe: salários no 5º dia útil e pró-labore em dia configurável.

create table if not exists public.equipe_feriados (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data date not null,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, data)
);

create index if not exists equipe_feriados_workspace_data_idx
  on public.equipe_feriados (workspace_id, data);

alter table public.equipe_feriados enable row level security;

drop policy if exists equipe_feriados_select on public.equipe_feriados;
drop policy if exists equipe_feriados_insert on public.equipe_feriados;
drop policy if exists equipe_feriados_update on public.equipe_feriados;
drop policy if exists equipe_feriados_delete on public.equipe_feriados;

create policy equipe_feriados_select on public.equipe_feriados
for select to authenticated using (public.tem_acesso_workspace(workspace_id));
create policy equipe_feriados_insert on public.equipe_feriados
for insert to authenticated with check (public.tem_acesso_workspace(workspace_id));
create policy equipe_feriados_update on public.equipe_feriados
for update to authenticated
using (public.tem_acesso_workspace(workspace_id))
with check (public.tem_acesso_workspace(workspace_id));
create policy equipe_feriados_delete on public.equipe_feriados
for delete to authenticated using (public.tem_acesso_workspace(workspace_id));

grant select, insert, update, delete on public.equipe_feriados to authenticated, service_role;

update public.colaboradores
set dia_pagamento = 16
where tipo = 'socio' and dia_pagamento is null and lower(nome) like 'heitor%';

update public.colaboradores
set dia_pagamento = 25
where tipo = 'socio' and dia_pagamento is null and lower(nome) like 'viviane%';

update public.colaboradores
set valor_pro_labore = coalesce(salario_bruto, 0)
where tipo = 'socio' and valor_pro_labore = 0 and coalesce(salario_bruto, 0) > 0;

create or replace function public.equipe_quinto_dia_util(
  p_competencia date,
  p_workspace_id uuid
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select dia::date
  from generate_series(
    date_trunc('month', p_competencia)::date,
    (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) as dias(dia)
  where extract(isodow from dia) between 1 and 5
    and not exists (
      select 1
      from public.equipe_feriados f
      where f.workspace_id = p_workspace_id and f.data = dia::date
    )
  order by dia
  offset 4 limit 1;
$$;

revoke all on function public.equipe_quinto_dia_util(date, uuid) from public;
grant execute on function public.equipe_quinto_dia_util(date, uuid) to authenticated, service_role;

create or replace function public.gerar_obrigacoes_mensais_equipe(
  p_competencia date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_colaborador record;
  v_tipo text;
  v_natureza text;
  v_valor numeric(12,2);
  v_vencimento date;
  v_acerto_id uuid;
  v_despesa_id uuid;
  v_total integer := 0;
  v_processa_todos boolean := coalesce(auth.role() = 'service_role', false)
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
begin
  if p_competencia is null then
    raise exception 'Competencia obrigatoria' using errcode = '22023';
  end if;

  for v_colaborador in
    select c.*, w.user_id as owner_id
    from public.colaboradores c
    join public.workspaces w on w.id = c.workspace_id
    where c.tipo in ('funcionario', 'socio')
      and coalesce(c.status, 'ativo') <> 'demitido'
      and c.data_demissao is null
      and (v_processa_todos or public.tem_acesso_workspace(c.workspace_id))
    order by c.workspace_id, c.id
  loop
    if v_colaborador.tipo = 'funcionario' then
      v_tipo := 'salario';
      v_natureza := 'salario';
      v_valor := coalesce(v_colaborador.salario_bruto, 0);
      v_vencimento := public.equipe_quinto_dia_util(v_inicio, v_colaborador.workspace_id);
    else
      v_tipo := 'pro_labore';
      v_natureza := 'pro_labore';
      v_valor := coalesce(nullif(v_colaborador.valor_pro_labore, 0), v_colaborador.salario_bruto, 0);
      v_vencimento := v_inicio + (coalesce(v_colaborador.dia_pagamento, 16) - 1);
    end if;

    if v_valor <= 0 or v_vencimento is null then
      continue;
    end if;

    v_acerto_id := null;
    insert into public.colaborador_acertos (
      workspace_id, colaborador_id, tipo, periodo_inicio, periodo_fim,
      vencimento, status, valor_total, pix_chave_snapshot
    ) values (
      v_colaborador.workspace_id, v_colaborador.id, v_tipo, v_inicio, v_fim,
      v_vencimento, 'pendente', v_valor, v_colaborador.pix_chave
    )
    on conflict (colaborador_id, tipo, periodo_inicio, periodo_fim) do nothing
    returning id into v_acerto_id;

    if v_acerto_id is null then
      continue;
    end if;

    insert into public.colaborador_acerto_itens (
      workspace_id, acerto_id, natureza, descricao, valor
    ) values (
      v_colaborador.workspace_id,
      v_acerto_id,
      v_natureza,
      case when v_tipo = 'salario' then 'Salário mensal' else 'Pró-labore mensal' end,
      v_valor
    );

    insert into public.despesas (
      user_id, workspace_id, descricao, valor, data, status, observacoes
    ) values (
      v_colaborador.owner_id,
      v_colaborador.workspace_id,
      case when v_tipo = 'salario' then 'Salário: ' else 'Pró-labore: ' end || v_colaborador.nome,
      v_valor,
      v_vencimento,
      'pendente',
      'Obrigação mensal gerada automaticamente pela Equipe'
    ) returning id into v_despesa_id;

    update public.colaborador_acertos
    set despesa_id = v_despesa_id
    where id = v_acerto_id;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.gerar_obrigacoes_mensais_equipe(date) from public;
grant execute on function public.gerar_obrigacoes_mensais_equipe(date) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'equipe-obrigacoes-mensais-diario';

    perform cron.schedule(
      'equipe-obrigacoes-mensais-diario',
      '15 3 * * *',
      'select public.gerar_obrigacoes_mensais_equipe(current_date);'
    );
  end if;
exception
  when insufficient_privilege or undefined_table or undefined_function then
    raise notice 'pg_cron indisponível; o frontend executará o fallback idempotente';
end;
$$;

comment on function public.gerar_obrigacoes_mensais_equipe(date) is
  'Gera salários e pró-labores pendentes uma única vez por competência.';
