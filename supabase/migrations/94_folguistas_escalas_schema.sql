-- =============================================================================
-- Migration 94: Gestão de Folguistas, Disponibilidades e Motor de Escalas
-- =============================================================================

BEGIN;

-- ─── 1. Extensão da Tabela Colaboradores para Folguistas & Preferências ──────

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS turnos_preferidos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dias_disponiveis text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS avaliacao_nota numeric(3,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS restricoes_alimentares text,
  ADD COLUMN IF NOT EXISTS observacoes_escala text;

-- ─── 2. Tabela de Disponibilidades Semanais dos Folguistas ────────────────────

CREATE TABLE IF NOT EXISTS public.folguistas_disponibilidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data_referencia date NOT NULL,
  turno text NOT NULL CHECK (turno IN ('manha', 'intermediario', 'noite', 'qualquer')),
  disponivel boolean NOT NULL DEFAULT true,
  confirmado boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('telegram', 'web', 'manual', 'ia')),
  resposta_raw text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_folguista_disp UNIQUE (colaborador_id, data_referencia, turno)
);

CREATE INDEX IF NOT EXISTS idx_folguistas_disp_ws_data
  ON public.folguistas_disponibilidade (workspace_id, data_referencia);

CREATE INDEX IF NOT EXISTS idx_folguistas_disp_colab
  ON public.folguistas_disponibilidade (colaborador_id, data_referencia);

-- ─── 3. Tabela de Configurações das Escalas por Workspace ─────────────────────

CREATE TABLE IF NOT EXISTS public.escalas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  min_horas_descanso integer NOT NULL DEFAULT 11,
  valor_diaria_padrao numeric(10,2) NOT NULL DEFAULT 100.00,
  valor_meta_padrao numeric(10,2) NOT NULL DEFAULT 20.00,
  horarios_turnos jsonb NOT NULL DEFAULT '{
    "manha": {"inicio": "05:00", "fim": "13:30", "descricao": "Turno Manhã (Abertura)"},
    "intermediario": {"inicio": "12:00", "fim": "20:30", "descricao": "Turno Intermediário"},
    "noite": {"inicio": "15:00", "fim": "23:30", "descricao": "Turno Noite (Fechamento)"}
  }'::jsonb,
  dias_semana_turnos jsonb NOT NULL DEFAULT '{
    "sabado": ["manha", "intermediario", "noite"],
    "domingo": ["manha", "intermediario", "noite"]
  }'::jsonb,
  notificacao_segunda_horario text NOT NULL DEFAULT '09:00',
  notificacao_sexta_horario text NOT NULL DEFAULT '14:00',
  simulacao_modo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_escalas_config_workspace UNIQUE (workspace_id)
);

-- Seed de configurações padrão para os workspaces existentes
INSERT INTO public.escalas_config (workspace_id)
SELECT id FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- ─── 4. RLS & Segurança ──────────────────────────────────────────────────────

ALTER TABLE public.folguistas_disponibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_config ENABLE ROW LEVEL SECURITY;

-- Policies para folguistas_disponibilidade
DROP POLICY IF EXISTS "folguistas_disp_select" ON public.folguistas_disponibilidade;
CREATE POLICY "folguistas_disp_select"
  ON public.folguistas_disponibilidade
  FOR SELECT
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "folguistas_disp_insert" ON public.folguistas_disponibilidade;
CREATE POLICY "folguistas_disp_insert"
  ON public.folguistas_disponibilidade
  FOR INSERT
  TO authenticated
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "folguistas_disp_update" ON public.folguistas_disponibilidade;
CREATE POLICY "folguistas_disp_update"
  ON public.folguistas_disponibilidade
  FOR UPDATE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id))
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "folguistas_disp_delete" ON public.folguistas_disponibilidade;
CREATE POLICY "folguistas_disp_delete"
  ON public.folguistas_disponibilidade
  FOR DELETE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

-- Policies para escalas_config
DROP POLICY IF EXISTS "escalas_config_select" ON public.escalas_config;
CREATE POLICY "escalas_config_select"
  ON public.escalas_config
  FOR SELECT
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_config_insert" ON public.escalas_config;
CREATE POLICY "escalas_config_insert"
  ON public.escalas_config
  FOR INSERT
  TO authenticated
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_config_update" ON public.escalas_config;
CREATE POLICY "escalas_config_update"
  ON public.escalas_config
  FOR UPDATE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id))
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_config_delete" ON public.escalas_config;
CREATE POLICY "escalas_config_delete"
  ON public.escalas_config
  FOR DELETE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

COMMIT;
