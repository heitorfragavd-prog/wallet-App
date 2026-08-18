begin;

alter table public.workspaces
  add column if not exists regime_encargos text not null default 'geral',
  add column if not exists piso_categoria numeric(12,2),
  add column if not exists piso_vigencia_inicio date,
  add column if not exists convencao_mte text,
  add column if not exists convencao_fonte_url text;

alter table public.workspaces
  drop constraint if exists workspaces_regime_encargos_check;
alter table public.workspaces
  add constraint workspaces_regime_encargos_check
  check (regime_encargos in ('mei', 'geral'));

update public.workspaces
set regime_encargos = 'mei',
    piso_categoria = 1681.18,
    piso_vigencia_inicio = date '2026-01-01',
    convencao_mte = 'MR009846/2026',
    convencao_fonte_url = 'https://mediador.trabalho.gov.br/sistemas/mediador/Resumo/ResumoVisualizar?NrSolicitacao=MR009846%2F2026'
where tipo = 'PJ' and lower(trim(nome)) = 'conta rodo point';

commit;
