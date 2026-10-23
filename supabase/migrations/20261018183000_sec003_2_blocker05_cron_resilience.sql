-- ============================================================================
-- WALLET APP — SEC-003.2 | BLOQUEADOR 05: RESILIÊNCIA, GUCs E AUDITORIA CRON/NET
-- ============================================================================
-- Migration: 20261018183000_sec003_2_blocker05_cron_resilience.sql
--
-- Objetivos:
-- 1. Persistência de payload e recuperação efetiva idempotente de updates Telegram.
-- 2. Resolução resiliente de GUCs ('app.settings.supabase_service_role_key' / 'app.settings.service_role_key')
--    com missing_ok = true para eliminar aborts fatais no PostgreSQL.
-- 3. Invocador seguro e restrito (cron_dispatch_edge_function) com ALLOWLIST ESTRITA
--    de funções autorizadas, impedindo SSRF e vazamento de chaves para URLs arbitrárias.
-- 4. Monitoramento e auditoria de respostas HTTP do pg_net (401, 403, 429, 500+).
-- 5. Registro estruturado de execuções de cron sem exposição de secrets em logs ou tabelas.
-- 6. Preservação idempotente das definições de jobs existentes no pg_cron.
-- ============================================================================

-- ============================================================================
-- 1. TELEGRAM: Persistência de Payload e Recuperação Efetiva
-- ============================================================================

ALTER TABLE public.telegram_processed_updates
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- Atualizar CHECK constraint para incluir novos status do ciclo de vida
ALTER TABLE public.telegram_processed_updates
  DROP CONSTRAINT IF EXISTS telegram_processed_updates_status_check;

ALTER TABLE public.telegram_processed_updates
  ADD CONSTRAINT telegram_processed_updates_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'pending_retry', 'dead_letter'));

-- Índice para busca rápida de mensagens para reprocessamento
CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_retry
  ON public.telegram_processed_updates (bot_id, status, last_attempt_at)
  WHERE status IN ('processing', 'pending_retry');

