-- ==============================================================================
-- MIGRATION: 20261102140000_delivery_marketplace_vault.sql
-- Submódulo: Delivery Marketplaces (iFood / 99Food)
-- Cofre Seguro de Credenciais, Zero Exposição no Frontend e Handshake OAuth Oficial
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
  client_secret_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_channel_secrets_workspace_channel UNIQUE (workspace_id, channel_name)
);

CREATE INDEX IF NOT EXISTS idx_delivery_channel_secrets_workspace
  ON public.delivery_channel_secrets(workspace_id);

-- 2. POLÍTICA RLS ABSOLUTA: BLOQUEIO TOTAL DIRETO PARA ANON E AUTHENTICATED
ALTER TABLE public.delivery_channel_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.delivery_channel_secrets FROM public, anon, authenticated;
GRANT ALL ON public.delivery_channel_secrets TO service_role;

-- 3. RPC: OBTER METADATA SANITIZADA DO CANAL (SEM EXPOR SEGREDO)
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
  -- Valida acesso de administrador no workspace
  IF NOT public.tem_acesso_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores do workspace podem visualizar credenciais.';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.get_delivery_channel_metadata(UUID, TEXT) TO authenticated, service_role;

-- 4. RPC: DESCONECTAR MARKETPLACE E PURGAR CREDENCIAIS
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
  IF NOT public.tem_acesso_admin_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores do workspace podem desconectar marketplaces.';
  END IF;

  -- Remove credenciais com segurança
  DELETE FROM public.delivery_channel_secrets
  WHERE workspace_id = p_workspace_id
    AND channel_name = p_channel_name;

  -- Atualiza o canal público para desconectado
  UPDATE public.delivery_channels
  SET
    connection_state = 'disconnected',
    status = 'pending_auth',
    is_active = false,
    updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND channel_name = p_channel_name;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disconnect_delivery_marketplace(UUID, TEXT) TO authenticated, service_role;

COMMIT;
