-- =========================================================================
-- test-isolated-pg-security.sql
-- Suite de Testes Automatizados de Seguranca em PostgreSQL Real Isolado
-- =========================================================================
\set ON_ERROR_STOP on

BEGIN;

-- 1. Setup do Schema Base do Supabase (Mock do runtime do Supabase)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

-- Funcoes de contexto do auth do Supabase
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true)::json->>'role', ''), 'anon');
$$ LANGUAGE sql STABLE;

-- Criacao das roles padrao do Supabase se nao existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Tabelas da aplicacao
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT,
  organization_name TEXT,
  telefone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

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

CREATE TABLE IF NOT EXISTS public.senha_investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  senha_hash TEXT NOT NULL,
  tentativas_falhas INTEGER DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo TEXT NOT NULL,
  valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.depositos_investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.depositos_investimentos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.metas_investimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.metas_investimento ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.historico_rendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rendimento NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.historico_rendimentos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.proventos_esperados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor NUMERIC(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.proventos_esperados ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.configuracoes_investimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.configuracoes_investimentos ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;

COMMIT;

-- 2. APLICACAO DA FASE A
\i supabase/migrations/20260908120000_security_phase_a_infrastructure.sql

-- 3. CONFIRMACAO DA FASE B & APLICACAO DA FASE C
SET wallet.deploy_phase_b_completed = 'true';
\i supabase/migrations/20260908120001_security_phase_c_enforcement.sql

-- 4. EXECUCAO DA BATERIA DE TESTES DE SEGURANCA EM POSTGRES REAL
DO $$
DECLARE
  v_user_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_b UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  v_user_admin UUID := '99999999-9999-9999-9999-999999999999'::uuid;
  v_allowed BOOLEAN;
  v_retry_after INTEGER;
  v_count INTEGER;
  v_limit INTEGER;
  v_res_id TEXT;
  v_unlocked BOOLEAN;
  v_falha_count INTEGER;
  v_bloqueado BOOLEAN;
  v_bloq_ate TIMESTAMPTZ;
  v_rows_count INTEGER;
  v_rec_status TEXT;
  v_delta INTEGER;
BEGIN
  RAISE NOTICE 'Iniciando bateria de testes em PostgreSQL isolado...';

  -- Setup Usuarios
  DELETE FROM auth.users WHERE id IN (v_user_a, v_user_b, v_user_admin);
  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'usera@example.com'), (v_user_b, 'userb@example.com'), (v_user_admin, 'admin@example.com');

  INSERT INTO public.profiles (user_id, name, role) VALUES 
    (v_user_a, 'User A', 'user'),
    (v_user_b, 'User B', 'user'),
    (v_user_admin, 'Admin User', 'admin')
  ON CONFLICT (user_id) DO NOTHING;

  -- Teste 1: Rate Limiter Atomico (check_rate_limit)
  SELECT allowed, retry_after_seconds, current_count, limit_count 
  INTO v_allowed, v_retry_after, v_count, v_limit
  FROM public.check_rate_limit('test:bucket:1', 2, 60, 1);
  ASSERT v_allowed IS TRUE AND v_count = 1, 'Teste 1.1 falhou: primeira chamada deve ser permitida com count 1';

  SELECT allowed, current_count INTO v_allowed, v_count
  FROM public.check_rate_limit('test:bucket:1', 2, 60, 1);
  ASSERT v_allowed IS TRUE AND v_count = 2, 'Teste 1.2 falhou: segunda chamada deve ser permitida com count 2';

  SELECT allowed, retry_after_seconds INTO v_allowed, v_retry_after
  FROM public.check_rate_limit('test:bucket:1', 2, 60, 1);
  ASSERT v_allowed IS FALSE AND v_retry_after > 0, 'Teste 1.3 falhou: terceira chamada deve ser bloqueada';

  -- Teste 2: Reserva de IA e Reconciliacao Idempotente com Protecao de Janela
  SELECT allowed, reservation_id INTO v_allowed, v_res_id
  FROM public.reserve_ai_tokens('res_test_101', 'test:ai:tph', v_user_a, 'ws1', 'proxy', 2000, 50000);
  ASSERT v_allowed IS TRUE AND v_res_id = 'res_test_101', 'Teste 2.1 falhou: reserva de tokens deve ser aceita';

  -- Reconciliacao de sucesso (consumo real 1500 contra 2000 reservados -> delta -500)
  SELECT status, delta_applied INTO v_rec_status, v_delta
  FROM public.reconcile_ai_tokens('res_test_101', 1500, 'success');
  ASSERT v_rec_status = 'reconciled' AND v_delta = -500, 'Teste 2.2 falhou: delta deve devolver 500 tokens';

  -- Idempotencia: chamar a reconciliacao uma segunda vez nao altera o saldo
  SELECT status, delta_applied INTO v_rec_status, v_delta
  FROM public.reconcile_ai_tokens('res_test_101', 1500, 'success');
  ASSERT v_rec_status = 'already_reconciled' AND v_delta = 0, 'Teste 2.3 falhou: chamada repetida deve ser idempotente';

  -- Teste 2.4: Protecao contra virada de janela
  SELECT allowed INTO v_allowed
  FROM public.reserve_ai_tokens('res_test_102', 'test:ai:tph_window', v_user_a, 'ws1', 'proxy', 3000, 50000);
  ASSERT v_allowed IS TRUE, 'Teste 2.4 falhou: reserva inicial aceita';

  -- Simula que a janela virou (window_start avancou para o futuro)
  UPDATE public.rate_limits
  SET window_start = clock_timestamp() + interval '2 hours', request_count = 100
  WHERE bucket_key = 'test:ai:tph_window';

  -- Reconcilia a reserva atrasada da janela passada: NAO pode afetar os 100 da janela nova!
  SELECT status, delta_applied INTO v_rec_status, v_delta
  FROM public.reconcile_ai_tokens('res_test_102', 1000, 'success');
  ASSERT v_rec_status = 'reconciled' AND v_delta = 0, 'Teste 2.5 falhou: reconciliacao em janela virada nao deve alterar delta';

  SELECT request_count INTO v_count FROM public.rate_limits WHERE bucket_key = 'test:ai:tph_window';
  ASSERT v_count = 100, 'Teste 2.6 falhou: saldo da nova janela foi corrompido por resposta atrasada!';

  -- Teste 3: Incremento Atomico de Falha de Senha e Bloqueio
  INSERT INTO public.senha_investimentos (user_id, senha_hash, tentativas_falhas)
  VALUES (v_user_a, 'hash_inicial', 0)
  ON CONFLICT (user_id) DO UPDATE SET senha_hash = 'hash_inicial', tentativas_falhas = 0, bloqueado_ate = null;

  SELECT tentativas_falhas, bloqueado, bloqueado_ate 
  INTO v_falha_count, v_bloqueado, v_bloq_ate
  FROM public.registrar_falha_senha_investimentos(v_user_a);
  ASSERT v_falha_count = 1 AND v_bloqueado IS FALSE, 'Teste 3.1 falhou: primeira falha deve registrar 1 e nao bloquear';

  SELECT tentativas_falhas, bloqueado INTO v_falha_count, v_bloqueado
  FROM public.registrar_falha_senha_investimentos(v_user_a);
  ASSERT v_falha_count = 2 AND v_bloqueado IS FALSE, 'Teste 3.2 falhou: segunda falha deve registrar 2 e nao bloquear';

  SELECT tentativas_falhas, bloqueado, bloqueado_ate INTO v_falha_count, v_bloqueado, v_bloq_ate
  FROM public.registrar_falha_senha_investimentos(v_user_a);
  ASSERT v_falha_count = 3 AND v_bloqueado IS TRUE AND v_bloq_ate > clock_timestamp(), 'Teste 3.3 falhou: terceira falha deve bloquear por 30min';

  -- Teste 4: Desbloqueio Atomico de Sessao e Prevencao de Race Condition
  SELECT public.desbloquear_sessao_investimentos(v_user_a, 'sess_1', 'hash_antigo_errado', 'novo_hash', clock_timestamp() + interval '30 min')
  INTO v_unlocked;
  ASSERT v_unlocked IS FALSE, 'Teste 4.1 falhou: desbloqueio com hash antigo nao deve ser permitido';

  SELECT public.desbloquear_sessao_investimentos(v_user_a, 'sess_desktop', 'hash_inicial', 'novo_hash_valido', clock_timestamp() + interval '30 min')
  INTO v_unlocked;
  ASSERT v_unlocked IS TRUE, 'Teste 4.2 falhou: desbloqueio com hash correto deve suceder e criar sessao';

  -- Teste 5: Isolamento de Sessao
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated', 'session_id', 'sess_desktop')::text, true);
  ASSERT public.is_investimentos_unlocked(v_user_a) IS TRUE, 'Teste 5.1 falhou: sess_desktop deve estar desbloqueada';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated', 'session_id', 'sess_mobile_comprometida')::text, true);
  ASSERT public.is_investimentos_unlocked(v_user_a) IS FALSE, 'Teste 5.2 falhou: sess_mobile_comprometida DEVE estar bloqueada';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  ASSERT public.is_investimentos_unlocked(v_user_a) IS FALSE, 'Teste 5.3 falhou: JWT sem session_id/jti DEVE estar bloqueado';

  -- Setup de dados para teste de RLS em public.investimentos
  DELETE FROM public.investimentos WHERE user_id IN (v_user_a, v_user_b);
  INSERT INTO public.investimentos (user_id, ativo, valor) VALUES 
    (v_user_a, 'PETR4', 1000.00),
    (v_user_b, 'VALE3', 2000.00);

  -- Cria sessao expirada para validar RLS
  INSERT INTO public.investimentos_sessions (session_id, user_id, expires_at)
  VALUES ('sess_expirada', v_user_a, clock_timestamp() - interval '10 minutes')
  ON CONFLICT (session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;

  RAISE NOTICE 'Bateria principal de infraestrutura e logica concluida com sucesso.';
END $$;

-- =========================================================================
-- 5. TESTES DE RLS, PERMISSOES E REVOGACOES COM ROLE AUTHENTICATED
-- =========================================================================
-- Executado como 'authenticated' para que as politicas RLS (TO authenticated) e
-- restricoes de coluna se apliquem fielmente ao contexto real de producao.
SET ROLE authenticated;

DO $$
DECLARE
  v_user_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_rows_count INTEGER;
  v_caught_expected_error BOOLEAN;
  v_error_msg TEXT;
BEGIN
  -- 6.1 Como User A na sessao bloqueada -> 0 linhas visiveis
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated', 'session_id', 'sess_mobile_comprometida')::text, true);
  SELECT count(*) INTO v_rows_count FROM public.investimentos;
  ASSERT v_rows_count = 0, 'Teste 6.1 falhou: RLS deve ocultar investimentos quando sessao esta bloqueada';

  -- 6.2 Como User A na sessao desbloqueada -> enxerga apenas PETR4 (nao VALE3 de User B)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated', 'session_id', 'sess_desktop')::text, true);
  SELECT count(*) INTO v_rows_count FROM public.investimentos;
  ASSERT v_rows_count = 1, 'Teste 6.2 falhou: RLS deve exibir exatamente 1 registro do proprio User A';

  -- 6.3 Teste de expiracao de sessao
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated', 'session_id', 'sess_expirada')::text, true);
  SELECT count(*) INTO v_rows_count FROM public.investimentos;
  ASSERT v_rows_count = 0, 'Teste 6.3 falhou: RLS deve bloquear apos a expiracao da sessao';

  RAISE NOTICE 'SUCESSO: Politicas de RLS de investimentos validadas confiavelmente sob a role authenticated.';

  -- 7.1 Revogacao de client_secret em divipay_config
  v_caught_expected_error := false;
  BEGIN
    EXECUTE 'SELECT client_secret FROM public.divipay_config LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_expected_error := true;
  END;

  IF NOT v_caught_expected_error THEN
    RAISE EXCEPTION 'FALHA DE SEGURANCA: authenticated conseguiu ler client_secret diretamente!';
  END IF;
  RAISE NOTICE 'SUCESSO: Leitura de client_secret bloqueada por Column-Level Security';

  -- 7.2 Revogacao de secret_key em eyemobile_config
  v_caught_expected_error := false;
  BEGIN
    EXECUTE 'SELECT secret_key FROM public.eyemobile_config LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_expected_error := true;
  END;

  IF NOT v_caught_expected_error THEN
    RAISE EXCEPTION 'FALHA DE SEGURANCA: authenticated conseguiu ler secret_key diretamente!';
  END IF;
  RAISE NOTICE 'SUCESSO: Leitura de secret_key bloqueada por Column-Level Security';

  -- 7.3 Revogacao total de SELECT em senha_investimentos
  v_caught_expected_error := false;
  BEGIN
    EXECUTE 'SELECT senha_hash FROM public.senha_investimentos LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught_expected_error := true;
  END;

  IF NOT v_caught_expected_error THEN
    RAISE EXCEPTION 'FALHA DE SEGURANCA: authenticated conseguiu ler senha_investimentos diretamente!';
  END IF;
  RAISE NOTICE 'SUCESSO: Acesso direto a senha_investimentos bloqueado';

  -- 7.4 Bloqueio de alteracao do campo role em profiles
  -- Aceita EXCLUSIVAMENTE insufficient_privilege ou a excecao especifica da trigger protect_profiles_role.
  -- Qualquer outro erro (ou a ausencia de erro) FALHA o teste.
  v_caught_expected_error := false;
  v_error_msg := '';
  BEGIN
    EXECUTE 'UPDATE public.profiles SET role = ''admin'' WHERE user_id = ''11111111-1111-1111-1111-111111111111''::uuid';
  EXCEPTION 
    WHEN insufficient_privilege THEN
      v_caught_expected_error := true;
      v_error_msg := 'insufficient_privilege (Column-Level Security)';
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%apenas administradores ou service_role podem alterar o campo role%' THEN
        v_caught_expected_error := true;
        v_error_msg := 'trigger protect_profiles_role';
      ELSE
        -- Excecao inesperada FALHA o teste explicitamente
        RAISE EXCEPTION 'Erro inesperado na tentativa de atualizar role: % (SQLSTATE %)', SQLERRM, SQLSTATE;
      END IF;
  END;

  IF NOT v_caught_expected_error THEN
    RAISE EXCEPTION 'FALHA DE SEGURANCA: authenticated conseguiu alterar o campo role sem bloqueio!';
  END IF;
  RAISE NOTICE 'SUCESSO: Alteracao de role bloqueada com sucesso por: %', v_error_msg;

  -- 7.5 Leitura de colunas permitidas deve funcionar sem erro
  BEGIN
    EXECUTE 'SELECT id, client_id, environment FROM public.divipay_config LIMIT 1';
    RAISE NOTICE 'SUCESSO: Leitura de colunas publicas de divipay_config autorizada';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FALHA: Leitura de colunas permitidas falhou: %', SQLERRM;
  END;
END $$;

RESET ROLE;

-- =========================================================================
-- 6. PROVA DE ELIMINACAO DE FALSO-POSITIVO
-- =========================================================================
-- Demonstra que o algoritmo do teste 7.4 FALHA confiavelmente se a protecao for removida.
DO $$
DECLARE
  v_caught_expected_error BOOLEAN := false;
  v_test_failed_as_expected BOOLEAN := false;
BEGIN
  CREATE TEMPORARY TABLE temp_profiles_unprotected (
    user_id UUID,
    role TEXT
  );
  INSERT INTO temp_profiles_unprotected VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'user');
  GRANT ALL ON temp_profiles_unprotected TO authenticated;

  -- Simula o teste 7.4 contra uma tabela desprotegida
  BEGIN
    EXECUTE 'UPDATE temp_profiles_unprotected SET role = ''admin'' WHERE user_id = ''11111111-1111-1111-1111-111111111111''::uuid';
  EXCEPTION 
    WHEN insufficient_privilege THEN
      v_caught_expected_error := true;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%apenas administradores ou service_role podem alterar o campo role%' THEN
        v_caught_expected_error := true;
      END IF;
  END;

  -- Em uma tabela desprotegida, v_caught_expected_error deve ser FALSE
  IF NOT v_caught_expected_error THEN
    v_test_failed_as_expected := true;
  END IF;

  DROP TABLE temp_profiles_unprotected;

  IF NOT v_test_failed_as_expected THEN
    RAISE EXCEPTION 'FALHA DE ROBUSTEZ: O algoritmo de teste aceitou uma tabela desprotegida!';
  END IF;

  RAISE NOTICE 'PROVA CONCLUIDA: O teste reprova de forma confiavel quando a protecao esta ausente (falso-positivo eliminado).';
END $$;

SELECT 'TODOS OS TESTES DE POSTGRESQL ISOLADO PASSARAM COM EXITO!' AS status;