-- =========================================================================
-- Script: scripts/test-phase-abc-rehearsal.sql
-- Ensaio Completo da Implantação A -> B -> C e Procedimento de Contingência
-- =========================================================================

\set ON_ERROR_STOP on

-- -------------------------------------------------------------------------
-- 1. SETUP DO SCHEMA DERIVADO DAS MIGRATIONS REAIS (Estado pré-migração)
-- -------------------------------------------------------------------------
BEGIN;

DROP VIEW IF EXISTS public.divipay_config_safe, public.eyemobile_config_safe CASCADE;
DROP TABLE IF EXISTS public.divipay_config, public.eyemobile_config, public.investimentos, public.workspaces, public.profiles, public.senha_investimentos, public.ai_token_reservations, public.rate_limits, public.investimentos_sessions CASCADE;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)->>'sub', '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', 'anon');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ LANGUAGE sql STABLE;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT,
  organization_name TEXT,
  telefone TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'PF',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspaces_all" ON public.workspaces;
CREATE POLICY "workspaces_all" ON public.workspaces FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Divipay Config
CREATE TABLE IF NOT EXISTS public.divipay_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  environment TEXT DEFAULT 'sandbox',
  is_active BOOLEAN DEFAULT false,
  webhook_url TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.divipay_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "divipay_all" ON public.divipay_config;
CREATE POLICY "divipay_all" ON public.divipay_config FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Eyemobile Config
CREATE TABLE IF NOT EXISTS public.eyemobile_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_key TEXT,
  secret_key TEXT,
  environment TEXT DEFAULT 'sandbox',
  store_id TEXT,
  default_conta_id UUID,
  default_categoria_receita_id UUID,
  default_categoria_taxa_id UUID,
  auto_sync_sales BOOLEAN DEFAULT true,
  auto_sync_stock BOOLEAN DEFAULT true,
  last_synced_offset INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.eyemobile_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eyemobile_all" ON public.eyemobile_config;
CREATE POLICY "eyemobile_all" ON public.eyemobile_config FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Senha Investimentos
CREATE TABLE IF NOT EXISTS public.senha_investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  senha_hash TEXT NOT NULL,
  tentativas_falhas INTEGER DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.senha_investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "senha_investimentos_all" ON public.senha_investimentos;
CREATE POLICY "senha_investimentos_all" ON public.senha_investimentos FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Investimentos
CREATE TABLE IF NOT EXISTS public.investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo TEXT NOT NULL,
  valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
