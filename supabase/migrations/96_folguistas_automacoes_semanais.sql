-- =============================================================================
-- Migration 96: Automações Semanais Inteligentes dos Folguistas (Etapa 3C)
-- =============================================================================

BEGIN;

-- ─── 1. Expansão da Tabela escalas_config ─────────────────────────────────────

ALTER TABLE public.escalas_config
  ADD COLUMN IF NOT EXISTS ativo_segunda boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ativo_sexta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limite_tentativas integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS canal_preferencial text NOT NULL DEFAULT 'telegram';

-- Garantir constraint de canal_preferencial de forma segura
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_escalas_config_canal_preferencial'
  ) THEN
    ALTER TABLE public.escalas_config
      ADD CONSTRAINT chk_escalas_config_canal_preferencial
      CHECK (canal_preferencial IN ('telegram', 'whatsapp_manual', 'web'));
  END IF;
END $$;

-- ─── 2. Tabela de Log e Idempotência das Automações Semanais ──────────────────

CREATE TABLE IF NOT EXISTS public.escalas_automacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tipo_rotina text NOT NULL CHECK (tipo_rotina IN ('consulta_segunda', 'confirmacao_sexta', 'lembrete', 'busca_substituto', 'simulacao')),
  idempotency_key text NOT NULL UNIQUE,
  data_fim_semana_inicio date NOT NULL,
  data_fim_semana_fim date NOT NULL,
  status text NOT NULL DEFAULT 'preparada' CHECK (status IN ('preparada', 'executada', 'erro', 'simulada', 'cancelada')),
  destinatario_tipo text NOT NULL DEFAULT 'grupo' CHECK (destinatario_tipo IN ('grupo', 'individual', 'sistema')),
  destinatario_id text,
  destinatario_nome text,
  mensagem_texto text NOT NULL,
  vagas_identificadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  respostas_processadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  enviado_telegram boolean NOT NULL DEFAULT false,
  erro_mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalas_automacoes_ws_data
  ON public.escalas_automacoes_log (workspace_id, data_fim_semana_inicio);

CREATE INDEX IF NOT EXISTS idx_escalas_automacoes_idempotency
  ON public.escalas_automacoes_log (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_escalas_automacoes_tipo_status
  ON public.escalas_automacoes_log (workspace_id, tipo_rotina, status);

-- ─── 3. RLS & Políticas de Segurança ──────────────────────────────────────────

ALTER TABLE public.escalas_automacoes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escalas_automacoes_select" ON public.escalas_automacoes_log;
CREATE POLICY "escalas_automacoes_select"
  ON public.escalas_automacoes_log
  FOR SELECT
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_automacoes_insert" ON public.escalas_automacoes_log;
CREATE POLICY "escalas_automacoes_insert"
  ON public.escalas_automacoes_log
  FOR INSERT
  TO authenticated
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_automacoes_update" ON public.escalas_automacoes_log;
CREATE POLICY "escalas_automacoes_update"
  ON public.escalas_automacoes_log
  FOR UPDATE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id))
  WITH CHECK (tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "escalas_automacoes_delete" ON public.escalas_automacoes_log;
CREATE POLICY "escalas_automacoes_delete"
  ON public.escalas_automacoes_log
  FOR DELETE
  TO authenticated
  USING (tem_acesso_workspace(workspace_id));

COMMIT;
