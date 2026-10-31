-- Migration: 20261031120000_wallet_ceo_ai_telemetry_budgets.sql
-- Objetivo: Telemetria estruturada de custos de IA, controle de orçamento e observabilidade por workspace
-- REGRA DE SEGURANÇA: 100% idempotente, isolamento por workspace via RLS.
-- NÃO executar automaticamente em produção sem autorização explícita.

-- 1. TABELA DE TELEMETRIA DE CONSUMO DE IA (web e telegram)
CREATE TABLE IF NOT EXISTS public.wallet_ai_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'cron', 'api')),
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0.000000,
  tool_calls_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  correlation_id TEXT,
  conversation_id UUID,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'fallback')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- 5. VIEW DE CONSUMO MENSAL DE IA (SECURITY BARRIER)
CREATE OR REPLACE VIEW public.v_wallet_ai_monthly_usage
WITH (security_barrier = true)
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
