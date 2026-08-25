-- ─── TABELA DE MAPEAMENTO DE ITENS PLUGGY (OPEN FINANCE) ───
-- Garante integridade e validação de propriedade por usuário e workspace.
-- item_id possui UNIQUE global: um item Pluggy não pode ser registrado
-- simultaneamente por múltiplos usuários ou workspaces.

create table if not exists public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_id text not null unique,
  connector_id integer,
  connector_name text,
  client_user_id text,
  status text default 'UPDATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices de busca
create index if not exists idx_pluggy_items_workspace_id on public.pluggy_items(workspace_id);
create index if not exists idx_pluggy_items_user_id on public.pluggy_items(user_id);
create index if not exists idx_pluggy_items_item_id on public.pluggy_items(item_id);

-- Habilitar Row Level Security (RLS)
alter table public.pluggy_items enable row level security;

-- Políticas de RLS usando tem_acesso_workspace
drop policy if exists "pluggy_items_select_policy" on public.pluggy_items;
create policy "pluggy_items_select_policy"
  on public.pluggy_items
  for select
  to authenticated
  using (public.tem_acesso_workspace(workspace_id));

drop policy if exists "pluggy_items_insert_policy" on public.pluggy_items;
create policy "pluggy_items_insert_policy"
  on public.pluggy_items
  for insert
  to authenticated
  with check (public.tem_acesso_workspace(workspace_id) and auth.uid() = user_id);

drop policy if exists "pluggy_items_update_policy" on public.pluggy_items;
create policy "pluggy_items_update_policy"
  on public.pluggy_items
  for update
  to authenticated
  using (public.tem_acesso_workspace(workspace_id))
  with check (public.tem_acesso_workspace(workspace_id) and auth.uid() = user_id);

drop policy if exists "pluggy_items_delete_policy" on public.pluggy_items;
create policy "pluggy_items_delete_policy"
  on public.pluggy_items
  for delete
  to authenticated
  using (public.tem_acesso_workspace(workspace_id));

-- ─── COLUNAS PARA SINCRONIZAÇÃO IDEMPOTENTE ───
-- Permite que syncItem realize UPSERT sem duplicar contas ou transações em chamadas repetidas.

alter table public.contas_usuario
  add column if not exists pluggy_account_id text;

create unique index if not exists uq_contas_usuario_pluggy_account
  on public.contas_usuario(workspace_id, pluggy_account_id)
  where pluggy_account_id is not null;

alter table public.transacoes
  add column if not exists pluggy_transaction_id text;

create unique index if not exists uq_transacoes_pluggy_transaction
  on public.transacoes(workspace_id, pluggy_transaction_id)
  where pluggy_transaction_id is not null;
