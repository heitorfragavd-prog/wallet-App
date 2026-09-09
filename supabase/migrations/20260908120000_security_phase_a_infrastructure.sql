-- =========================================================================
-- Migration: 20260908120000_security_phase_a_infrastructure.sql
-- FASE A: Criacao de Infraestrutura e RPCs compativeis
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
--
-- Objetivo:
-- 1. Criar tabelas auxiliares (rate_limits, investimentos_sessions, ai_token_reservations)
--    com acesso restrito desde a criacao.
-- 2. Criar RPCs seguras para consulta de status sem exposicao de segredos.
-- 3. Criar funcoes atomicas para controle de tentativas e sessoes de investimentos.
-- 4. Criar controle duravel de reservas de IA com idempotencia e protecao contra virada de janela.
-- 5. Blindar triggers de profiles.role contra escalacao de privilegios.
--
-- NOTA DE RETROCOMPATIBILIDADE (FASE A):
-- As colunas existentes e politicas de RLS antigas NAO sao revogadas nesta fase,
-- permitindo que as Edge Functions e Frontend atuais continuem em operacao
-- enquanto o deploy de codigo (Fase B) e realizado.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. RPCs de Status de Configuracoes (Leitura Segura sem Secrets)
-- =========================================================================

-- Divipay Status RPC
CREATE OR REPLACE FUNCTION public.get_divipay_config_status()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  client_id TEXT,
  environment TEXT,
  is_active BOOLEAN,
  webhook_url TEXT,
  has_secret BOOLEAN,
  has_access_token BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.client_id,
    c.environment,
    c.is_active,
    c.webhook_url,
    (c.client_secret IS NOT NULL AND length(trim(c.client_secret)) > 0) AS has_secret,
    (c.access_token IS NOT NULL AND length(trim(c.access_token)) > 0) AS has_access_token,
    c.created_at,
    c.updated_at
  FROM public.divipay_config c
  WHERE c.user_id = auth.uid()
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_divipay_config_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_divipay_config_status() TO authenticated;

-- Eyemobile Status RPC
CREATE OR REPLACE FUNCTION public.get_eyemobile_config_status()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  access_key TEXT,
  environment TEXT,
  store_id TEXT,
  has_secret BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.access_key,
    c.environment,
    c.store_id,
    (c.secret_key IS NOT NULL AND length(trim(c.secret_key)) > 0) AS has_secret,
    c.created_at,
    c.updated_at
  FROM public.eyemobile_config c
  WHERE c.user_id = auth.uid()
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_eyemobile_config_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eyemobile_config_status() TO authenticated;

-- Senha Investimentos Status RPC
CREATE OR REPLACE FUNCTION public.has_senha_investimentos()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.senha_investimentos
    WHERE user_id = auth.uid()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.has_senha_investimentos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_senha_investimentos() TO authenticated;

