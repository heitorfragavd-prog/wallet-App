-- ==============================================================================
-- Migration 91: Hardening de Inserção, Imutabilidade e Membros Ativos em Experimentos
-- Etapa 08 - Gate 2: Hardening do Banco e Workflow de Experimentos Comerciais
-- ==============================================================================

-- 1. Atualizar função de autorização executiva checando membro ativo
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
            AND coalesce(wm.active, true) = true
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso_executivo_proprietario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso_executivo_proprietario(uuid) TO authenticated, service_role;

-- 2. Atualizar Trigger de Governança com validação estrita em INSERT e UPDATE
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

  -- 1. Validação de workspace_id em qualquer operação
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: o workspace_id é obrigatório para experimentos comerciais.';
  END IF;

  -- 2. Regras para inserção (TG_OP = 'INSERT')
  IF TG_OP = 'INSERT' THEN
    -- Um experimento novo não pode ser inserido diretamente como 'em_andamento', 'concluido' ou 'cancelado'
    IF NEW.status IN ('em_andamento', 'active', 'concluido', 'completed', 'cancelado', 'cancelled') THEN
      RAISE EXCEPTION 'Operação negada: experimentos recém-criados devem iniciar no estado planejado ou aprovado, não diretamente em andamento ou concluído.';
    END IF;

    -- Se inserido como aprovado, exige permissão do proprietário
    IF NEW.status IN ('aprovado', 'approved') AND NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace pode criar experimentos diretamente com status aprovado.';
    END IF;

    -- Default status seguro se nulo
    IF NEW.status IS NULL THEN
      NEW.status := 'planejado';
    END IF;
  END IF;

  -- 3. Regras para atualização (TG_OP = 'UPDATE')
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
