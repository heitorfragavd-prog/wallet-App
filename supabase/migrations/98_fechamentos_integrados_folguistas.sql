-- Migration 98: Fechamentos Integrados dos Folguistas (Etapa 3D)
-- Adiciona rastreabilidade de colaborador, escala, turno, consolidação de anexos e espelhamento

-- 1. Colunas em colaboradores para identificação imutável via Telegram
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS telegram_user_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_username text;

CREATE INDEX IF NOT EXISTS idx_colaboradores_ws_tg_id 
  ON public.colaboradores (workspace_id, telegram_user_id);

-- 2. Colunas em fechamentos_caixa para governança de folguistas e espelhamento
ALTER TABLE public.fechamentos_caixa
  ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escala_id uuid REFERENCES public.colaborador_escalas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turno text DEFAULT 'integral',
  ADD COLUMN IF NOT EXISTS origem_grupo_id uuid REFERENCES public.telegram_grupos_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_canal text DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS chave_operacional text,
  ADD COLUMN IF NOT EXISTS anexos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS telegram_message_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS divergencias jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS espelhado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS espelhado_message_id bigint;

CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_chave_operacional 
  ON public.fechamentos_caixa (workspace_id, chave_operacional);

CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_colaborador 
  ON public.fechamentos_caixa (workspace_id, colaborador_id);

CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_data_turno 
  ON public.fechamentos_caixa (workspace_id, data_fechamento, turno);

-- 3. Atualizar política de SELECT em fechamentos_caixa
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

COMMENT ON COLUMN public.fechamentos_caixa.colaborador_id IS 'Colaborador/Folguista responsável pelo fechamento';
COMMENT ON COLUMN public.fechamentos_caixa.escala_id IS 'Escala de trabalho associada ao fechamento do turno';
COMMENT ON COLUMN public.fechamentos_caixa.chave_operacional IS 'Chave única de consolidação por workspace, data, colaborador e turno';
COMMENT ON COLUMN public.fechamentos_caixa.anexos IS 'Lista de fotografias e comprovantes recebidos e vinculados a este fechamento';
COMMENT ON COLUMN public.fechamentos_caixa.espelhado_em IS 'Registro do momento em que o fechamento foi espelhado no grupo oficial';