-- =========================================================================
-- 2. Incremento Atomico de Falhas de Senha de Investimentos
-- =========================================================================
CREATE OR REPLACE FUNCTION public.registrar_falha_senha_investimentos(p_user_id UUID)
RETURNS TABLE (
  tentativas_falhas INTEGER,
  bloqueado BOOLEAN,
  bloqueado_ate TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tentativas INTEGER;
  v_bloqueado_ate TIMESTAMPTZ;
  v_bloqueado BOOLEAN := false;
BEGIN
  UPDATE public.senha_investimentos
  SET
    tentativas_falhas = COALESCE(senha_investimentos.tentativas_falhas, 0) + 1,
    bloqueado_ate = CASE
      WHEN COALESCE(senha_investimentos.tentativas_falhas, 0) + 1 >= 3
      THEN clock_timestamp() + interval '30 minutes'
      ELSE senha_investimentos.bloqueado_ate
    END,
    updated_at = clock_timestamp()
  WHERE user_id = p_user_id
  RETURNING senha_investimentos.tentativas_falhas, senha_investimentos.bloqueado_ate
  INTO v_tentativas, v_bloqueado_ate;

  v_bloqueado := (v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate > clock_timestamp());

  RETURN QUERY SELECT v_tentativas, v_bloqueado, v_bloqueado_ate;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_falha_senha_investimentos(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_falha_senha_investimentos(UUID) TO service_role;

-- =========================================================================
-- 3. Blindagem de profiles.role (Triggers Compativeis com SECURITY DEFINER)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.protect_profiles_role()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_role TEXT;
  v_is_caller_admin BOOLEAN := false;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Obter a role do contexto da chamada PostgREST/Supabase (nao current_user)
    BEGIN
      v_caller_role := COALESCE(
        auth.role(),
        nullif(current_setting('request.jwt.claims', true)::json->>'role', ''),
        nullif(current_setting('role', true), '')
      );
    EXCEPTION WHEN OTHERS THEN
      v_caller_role := 'authenticated';
    END;

    -- Se for service_role autenticada pela chave de servico, permite
    IF v_caller_role = 'service_role' THEN
      RETURN NEW;
    END IF;

    -- Se for usuario authenticated, verificar se o chamador (auth.uid()) e admin no banco
    IF auth.uid() IS NOT NULL THEN
      SELECT (role = 'admin') INTO v_is_caller_admin
      FROM public.profiles
      WHERE user_id = auth.uid();
    END IF;

    IF v_is_caller_admin IS TRUE THEN
      RETURN NEW;
    END IF;

    -- Bloqueio estrito para qualquer tentativa de escalacao de privilegio
    RAISE EXCEPTION 'Acesso negado: apenas administradores ou service_role podem alterar o campo role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profiles_role ON public.profiles;
CREATE TRIGGER trg_protect_profiles_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_role();

CREATE OR REPLACE FUNCTION public.enforce_profiles_role_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_caller_role TEXT;
  v_is_caller_admin BOOLEAN := false;
BEGIN
  IF NEW.role IS DISTINCT FROM 'user' THEN
    BEGIN
      v_caller_role := COALESCE(
        auth.role(),
        nullif(current_setting('request.jwt.claims', true)::json->>'role', ''),
        nullif(current_setting('role', true), '')
      );
    EXCEPTION WHEN OTHERS THEN
      v_caller_role := 'authenticated';
    END;

    IF v_caller_role = 'service_role' THEN
      RETURN NEW;
    END IF;

    IF auth.uid() IS NOT NULL THEN
      SELECT (role = 'admin') INTO v_is_caller_admin
      FROM public.profiles
      WHERE user_id = auth.uid();
    END IF;

    IF v_is_caller_admin IS NOT TRUE THEN
      NEW.role := 'user'; -- Forca 'user' para qualquer cadastro feito por usuario comum ou anonimo
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_profiles_role_insert ON public.profiles;
CREATE TRIGGER trg_enforce_profiles_role_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profiles_role_insert();

-- =========================================================================
-- 4. Rate Limiter Compartilhado e Atomico
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_request TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON public.rate_limits FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER,
  p_cost INTEGER DEFAULT 1
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  current_count INTEGER,
  limit_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_interval INTERVAL := (p_window_seconds || ' seconds')::interval;
  v_cost INTEGER := GREATEST(1, COALESCE(p_cost, 1));
  v_record RECORD;
  v_retry_after INTEGER := 0;
BEGIN
  IF p_max_requests <= 0 OR p_window_seconds <= 0 OR length(trim(p_key)) = 0 THEN
    RETURN QUERY SELECT false, 60, 0, p_max_requests;
    RETURN;
  END IF;

  -- Limpeza oportunista (5% das chamadas limpam registros antigos)
  IF random() < 0.05 THEN
    DELETE FROM public.rate_limits WHERE window_start < v_now - interval '2 hours';
  END IF;

  -- Inicializacao atomica da linha com contador 0 (protege contra race condition inicial)
  INSERT INTO public.rate_limits (bucket_key, request_count, window_start, last_request)
  VALUES (p_key, 0, v_now, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  -- Bloqueio exclusivo em nivel de linha para atualizacao atomica
  SELECT * INTO v_record FROM public.rate_limits WHERE bucket_key = p_key FOR UPDATE;

  -- 1. Verifica se a janela expirou
  IF v_now - v_record.window_start >= v_window_interval THEN
    IF v_cost <= p_max_requests THEN
      UPDATE public.rate_limits
      SET request_count = v_cost, window_start = v_now, last_request = v_now
      WHERE bucket_key = p_key;
      RETURN QUERY SELECT true, 0, v_cost, p_max_requests;
    ELSE
      v_retry_after := p_window_seconds;
      RETURN QUERY SELECT false, v_retry_after, 0, p_max_requests;
    END IF;
    RETURN;
  END IF;

  -- 2. Janela ativa: verifica se permite o custo solicitado
  IF v_record.request_count + v_cost <= p_max_requests THEN
    UPDATE public.rate_limits
    SET request_count = v_record.request_count + v_cost, last_request = v_now
    WHERE bucket_key = p_key;
    RETURN QUERY SELECT true, 0, v_record.request_count + v_cost, p_max_requests;
    RETURN;
  ELSE
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_record.window_start + v_window_interval - v_now)))::INTEGER);
    RETURN QUERY SELECT false, v_retry_after, v_record.request_count, p_max_requests;
    RETURN;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- =========================================================================
