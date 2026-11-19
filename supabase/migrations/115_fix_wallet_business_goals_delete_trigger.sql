-- ==============================================================================
-- Migration 115: Correção do Trigger BEFORE DELETE em wallet_business_goals (Wallet CEO 3.0)
-- Retorna OLD em operações de DELETE para permitir a remoção legítima da linha
-- e inclui reconhecimento seguro de sessão superusuário postgres sem JWT
-- ==============================================================================

-- 1. Atualizar tem_acesso_executivo_proprietario
CREATE OR REPLACE FUNCTION public.tem_acesso_executivo_proprietario(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (session_user = 'postgres' AND auth.uid() IS NULL)
    OR (
      p_workspace_id IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND (
        public.is_workspace_owner(p_workspace_id, auth.uid())
        OR public.is_workspace_executive(p_workspace_id, auth.uid())
      )
    );
$$;

-- 2. Atualizar validar_wallet_business_goals_governance
CREATE OR REPLACE FUNCTION public.validar_wallet_business_goals_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Service role ou superusuário de manutenção/migrações sem JWT
  IF coalesce(auth.role() = 'service_role', false) OR (session_user = 'postgres' AND auth.uid() IS NULL) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Operação DELETE: valida acesso do proprietário/administrador executivo e retorna OLD
  IF TG_OP = 'DELETE' THEN
    IF NOT public.tem_acesso_executivo_proprietario(OLD.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para remover metas empresariais.';
    END IF;
    RETURN OLD;
  END IF;

  -- Para INSERT e UPDATE, workspace_id é obrigatório
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: o workspace_id é obrigatório para metas empresariais.';
  END IF;

  -- Operação INSERT
  IF TG_OP = 'INSERT' THEN
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace pode cadastrar metas empresariais.';
    END IF;
    RETURN NEW;
  END IF;

  -- Operação UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de uma meta empresarial.';
    END IF;

    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para alterar metas empresariais.';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
