-- Migration: 20261018170000_sec003_2_blocker04_webhook_idempotency.sql
-- Descrição: Hardening de Idempotência Atômica, Recuperação de Falhas e Consistência Financeira (SEC-003.2 / Bloqueador 04)
-- - Garante unicidade e idempotência de pagamentos por (provider, transaction_id)
-- - Implementa ciclo de vida completo com recuperação de falhas para telegram_processed_updates
-- - Implementa RPC transacional atômica para confirmação de cash-in Divipay (transação + receita + despesa)
-- - Implementa RPC transacional atômica para registro de pagamentos de assinaturas (pagamento + ativação)

BEGIN;

-- ============================================================================
-- 1. TABELA subscription_payments: Idempotência Multi-Provedor e Subscriptions
-- ============================================================================

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'pepper';

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS transaction_id TEXT;

-- Índice único condicional seguro para registros históricos (não quebra linhas legadas sem transaction_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_provider_tx
  ON public.subscription_payments (COALESCE(provider, 'pepper'), transaction_id)
  WHERE transaction_id IS NOT NULL;

-- Hardening da tabela public.subscriptions para suporte a idempotência e ativação
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Verificação prévia de unicidade de user_id antes de criar o índice
DO $$
DECLARE
  v_dup_users integer;
BEGIN
  SELECT count(*) INTO v_dup_users
  FROM (
    SELECT user_id FROM public.subscriptions GROUP BY user_id HAVING count(*) > 1
  ) d;

  IF v_dup_users > 0 THEN
    RAISE EXCEPTION 'Atenção: Existem assinaturas duplicadas para o mesmo user_id (total: % usuários). Intervenção manual requerida para desambiguação segura.', v_dup_users;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);

