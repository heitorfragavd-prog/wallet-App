-- Script de Recuperacao Segura (Safe Rollback)
-- Migration: rollback_20260908120000_safe_recovery.sql
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
--
-- PRINCIPIO DE SEGURANCA:
-- Caso seja necessario realizar rollback ou reparo de permissoes,
-- NUNCA reabrir SELECT amplo em colunas de segredo (client_secret, secret_key, senha_hash, access_token).
-- Este script restaura o estado funcional de forma segura sem reexpor dados confidenciais.

BEGIN;

-- 1. Divipay: Caso as RPCs precisem ser revertidas, manter as colunas sensiveis revogadas
REVOKE SELECT (client_secret, access_token) ON public.divipay_config FROM authenticated, anon, PUBLIC;
GRANT SELECT (id, user_id, client_id, environment, is_active, webhook_url, token_expires_at, created_at, updated_at)
  ON public.divipay_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.divipay_config TO authenticated;

-- 2. Eyemobile: Manter secret_key estritamente revogada
REVOKE SELECT (secret_key) ON public.eyemobile_config FROM authenticated, anon, PUBLIC;
GRANT SELECT (id, user_id, access_key, environment, store_id, default_conta_id, default_categoria_receita_id, default_categoria_taxa_id, auto_sync_sales, auto_sync_stock, last_synced_offset, created_at, updated_at)
  ON public.eyemobile_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.eyemobile_config TO authenticated;

-- 3. Senha Investimentos: Permissao direta e NUNCA concedida
-- Em caso de rollback da RPC has_senha_investimentos(), a verificacao continua via Edge Function 'validar-senha' (service_role).
-- Jamais conceder SELECT, INSERT, UPDATE ou DELETE a roles authenticated/anon.
REVOKE ALL ON public.senha_investimentos FROM authenticated, anon, PUBLIC;

-- Manter RLS ativado
ALTER TABLE IF EXISTS public.divipay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eyemobile_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.senha_investimentos ENABLE ROW LEVEL SECURITY;

COMMIT;
