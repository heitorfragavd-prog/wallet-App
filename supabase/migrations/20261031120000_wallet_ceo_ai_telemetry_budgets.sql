-- Migration: 20261031120000_wallet_ceo_ai_telemetry_budgets.sql
-- Objetivo: Telemetria estruturada de custos de IA, controle de orçamento e observabilidade por workspace
-- REGRA DE SEGURANÇA: 100% idempotente, isolamento por workspace via RLS e security_invoker.
-- NÃO executar automaticamente em produção sem autorização explícita do proprietário.

-- 1. TABELA DE TELEMETRIA DE CONSUMO DE IA (web e telegram)
CREATE TABLE IF NOT EXISTS public.wallet_ai_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'cron', 'api')),
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
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'fallback')),
  error_code TEXT,
  correlation_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantir colunas se tabela já existia
ALTER TABLE public.wallet_ai_telemetry ADD COLUMN IF NOT EXISTS conversation_id UUID;
ALTER TABLE public.wallet_ai_telemetry ADD COLUMN IF NOT EXISTS complexity_level INTEGER DEFAULT 1;
ALTER TABLE public.wallet_ai_telemetry ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.wallet_ai_telemetry ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_ai_telemetry_workspace_date
  ON public.wallet_ai_telemetry(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_telemetry_workspace_channel
  ON public.wallet_ai_telemetry(workspace_id, channel);

-- 2. TABELA DE ORÇAMENTOS E LIMITES DE IA
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

CREATE INDEX IF NOT EXISTS idx_wallet_ai_budgets_workspace
  ON public.wallet_ai_budgets(workspace_id);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.wallet_ai_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ai_budgets ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE RLS (IDEMPOTENTES COM DROP IF EXISTS)
DROP POLICY IF EXISTS "Admins podem visualizar telemetria de IA do workspace" ON public.wallet_ai_telemetry;
CREATE POLICY "Admins podem visualizar telemetria de IA do workspace"
  ON public.wallet_ai_telemetry
  FOR SELECT
  TO authenticated
  USING (
    coalesce(auth.role() = 'service_role', false)
    OR public.tem_acesso_admin_workspace(workspace_id)
  );

DROP POLICY IF EXISTS "Membros autorizados e service_role podem inserir telemetria" ON public.wallet_ai_telemetry;
CREATE POLICY "Membros autorizados e service_role podem inserir telemetria"
  ON public.wallet_ai_telemetry
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    coalesce(auth.role() = 'service_role', false)
    OR (workspace_id IS NOT NULL AND public.tem_acesso_operacional_workspace(workspace_id))
  );

DROP POLICY IF EXISTS "Admins gerenciam orçamentos de IA do workspace" ON public.wallet_ai_budgets;
CREATE POLICY "Admins gerenciam orçamentos de IA do workspace"
  ON public.wallet_ai_budgets
  FOR ALL
  TO authenticated, service_role
  USING (
    coalesce(auth.role() = 'service_role', false)
    OR public.tem_acesso_admin_workspace(workspace_id)
  )
  WITH CHECK (
    coalesce(auth.role() = 'service_role', false)
    OR public.tem_acesso_admin_workspace(workspace_id)
  );

-- 5. VIEW DE CONSUMO MENSAL DE IA (SECURITY INVOKER + BARRIER)
-- security_invoker = true garante que o RLS do usuário chamador seja estritamente aplicado
CREATE OR REPLACE VIEW public.v_wallet_ai_monthly_usage
WITH (security_invoker = true, security_barrier = true)
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

-- 6. RPC SEGURA DE CONSULTA DE CONSUMO MENSAL (SECURITY DEFINER COM CHECAGEM DE WORKSPACE)
CREATE OR REPLACE FUNCTION public.rpc_consultar_consumo_ia_mensal(
  p_workspace_id UUID,
  p_month_reference TEXT DEFAULT NULL
)
RETURNS TABLE (
  workspace_id UUID,
  month_reference TEXT,
  total_requests INTEGER,
  sum_total_tokens BIGINT,
  total_cost_usd NUMERIC,
  monthly_budget_usd NUMERIC,
  budget_consumed_percent NUMERIC,
  hard_limit_active BOOLEAN,
  allow_advanced_models BOOLEAN,
  alert_50_sent BOOLEAN,
  alert_80_sent BOOLEAN,
  alert_100_sent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month TEXT;
BEGIN
  -- 1. Validação de segurança estrita
  IF NOT (
    coalesce(auth.role() = 'service_role', false)
    OR public.tem_acesso_admin_workspace(p_workspace_id)
  ) THEN
    RAISE EXCEPTION 'Acesso negado aos dados de telemetria do workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_month := coalesce(p_month_reference, to_char(now(), 'YYYY-MM'));

  RETURN QUERY
  SELECT
    p_workspace_id,
    v_month,
    coalesce(count(t.id)::integer, 0) AS total_requests,
    coalesce(sum(t.total_tokens)::bigint, 0::bigint) AS sum_total_tokens,
    coalesce(sum(t.estimated_cost_usd), 0.000000)::numeric(10, 4) AS total_cost_usd,
    coalesce(b.monthly_budget_usd, 10.00)::numeric(10, 2) AS monthly_budget_usd,
    CASE
      WHEN coalesce(b.monthly_budget_usd, 10.00) > 0
      THEN round((coalesce(sum(t.estimated_cost_usd), 0) / coalesce(b.monthly_budget_usd, 10.00)) * 100, 1)
      ELSE 0.0
    END AS budget_consumed_percent,
    coalesce(b.hard_limit_active, false) AS hard_limit_active,
    coalesce(b.allow_advanced_models, true) AS allow_advanced_models,
    coalesce(b.alert_50_sent, false) AS alert_50_sent,
    coalesce(b.alert_80_sent, false) AS alert_80_sent,
    coalesce(b.alert_100_sent, false) AS alert_100_sent
  FROM public.wallet_ai_budgets b
  FULL OUTER JOIN public.wallet_ai_telemetry t
    ON t.workspace_id = b.workspace_id
    AND to_char(t.created_at, 'YYYY-MM') = v_month
  WHERE coalesce(b.workspace_id, t.workspace_id) = p_workspace_id
  GROUP BY b.monthly_budget_usd, b.hard_limit_active, b.allow_advanced_models, b.alert_50_sent, b.alert_80_sent, b.alert_100_sent;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_consultar_consumo_ia_mensal(UUID, TEXT) TO authenticated, service_role;
GRANT SELECT, INSERT ON public.wallet_ai_telemetry TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.wallet_ai_budgets TO authenticated, service_role;
GRANT SELECT ON public.v_wallet_ai_monthly_usage TO authenticated, service_role;

