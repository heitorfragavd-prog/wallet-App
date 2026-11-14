-- Rollback da Migration 99: Correção de Integridade Financeira e Segurança dos Fechamentos (Etapa 3D.1)

DROP INDEX IF EXISTS public.idx_fechamentos_caixa_chave_operacional_uniq;

ALTER TABLE public.fechamentos_caixa
  DROP COLUMN IF EXISTS identidade_pendente,
  DROP COLUMN IF EXISTS status_espelhamento,
  DROP COLUMN IF EXISTS erro_espelhamento,
  DROP COLUMN IF EXISTS tipo_conferencia;

-- Restaura RLS da migration 98
DROP POLICY IF EXISTS "fechamentos_caixa_select_authorized" ON public.fechamentos_caixa;
CREATE POLICY "fechamentos_caixa_select_authorized" ON public.fechamentos_caixa
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL AND (
      is_workspace_executive(workspace_id, auth.uid()) OR
      (grupo_id IS NOT NULL AND user_can_access_group(grupo_id, auth.uid())) OR
      (origem_grupo_id IS NOT NULL AND user_can_access_group(origem_grupo_id, auth.uid())) OR
      EXISTS (
        SELECT 1 FROM public.telegram_grupos_config g
        WHERE g.workspace_id = fechamentos_caixa.workspace_id
          AND g.tipo_grupo = 'fechamento'
          AND g.ativo = true
          AND user_can_access_group(g.id, auth.uid())
      )
    )
  );
