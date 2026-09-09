-- =========================================================================
-- Migration: 20260908120001_security_phase_c_enforcement.sql
-- FASE C: Ativacao de Restricoes, Revogacao de Colunas e RLS Estrito
-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE SEM APROVACAO
--
-- Pre-requisitos:
-- 1. Fase A (20260908120000_security_phase_a_infrastructure.sql) executada.
-- 2. Fase B (Deploy das Edge Functions e Frontend com RPCs seguras) concluida.
--
-- Objetivo:
-- 1. Revogar SELECT sobre colunas de credenciais em divipay_config e eyemobile_config.
-- 2. Revogar todo acesso direto a senha_investimentos para roles publicas/autenticadas.
-- 3. Revogar permissao de alteracao direta do campo role em profiles.
-- 4. Substituir politicas de RLS em tabelas de investimentos para exigir sessao ativa desbloqueada.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. Restricao de Colunas em divipay_config
-- =========================================================================
REVOKE SELECT ON public.divipay_config FROM authenticated, anon, PUBLIC;
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

-- =========================================================================
-- 2. Restricao de Colunas em eyemobile_config
-- =========================================================================
REVOKE SELECT ON public.eyemobile_config FROM authenticated, anon, PUBLIC;
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

-- =========================================================================
-- 3. Blindagem Completa de senha_investimentos
-- =========================================================================
REVOKE ALL ON public.senha_investimentos FROM authenticated, anon, PUBLIC;
GRANT ALL ON public.senha_investimentos TO service_role;

-- =========================================================================
-- 4. Restricao de Colunas em profiles (Protecao de role)
-- =========================================================================
REVOKE UPDATE ON public.profiles FROM authenticated, anon, PUBLIC;
GRANT UPDATE (
  name,
  organization_name,
  telefone,
  updated_at
) ON public.profiles TO authenticated;

-- =========================================================================
-- 5. Ativacao de RLS Estrito Vinculado a Sessao Desbloqueada de Investimentos
-- =========================================================================

-- 5.1 public.investimentos
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
CREATE POLICY "Users manage own investimentos" ON public.investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 5.2 public.depositos_investimentos
DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 5.3 public.metas_investimento
DROP POLICY IF EXISTS "Users manage own metas_investimento" ON public.metas_investimento;
CREATE POLICY "Users manage own metas_investimento" ON public.metas_investimento
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 5.4 public.historico_rendimentos
DROP POLICY IF EXISTS "Users manage own historico" ON public.historico_rendimentos;
CREATE POLICY "Users manage own historico" ON public.historico_rendimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 5.5 public.proventos_esperados
DROP POLICY IF EXISTS "Users manage own proventos" ON public.proventos_esperados;
CREATE POLICY "Users manage own proventos" ON public.proventos_esperados
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

-- 5.6 public.configuracoes_investimentos
DROP POLICY IF EXISTS "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos;
CREATE POLICY "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_investimentos_unlocked(auth.uid()));

COMMIT;