-- Atualização da RPC de reivindicação com suporte a persistência do payload
DROP FUNCTION IF EXISTS public.reivindicar_telegram_update(BIGINT, TEXT, BIGINT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.reivindicar_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default',
  p_chat_id BIGINT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 180,
  p_max_attempts INTEGER DEFAULT 3,
  p_payload JSONB DEFAULT NULL
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

  -- 2. Primeira vez que o evento é visto: registra como processing e armazena payload
  IF NOT FOUND THEN
    INSERT INTO public.telegram_processed_updates (
      update_id,
      bot_id,
      chat_id,
      status,
      attempt_count,
      last_attempt_at,
      processed_at,
      expires_at,
      payload
    )
    VALUES (
      p_update_id,
      v_effective_bot_id,
      p_chat_id,
      'processing',
      1,
      now(),
      now(),
      now() + interval '48 hours',
      p_payload
    );

    RETURN QUERY SELECT true, 'processing'::TEXT, 1, 'new_update_claimed'::TEXT;
    RETURN;
  END IF;

  -- 3. Se já concluído: idempotente, não reprocessa
  IF v_rec.status = 'completed' THEN
    RETURN QUERY SELECT false, 'completed'::TEXT, v_rec.attempt_count, 'already_completed'::TEXT;
    RETURN;
  END IF;

  -- 4. Se em processamento: verificar se o lease expirou (worker travou/caiu)
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
            payload = COALESCE(p_payload, v_rec.payload),
            error_message = 'Recuperado de reserva abandonada (stale lease)'
        WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

        RETURN QUERY SELECT true, 'processing'::TEXT, v_rec.attempt_count + 1, 'stale_lease_recovered'::TEXT;
        RETURN;
      ELSE
        UPDATE public.telegram_processed_updates
        SET status = 'dead_letter',
            error_message = 'Limite máximo de tentativas excedido após reserva abandonada'
        WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

        RETURN QUERY SELECT false, 'dead_letter'::TEXT, v_rec.attempt_count, 'max_attempts_exceeded'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 5. Se o status for failed ou pending_retry: permite retentativa se não estourou max_attempts
  IF v_rec.status IN ('failed', 'pending_retry') THEN
    IF v_rec.attempt_count < p_max_attempts THEN
      UPDATE public.telegram_processed_updates
      SET status = 'processing',
          attempt_count = v_rec.attempt_count + 1,
          last_attempt_at = now(),
          payload = COALESCE(p_payload, v_rec.payload)
      WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

      RETURN QUERY SELECT true, 'processing'::TEXT, v_rec.attempt_count + 1, 'retry_after_failure'::TEXT;
      RETURN;
    ELSE
      UPDATE public.telegram_processed_updates
      SET status = 'dead_letter',
          error_message = 'Limite máximo de tentativas excedido'
      WHERE bot_id = v_effective_bot_id AND update_id = p_update_id;

      RETURN QUERY SELECT false, 'dead_letter'::TEXT, v_rec.attempt_count, 'max_attempts_exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Fallback de segurança
  RETURN QUERY SELECT false, v_rec.status, v_rec.attempt_count, 'unhandled_state'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reivindicar_telegram_update(BIGINT, TEXT, BIGINT, INTEGER, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reivindicar_telegram_update(BIGINT, TEXT, BIGINT, INTEGER, INTEGER, JSONB) TO service_role;

-- ============================================================================
-- 1.1 TELEGRAM: Finalização com Fencing Token (Proteção contra Stale Workers)
-- ============================================================================
-- Se um worker demorar e o lease expirar, outro worker assumirá o evento (com attempt_count incrementado).
-- Quando o worker antigo tentar finalizar, o fencing token (p_expected_attempt) impede que ele
-- sobrescreva o estado do worker ativo.

DROP FUNCTION IF EXISTS public.concluir_telegram_update(BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.concluir_telegram_update(BIGINT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.concluir_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default',
  p_expected_attempt INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT t.status, t.attempt_count INTO v_rec
  FROM public.telegram_processed_updates t
  WHERE t.bot_id = COALESCE(p_bot_id, 'default') AND t.update_id = p_update_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_rec.status = 'completed' THEN
    RETURN true;
  END IF;

  -- Fencing token / proteção contra stale workers:
  -- Só permite concluir se estiver em processing e attempt bater com p_expected_attempt (se informado)
  IF v_rec.status = 'processing' AND (p_expected_attempt IS NULL OR v_rec.attempt_count = p_expected_attempt) THEN
    UPDATE public.telegram_processed_updates
    SET status = 'completed',
        error_message = NULL,
        last_attempt_at = now()
    WHERE bot_id = COALESCE(p_bot_id, 'default') AND update_id = p_update_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.concluir_telegram_update(BIGINT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concluir_telegram_update(BIGINT, TEXT, INTEGER) TO service_role;

DROP FUNCTION IF EXISTS public.falhar_telegram_update(BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.falhar_telegram_update(BIGINT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.falhar_telegram_update(
  p_update_id BIGINT,
  p_bot_id TEXT DEFAULT 'default',
  p_error_message TEXT DEFAULT NULL,
  p_expected_attempt INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT t.status, t.attempt_count INTO v_rec
  FROM public.telegram_processed_updates t
  WHERE t.bot_id = COALESCE(p_bot_id, 'default') AND t.update_id = p_update_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_rec.status = 'processing' AND (p_expected_attempt IS NULL OR v_rec.attempt_count = p_expected_attempt) THEN
    UPDATE public.telegram_processed_updates
    SET status = 'failed',
        error_message = p_error_message,
        last_attempt_at = now()
    WHERE bot_id = COALESCE(p_bot_id, 'default') AND update_id = p_update_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.falhar_telegram_update(BIGINT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.falhar_telegram_update(BIGINT, TEXT, TEXT, INTEGER) TO service_role;

-- Reconciliação aprimorada: marca como pending_retry em vez de apenas falho
DROP FUNCTION IF EXISTS public.reconciliar_telegram_updates_abandonados(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.reconciliar_telegram_updates_abandonados(
  p_bot_id TEXT DEFAULT 'default',
  p_lease_seconds INTEGER DEFAULT 300,
  p_max_attempts INTEGER DEFAULT 3
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
    SELECT t.update_id AS uid, t.status AS st, t.attempt_count AS att
    FROM public.telegram_processed_updates t
    WHERE t.bot_id = COALESCE(p_bot_id, 'default')
      AND t.status = 'processing'
      AND t.last_attempt_at < (now() - (p_lease_seconds || ' seconds')::interval)
    FOR UPDATE SKIP LOCKED
  ),
  updated_rows AS (
    UPDATE public.telegram_processed_updates t
    SET status = CASE 
          WHEN s.att < p_max_attempts THEN 'pending_retry'
          ELSE 'dead_letter'
        END,
        error_message = CASE 
          WHEN s.att < p_max_attempts THEN 'Abandonado: timeout de execução; agendado para reprocessamento'
          ELSE 'Abandonado: limite de tentativas esgotado sem conclusão'
        END
    FROM stale_candidates s
    WHERE t.bot_id = COALESCE(p_bot_id, 'default') AND t.update_id = s.uid
    RETURNING t.update_id, 
              CASE 
                WHEN t.status = 'pending_retry' THEN 'marked_pending_retry'::TEXT
                ELSE 'marked_dead_letter'::TEXT
              END,
              s.st, 
              t.attempt_count
  )
  SELECT * FROM updated_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.reconciliar_telegram_updates_abandonados(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconciliar_telegram_updates_abandonados(TEXT, INTEGER, INTEGER) TO service_role;

-- RPC: Obtenção segura de updates pendentes com payload para reprocessamento ativo
CREATE OR REPLACE FUNCTION public.recuperar_telegram_updates_para_reprocessamento(
  p_bot_id TEXT DEFAULT 'default',
  p_max_batch INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS TABLE (
  update_id BIGINT,
  chat_id BIGINT,
  payload JSONB,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH ready_candidates AS (
    SELECT t.update_id AS uid
    FROM public.telegram_processed_updates t
    WHERE t.bot_id = COALESCE(p_bot_id, 'default')
      AND t.status = 'pending_retry'
      AND t.payload IS NOT NULL
      AND t.attempt_count < 3
    ORDER BY t.last_attempt_at ASC
    LIMIT GREATEST(1, LEAST(p_max_batch, 50))
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.telegram_processed_updates t
    SET status = 'processing',
        last_attempt_at = now()
    FROM ready_candidates c
    WHERE t.bot_id = COALESCE(p_bot_id, 'default') AND t.update_id = c.uid
    RETURNING t.update_id, t.chat_id, t.payload, t.attempt_count
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.recuperar_telegram_updates_para_reprocessamento(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recuperar_telegram_updates_para_reprocessamento(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- 2. LOG E AUDITORIA DE EXECUÇÃO DE ROTINAS CRON
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cron_execution_logs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dispatched', 'skipped_missing_guc', 'skipped_no_pg_net', 'failed')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.cron_execution_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cron_execution_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.cron_execution_logs TO postgres, service_role;

CREATE INDEX IF NOT EXISTS idx_cron_execution_logs_job_date
  ON public.cron_execution_logs (job_name, created_at DESC);

-- ============================================================================
-- 3. INVOCADOR SEGURO DE EDGE FUNCTIONS VIA PG_NET
-- ============================================================================
-- Defesas implementadas:
-- a) Allowlist estrita: impede invocar URLs externas ou endpoints arbitrários (anti-SSRF).
-- b) missing_ok = true: impede aborts fatais se GUC não estiver configurado.
-- c) Fallback transparente entre 'app.settings.supabase_service_role_key' e 'app.settings.service_role_key'.
-- d) Fallback para vault.decrypted_secrets quando disponível.
-- e) NUNCA imprime tokens ou chaves em logs, exceptions ou mensagens de retorno.
-- f) Permissão estrita: apenas postgres e service_role; anon e authenticated bloqueados.

CREATE OR REPLACE FUNCTION public.cron_dispatch_edge_function(
  p_job_name TEXT,
  p_function_name TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_target_url TEXT;
  v_request_id BIGINT := NULL;
  v_has_pg_net BOOLEAN := false;
BEGIN
  -- 1. Validação estrita contra ALLOWLIST pré-aprovada (Zero URLs arbitrárias)
  IF p_function_name NOT IN (
    'process-recurring-transactions',
    'processar-lembretes-manutencao',
    'cron-notificacoes',
    'atualizar-cotacoes',
    'cron-alertas-investimentos',
    'sefaz-sync',
    'eyemobile-sync',
    'telegram-reprocess-worker',
    'lembrete-precos',
    'notificar-lembretes',
    'telegram-notificador-cron'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Edge Function "%" não permitida no despachante cron.', p_function_name;
  END IF;

  -- 2. Resolução segura de URL (com missing_ok = true)
  v_supabase_url := NULLIF(trim(current_setting('app.settings.supabase_url', true)), '');
  IF v_supabase_url IS NULL THEN
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'unknown_cron'),
      p_function_name,
      'skipped_missing_guc',
      'Configuração ausente: app.settings.supabase_url não definida no banco de dados'
    );
    RETURN NULL;
  END IF;

  -- 3. Resolução segura e resiliente da service role key (múltiplas fontes, missing_ok = true)
  v_service_role_key := COALESCE(
    NULLIF(trim(current_setting('app.settings.supabase_service_role_key', true)), ''),
    NULLIF(trim(current_setting('app.settings.service_role_key', true)), '')
  );

  -- Fallback defensivo para Supabase Vault se as GUCs não estiverem definidas
  IF (v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0) THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
        SELECT decrypted_secret INTO v_service_role_key
        FROM vault.decrypted_secrets
        WHERE name IN ('service_role_key', 'supabase_service_role_key')
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_service_role_key := NULL;
    END;
  END IF;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'unknown_cron'),
      p_function_name,
      'skipped_missing_guc',
      'Configuração ausente: service role key não definida em app.settings nem no vault'
    );
    RETURN NULL;
  END IF;

  -- 4. Construção estrita da URL de destino
  v_target_url := rtrim(v_supabase_url, '/') || '/functions/v1/' || p_function_name;

  -- 5. Disparo via pg_net (se disponível)
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_pg_net;

  IF v_has_pg_net THEN
    BEGIN
      -- Chamada dinâmica via SQL nativo para evitar erro de compilação em instâncias sem pg_net
      EXECUTE $exec$
        SELECT net.http_post(
          url := $1,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || $2
          ),
          body := $3
        )
      $exec$
      INTO v_request_id
      USING v_target_url, v_service_role_key, COALESCE(p_payload, '{}'::jsonb);

      INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
      VALUES (
        COALESCE(p_job_name, 'cron_job'),
        p_function_name,
        'dispatched',
        'Invocação assíncrona despachada via pg_net. Request ID: ' || COALESCE(v_request_id::TEXT, 'desconhecido')
      );

      RETURN v_request_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
      VALUES (
        COALESCE(p_job_name, 'cron_job'),
        p_function_name,
        'failed',
        'Exceção ao disparar pg_net: ' || SQLERRM
      );
      RETURN NULL;
    END;
  ELSE
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'cron_job'),
      p_function_name,
      'skipped_no_pg_net',
      'Extensão pg_net não disponível neste nó PostgreSQL'
    );
    RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_dispatch_edge_function(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_dispatch_edge_function(TEXT, TEXT, JSONB) TO postgres, service_role;

-- ============================================================================
-- 3.1 TRANSAÇÕES RECORRENTES: Idempotência Atômica e Constraints Anti-Duplicidade
-- ============================================================================
-- Previne concorrência e condições de corrida entre múltiplas instâncias do cron.
-- A constraint única no índice parcial garante que apenas uma transação por recorrência/dia
-- seja gravada no banco de dados, e a RPC processar_transacao_recorrente_atomica lida de forma
-- transacional com inserção e atualização de ultima_execucao com ON CONFLICT DO NOTHING.

ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS recorrencia_id UUID;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS recorrencia_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_recorrencia_data
  ON public.receitas (recorrencia_id, data)
  WHERE recorrencia_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_recorrencia_data
  ON public.despesas (recorrencia_id, data)
  WHERE recorrencia_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.processar_transacao_recorrente_atomica(UUID, UUID, TEXT, TEXT, NUMERIC, DATE, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.processar_transacao_recorrente_atomica(
  p_recorrencia_id UUID,
  p_user_id UUID,
  p_tipo_transacao TEXT,
  p_descricao TEXT,
  p_valor NUMERIC,
  p_data DATE,
  p_categoria_id UUID DEFAULT NULL,
  p_metodo_pagamento TEXT DEFAULT NULL,
  p_conta_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  transacao_id UUID,
  duplicate BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transacao_id UUID := NULL;
  v_dedup_key TEXT := 'recorrente_' || p_recorrencia_id || '_' || p_data;
BEGIN
  IF p_valor <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, false, 'Valor da transação deve ser positivo'::TEXT;
    RETURN;
  END IF;

  IF p_tipo_transacao = 'receita' THEN
    INSERT INTO public.receitas (
      user_id,
      descricao,
      valor,
      data,
      categoria_id,
      metodo_pagamento,
      conta_id,
      recorrencia_id,
      deduplication_key
    )
    VALUES (
      p_user_id,
      p_descricao,
      p_valor,
      p_data,
      p_categoria_id,
      p_metodo_pagamento,
      p_conta_id,
      p_recorrencia_id,
      v_dedup_key
    )
    ON CONFLICT (recorrencia_id, data) WHERE recorrencia_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_transacao_id;

    IF v_transacao_id IS NOT NULL THEN
      UPDATE public.transacoes_recorrentes
      SET ultima_execucao = p_data, updated_at = now()
      WHERE id = p_recorrencia_id;

      RETURN QUERY SELECT true, v_transacao_id, false, 'Transação criada com sucesso'::TEXT;
      RETURN;
    ELSE
      SELECT id INTO v_transacao_id
      FROM public.receitas
      WHERE recorrencia_id = p_recorrencia_id AND data = p_data;

      UPDATE public.transacoes_recorrentes
      SET ultima_execucao = p_data, updated_at = now()
      WHERE id = p_recorrencia_id;

      RETURN QUERY SELECT true, v_transacao_id, true, 'Transação recorrente já gerada anteriormente (idempotente)'::TEXT;
      RETURN;
    END IF;

  ELSIF p_tipo_transacao = 'despesa' THEN
    INSERT INTO public.despesas (
      user_id,
      descricao,
      valor,
      data,
      categoria_id,
      metodo_pagamento,
      conta_id,
      recorrencia_id,
      deduplication_key
    )
    VALUES (
      p_user_id,
      p_descricao,
      p_valor,
      p_data,
      p_categoria_id,
      p_metodo_pagamento,
      p_conta_id,
      p_recorrencia_id,
      v_dedup_key
    )
    ON CONFLICT (recorrencia_id, data) WHERE recorrencia_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_transacao_id;

    IF v_transacao_id IS NOT NULL THEN
      UPDATE public.transacoes_recorrentes
      SET ultima_execucao = p_data, updated_at = now()
      WHERE id = p_recorrencia_id;

      RETURN QUERY SELECT true, v_transacao_id, false, 'Transação criada com sucesso'::TEXT;
      RETURN;
    ELSE
      SELECT id INTO v_transacao_id
      FROM public.despesas
      WHERE recorrencia_id = p_recorrencia_id AND data = p_data;

      UPDATE public.transacoes_recorrentes
      SET ultima_execucao = p_data, updated_at = now()
      WHERE id = p_recorrencia_id;

      RETURN QUERY SELECT true, v_transacao_id, true, 'Transação recorrente já gerada anteriormente (idempotente)'::TEXT;
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT false, NULL::UUID, false, 'Tipo de transação inválido'::TEXT;
    RETURN;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.processar_transacao_recorrente_atomica(UUID, UUID, TEXT, TEXT, NUMERIC, DATE, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.processar_transacao_recorrente_atomica(UUID, UUID, TEXT, TEXT, NUMERIC, DATE, UUID, TEXT, UUID) TO postgres, service_role;

-- ============================================================================
-- 4. MONITORAMENTO E AUDITORIA DE RESPOSTAS HTTP DO PG_NET
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auditar_respostas_pg_net(
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
  request_id BIGINT,
  status_code INTEGER,
  categoria_status TEXT,
  preview_resposta TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  RETURN QUERY
  EXECUTE $exec$
    SELECT 
      r.id AS request_id,
      r.status_code,
      CASE 
        WHEN r.status_code = 401 THEN 'AUTH_FAILURE_401_UNAUTHORIZED'
        WHEN r.status_code = 403 THEN 'AUTH_FAILURE_403_FORBIDDEN'
        WHEN r.status_code = 429 THEN 'RATE_LIMITED_429'
        WHEN r.status_code >= 500 THEN 'SERVER_ERROR_5XX'
        WHEN r.status_code >= 200 AND r.status_code < 300 THEN 'SUCCESS_2XX'
        WHEN r.timed_out = true THEN 'TIMEOUT_EXCEEDED'
        WHEN r.error_msg IS NOT NULL THEN 'NETWORK_TRANSPORT_ERROR'
        ELSE 'OTHER_STATUS'
      END AS categoria_status,
      LEFT(r.content, 200) AS preview_resposta,
      r.error_msg AS error_message,
      r.created AS created_at
    FROM net._http_response r
    ORDER BY r.created DESC
    LIMIT $1
  $exec$
  USING GREATEST(1, LEAST(p_limite, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_respostas_pg_net(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_respostas_pg_net(INTEGER) TO postgres, service_role;

-- ============================================================================
-- 4.1 AUDITORIA UNIFICADA DE FALHAS OPERACIONAIS (TELEMETRIA SEM DEPENDÊNCIA CIRCULAR)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auditar_falhas_operacionais(
  p_horas INTEGER DEFAULT 24
)
RETURNS TABLE (
  origem TEXT,
  identificador TEXT,
  categoria_erro TEXT,
  detalhe_erro TEXT,
  tentativas INTEGER,
  registrado_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Falhas e pulos de execução registrados no cron_execution_logs
  RETURN QUERY
  SELECT 
    'cron_execution_logs'::TEXT AS origem,
    l.job_name AS identificador,
    l.status AS categoria_erro,
    l.message AS detalhe_erro,
    1 AS tentativas,
    l.created_at AS registrado_em
  FROM public.cron_execution_logs l
  WHERE l.status IN ('failed', 'skipped_missing_guc', 'skipped_no_pg_net')
    AND l.created_at >= (now() - (p_horas || ' hours')::interval);

  -- 2. Mensagens Telegram esgotadas (dead_letter)
  RETURN QUERY
  SELECT
    'telegram_dead_letter'::TEXT AS origem,
    'update_' || t.update_id::TEXT AS identificador,
    t.status AS categoria_erro,
    t.error_message AS detalhe_erro,
    t.attempt_count AS tentativas,
    t.last_attempt_at AS registrado_em
  FROM public.telegram_processed_updates t
  WHERE t.status = 'dead_letter'
    AND t.last_attempt_at >= (now() - (p_horas || ' hours')::interval);

  -- 3. Respostas HTTP anômalas capturadas pelo pg_net (se pg_net estiver instalado)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN QUERY
    EXECUTE $exec$
      SELECT
        'pg_net_http_failure'::TEXT AS origem,
        'req_' || r.id::TEXT AS identificador,
        CASE
          WHEN r.status_code = 401 THEN 'HTTP_401_UNAUTHORIZED'
          WHEN r.status_code = 403 THEN 'HTTP_403_FORBIDDEN'
          WHEN r.status_code = 429 THEN 'HTTP_429_RATE_LIMITED'
          WHEN r.status_code >= 500 THEN 'HTTP_5XX_SERVER_ERROR'
          WHEN r.timed_out = true THEN 'TIMEOUT_EXCEEDED'
          ELSE 'NETWORK_TRANSPORT_ERROR'
        END AS categoria_erro,
        COALESCE(r.error_msg, LEFT(r.content, 200)) AS detalhe_erro,
        1 AS tentativas,
        r.created AS registrado_em
      FROM net._http_response r
      WHERE (r.status_code < 200 OR r.status_code >= 400 OR r.timed_out = true OR r.error_msg IS NOT NULL)
        AND r.created >= (now() - ($1 || ' hours')::interval)
    $exec$
    USING p_horas;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_falhas_operacionais(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_falhas_operacionais(INTEGER) TO postgres, service_role;

-- ============================================================================
-- 5. ATUALIZAÇÃO IDEMPOTENTE DOS JOBS NO PG_CRON (CASO PG_CRON EXISTA)
-- ============================================================================
-- Atualiza os jobs existentes para utilizar cron_dispatch_edge_function,
-- eliminando completamente o risco de erros fatais por GUCs inexistentes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- 1. processar-lembretes-manutencao
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'processar-lembretes-manutencao') THEN
      PERFORM cron.unschedule('processar-lembretes-manutencao');
    END IF;

    PERFORM cron.schedule(
      'processar-lembretes-manutencao',
      '0 8 * * *',
      $cmd$SELECT public.cron_dispatch_edge_function('processar-lembretes-manutencao', 'processar-lembretes-manutencao');$cmd$
    );

    -- 2. process-recurring-transactions
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-recurring-transactions') THEN
      PERFORM cron.unschedule('process-recurring-transactions');
    END IF;

    PERFORM cron.schedule(
      'process-recurring-transactions',
      '5 0 * * *',
      $cmd$SELECT public.cron_dispatch_edge_function('process-recurring-transactions', 'process-recurring-transactions');$cmd$
    );

    -- 3. cron-notificacoes (cadastrado de forma segura às 08:30)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-notificacoes') THEN
      PERFORM cron.unschedule('cron-notificacoes');
    END IF;

    PERFORM cron.schedule(
      'cron-notificacoes',
      '30 8 * * *',
      $cmd$SELECT public.cron_dispatch_edge_function('cron-notificacoes', 'cron-notificacoes');$cmd$
    );

    -- 4. reconciliar-telegram-updates (a cada 15 minutos via SQL nativo)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconciliar-telegram-updates') THEN
      PERFORM cron.unschedule('reconciliar-telegram-updates');
    END IF;

    PERFORM cron.schedule(
      'reconciliar-telegram-updates',
      '*/15 * * * *',
      $cmd$SELECT public.reconciliar_telegram_updates_abandonados('default', 300, 3);$cmd$
    );

    RAISE NOTICE 'pg_cron configurado com sucesso utilizando o despachante seguro.';
  ELSE
    RAISE NOTICE 'pg_cron não disponível no ambiente atual; as funções utilitárias e RPCs foram criadas.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aviso: configuração do pg_cron ignorada defensivamente: %', SQLERRM;
END;
$$;
