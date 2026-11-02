-- ==============================================================================
-- MIGRATION: 20261102150000_delivery_marketplace_vault.sql
-- Submódulo: Delivery Marketplaces (iFood / 99Food)
-- Cofre Seguro de Credenciais, Zero Exposição no Frontend, Handshake OAuth Oficial
-- e Operações Transacionais Atômicas Exclusivas do Servidor (service_role)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABELA COFRE DE CREDENCIAIS DE MARKETPLACE
CREATE TABLE IF NOT EXISTS public.delivery_channel_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL CHECK (channel_name IN ('ifood', '99food')),
  merchant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  key_id TEXT NOT NULL DEFAULT 'v1',
  client_secret_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_channel_secrets_workspace_channel UNIQUE (workspace_id, channel_name)
);

ALTER TABLE public.delivery_channel_secrets ADD COLUMN IF NOT EXISTS key_id TEXT NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_delivery_channel_secrets_workspace
  ON public.delivery_channel_secrets(workspace_id);

-- 2. POLÍTICA RLS ABSOLUTA: BLOQUEIO TOTAL DIRETO PARA ANON E AUTHENTICATED
ALTER TABLE public.delivery_channel_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.delivery_channel_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delivery_channel_secrets TO service_role;

-- 3. RPC: OBTER METADATA SANITIZADA DO CANAL (SEM EXPOR SEGREDO)
-- GATE 1: Restrita exclusivamente a service_role (Edge Functions autorizadas)
CREATE OR REPLACE FUNCTION public.get_delivery_channel_metadata(
  p_workspace_id UUID,
  p_channel_name TEXT
)
RETURNS TABLE (
  channel_name TEXT,
  merchant_id TEXT,
  client_id_preview TEXT,
  has_secret BOOLEAN,
  environment TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.channel_name,
    s.merchant_id,
    CASE
      WHEN length(s.client_id) <= 8 THEN '********'
      ELSE substring(s.client_id from 1 for 4) || '••••••••' || substring(s.client_id from length(s.client_id) - 3)
    END AS client_id_preview,
    (s.client_secret_encrypted IS NOT NULL AND length(s.client_secret_encrypted) > 0) AS has_secret,
    s.environment,
    s.updated_at
  FROM public.delivery_channel_secrets s
  WHERE s.workspace_id = p_workspace_id
    AND s.channel_name = p_channel_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_channel_metadata(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_channel_metadata(UUID, TEXT) TO service_role;

-- 4. RPC TRANSACIONAL ATÔMICA: SALVAMENTO SEGURO DE CREDENCIAIS E ESTADO DO CANAL
-- GATE 1: Restrita exclusivamente a service_role (Edge Functions autorizadas)
CREATE OR REPLACE FUNCTION public.save_delivery_channel_vault_atomic(
  p_workspace_id UUID,
  p_channel_name TEXT,
  p_merchant_id TEXT,
  p_client_id TEXT,
  p_key_id TEXT,
  p_client_secret_encrypted TEXT,
  p_environment TEXT DEFAULT 'production'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name TEXT;
  v_client_preview TEXT;
  v_log_entry JSONB;
BEGIN
  v_display_name := CASE WHEN p_channel_name = 'ifood' THEN 'iFood Marketplace' ELSE '99Food Restaurante' END;
  v_client_preview := CASE
    WHEN length(p_client_id) <= 8 THEN '********'
    ELSE substring(p_client_id from 1 for 4) || '••••••••' || substring(p_client_id from length(p_client_id) - 3)
  END;

  -- 1. Upsert no cofre isolado de credenciais
  INSERT INTO public.delivery_channel_secrets (
    workspace_id,
    channel_name,
    merchant_id,
    client_id,
    key_id,
    client_secret_encrypted,
    environment,
    updated_at
  ) VALUES (
    p_workspace_id,
    p_channel_name,
    p_merchant_id,
    p_client_id,
    p_key_id,
    p_client_secret_encrypted,
    p_environment,
    now()
  )
  ON CONFLICT (workspace_id, channel_name)
  DO UPDATE SET
    merchant_id = EXCLUDED.merchant_id,
    client_id = EXCLUDED.client_id,
    key_id = EXCLUDED.key_id,
    client_secret_encrypted = EXCLUDED.client_secret_encrypted,
    environment = EXCLUDED.environment,
    updated_at = now();

  -- 2. Log de auditoria
  v_log_entry := jsonb_build_object(
    'id', 'log-' || floor(extract(epoch from now()) * 1000)::text,
    'event_type', 'connect',
    'status', 'info',
    'message', 'Credenciais atualizadas no cofre AES-256-GCM. Homologação anterior invalidada até novo teste.',
    'timestamp', now()
  );

  -- 3. Upsert atômico no delivery_channels com invalidação obrigatória de auto-aceite
  INSERT INTO public.delivery_channels (
    workspace_id,
    channel_name,
    display_name,
    is_active,
    status,
    connection_state,
    auto_accept_orders,
    config,
    updated_at
  ) VALUES (
    p_workspace_id,
    p_channel_name,
    v_display_name,
    true,
    'pending_auth',
    'credentials_saved',
    false,
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'client_id_preview', v_client_preview,
      'has_client_secret', true,
      'event_log', jsonb_build_array(v_log_entry),
      'updated_at', now()
    ),
    now()
  )
  ON CONFLICT (workspace_id, channel_name)
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_active = true,
    status = 'pending_auth',
    connection_state = 'credentials_saved',
    auto_accept_orders = false,
    config = (
      coalesce(public.delivery_channels.config, '{}'::jsonb) - 'client_id' - 'client_secret'
    ) || jsonb_build_object(
      'merchant_id', p_merchant_id,
      'client_id_preview', v_client_preview,
      'has_client_secret', true,
      'updated_at', now(),
      'event_log', jsonb_build_array(v_log_entry) || coalesce(public.delivery_channels.config->'event_log', '[]'::jsonb)
    ),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'state', 'credentials_saved',
    'message', 'Credenciais armazenadas com sucesso no cofre transacional.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_delivery_channel_vault_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_delivery_channel_vault_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 5. RPC TRANSACIONAL ATÔMICA: REGISTRAR RESULTADO DE TESTE DE CONEXÃO
-- GATE 1 & GATE 2: Restrita a service_role; auto-aceite bloqueado se loja fechada/pausada
CREATE OR REPLACE FUNCTION public.record_delivery_channel_test_atomic(
  p_workspace_id UUID,
  p_channel_name TEXT,
  p_connection_state TEXT,
  p_is_success BOOLEAN,
  p_http_status INT,
  p_latency_ms INT,
  p_feedback_msg TEXT,
  p_operational_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_test_log JSONB;
  v_tested_at TIMESTAMPTZ := now();
  v_status TEXT;
  v_auto_accept_allowed BOOLEAN;
BEGIN
  v_status := CASE WHEN p_is_success THEN 'active' ELSE 'pending_auth' END;
  
  -- GATE 2: auto_accept SÓ pode permanecer ativo se for homologado E loja aberta operacionalmente (OK)
  v_auto_accept_allowed := (p_connection_state = 'homologated' AND upper(coalesce(p_operational_status, 'OK')) = 'OK');

  v_test_log := jsonb_build_object(
    'id', 'test-' || floor(extract(epoch from v_tested_at) * 1000)::text,
    'event_type', 'test',
    'status', CASE WHEN p_is_success THEN 'success' WHEN p_connection_state ILIKE '%pending%' OR p_connection_state ILIKE '%approved%' THEN 'warning' ELSE 'error' END,
    'message', 'Teste HTTP (' || p_latency_ms || 'ms, status ' || p_http_status || '): ' || p_feedback_msg,
    'timestamp', v_tested_at
  );

  UPDATE public.delivery_channels
  SET
    connection_state = p_connection_state,
    status = v_status,
    auto_accept_orders = CASE WHEN v_auto_accept_allowed THEN auto_accept_orders ELSE false END,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'last_connection_test', jsonb_build_object(
        'success', p_is_success,
        'state', p_connection_state,
        'message', p_feedback_msg,
        'tested_at', v_tested_at,
        'latency_ms', p_latency_ms,
        'http_status', p_http_status,
        'operational_status', p_operational_status
      ),
      'event_log', jsonb_build_array(v_test_log) || coalesce(config->'event_log', '[]'::jsonb)
    ),
    updated_at = v_tested_at
  WHERE workspace_id = p_workspace_id
    AND channel_name = p_channel_name;

  RETURN jsonb_build_object(
    'success', true,
    'connection_state', p_connection_state,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_delivery_channel_test_atomic(UUID, TEXT, TEXT, BOOLEAN, INT, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_channel_test_atomic(UUID, TEXT, TEXT, BOOLEAN, INT, INT, TEXT, TEXT) TO service_role;

-- 6. RPC TRANSACIONAL ATÔMICA: DESCONECTAR MARKETPLACE E PURGAR CREDENCIAIS
-- GATE 1: Restrita exclusivamente a service_role (Edge Functions autorizadas)
CREATE OR REPLACE FUNCTION public.disconnect_delivery_marketplace(
  p_workspace_id UUID,
  p_channel_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Remove credenciais com segurança no cofre
  DELETE FROM public.delivery_channel_secrets
  WHERE workspace_id = p_workspace_id
    AND channel_name = p_channel_name;

  -- Atualiza o canal público para desconectado, desativa auto-aceite e limpa metadados confidenciais
  UPDATE public.delivery_channels
  SET
    connection_state = 'disconnected',
    status = 'pending_auth',
    is_active = false,
    auto_accept_orders = false,
    config = (
      config - 'client_id' - 'client_secret' - 'has_client_secret' - 'client_id_preview' - 'encrypted_secret' - 'merchant_id'
    ) || jsonb_build_object(
      'has_client_secret', false,
      'client_id_preview', null,
      'last_sync_at', null,
      'event_log', jsonb_build_array(
        jsonb_build_object(
          'id', 'disconnect-' || floor(extract(epoch from now()) * 1000)::text,
          'event_type', 'disconnect',
          'status', 'info',
          'message', 'Canal desconectado pelo administrador e credenciais purgadas do cofre.',
          'timestamp', now()
        )
      ) || coalesce(config->'event_log', '[]'::jsonb)
    ),
    updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND channel_name = p_channel_name;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_delivery_marketplace(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_delivery_marketplace(UUID, TEXT) TO service_role;

COMMIT;
