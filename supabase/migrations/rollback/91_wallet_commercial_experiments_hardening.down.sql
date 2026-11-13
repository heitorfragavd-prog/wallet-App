-- Rollback da Migration 91: Retorna ao trigger da Migration 90
CREATE OR REPLACE FUNCTION public.validar_experimento_comercial_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de um experimento comercial.';
    END IF;

    IF (OLD.status IN ('concluido', 'completed', 'cancelado', 'cancelled')) AND (NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Operação negada: experimentos concluídos ou cancelados são históricos e não podem ser reabertos.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
        RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace tem permissão para alterar o ciclo de vida do experimento.';
      END IF;

      IF NEW.status IN ('concluido', 'completed') AND OLD.status NOT IN ('em_andamento', 'active') THEN
        RAISE EXCEPTION 'Operação inválida: um experimento só pode ser concluído após ter sido iniciado (em andamento).';
      END IF;

      IF NEW.status IN ('em_andamento', 'active') AND OLD.status NOT IN ('aprovado', 'approved', 'em_andamento', 'active') THEN
        RAISE EXCEPTION 'Operação inválida: o experimento precisa ser aprovado pelo proprietário antes de ser iniciado.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
