-- =========================================================================
-- Script de Recuperacao Segura (Safe Rollback)
-- Migration: rollback_20260908120000_safe_recovery.sql
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
--
-- PRINCIPIO DE SEGURANCA (PostgreSQL GRANT/REVOKE Semantics):
-- Conforme a documentacao oficial do PostgreSQL (https://www.postgresql.org/docs/current/sql-grant.html):
-- "A privilege grant for a table does not automatically extend to columns added later...
--  Conversely, revoking column privileges does NOT remove table-level privileges."
--
-- Se houver um GRANT SELECT anterior em nivel de tabela, revogar colunas individuais
-- NAO remove o acesso de leitura a tabela inteira!
-- Portanto, para garantir que segredos (client_secret, secret_key, senha_hash, access_token)
-- NUNCA fiquem acessiveis durante uma recuperacao de contingencia:
-- 1. Revoga expressamente TODAS as permissoes de tabela (REVOKE ALL ON table);
-- 2. Concede SELECT EXCLUSIVAMENTE nas colunas publicas/operacionais autorizadas;
-- 3. Mantem senha_investimentos com REVOKE ALL irrestrito para usuarios comuns;
-- 4. Preserva a DUPLA PROTECAO de investimentos: isolamento de locatario (auth.uid() = user_id)
--    E desbloqueio ativo de sessao (public.is_investimentos_unlocked(auth.uid())).
-- =========================================================================

BEGIN;

-- 1. Divipay Config: Revoga nivel de tabela e concede apenas colunas publicas
REVOKE ALL ON public.divipay_config FROM authenticated, anon, PUBLIC;
GRANT SELECT (
  id,
  user_id,
  client_id,
  environment,
  is_active,
  webhook_url,
  token_expires_at,
  created_at,
  updated_at
) ON public.divipay_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.divipay_config TO authenticated;
GRANT ALL ON public.divipay_config TO service_role;

-- 2. Eyemobile Config: Revoga nivel de tabela e concede apenas colunas publicas
REVOKE ALL ON public.eyemobile_config FROM authenticated, anon, PUBLIC;
GRANT SELECT (
  id,
  user_id,
  access_key,
  environment,
  store_id,
  default_conta_id,
  default_categoria_receita_id,
  default_categoria_taxa_id,
  auto_sync_sales,
  auto_sync_stock,
  last_synced_offset,
  created_at,
  updated_at
) ON public.eyemobile_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.eyemobile_config TO authenticated;
GRANT ALL ON public.eyemobile_config TO service_role;

-- 3. Senha Investimentos: Bloqueio absoluto para usuarios comuns
REVOKE ALL ON public.senha_investimentos FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.senha_investimentos TO service_role;

-- 4. Profiles: Protecao estrita de role contra auto-promocao
REVOKE ALL ON public.profiles FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (name, organization_name, telefone, updated_at) ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 5. Investimentos e Depositos: Preserva DUPLA PROTECAO (Usuario E Sessao Desbloqueada)
ALTER TABLE IF EXISTS public.investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
DROP POLICY IF EXISTS "investimentos_legacy" ON public.investimentos;
CREATE POLICY "Users manage own investimentos" ON public.investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

ALTER TABLE IF EXISTS public.depositos_investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
DROP POLICY IF EXISTS "depositos_legacy" ON public.depositos_investimentos;
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 6. Garantir RLS ativo em todas as relacoes sensiveis
ALTER TABLE IF EXISTS public.divipay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.eyemobile_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.senha_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

COMMIT;
