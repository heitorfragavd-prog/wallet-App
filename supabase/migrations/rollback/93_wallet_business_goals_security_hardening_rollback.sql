-- ==============================================================================
-- Rollback Migration 93: Reverter Hardening de Segurança de Metas Empresariais
-- ==============================================================================

DROP POLICY IF EXISTS "wallet_business_goals_select" ON public.wallet_business_goals;

CREATE POLICY "wallet_business_goals_select"
  ON public.wallet_business_goals
  FOR SELECT
  USING (
    coalesce(auth.role() = 'service_role', false)
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = wallet_business_goals.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wallet_business_goals.workspace_id
        AND wm.user_id = auth.uid()
        AND coalesce(wm.active, true) = true
    )
  );
