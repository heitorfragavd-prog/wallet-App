-- Migration: 20260908120000_security_column_protection.sql
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
-- Objetivo: Protecao de colunas confidenciais contra leitura direta por usuarios authenticated
-- Escopo:
--   1. divipay_config (client_secret, access_token)
--   2. eyemobile_config (secret_key)
--   3. senha_investimentos (senha_hash)

BEGIN;

-- 1. Protecao de colunas em divipay_config
REVOKE SELECT ON public.divipay_config FROM authenticated;
GRANT SELECT (id, user_id, client_id, environment, is_active, webhook_url, token_expires_at, created_at, updated_at)
  ON public.divipay_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.divipay_config TO authenticated;

-- RPC SECURITY DEFINER para checar se credenciais Divipay estao completas sem vazar client_secret
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

-- 2. Protecao de colunas em eyemobile_config
REVOKE SELECT ON public.eyemobile_config FROM authenticated;
GRANT SELECT (id, user_id, access_key, environment, store_id, default_conta_id, default_categoria_receita_id, default_categoria_taxa_id, auto_sync_sales, auto_sync_stock, last_synced_offset, created_at, updated_at)
  ON public.eyemobile_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.eyemobile_config TO authenticated;

-- RPC SECURITY DEFINER para status seguro do Eyemobile
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

-- 3. Protecao de colunas em senha_investimentos
REVOKE SELECT ON public.senha_investimentos FROM authenticated;
GRANT SELECT (id, user_id, tentativas_falhas, bloqueado_ate, created_at, updated_at)
  ON public.senha_investimentos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.senha_investimentos TO authenticated;

COMMIT;
