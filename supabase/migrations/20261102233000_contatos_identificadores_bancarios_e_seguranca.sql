-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261102233000_contatos_identificadores_bancarios_e_seguranca.sql
-- Domínio: Financeiro / Fornecedores / Conciliação Divipay / Segurança
-- Finalidade:
--   1. Evoluir tabela contatos com dados cadastrais completos, identificadores bancários
--      (Pix principal, múltiplas chaves autorizadas, documento/nome beneficiário, boletos)
--      e categoria financeira padrão.
--   2. Normalização automática e trilha de auditoria para identificadores bancários.
--   3. Ampliar divipay_conciliacoes como repositório canônico de vínculos financeiros
--      (contato_id, colaborador_id, acerto_id, categoria_id, metodo_pagamento, evidencias).
--   4. Blindar a RPC registrar_pagamento_colaborador_manual contra violação de isolamento
--      entre workspaces, despesas cruzadas e concorrência com pagamentos em processamento.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Campos avançados na tabela contatos (cadastro operacional preferencial)
alter table public.contatos
  add column if not exists nome_fantasia text,
  add column if not exists categoria_padrao_id uuid references public.categorias(id) on delete set null,
  add column if not exists subcategoria_padrao_id uuid references public.subcategorias(id) on delete set null,
  add column if not exists ativo boolean not null default true,
  add column if not exists pix_chave text,
  add column if not exists pix_tipo text,
  add column if not exists pix_chave_normalizada text,
  add column if not exists beneficiario_documento text,
  add column if not exists beneficiario_documento_normalizado text,
  add column if not exists beneficiario_nome text,
  add column if not exists chaves_pix_adicionais jsonb not null default '[]'::jsonb,
  add column if not exists identificadores_boletos jsonb not null default '[]'::jsonb,
  add column if not exists historico_identificadores jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Função de normalização e auditoria de identificadores de contatos
create or replace function public.normalizar_contato_identificadores()
returns trigger
language plpgsql
as $$
declare
  v_chave_limpa text;
  v_doc_limpo text;
  v_cnpj_limpo text;
  v_evento jsonb;
begin
  -- Normaliza Chave Pix
  if new.pix_chave is not null and btrim(new.pix_chave) <> '' then
    v_chave_limpa := btrim(new.pix_chave);
    if position('@' in v_chave_limpa) > 0 then
      new.pix_chave_normalizada := lower(v_chave_limpa);
    else
      new.pix_chave_normalizada := lower(regexp_replace(v_chave_limpa, '[^a-zA-Z0-9]', '', 'g'));
    end if;
  else
    new.pix_chave_normalizada := null;
  end if;

  -- Normaliza Documento do Beneficiário
  if new.beneficiario_documento is not null and btrim(new.beneficiario_documento) <> '' then
    v_doc_limpo := regexp_replace(new.beneficiario_documento, '\D', '', 'g');
    new.beneficiario_documento_normalizado := nullif(v_doc_limpo, '');
  else
    new.beneficiario_documento_normalizado := null;
  end if;

  -- Normaliza CNPJ/CPF principal caso fornecido
  if new.cnpj_cpf is not null and btrim(new.cnpj_cpf) <> '' then
    v_cnpj_limpo := regexp_replace(new.cnpj_cpf, '\D', '', 'g');
    -- Mantém dígitos limpos no campo caso seja só número
    if v_cnpj_limpo <> '' and length(v_cnpj_limpo) in (11, 14) then
      new.cnpj_cpf := v_cnpj_limpo;
    end if;
  end if;

  -- Auditoria de alterações em identificadores bancários
  if tg_op = 'UPDATE' then
    if (old.pix_chave is distinct from new.pix_chave) or
       (old.beneficiario_documento is distinct from new.beneficiario_documento) or
       (old.beneficiario_nome is distinct from new.beneficiario_nome) or
       (old.chaves_pix_adicionais is distinct from new.chaves_pix_adicionais) or
       (old.identificadores_boletos is distinct from new.identificadores_boletos) then

      v_evento := jsonb_build_object(
        'alterado_em', now(),
        'alterado_por', auth.uid(),
        'pix_anterior', old.pix_chave,
        'pix_novo', new.pix_chave,
        'doc_beneficiario_anterior', old.beneficiario_documento,
        'doc_beneficiario_novo', new.beneficiario_documento,
        'nome_beneficiario_anterior', old.beneficiario_nome,
        'nome_beneficiario_novo', new.beneficiario_nome
      );

      new.historico_identificadores := coalesce(old.historico_identificadores, '[]'::jsonb) || jsonb_build_array(v_evento);
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalizar_contato_identificadores on public.contatos;
create trigger trg_normalizar_contato_identificadores
  before insert or update on public.contatos
  for each row
  execute function public.normalizar_contato_identificadores();

-- 3. Índices otimizados para busca de conciliação em contatos
create index if not exists idx_contatos_workspace_pix_norm
  on public.contatos (workspace_id, pix_chave_normalizada)
  where pix_chave_normalizada is not null and ativo = true;