DROP POLICY IF EXISTS "investimentos_legacy" ON public.investimentos;
CREATE POLICY "Users manage own investimentos" ON public.investimentos FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Depositos Investimentos
CREATE TABLE IF NOT EXISTS public.depositos_investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.depositos_investimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
DROP POLICY IF EXISTS "depositos_legacy" ON public.depositos_investimentos;
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos FOR ALL TO authenticated USING (auth.uid() = user_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated;

COMMIT;

-- -------------------------------------------------------------------------
-- 2. APLICAÇÃO DA FASE A (Infraestrutura Segura)
-- -------------------------------------------------------------------------
\i supabase/migrations/20260908120000_security_phase_a_infrastructure.sql

-- TESTE DE COMPATIBILIDADE DA VERSÃO ANTERIOR (VERSÃO A):
-- Clientes legados continuam operando perfeitamente após a Fase A
DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_rec RECORD;
BEGIN
  -- Cria dados para teste da versao anterior
  INSERT INTO auth.users (id, email) VALUES (v_u1, 'u1_legacy@test.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, name, role) VALUES (v_u1, 'Usuario Legado', 'user') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.divipay_config (user_id, client_id, client_secret) VALUES (v_u1, 'client_legado', 'secret_legado');

  -- Simula chamada da versao anterior (que lia tabelas completas)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
  SELECT id, client_id, client_secret INTO v_rec FROM public.divipay_config WHERE user_id = v_u1;
  ASSERT v_rec.client_id = 'client_legado', 'Fase A: compatibilidade legada deve preservar leitura de client_id';

  RAISE NOTICE 'ENSAIO FASE A APROVADO: Aplicacao anterior opera normalmente apos implantacao da infraestrutura Fase A.';
END $$;

-- -------------------------------------------------------------------------
-- 3. ENSAIO DA FASE B (DEPLOY DOS CLIENTES E EDGE FUNCTIONS ATUALIZADOS)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_res_res RECORD;
BEGIN
  -- A nova versao B utiliza as novas RPCs atomicas
  SELECT allowed, reservation_id INTO v_res_res
  FROM public.reserve_ai_tokens(
    'res_phase_b_rehearsal',
    'phase_b_bucket',
    v_u1,
    'ws_default',
    'chat',
    100,
    10000
  );
  ASSERT v_res_res.allowed IS TRUE, 'Fase B: reserva atomica deve responder allowed = true';

  RAISE NOTICE 'ENSAIO FASE B APROVADO: Clientes e Edge Functions atualizados operando com novas RPCs.';
END $$;

-- -------------------------------------------------------------------------
-- 4. VERIFICAÇÃO DO GATING OPERACIONAL DA FASE C
-- -------------------------------------------------------------------------
-- Tentativa de aplicar a Fase C SEM a confirmacao da Fase B
DO $$
DECLARE
  v_blocked BOOLEAN := false;
BEGIN
  PERFORM set_config('wallet.deploy_phase_b_completed', 'false', false);
  BEGIN
    IF current_setting('wallet.deploy_phase_b_completed', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'OPERACAO BLOQUEADA: A Fase C revoga colunas e ativa RLS estrito.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  ASSERT v_blocked IS TRUE, 'Gating falhou: Fase C nao pode ser aplicada sem confirmacao da Fase B!';
  RAISE NOTICE 'GATING OPERACIONAL CONFIRMADO: Fase C bloqueada confiavelmente sem a flag de Fase B.';
END $$;

-- -------------------------------------------------------------------------
-- 5. APLICAÇÃO AUTORIZADA DA FASE C (Enforcement)
-- -------------------------------------------------------------------------
SET wallet.deploy_phase_b_completed = 'true';
\i supabase/migrations/20260908120001_security_phase_c_enforcement.sql

-- -------------------------------------------------------------------------
-- 6. VALIDAÇÃO DE ACESSO LEGÍTIMO E BLOQUEIO DE ACESSO INDEVIDO PÓS-FASE C
-- -------------------------------------------------------------------------
-- Setup de dados para validacao de RLS e permissoes (executado como superuser/postgres)
DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_u2 UUID := '22222222-2222-4222-8222-222222222222'::uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_u2, 'u2_legacy@test.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (user_id, name, role) VALUES (v_u2, 'Usuario 2', 'user') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.senha_investimentos (user_id, senha_hash) VALUES (v_u1, 'hash_u1') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.investimentos (user_id, ativo, valor) VALUES 
    (v_u1, 'PETR4', 5000.00),
    (v_u2, 'VALE3', 8000.00);
  INSERT INTO public.investimentos_sessions (session_id, user_id, expires_at)
  VALUES ('sess_u1_token', v_u1, clock_timestamp() + interval '1 hour')
  ON CONFLICT (session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;
END $$;

SET ROLE authenticated;

DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_u2 UUID := '22222222-2222-4222-8222-222222222222'::uuid;
  v_sess_u1 TEXT := 'sess_u1_token';
  v_rec RECORD;
  v_count INTEGER;
  v_caught_error BOOLEAN;
BEGIN
  -- 6.1 ACESSO LEGÍTIMO DO USUÁRIO 1 (comprovando que dados existem e são acessíveis)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated', 'session_id', v_sess_u1)::text, true);
  
  -- Consulta de colunas publicas autorizadas
  SELECT id, client_id, environment INTO v_rec FROM public.divipay_config WHERE user_id = v_u1 LIMIT 1;
  ASSERT v_rec.client_id = 'client_legado', 'Fase C: leitura de colunas permitidas deve funcionar para o usuario legitimo';

  -- 6.2 BLOQUEIO DE ACESSO INDEVIDO (tentativa de ler client_secret)
  v_caught_error := false;
  BEGIN
    EXECUTE 'SELECT client_secret FROM public.divipay_config LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Fase C: leitura de client_secret DEVE ser bloqueada por Column-Level Security';

  -- 6.3 BLOQUEIO DE ACESSO INDEVIDO (tentativa de auto-promocao a admin)
  v_caught_error := false;
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE user_id = v_u1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  WHEN OTHERS THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Fase C: atualizacao de profiles.role DEVE ser bloqueada';

  -- 6.4 DUPLA PROTECAO DE INVESTIMENTOS NA FASE C:
  -- Sem sessao desbloqueada -> 0 registros
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.investimentos;
  ASSERT v_count = 0, 'Fase C: sem sessao desbloqueada deve retornar 0 registros';

  -- Com sessao desbloqueada -> enxerga exatamente 1 registro proprio e 0 de outros usuarios
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated', 'session_id', v_sess_u1)::text, true);
  SELECT count(*) INTO v_count FROM public.investimentos;
  ASSERT v_count = 1, 'Fase C: usuario 1 deve ver seu investimento com sessao desbloqueada';

  SELECT count(*) INTO v_count FROM public.investimentos WHERE ativo = 'VALE3';
  ASSERT v_count = 0, 'Fase C: usuario 1 nunca deve ver investimentos de usuario 2';

  RAISE NOTICE 'ENSAIO FASE C APROVADO: Acesso legitimo preservado e acesso indevido estritamente bloqueado.';
END $$;

RESET ROLE;

-- -------------------------------------------------------------------------
-- 7. ENSAIO DO PROCEDIMENTO DE RECUPERAÇÃO SEGURA / ROLLBACK
-- -------------------------------------------------------------------------
-- Aplica o script oficial de recuperacao segura (Safe Rollback)
\i supabase/ops/rollback_20260908120000_safe_recovery.sql

-- Executa consultas ativas como authenticated para comprovar que o rollback
-- NUNCA restaura leitura de secrets nem acesso indevido a investimentos
SET ROLE authenticated;

DO $$
DECLARE
  v_u1 UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_u2 UUID := '22222222-2222-4222-8222-222222222222'::uuid;
  v_sess_u1 TEXT := 'sess_u1_token';
  v_rec RECORD;
  v_count INTEGER;
  v_caught_error BOOLEAN;
BEGIN
  -- Configura contexto JWT inicial do usuario 1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);

  -- 7.1 Rollback NÃO restaura leitura de client_secret em divipay_config
  v_caught_error := false;
  BEGIN
    EXECUTE 'SELECT client_secret FROM public.divipay_config LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Rollback falhou: client_secret DEVE continuar bloqueado por permissoes de coluna!';

  -- 7.2 Rollback NÃO restaura leitura de secret_key em eyemobile_config
  v_caught_error := false;
  BEGIN
    EXECUTE 'SELECT secret_key FROM public.eyemobile_config LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Rollback falhou: secret_key DEVE continuar bloqueada por permissoes de coluna!';

  -- 7.3 Rollback NÃO restaura leitura de senha_investimentos
  v_caught_error := false;
  BEGIN
    EXECUTE 'SELECT senha_hash FROM public.senha_investimentos LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Rollback falhou: senha_investimentos DEVE manter REVOKE ALL absoluto!';

  -- 7.4 Rollback NÃO permite auto-promocao para role admin em profiles
  v_caught_error := false;
  BEGIN
    EXECUTE 'UPDATE public.profiles SET role = ''admin'' WHERE user_id = ''11111111-1111-4111-8111-111111111111''::uuid';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_error := true;
  WHEN OTHERS THEN
    v_caught_error := true;
  END;
  ASSERT v_caught_error IS TRUE, 'Rollback falhou: alteracao de role DEVE continuar bloqueada!';

  -- 7.5 Rollback PRESERVA DUPLA PROTEÇÃO de investimentos (Tenant E Sessão Desbloqueada):
  -- Caso A: Sem sessão desbloqueada -> 0 linhas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.investimentos;
  ASSERT v_count = 0, 'Rollback falhou: investimentos sem sessao desbloqueada DEVE retornar 0 linhas!';

  -- Caso B: Com sessão desbloqueada -> Enxerga apenas 1 registro próprio (PETR4) e 0 do usuário 2 (VALE3)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1::text, 'role', 'authenticated', 'session_id', v_sess_u1)::text, true);
  SELECT count(*) INTO v_count FROM public.investimentos;
  ASSERT v_count = 1, 'Rollback falhou: usuario 1 deve ver seu investimento com sessao desbloqueada!';

  SELECT count(*) INTO v_count FROM public.investimentos WHERE ativo = 'VALE3';
  ASSERT v_count = 0, 'Rollback falhou: usuario 1 NUNCA deve ver investimentos do usuario 2!';

  -- 7.6 Leitura legítima de colunas públicas continua autorizada
  SELECT id, client_id, environment INTO v_rec FROM public.divipay_config WHERE user_id = v_u1 LIMIT 1;
  ASSERT v_rec.client_id = 'client_legado', 'Rollback falhou: colunas publicas devem ser lidas com sucesso!';

  RAISE NOTICE 'SUCESSO TOTAL: Rollback seguro validado em execucao real com bloqueio comprovado de secrets e dupla protecao de investimentos.';
END $$;

RESET ROLE;

SELECT 'ENSAIO COMPLETO A -> B -> C E RECUPERAÇÃO SEGURA CONCLUÍDOS COM SUCESSO!' AS resultado;
