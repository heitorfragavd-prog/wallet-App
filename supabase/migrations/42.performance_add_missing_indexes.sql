-- Migration: Add missing indexes for foreign keys and optimize admin policies
-- Issue: Foreign keys without indexes cause slow JOINs
-- Issue: Multiple permissive policies cause performance issues

-- =====================================================
-- ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

-- ia_analysis_results
CREATE INDEX IF NOT EXISTS idx_ia_analysis_results_categoria_id 
  ON public.ia_analysis_results(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ia_analysis_results_upload_id 
  ON public.ia_analysis_results(upload_id);

-- invite_tokens
CREATE INDEX IF NOT EXISTS idx_invite_tokens_plan_id 
  ON public.invite_tokens(plan_id);

-- pagamentos_dividas
CREATE INDEX IF NOT EXISTS idx_pagamentos_dividas_conta_id 
  ON public.pagamentos_dividas(conta_id);

-- subscription_payments
CREATE INDEX IF NOT EXISTS idx_subscription_payments_plan_id 
  ON public.subscription_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_id 
  ON public.subscription_payments(user_id);

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id 
  ON public.subscriptions(plan_id);

-- transacoes_recorrentes
CREATE INDEX IF NOT EXISTS idx_transacoes_recorrentes_categoria_id 
  ON public.transacoes_recorrentes(categoria_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_recorrentes_conta_id 
  ON public.transacoes_recorrentes(conta_id);

-- =====================================================
-- OPTIMIZE ADMIN POLICIES (fix auth.uid() and consolidate)
-- =====================================================

-- DEBT_REMINDERS - Remove duplicate admin policy
DROP POLICY IF EXISTS "Admins can view all debt_reminders" ON public.debt_reminders;

CREATE POLICY "Admins can view all debt_reminders" ON public.debt_reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- SUBSCRIPTION_PAYMENTS - Optimize admin policy
DROP POLICY IF EXISTS "Admins can view all payments" ON public.subscription_payments;

CREATE POLICY "Admins can view all payments" ON public.subscription_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- SUBSCRIPTIONS - Consolidate and optimize admin policies
DROP POLICY IF EXISTS "Subscriptions viewable by admin" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriptions viewable by owner" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON public.subscriptions;

CREATE POLICY "Subscriptions viewable by owner" ON public.subscriptions
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- PLANS - Consolidate and optimize admin policies
DROP POLICY IF EXISTS "Plans are insertable by admin" ON public.plans;
DROP POLICY IF EXISTS "Plans are updatable by admin" ON public.plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;
DROP POLICY IF EXISTS "Users can view plans" ON public.plans;
-- Keep "Plans are viewable by everyone" as it's public

CREATE POLICY "Admins can manage plans" ON public.plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- WEBHOOK_LOGS - Optimize admin policy
DROP POLICY IF EXISTS "Webhook logs viewable by admin" ON public.webhook_logs;

CREATE POLICY "Webhook logs viewable by admin" ON public.webhook_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- SYSTEM_SETTINGS - Optimize admin policies
DROP POLICY IF EXISTS "Admins can view system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can update system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can insert system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can delete system_settings" ON public.system_settings;

CREATE POLICY "Admins can manage system_settings" ON public.system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- INVITE_TOKENS - Optimize admin policy
DROP POLICY IF EXISTS "invite_tokens_admin_select" ON public.invite_tokens;

CREATE POLICY "invite_tokens_admin_select" ON public.invite_tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- PAYMENT_LINKS - Optimize admin policy
DROP POLICY IF EXISTS "payment_links_admin_all" ON public.payment_links;

CREATE POLICY "payment_links_admin_all" ON public.payment_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- WEBHOOKS_MANUTENCAO - Fix and optimize (was using profiles.id instead of profiles.user_id)
DROP POLICY IF EXISTS "Admins can view all webhooks_manutencao" ON public.webhooks_manutencao;
DROP POLICY IF EXISTS "Admins can create webhooks_manutencao" ON public.webhooks_manutencao;
DROP POLICY IF EXISTS "Admins can update webhooks_manutencao" ON public.webhooks_manutencao;
DROP POLICY IF EXISTS "Admins can delete webhooks_manutencao" ON public.webhooks_manutencao;

CREATE POLICY "Admins can manage webhooks_manutencao" ON public.webhooks_manutencao
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- LOGS_WEBHOOKS_MANUTENCAO - Fix and optimize (was using profiles.id instead of profiles.user_id)
DROP POLICY IF EXISTS "Admins can view all logs_webhooks_manutencao" ON public.logs_webhooks_manutencao;
DROP POLICY IF EXISTS "Admins can create logs_webhooks_manutencao" ON public.logs_webhooks_manutencao;
DROP POLICY IF EXISTS "Admins can delete logs_webhooks_manutencao" ON public.logs_webhooks_manutencao;

CREATE POLICY "Admins can manage logs_webhooks_manutencao" ON public.logs_webhooks_manutencao
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (select auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- OPTIMIZE DESPESA_TAGS AND RECEITA_TAGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own despesa_tags" ON public.despesa_tags;
DROP POLICY IF EXISTS "Users can create their own despesa_tags" ON public.despesa_tags;
DROP POLICY IF EXISTS "Users can delete their own despesa_tags" ON public.despesa_tags;

CREATE POLICY "Users can view their own despesa_tags" ON public.despesa_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.despesas
      WHERE despesas.id = despesa_tags.despesa_id 
      AND despesas.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can create their own despesa_tags" ON public.despesa_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.despesas
      WHERE despesas.id = despesa_tags.despesa_id 
      AND despesas.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own despesa_tags" ON public.despesa_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.despesas
      WHERE despesas.id = despesa_tags.despesa_id 
      AND despesas.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view their own receita_tags" ON public.receita_tags;
DROP POLICY IF EXISTS "Users can create their own receita_tags" ON public.receita_tags;
DROP POLICY IF EXISTS "Users can delete their own receita_tags" ON public.receita_tags;

CREATE POLICY "Users can view their own receita_tags" ON public.receita_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.receitas
      WHERE receitas.id = receita_tags.receita_id 
      AND receitas.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can create their own receita_tags" ON public.receita_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receitas
      WHERE receitas.id = receita_tags.receita_id 
      AND receitas.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own receita_tags" ON public.receita_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.receitas
      WHERE receitas.id = receita_tags.receita_id 
      AND receitas.user_id = (select auth.uid())
    )
  );

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 42: Added missing indexes and optimized admin policies';
END $$;