create index if not exists idx_contatos_workspace_doc_norm
  on public.contatos (workspace_id, beneficiario_documento_normalizado)
  where beneficiario_documento_normalizado is not null and ativo = true;

create index if not exists idx_contatos_workspace_cnpj_cpf
  on public.contatos (workspace_id, cnpj_cpf)
  where cnpj_cpf is not null and ativo = true;

-- 4. Ampliação canônica de divipay_conciliacoes (ETAPA 7: Unificação de Vínculos Financeiros)
alter table public.divipay_conciliacoes
  add column if not exists beneficiario_tipo text check (beneficiario_tipo in ('fornecedor', 'colaborador', 'socio', 'outro')),
  add column if not exists contato_id uuid references public.contatos(id) on delete set null,
  add column if not exists colaborador_id uuid references public.colaboradores(id) on delete set null,
  add column if not exists acerto_id uuid references public.colaborador_acertos(id) on delete set null,
  add column if not exists categoria_id uuid references public.categorias(id) on delete set null,
  add column if not exists subcategoria_id uuid references public.subcategorias(id) on delete set null,
  add column if not exists metodo_pagamento text check (metodo_pagamento in ('pix', 'boleto', 'cartao', 'ted', 'outro')),
  add column if not exists origem_evidencia text,
  add column if not exists linha_digitavel text,
  add column if not exists codigo_barras text,
  add column if not exists competencia text,
  add column if not exists comprovante_url text,
  add column if not exists valor_aplicado numeric default 0,
  add column if not exists saldo_remanescente numeric default 0,
  add column if not exists revisado_por uuid references auth.users(id) on delete set null,
  add column if not exists revisado_em timestamptz,
  add column if not exists motivo_revisao text;

create index if not exists idx_divipay_conciliacoes_contato
  on public.divipay_conciliacoes (workspace_id, contato_id)
  where contato_id is not null;

create index if not exists idx_divipay_conciliacoes_colaborador
  on public.divipay_conciliacoes (workspace_id, colaborador_id)
  where colaborador_id is not null;

-- 5. RPC registrar_pagamento_colaborador_manual blindada com validação estrita de segurança (ETAPA 9)
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
  v_despesa record;
  v_pagamento_existente record;
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

  -- Obter colaborador e verificar permissão estrita no workspace
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
    raise exception 'Acesso negado ao workspace do colaborador' using errcode = '42501';
  end if;

  -- Validação estrita de despesa pré-existente (ETAPA 9: Não usar despesa de outro workspace)
  if p_despesa_id is not null then
    select * into v_despesa
    from public.despesas
    where id = p_despesa_id
    for update;

    if not found then
      raise exception 'Despesa informada nao encontrada' using errcode = 'P0002';
    end if;

    if v_despesa.workspace_id is distinct from v_colaborador.workspace_id then
      raise exception 'Violacao de isolamento: despesa pertence a outro workspace' using errcode = '42501';
    end if;

    -- Impedir conciliação com despesa cancelada ou já vinculada a outro acerto ativo
    if exists (
      select 1 from public.colaborador_acertos
      where despesa_id = p_despesa_id
        and id <> coalesce(p_acerto_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and colaborador_id <> p_colaborador_id
    ) then
      raise exception 'Esta despesa ja esta vinculada ao acerto de outro colaborador' using errcode = '23505';
    end if;
  end if;

  -- Validação estrita de referência externa Divipay (ETAPA 9: Unicidade e não-duplicação)
  if p_referencia is not null and btrim(p_referencia) <> '' then
    if exists (
      select 1 from public.colaborador_pagamentos
      where divipay_external_id = btrim(p_referencia)
        and acerto_id <> coalesce(p_acerto_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'Esta referencia de pagamento ja foi vinculada a outro pagamento' using errcode = '23505';
    end if;
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
      raise exception 'Acerto especificado nao encontrado para este colaborador' using errcode = 'P0002';
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
    -- Proteção contra conversão de pagamento atualmente em processamento (ETAPA 9)
    select * into v_pagamento_existente
    from public.colaborador_pagamentos
    where acerto_id = v_acerto.id
      and status in ('processando', 'pending')
    limit 1;

    if v_pagamento_existente.id is not null and p_origem = 'manual' then
      raise exception 'Existe um pagamento automatizado em processamento para este acerto. Aguarde a confirmacao bancaria.' using errcode = '55P03';
    end if;

    -- Se o acerto já está pago e possui pagamento confirmado
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
        'referencia', p_referencia,
        'registrado_por', auth.uid(),
        'registrado_em', now()
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

revoke all on function public.registrar_pagamento_colaborador_manual(
  uuid, text, date, date, numeric, timestamptz, text, text, text, text, uuid, uuid
) from public, anon;

grant execute on function public.registrar_pagamento_colaborador_manual(
  uuid, text, date, date, numeric, timestamptz, text, text, text, text, uuid, uuid
) to authenticated, service_role;