-- ============================================================================
-- 2. TABELA telegram_processed_updates: Ciclo de Vida e Recuperação
-- ============================================================================

ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
  CHECK (status IN ('processing', 'completed', 'failed'));

ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ============================================================================
-- 3. RPC: Reivindicação Atômica e Recuperação de Updates do Telegram
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reivindicar_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default',
  p_chat_id BIGINT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 180,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS TABLE (
  should_process BOOLEAN,
  current_status TEXT,
  attempt_count INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_effective_bot_id TEXT := COALESCE(p_bot_id, 'default');
BEGIN
  -- 1. Bloqueia linha existente ou detecta ausência
  SELECT * INTO v_rec
  FROM public.telegram_processed_updates
  WHERE bot_id = v_effective_bot_id AND update_id = p_update_id
  FOR UPDATE;

  -- 2. Primeira vez que o evento é visto: registra como processing
  IF NOT FOUND THEN
    INSERT INTO public.telegram_processed_updates (
      update_id,
      bot_id,
      chat_id,
      status,
      attempt_count,
      last_attempt_at,
      processed_at,
      expires_at
    )
    VALUES (
      p_update_id,
      v_effective_bot_id,
      p_chat_id,
      'processing',
      1,
      now(),
      now(),
      now() + interval '48 hours'
    );

    RETURN QUERY SELECT true, 'processing'::TEXT, 1, 'new_update_claimed'::TEXT;
    RETURN;
  END IF;

  -- 3. Se já concluído: idempotente, não reprocessa
  IF v_rec.status = 'completed' THEN
    RETURN QUERY SELECT false, 'completed'::TEXT, v_rec.attempt_count, 'already_completed'::TEXT;
    RETURN;
  END IF;

  -- 4. Se em processamento: verificar se o lease expirou (worker anterior travou/caiu)
  IF v_rec.status = 'processing' THEN
    IF (now() - v_rec.last_attempt_at) < (p_lease_seconds || ' seconds')::interval THEN
      -- Lease ainda ativo: outra instância está executando ativamente
      RETURN QUERY SELECT false, 'processing'::TEXT, v_rec.attempt_count, 'in_flight_concurrent'::TEXT;
      RETURN;
    ELSE
      -- Lease expirado (stale): assume controle para não perder a mensagem/documento
      IF v_rec.attempt_count < p_max_attempts THEN
        UPDATE public.telegram_processed_updates
        SET attempt_count = v_rec.attempt_count + 1,
            last_attempt_at = now(),
            error_message = 'Recuperado de reserva abandonada (stale lease)'
        WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

        RETURN QUERY SELECT true, 'processing'::TEXT, v_rec.attempt_count + 1, 'stale_lease_recovered'::TEXT;
        RETURN;
      ELSE
        UPDATE public.telegram_processed_updates
        SET status = 'failed',
            error_message = 'Limite máximo de tentativas excedido após reserva abandonada'
        WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

        RETURN QUERY SELECT false, 'failed'::TEXT, v_rec.attempt_count, 'max_attempts_exceeded'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 5. Se o status for failed: permite retentativa se não tiver estourado max_attempts
  IF v_rec.status = 'failed' THEN
    IF v_rec.attempt_count < p_max_attempts THEN
      UPDATE public.telegram_processed_updates
      SET status = 'processing',
          attempt_count = v_rec.attempt_count + 1,
          last_attempt_at = now()
      WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

      RETURN QUERY SELECT true, 'processing'::TEXT, v_rec.attempt_count + 1, 'retry_after_failure'::TEXT;
      RETURN;
    ELSE
      RETURN QUERY SELECT false, 'failed'::TEXT, v_rec.attempt_count, 'max_attempts_exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Fallback de segurança
  RETURN QUERY SELECT false, v_rec.status, v_rec.attempt_count, 'unhandled_state'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reivindicar_telegram_update(BIGINT, TEXT, BIGINT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reivindicar_telegram_update(BIGINT, TEXT, BIGINT, INTEGER, INTEGER) TO service_role;

-- Funções auxiliares de finalização de update
CREATE OR REPLACE FUNCTION public.concluir_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.telegram_processed_updates
  SET status = 'completed',
      error_message = NULL,
      last_attempt_at = now()
  WHERE bot_id = COALESCE(p_bot_id, 'default') AND update_id = p_update_id;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_telegram_update(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concluir_telegram_update(BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.falhar_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default',
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.telegram_processed_updates
  SET status = 'failed',
      error_message = p_error_message,
      last_attempt_at = now()
  WHERE bot_id = COALESCE(p_bot_id, 'default') AND update_id = p_update_id;
END;
$$;

REVOKE ALL ON FUNCTION public.falhar_telegram_update(BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.falhar_telegram_update(BIGINT, TEXT, TEXT) TO service_role;

-- 3.1. RPC: Reconciliação Administrativa de Updates Abandonados (Timeout)
CREATE OR REPLACE FUNCTION public.reconciliar_telegram_updates_abandonados(
  p_bot_id TEXT DEFAULT 'default',
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  reconciled_update_id BIGINT,
  action_taken TEXT,
  previous_status TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH stale_candidates AS (
    SELECT t.update_id as uid, t.status as st, t.attempt_count as att
    FROM public.telegram_processed_updates t
    WHERE t.bot_id = COALESCE(p_bot_id, 'default')
      AND t.status = 'processing'
      AND t.last_attempt_at < (now() - (p_lease_seconds || ' seconds')::interval)
    FOR UPDATE SKIP LOCKED
  ),
  updated_rows AS (
    UPDATE public.telegram_processed_updates t
    SET status = 'failed',
        error_message = 'Abandonado: timeout de execução excedido durante processamento'
    FROM stale_candidates s
    WHERE t.bot_id = COALESCE(p_bot_id, 'default') AND t.update_id = s.uid
    RETURNING t.update_id, 'marked_failed_after_timeout'::TEXT, s.st, t.attempt_count
  )
  SELECT * FROM updated_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.reconciliar_telegram_updates_abandonados(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconciliar_telegram_updates_abandonados(TEXT, INTEGER) TO service_role;

-- ============================================================================
-- 3.1 INFRAESTRUTURA DE DEDUPLICAÇÃO E TENANCY (Divipay e Finanças)
-- ============================================================================

-- Garante coluna workspace_id e índice de isolamento em public.divipay_transacoes se a tabela existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'divipay_transacoes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
      ALTER TABLE public.divipay_transacoes
        ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
    ELSE
      ALTER TABLE public.divipay_transacoes
        ADD COLUMN IF NOT EXISTS workspace_id UUID;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_divipay_transacoes_workspace
      ON public.divipay_transacoes(workspace_id);
  END IF;
END $$;

-- Garante colunas de deduplicação e índices únicos nas tabelas financeiras existentes
DO $$
BEGIN
  -- 1. Receitas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'receitas') THEN
    ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
    UPDATE public.receitas SET deduplication_key = 'receita:' || id::TEXT WHERE deduplication_key IS NULL;
    
    IF EXISTS (
      SELECT 1 FROM public.receitas
      WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
      GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
    ) THEN
      UPDATE public.receitas r
      SET deduplication_key = r.deduplication_key || ':dup:' || r.id::text
      WHERE (r.workspace_id, r.deduplication_key) IN (
        SELECT workspace_id, deduplication_key
        FROM public.receitas
        WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
        GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
      );
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_wallet_ai_dedup
      ON public.receitas(workspace_id, deduplication_key)
      WHERE workspace_id IS NOT NULL;
  END IF;

  -- 2. Despesas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'despesas') THEN
    ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
    UPDATE public.despesas SET deduplication_key = 'despesa:' || id::TEXT WHERE deduplication_key IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.despesas
      WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
      GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
    ) THEN
      UPDATE public.despesas d
      SET deduplication_key = d.deduplication_key || ':dup:' || d.id::text
      WHERE (d.workspace_id, d.deduplication_key) IN (
        SELECT workspace_id, deduplication_key
        FROM public.despesas
        WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
        GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
      );
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_wallet_ai_dedup
      ON public.despesas(workspace_id, deduplication_key)
      WHERE workspace_id IS NOT NULL;
  END IF;

  -- 3. Transações
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transacoes') THEN
    ALTER TABLE public.transacoes ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
    UPDATE public.transacoes SET deduplication_key = 'transacao:' || id::TEXT WHERE deduplication_key IS NULL;

    IF EXISTS (
      SELECT 1 FROM public.transacoes
      WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
      GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
    ) THEN
      UPDATE public.transacoes t
      SET deduplication_key = t.deduplication_key || ':dup:' || t.id::text
      WHERE (t.workspace_id, t.deduplication_key) IN (
        SELECT workspace_id, deduplication_key
        FROM public.transacoes
        WHERE workspace_id IS NOT NULL AND deduplication_key IS NOT NULL
        GROUP BY workspace_id, deduplication_key HAVING count(*) > 1
      );
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_wallet_ai_dedup
      ON public.transacoes(workspace_id, deduplication_key)
      WHERE workspace_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. RPC: Processamento Atômico Transacional do Divipay Cash-In
-- ============================================================================
-- Garante que o status PAID só seja definitivo se a receita e a taxa forem criadas.
-- Se a transação já estiver PAID mas faltar receita (falha parcial anterior), recupera.

CREATE OR REPLACE FUNCTION public.processar_divipay_cashin_atomico(
  p_transacao_id UUID,
  p_external_id TEXT,
  p_user_id UUID,
  p_workspace_id UUID,
  p_amount NUMERIC,
  p_fee NUMERIC,
  p_conta_id UUID,
  p_categoria_receita_id UUID,
  p_categoria_taxa_id UUID,
  p_descricao TEXT,
  p_data DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx RECORD;
  v_receita_id UUID;
  v_despesa_id UUID;
  v_dedup_receita TEXT := 'divipay:cashin:' || p_transacao_id::TEXT;
  v_dedup_taxa TEXT := 'divipay:fee:' || p_transacao_id::TEXT;
  v_recovered BOOLEAN := false;
BEGIN
  -- 1. Bloqueia a transação no banco para serialização concorrente estrita
  SELECT * INTO v_tx
  FROM public.divipay_transacoes
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação Divipay % não encontrada', p_transacao_id;
  END IF;

  -- 1.1 Validações de integridade financeira e isolamento de workspace (cross-tenant)
  IF v_tx.user_id != p_user_id THEN
    RAISE EXCEPTION 'Acesso cross-tenant negado: transação pertence a outro usuário';
  END IF;

  IF v_tx.workspace_id IS NOT NULL AND v_tx.workspace_id != p_workspace_id THEN
    RAISE EXCEPTION 'Acesso cross-tenant negado: workspace divergente da transação';
  END IF;

  IF p_amount <= 0 OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Montante financeiro inválido: deve ser estritamente positivo';
  END IF;

  IF p_fee < 0 THEN
    RAISE EXCEPTION 'Taxa financeira inválida: não pode ser negativa';
  END IF;

  -- 2. Verifica se a transação já estava PAID
  IF v_tx.status = 'PAID' THEN
    IF (v_tx.metadata ? 'receita_id') THEN
      -- Confirma se a receita realmente existe no banco
      SELECT id INTO v_receita_id
      FROM public.receitas
      WHERE workspace_id = p_workspace_id AND deduplication_key = v_dedup_receita;

      IF v_receita_id IS NOT NULL THEN
        -- Já processada completamente
        RETURN jsonb_build_object(
          'success', true,
          'already_processed', true,
          'receita_id', v_receita_id,
          'despesa_taxa_id', v_tx.metadata->>'despesa_taxa_id'
        );
      ELSE
        -- Transação estava marcada como PAID mas sem o registro físico da receita (recuperação)
        v_recovered := true;
      END IF;
    ELSE
      -- Transação travou em PAID sem ponteiro de receita em metadata: recuperação ativa!
      v_recovered := true;
    END IF;
  END IF;

  -- 3. Insere a Receita com deduplication_key garantida por índice único
  INSERT INTO public.receitas (
    user_id,
    workspace_id,
    categoria_id,
    conta_id,
    descricao,
    valor,
    data,
    metodo_pagamento,
    status,
    deduplication_key
  )
  VALUES (
    p_user_id,
    p_workspace_id,
    p_categoria_receita_id,
    p_conta_id,
    COALESCE(p_descricao, 'Recebimento Pix Divipay ' || p_external_id),
    p_amount,
    COALESCE(p_data, CURRENT_DATE),
    'pix',
    'recebido',
    v_dedup_receita
  )
  ON CONFLICT (workspace_id, deduplication_key) WHERE workspace_id IS NOT NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_receita_id;

  -- 4. Insere a Despesa referente à taxa do gateway se houver taxa
  IF p_fee IS NOT NULL AND p_fee > 0 THEN
    INSERT INTO public.despesas (
      user_id,
      workspace_id,
      categoria_id,
      conta_id,
      descricao,
      valor,
      data,
      metodo_pagamento,
      status,
      deduplication_key
    )
    VALUES (
      p_user_id,
      p_workspace_id,
      p_categoria_taxa_id,
      p_conta_id,
      'Taxa Divipay - transação ' || p_external_id,
      p_fee,
      COALESCE(p_data, CURRENT_DATE),
      'pix',
      'pago',
      v_dedup_taxa
    )
    ON CONFLICT (workspace_id, deduplication_key) WHERE workspace_id IS NOT NULL
    DO UPDATE SET updated_at = now()
    RETURNING id INTO v_despesa_id;
  END IF;

  -- 5. Atualiza o status da transação para PAID e vincula metadados atomicamente
  UPDATE public.divipay_transacoes
  SET status = 'PAID',
      workspace_id = COALESCE(workspace_id, p_workspace_id),
      fee = COALESCE(p_fee, fee),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'receita_id', v_receita_id,
        'despesa_taxa_id', v_despesa_id,
        'reconciled_at', now(),
        'recovered', v_recovered
      ),
      updated_at = now()
  WHERE id = p_transacao_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'recovered', v_recovered,
    'receita_id', v_receita_id,
    'despesa_taxa_id', v_despesa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.processar_divipay_cashin_atomico(UUID, TEXT, UUID, UUID, NUMERIC, NUMERIC, UUID, UUID, UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_divipay_cashin_atomico(UUID, TEXT, UUID, UUID, NUMERIC, NUMERIC, UUID, UUID, UUID, TEXT, DATE) TO service_role;

-- ============================================================================
-- 5. RPC: Registro Atômico de Pagamento e Ativação de Assinatura
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_pagamento_assinatura_atomico(
  p_user_id UUID,
  p_profile_id UUID,
  p_plan_id UUID,
  p_provider TEXT,
  p_transaction_id TEXT,
  p_amount NUMERIC,
  p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id UUID;
  v_existing_id UUID;
  v_effective_provider TEXT := COALESCE(p_provider, 'pepper');
  v_days INTEGER := COALESCE(p_duration_days, 30);
BEGIN
  -- 0. Validação de integridade financeira
  IF p_amount < 0 OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Montante financeiro de assinatura inválido: não pode ser negativo';
  END IF;

  -- 1. Se houver transaction_id, verifica se o pagamento já foi registrado
  IF p_transaction_id IS NOT NULL AND trim(p_transaction_id) != '' THEN
    SELECT id INTO v_existing_id
    FROM public.subscription_payments
    WHERE provider = v_effective_provider AND transaction_id = trim(p_transaction_id);

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'payment_id', v_existing_id,
        'message', 'Pagamento já processado anteriormente'
      );
    END IF;
  END IF;

  -- 2. Insere o pagamento de forma atômica com proteção contra concorrência simultânea
  BEGIN
    INSERT INTO public.subscription_payments (
      user_id,
      plan_id,
      amount,
      status,
      provider,
      transaction_id,
      payment_date
    )
    VALUES (
      p_user_id,
      p_plan_id,
      p_amount,
      'paid',
      v_effective_provider,
      NULLIF(trim(p_transaction_id), ''),
      now()
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    -- Transação simultânea inseriu uma fração de segundo antes
    SELECT id INTO v_existing_id
    FROM public.subscription_payments
    WHERE provider = v_effective_provider AND transaction_id = trim(p_transaction_id);

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'payment_id', v_existing_id,
      'message', 'Pagamento já processado anteriormente (concorrente detectado)'
    );
  END;

  -- 3. Atualiza ou cria a assinatura do usuário (estendendo se ainda estiver ativa)
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    expires_at,
    updated_at
  )
  VALUES (
    p_profile_id,
    p_plan_id,
    'active',
    now() + (v_days || ' days')::interval,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET plan_id = p_plan_id,
      status = 'active',
      -- Estende a partir da expiração atual se ainda estiver válida, ou a partir de now()
      expires_at = GREATEST(COALESCE(public.subscriptions.expires_at, now()), now()) + (v_days || ' days')::interval,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'payment_id', v_payment_id,
    'message', 'Pagamento registrado e assinatura ativada com sucesso'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_assinatura_atomico(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_assinatura_atomico(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, INTEGER) TO service_role;

COMMIT;
