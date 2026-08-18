-- Esquema mínimo que reproduz o estado legado relevante do módulo Equipe.
-- Ele existe apenas para testes locais; não substitui o histórico remoto.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo varchar(10) not null default 'PF' check (tipo in ('PF', 'PJ')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  nome text not null,
  tipo text not null default 'despesa',
  created_at timestamptz not null default now()
);

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  categoria_id uuid references public.categorias(id) on delete set null,
  descricao text not null,
  valor numeric(12,2) not null,
  data date not null,
  status text not null default 'pendente',
  metodo_pagamento text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null,
  data date not null,
  tipo text not null default 'despesa',
  status text not null default 'pendente',
  divipay_transaction_id text,
  created_at timestamptz not null default now()
);

create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nome text not null,
  foto_url text,
  tipo text not null check (tipo in ('funcionario', 'socio')),
  cargo text,
  data_admissao date,
  data_demissao date,
  salario_bruto numeric(12,2) default 0,
  vale_transporte numeric(12,2) default 0,
  vale_transporte_diario numeric(10,2) default 0,
  vale_refeicao numeric(12,2) default 0,
  outros_beneficios numeric(12,2) default 0,
  status text default 'ativo' check (status in ('ativo', 'ferias', 'afastado', 'experiencia', 'demitido')),
  dias_experiencia integer default 90,
  carga_horaria_semanal integer default 44,
  contato_emergencia_1 text,
  contato_emergencia_2 text,
  cpf text,
  rg text,
  data_nascimento date,
  telefone text,
  email text,
  endereco text,
  pix_tipo text,
  pix_chave text,
  banco_nome text,
  banco_agencia text,
  banco_conta text,
  linha_onibus text,
  valor_passagem numeric(12,2) default 6.25,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.colaborador_custos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  workspace_id uuid references public.workspaces(id),
  tipo text not null check (tipo in (
    'salario', 'folguista', 'adiantamento', 'hora_extra', 'comissao',
    'premio', 'vale', 'desconto', 'outro', 'acerto_transporte',
    'uber_semanal', 'passagem_semanal', 'transporte_diferenca'
  )),
  valor numeric(12,2) not null,
  data date not null,
  descricao text,
  lancado_na_despesa boolean default false,
  created_at timestamptz default now()
);

create table public.colaborador_presencas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  data date not null,
  presente boolean default true,
  horas_trabalhadas numeric(4,2),
  atraso_minutos integer default 0,
  justificativa text,
  unique (colaborador_id, data)
);

create table public.colaborador_escalas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data date not null,
  turno text default 'integral',
  valor_diaria numeric(10,2) not null default 100,
  bateu_meta boolean default false,
  valor_meta numeric(10,2) default 20,
  valor_total numeric(10,2) not null default 100,
  observacao text,
  created_at timestamptz default now()
);

alter table public.workspaces enable row level security;
alter table public.categorias enable row level security;
alter table public.despesas enable row level security;
alter table public.transacoes enable row level security;
alter table public.colaboradores enable row level security;
alter table public.colaborador_custos enable row level security;
alter table public.colaborador_presencas enable row level security;
alter table public.colaborador_escalas enable row level security;

create policy "Usuarios gerenciam colaboradores do workspace"
  on public.colaboradores for all to authenticated using (true) with check (true);
create policy "Usuarios gerenciam custos do workspace"
  on public.colaborador_custos for all to authenticated using (true) with check (true);
create policy "Usuarios gerenciam presencas do workspace"
  on public.colaborador_presencas for all to authenticated using (true) with check (true);
create policy "Permitir tudo aos usuarios autenticados em escalas"
  on public.colaborador_escalas for all to authenticated using (true) with check (true);

create policy "Users can manage their own despesas"
  on public.despesas for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.workspaces,
  public.categorias,
  public.despesas,
  public.transacoes,
  public.colaboradores,
  public.colaborador_custos,
  public.colaborador_presencas,
  public.colaborador_escalas
to authenticated;
