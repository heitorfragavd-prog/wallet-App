-- ==============================================================================
-- Migration 93: Hardening de Segurança e Segregação de Metas Empresariais (Wallet CEO 3.0)
-- Etapa 09 - Hardening de Segurança (Gate 3)
-- ==============================================================================

-- 1. Substituir política de leitura para segregar metas financeiras privadas de metas operacionais
DROP POLICY IF EXISTS "wallet_business_goals_select" ON public.wallet_business_goals;

CREATE POLICY "wallet_business_goals_select"
  ON public.wallet_business_goals
  FOR SELECT
  USING (
    -- Service role tem acesso de sistema
    coalesce(auth.role() = 'service_role', false)
    
    -- Proprietário do workspace (acesso total)
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = wallet_business_goals.workspace_id
        AND w.user_id = auth.uid()
    )
    
    -- Administradores e Sócios Executivos com vínculo estritamente ATIVO (acesso total a metas privadas e operacionais)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wallet_business_goals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.active IS TRUE
        AND wm.role IN ('owner', 'admin')
    )

    -- Membros/Colaboradores comuns com vínculo estritamente ATIVO (apenas metas operacionais compartilháveis)
    -- Metas financeiras privadas ('faturamento', 'despesas', 'resultado_operacional', 'margem', 'ticket_medio') são BLOQUEADAS
    OR (
      wallet_business_goals.indicador NOT IN ('faturamento', 'despesas', 'resultado_operacional', 'margem', 'ticket_medio')
      AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = wallet_business_goals.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.active IS TRUE
      )
    )
  );

-- 2. Garantir que a função de governança exija estritamente status ativo para mutações
CREATE OR REPLACE FUNCTION public.validar_wallet_business_goals_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: o workspace_id é obrigatório para metas empresariais.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Apenas o proprietário ou administrador executivo ativo pode criar metas empresariais
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace pode cadastrar metas empresariais.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Imutabilidade do workspace_id
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de uma meta empresarial.';
    END IF;

    -- Apenas proprietário executivo ativo pode alterar metas
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para alterar metas empresariais.';
    END IF;

    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.tem_acesso_executivo_proprietario(OLD.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para remover metas empresariais.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
