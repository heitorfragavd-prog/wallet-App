-- =========================================================================
-- tests/setup-e2e-real-schema.sql
-- Setup do Schema Real Completo para Homologação E2E na Stack Real do Supabase
-- =========================================================================

-- 1. Profiles & Trigger de Cadastro
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  organization_name TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by users themselves" ON public.profiles;
CREATE POLICY "Profiles are viewable by users themselves" ON public.profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger de novos usuarios no GoTrue
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, organization_name, telefone, endereco, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_user_meta_data->>'endereco', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'user'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Workspaces & Membros
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

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Helper SECURITY DEFINER para evitar recursão mútua de RLS entre workspaces e workspace_members
CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select" ON public.workspaces
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = workspaces.id 
      AND user_id = auth.uid() 
      AND status = 'active'
  )
);

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert" ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update" ON public.workspaces
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete" ON public.workspaces
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "workspaces_all" ON public.workspaces;

DROP POLICY IF EXISTS "members_manage" ON public.workspace_members;
CREATE POLICY "members_manage" ON public.workspace_members
FOR ALL TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "members_view" ON public.workspace_members;
CREATE POLICY "members_view" ON public.workspace_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_workspace_owner(workspace_id, auth.uid())
);

-- 3. Divipay e Eyemobile
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

DROP POLICY IF EXISTS "divipay_own" ON public.divipay_config;
CREATE POLICY "divipay_own" ON public.divipay_config FOR ALL TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

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

DROP POLICY IF EXISTS "eyemobile_own" ON public.eyemobile_config;
CREATE POLICY "eyemobile_own" ON public.eyemobile_config FOR ALL TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. IA Configurações
CREATE TABLE IF NOT EXISTS public.ia_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  api_key TEXT,
  modelo TEXT DEFAULT 'gpt-4o-mini',
  created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE public.ia_configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_config_own" ON public.ia_configuracoes;
CREATE POLICY "ia_config_own" ON public.ia_configuracoes FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 5. Investimentos e Senha
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

-- Políticas de baseline pré-Fase C (legadas, baseadas em auth.uid() = user_id)
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
DROP POLICY IF EXISTS "investimentos_legacy" ON public.investimentos;
CREATE POLICY "Users manage own investimentos" ON public.investimentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
DROP POLICY IF EXISTS "depositos_legacy" ON public.depositos_investimentos;
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own metas" ON public.metas_investimento;
CREATE POLICY "Users manage own metas" ON public.metas_investimento FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own rendimentos" ON public.historico_rendimentos;
CREATE POLICY "Users manage own rendimentos" ON public.historico_rendimentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own proventos" ON public.proventos_esperados;
CREATE POLICY "Users manage own proventos" ON public.proventos_esperados FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own config_invest" ON public.configuracoes_investimentos;
CREATE POLICY "Users manage own config_invest" ON public.configuracoes_investimentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, service_role;

-- Reproduz o estado real pré-Fase A: ia_configuracoes.api_key JÁ ESTAVA PROTEGIDA pela migration 20260826120000
REVOKE SELECT ON public.ia_configuracoes FROM authenticated, anon, PUBLIC;
GRANT SELECT (id, user_id, modelo, created_at, updated_at) ON public.ia_configuracoes TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ia_config_status()
RETURNS TABLE(id UUID, modelo TEXT, api_key_configurada BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.modelo, (c.api_key IS NOT NULL AND length(trim(c.api_key)) > 0) AS api_key_configurada
  FROM public.ia_configuracoes c WHERE c.user_id = auth.uid() LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ia_config_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ia_config_status() TO authenticated;

-- Tabelas de Chat IA e Auditoria da Wallet IA
CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo             text         NOT NULL DEFAULT 'Nova Conversa',
  openai_thread_id   text,
  ultima_mensagem_em timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own conversations" ON public.chat_conversas;
CREATE POLICY "Users can manage own conversations" ON public.chat_conversas FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.chat_conversas TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id   uuid        NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  conteudo      text        NOT NULL DEFAULT '',
  imagem_base64 text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own messages" ON public.chat_mensagens;
CREATE POLICY "Users can manage own messages" ON public.chat_mensagens FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.chat_mensagens TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wallet_ai_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  tool_name TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('success', 'error')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  error_code TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_ai_audit_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_audit_events TO service_role;

-- Wallet AI Tables and Views for Homologation
CREATE TABLE IF NOT EXISTS public.wallet_ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nova Conversa',
  summary TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_conversations TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wallet_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.wallet_ai_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  tool_calls JSONB,
  tool_results JSONB,
  sources JSONB,
  tokens_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.wallet_ai_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_messages TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wallet_ai_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  action_version TEXT NOT NULL DEFAULT 'v1',
  summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  previous_state JSONB,
  idempotency_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'confirmed', 'executed', 'cancelled', 'expired')) DEFAULT 'prepared',
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.wallet_ai_action_proposals ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_action_proposals TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wallet_ai_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id UUID,
  channel TEXT NOT NULL DEFAULT 'web',
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
  tool_calls_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  complexity_level INTEGER DEFAULT 1,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  correlation_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_ai_telemetry ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_telemetry TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wallet_ai_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
  alert_50_sent BOOLEAN NOT NULL DEFAULT false,
  alert_80_sent BOOLEAN NOT NULL DEFAULT false,
  alert_100_sent BOOLEAN NOT NULL DEFAULT false,
  hard_limit_active BOOLEAN NOT NULL DEFAULT false,
  allow_advanced_models BOOLEAN NOT NULL DEFAULT true,
  last_alert_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_ai_budgets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.wallet_ai_budgets TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_wallet_ai_monthly_usage
AS
SELECT
  t.workspace_id,
  to_char(t.created_at, 'YYYY-MM') AS month_reference,
  count(*)::integer AS total_requests,
  sum(t.prompt_tokens)::bigint AS sum_prompt_tokens,
  sum(t.completion_tokens)::bigint AS sum_completion_tokens,
  sum(t.total_tokens)::bigint AS sum_total_tokens,
  coalesce(sum(t.estimated_cost_usd), 0.000000)::numeric(10, 4) AS total_cost_usd,
  coalesce(b.monthly_budget_usd, 10.00)::numeric(10, 2) AS monthly_budget_usd,
  CASE
    WHEN coalesce(b.monthly_budget_usd, 10.00) > 0
    THEN round((coalesce(sum(t.estimated_cost_usd), 0) / coalesce(b.monthly_budget_usd, 10.00)) * 100, 1)
    ELSE 0.0
  END AS budget_consumed_percent,
  coalesce(b.hard_limit_active, false) AS hard_limit_active,
  coalesce(b.allow_advanced_models, true) AS allow_advanced_models
FROM public.wallet_ai_telemetry t
LEFT JOIN public.wallet_ai_budgets b ON b.workspace_id = t.workspace_id
GROUP BY t.workspace_id, to_char(t.created_at, 'YYYY-MM'), b.monthly_budget_usd, b.hard_limit_active, b.allow_advanced_models;

GRANT SELECT ON public.v_wallet_ai_monthly_usage TO authenticated, service_role;
