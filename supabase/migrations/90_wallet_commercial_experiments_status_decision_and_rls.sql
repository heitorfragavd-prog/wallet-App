-- ==============================================================================
-- Migration 90: Reconciliação de Status, Decisão, Workflow e RLS Executiva
-- Etapa 08 - Entrega D: Compatibilidade do Banco e Autorização Executiva
-- ==============================================================================

-- 1. Reconciliação das restrições CHECK de status e decisão
ALTER TABLE public.wallet_commercial_experiments
  DROP CONSTRAINT IF EXISTS wallet_commercial_experiments_status_check;

ALTER TABLE public.wallet_commercial_experiments
  DROP CONSTRAINT IF EXISTS wallet_commercial_experiments_decision_check;

ALTER TABLE public.wallet_commercial_experiments
  ADD CONSTRAINT wallet_commercial_experiments_status_check
  CHECK (status IN (
    'planejado', 'planned',
    'aprovado', 'approved',
    'em_andamento', 'active',
    'concluido', 'completed',
    'cancelado', 'cancelled'
  ));

ALTER TABLE public.wallet_commercial_experiments
  ADD CONSTRAINT wallet_commercial_experiments_decision_check
  CHECK (decision IS NULL OR decision IN (
    'pendente',
    'aprovado', 'approved',
    'rejeitado', 'rejected',
    'manter',
    'ampliar',
    'ajustar',
    'interromper',
    'inconcluso', 'inconclusive'
  ));

-- 2. Função de Segurança Canônica: Acesso Executivo do Proprietário do Workspace
CREATE OR REPLACE FUNCTION public.tem_acesso_executivo_proprietario(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      p_workspace_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = p_workspace_id
            AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = p_workspace_id
            AND wm.user_id = auth.uid()
            AND wm.role = 'owner'
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso_executivo_proprietario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso_executivo_proprietario(uuid) TO authenticated, service_role;

-- 3. Trigger de Governança de Workflow e Imutabilidade do Workspace
CREATE OR REPLACE FUNCTION public.validar_experimento_comercial_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se for service_role, libera para tarefas automáticas e reconciliação
  IF coalesce(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- A. Imutabilidade do workspace_id no payload
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de um experimento comercial.';
    END IF;

    -- B. Imutabilidade de status concluído ou cancelado
    IF (OLD.status IN ('concluido', 'completed', 'cancelado', 'cancelled')) AND (NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Operação negada: experimentos concluídos ou cancelados são históricos e não podem ser reabertos.';
    END IF;

    -- C. Transições de ciclo de vida seguras
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      -- Apenas o proprietário executivo pode alterar status
      IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
        RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace tem permissão para alterar o ciclo de vida do experimento.';
      END IF;

      -- Não permitir concluir experimento que nunca foi iniciado
      IF NEW.status IN ('concluido', 'completed') AND OLD.status NOT IN ('em_andamento', 'active') THEN
        RAISE EXCEPTION 'Operação inválida: um experimento só pode ser concluído após ter sido iniciado (em andamento).';
      END IF;

      -- Não permitir iniciar experimento sem aprovação prévia
      IF NEW.status IN ('em_andamento', 'active') AND OLD.status NOT IN ('aprovado', 'approved', 'em_andamento', 'active') THEN
        RAISE EXCEPTION 'Operação inválida: o experimento precisa ser aprovado pelo proprietário antes de ser iniciado.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_experimento_comercial ON public.wallet_commercial_experiments;
CREATE TRIGGER trg_validar_experimento_comercial
  BEFORE INSERT OR UPDATE ON public.wallet_commercial_experiments
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_experimento_comercial_workflow();

-- 4. Políticas RLS segregadas por privilégio executivo
ALTER TABLE public.wallet_commercial_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_commercial_experiments_admin_all" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_select" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_insert" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_update" ON public.wallet_commercial_experiments;
DROP POLICY IF EXISTS "wallet_commercial_experiments_delete" ON public.wallet_commercial_experiments;

-- Leitura: Proprietários e Administradores do Workspace
CREATE POLICY "wallet_commercial_experiments_select"
  ON public.wallet_commercial_experiments
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_admin_workspace(workspace_id));

-- Inserção: Proprietários e Administradores (como sugestão / planejamento)
CREATE POLICY "wallet_commercial_experiments_insert"
  ON public.wallet_commercial_experiments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.tem_acesso_admin_workspace(workspace_id));

-- Atualização: Exclusiva do Proprietário / Executivo (Aprovar, Iniciar, Concluir, Cancelar)
CREATE POLICY "wallet_commercial_experiments_update"
  ON public.wallet_commercial_experiments
  FOR UPDATE
  TO authenticated
  USING (public.tem_acesso_executivo_proprietario(workspace_id))
  WITH CHECK (public.tem_acesso_executivo_proprietario(workspace_id));

-- Exclusão: Exclusiva do Proprietário
CREATE POLICY "wallet_commercial_experiments_delete"
  ON public.wallet_commercial_experiments
  FOR DELETE
  TO authenticated
  USING (public.tem_acesso_executivo_proprietario(workspace_id));