-- 5. Reservas Duraveis de Tokens de IA (Idempotencia e Protecao de Janela)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ai_token_reservations (
  reservation_id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  user_id UUID NOT NULL,
  workspace_id TEXT,
  action TEXT NOT NULL,
  reserved_tokens INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved', 'reconciled'
  actual_tokens INTEGER,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reconciled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_reservations_bucket ON public.ai_token_reservations(bucket_key);
CREATE INDEX IF NOT EXISTS idx_ai_reservations_status ON public.ai_token_reservations(status);

REVOKE ALL ON public.ai_token_reservations FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.ai_token_reservations TO service_role;

-- RPC para Reserva Atomica com Idempotencia e Gravacao da Janela
CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(
  p_reservation_id TEXT,
  p_key TEXT,
  p_user_id UUID,
  p_workspace_id TEXT,
  p_action TEXT,
  p_reserved_tokens INTEGER,
  p_max_tokens_per_hour INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  current_count INTEGER,
  limit_count INTEGER,
  reservation_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window_interval INTERVAL := interval '1 hour';
  v_tokens INTEGER := GREATEST(1, COALESCE(p_reserved_tokens, 1000));
  v_record RECORD;
  v_retry_after INTEGER := 0;
  v_existing_res RECORD;
BEGIN
  IF p_reservation_id IS NULL OR length(trim(p_reservation_id)) = 0 THEN
    RETURN QUERY SELECT false, 60, 0, p_max_tokens_per_hour, ''::TEXT;
    RETURN;
  END IF;

  -- Checagem de Idempotencia: se a reserva ja existe
  SELECT * INTO v_existing_res FROM public.ai_token_reservations WHERE reservation_id = p_reservation_id;
  IF FOUND THEN
    RETURN QUERY SELECT true, 0, v_existing_res.reserved_tokens, p_max_tokens_per_hour, p_reservation_id;
    RETURN;
  END IF;

  -- Inicializacao atomica da linha no rate_limits
  INSERT INTO public.rate_limits (bucket_key, request_count, window_start, last_request)
  VALUES (p_key, 0, v_now, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_record FROM public.rate_limits WHERE bucket_key = p_key FOR UPDATE;

  -- 1. Verifica se a janela expirou
  IF v_now - v_record.window_start >= v_window_interval THEN
    IF v_tokens <= p_max_tokens_per_hour THEN
      UPDATE public.rate_limits
      SET request_count = v_tokens, window_start = v_now, last_request = v_now
      WHERE bucket_key = p_key;

      INSERT INTO public.ai_token_reservations (
        reservation_id, bucket_key, user_id, workspace_id, action, reserved_tokens, window_start, status
      ) VALUES (
        p_reservation_id, p_key, p_user_id, p_workspace_id, p_action, v_tokens, v_now, 'reserved'
      );

      RETURN QUERY SELECT true, 0, v_tokens, p_max_tokens_per_hour, p_reservation_id;
    ELSE
      RETURN QUERY SELECT false, 3600, 0, p_max_tokens_per_hour, p_reservation_id;
    END IF;
    RETURN;
  END IF;

  -- 2. Janela ativa: verifica se cabe a reserva solicitada
  IF v_record.request_count + v_tokens <= p_max_tokens_per_hour THEN
    UPDATE public.rate_limits
    SET request_count = v_record.request_count + v_tokens, last_request = v_now
    WHERE bucket_key = p_key;

    INSERT INTO public.ai_token_reservations (
      reservation_id, bucket_key, user_id, workspace_id, action, reserved_tokens, window_start, status
    ) VALUES (
      p_reservation_id, p_key, p_user_id, p_workspace_id, p_action, v_tokens, v_record.window_start, 'reserved'
    );

    RETURN QUERY SELECT true, 0, v_record.request_count + v_tokens, p_max_tokens_per_hour, p_reservation_id;
    RETURN;
  ELSE
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_record.window_start + v_window_interval - v_now)))::INTEGER);
    RETURN QUERY SELECT false, v_retry_after, v_record.request_count, p_max_tokens_per_hour, p_reservation_id;
    RETURN;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_tokens(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- RPC de Reconciliacao Idempotente com Protecao contra Virada de Janela
CREATE OR REPLACE FUNCTION public.reconcile_ai_tokens(
  p_reservation_id TEXT,
  p_actual_tokens INTEGER,
  p_outcome TEXT DEFAULT 'success'
)
RETURNS TABLE (
  status TEXT,
  delta_applied INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res RECORD;
  v_rate RECORD;
  v_delta INTEGER := 0;
  v_effective_actual INTEGER;
BEGIN
  -- 1. Lock e busca da reserva
  SELECT * INTO v_res
  FROM public.ai_token_reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'reservation_not_found'::TEXT, 0;
    RETURN;
  END IF;

  -- 2. Idempotencia estrita: se ja reconciliada, ignora chamada repetida
  IF v_res.status = 'reconciled' THEN
    RETURN QUERY SELECT 'already_reconciled'::TEXT, 0;
    RETURN;
  END IF;

  -- 3. Lock do bucket de rate limit correspondente
  SELECT * INTO v_rate
  FROM public.rate_limits
  WHERE bucket_key = v_res.bucket_key
  FOR UPDATE;

  -- 4. Tratamento de timeout ou ausência de usage:
  -- "Timeout ou usage ausente nao comprovam consumo zero; nao estorne integralmente sem evidencia."
  IF p_outcome = 'timeout' OR p_outcome = 'missing_usage' OR p_actual_tokens IS NULL THEN
    v_effective_actual := v_res.reserved_tokens; -- Mantém a estimativa conservadora debitada
  ELSE
    v_effective_actual := GREATEST(0, p_actual_tokens);
  END IF;

  -- 5. Protecao de Virada de Janela:
  -- "Resposta atrasada nao pode alterar o orcamento de uma janela nova."
  IF FOUND AND v_rate.window_start = v_res.window_start THEN
    -- A janela atual e a mesma em que a reserva foi feita: ajusta o delta
    v_delta := v_effective_actual - v_res.reserved_tokens;
    UPDATE public.rate_limits
    SET request_count = GREATEST(0, request_count + v_delta),
        last_request = clock_timestamp()
    WHERE bucket_key = v_res.bucket_key;
  ELSE
    -- A janela virou! A reserva pertencia a janela passada, entao nao mexe no contador da janela nova.
    v_delta := 0;
  END IF;

  -- 6. Atualizacao de status da reserva
  UPDATE public.ai_token_reservations
  SET status = 'reconciled',
      actual_tokens = v_effective_actual,
      outcome = p_outcome,
      reconciled_at = clock_timestamp()
  WHERE reservation_id = p_reservation_id;

  RETURN QUERY SELECT 'reconciled'::TEXT, v_delta;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_ai_tokens(TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_tokens(TEXT, INTEGER, TEXT) TO service_role;

-- Reconciliacao generica legada mantida para compatibilidade
CREATE OR REPLACE FUNCTION public.reconcile_rate_limit(
  p_key TEXT,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.rate_limits
  SET request_count = GREATEST(0, request_count + p_delta),
      last_request = clock_timestamp()
  WHERE bucket_key = p_key;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_rate_limit(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_rate_limit(TEXT, INTEGER) TO service_role;

-- =========================================================================
-- 6. Sessao de Investimentos Vinculada a Sessao Autenticada
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.investimentos_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_investimentos_sessions_user ON public.investimentos_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_investimentos_sessions_expiry ON public.investimentos_sessions(expires_at);

REVOKE ALL ON public.investimentos_sessions FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.investimentos_sessions TO service_role;

-- RPC Atomica para Desbloqueio com Verificacao de Hash da Credencial (Prevencao de Race Condition com troca de senha)
CREATE OR REPLACE FUNCTION public.desbloquear_sessao_investimentos(
  p_user_id UUID,
  p_session_id TEXT,
  p_expected_hash TEXT,
  p_new_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_current_hash TEXT;
BEGIN
  SELECT senha_hash INTO v_current_hash
  FROM public.senha_investimentos
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_hash IS NULL OR v_current_hash <> p_expected_hash THEN
    RETURN false;
  END IF;

  UPDATE public.senha_investimentos
  SET senha_hash = COALESCE(p_new_hash, v_current_hash),
      tentativas_falhas = 0,
      bloqueado_ate = null,
      updated_at = clock_timestamp()
  WHERE user_id = p_user_id;

  INSERT INTO public.investimentos_sessions (session_id, user_id, expires_at)
  VALUES (p_session_id, p_user_id, p_expires_at)
  ON CONFLICT (session_id)
  DO UPDATE SET expires_at = EXCLUDED.expires_at;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.desbloquear_sessao_investimentos(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desbloquear_sessao_investimentos(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- Funcao STABLE para checar se a sessao atual autenticada possui acesso liberado
CREATE OR REPLACE FUNCTION public.is_investimentos_unlocked(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session_id TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.senha_investimentos WHERE user_id = p_user_id) THEN
    RETURN true;
  END IF;

  v_session_id := auth.jwt() ->> 'session_id';
  IF v_session_id IS NULL OR length(trim(v_session_id)) = 0 THEN
    v_session_id := auth.jwt() ->> 'jti';
  END IF;

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.investimentos_sessions
    WHERE user_id = p_user_id
      AND session_id = v_session_id
      AND expires_at > clock_timestamp()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_investimentos_unlocked(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_investimentos_unlocked(UUID) TO authenticated, service_role;

COMMIT;