-- Migration: 20260908120000_security_column_protection.sql
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
-- Objetivo: Hardening de segredos, RLS por sessao de investimentos, protecao atomica de role, rate limiting concorrente

BEGIN;

-- =========================================================================
-- 1. Protecao de colunas em divipay_config
-- =========================================================================
REVOKE SELECT ON public.divipay_config FROM authenticated;
GRANT SELECT (id, user_id, client_id, environment, is_active, webhook_url, token_expires_at, created_at, updated_at)
  ON public.divipay_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.divipay_config TO authenticated;

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
REVOKE ALL ON FUNCTION public.get_divipay_config_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_divipay_config_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_divipay_config_status() TO authenticated;

-- =========================================================================
-- 2. Protecao de colunas em eyemobile_config
-- =========================================================================
REVOKE SELECT ON public.eyemobile_config FROM authenticated;
GRANT SELECT (id, user_id, access_key, environment, store_id, default_conta_id, default_categoria_receita_id, default_categoria_taxa_id, auto_sync_sales, auto_sync_stock, last_synced_offset, created_at, updated_at)
  ON public.eyemobile_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.eyemobile_config TO authenticated;

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
REVOKE ALL ON FUNCTION public.get_eyemobile_config_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_eyemobile_config_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_eyemobile_config_status() TO authenticated;

-- =========================================================================
-- 3. Protecao de senha_investimentos e Incremento Atomico de Falhas
-- =========================================================================
REVOKE ALL ON public.senha_investimentos FROM authenticated, anon, public;

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
REVOKE ALL ON FUNCTION public.has_senha_investimentos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_senha_investimentos() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_senha_investimentos() TO authenticated;

-- RPC Atomica para registrar falha e calcular bloqueio sem race conditions
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
-- 4. Blindagem Robusta de profiles.role (Triggers Compatíveis com SECURITY DEFINER)
-- =========================================================================
REVOKE UPDATE ON public.profiles FROM authenticated, anon, PUBLIC;
GRANT UPDATE (name, organization_name, telefone, updated_at) ON public.profiles TO authenticated;

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
-- 5. Rate Limiter Compartilhado e Atomico (Safe ON CONFLICT Concorrente)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_request TIMESTAMPTZ NOT NULL DEFAULT now()
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

  -- Limpeza oportunista (5% das chamadas limpam registros > 1 hora)
  IF random() < 0.05 THEN
    DELETE FROM public.rate_limits WHERE window_start < v_now - interval '1 hour';
  END IF;

  -- Insercao atomica inicial com ON CONFLICT (protege contra ausencia da linha e race condition na primeira requisicao)
  INSERT INTO public.rate_limits (bucket_key, request_count, window_start, last_request)
  VALUES (p_key, v_cost, v_now, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  -- Bloqueio da linha existente para atualizacao atomica
  SELECT * INTO v_record FROM public.rate_limits WHERE bucket_key = p_key FOR UPDATE;

  -- Verifica se a janela expirou
  IF v_now - v_record.window_start >= v_window_interval THEN
    UPDATE public.rate_limits
    SET request_count = v_cost, window_start = v_now, last_request = v_now
    WHERE bucket_key = p_key;
    RETURN QUERY SELECT true, 0, v_cost, p_max_requests;
    RETURN;
  END IF;

  -- Janela ativa: checa se permite o custo adicional
  IF v_record.request_count + (CASE WHEN v_record.request_count = v_cost AND v_record.window_start = v_now THEN 0 ELSE v_cost END) <= p_max_requests THEN
    IF NOT (v_record.request_count = v_cost AND v_record.window_start = v_now) THEN
      UPDATE public.rate_limits
      SET request_count = request_count + v_cost, last_request = v_now
      WHERE bucket_key = p_key;
      RETURN QUERY SELECT true, 0, v_record.request_count + v_cost, p_max_requests;
    ELSE
      RETURN QUERY SELECT true, 0, v_record.request_count, p_max_requests;
    END IF;
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
-- 6. Sessao de Investimentos Vinculada a Sessao Autenticada
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.investimentos_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investimentos_sessions_user ON public.investimentos_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_investimentos_sessions_expiry ON public.investimentos_sessions(expires_at);

REVOKE ALL ON public.investimentos_sessions FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.investimentos_sessions TO service_role;

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

-- Substituicao total das politicas antigas de investimentos
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
CREATE POLICY "Users manage own investimentos" ON public.investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

DROP POLICY IF EXISTS "Users manage own metas_investimento" ON public.metas_investimento;
CREATE POLICY "Users manage own metas_investimento" ON public.metas_investimento
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

DROP POLICY IF EXISTS "Users manage own historico" ON public.historico_rendimentos;
CREATE POLICY "Users manage own historico" ON public.historico_rendimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

DROP POLICY IF EXISTS "Users manage own proventos" ON public.proventos_esperados;
CREATE POLICY "Users manage own proventos" ON public.proventos_esperados
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

DROP POLICY IF EXISTS "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos;
CREATE POLICY "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

COMMIT;