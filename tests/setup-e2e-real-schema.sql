-- =========================================================================
-- tests/setup-e2e-real-schema.sql
-- Setup do Schema Real Completo para Homologação E2E na Stack Real do Supabase
-- =========================================================================

-- 1. Profiles & Trigger de Cadastro
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  organization_name TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
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
  INSERT INTO public.profiles (user_id, name, organization_name, telefone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
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

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, service_role;

