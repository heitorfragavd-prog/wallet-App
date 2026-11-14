-- Migration 97: workspace_whatsapp_integrations & whatsapp_usuarios_pareados
-- Etapa 13: Integração Oficial WhatsApp Business (Cloud API), Pareamento e Idempotência

-- 1. Tabela de Integrações WhatsApp por Workspace
CREATE TABLE IF NOT EXISTS public.workspace_whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  waba_id text,
  display_phone_number text,
  verified_name text,
  quality_rating text DEFAULT 'UNKNOWN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'error')),
  webhook_verify_token text NOT NULL,
  app_secret_hash text,
  access_token_encrypted text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_workspace_whatsapp_phone UNIQUE (workspace_id, phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_whatsapp_ws ON public.workspace_whatsapp_integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_whatsapp_phone_id ON public.workspace_whatsapp_integrations(phone_number_id);

-- 2. Tabela de Usuários Pareados (Pareamento seguro de números WhatsApp com usuários do sistema)
CREATE TABLE IF NOT EXISTS public.whatsapp_usuarios_pareados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL, -- formato E.164: +55...
  nome_contato text,
  role_no_workspace text NOT NULL DEFAULT 'member' CHECK (role_no_workspace IN ('owner', 'admin', 'member')),
  autorizado_por uuid REFERENCES auth.users(id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_whatsapp_ws_phone UNIQUE (workspace_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_pareados_ws ON public.whatsapp_usuarios_pareados(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pareados_phone ON public.whatsapp_usuarios_pareados(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pareados_user ON public.whatsapp_usuarios_pareados(user_id);

-- 3. Tabela de Mensagens WhatsApp Processadas (Idempotência e Prevenção de Loops)
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens_processadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  whatsapp_message_id text NOT NULL,
  from_phone text NOT NULL,
  to_phone_number_id text NOT NULL,
  tipo_mensagem text NOT NULL,
  status_processamento text NOT NULL DEFAULT 'received' CHECK (status_processamento IN ('received', 'processed', 'ignored', 'duplicate', 'error')),
  idempotency_hash text NOT NULL,
  erro text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_whatsapp_msg_ws UNIQUE (workspace_id, whatsapp_message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_msgs_ws ON public.whatsapp_mensagens_processadas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msgs_hash ON public.whatsapp_mensagens_processadas(idempotency_hash);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msgs_msg_id ON public.whatsapp_mensagens_processadas(whatsapp_message_id);

-- 4. Gatilhos de updated_at
CREATE OR REPLACE FUNCTION public.handle_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspace_whatsapp_updated ON public.workspace_whatsapp_integrations;
CREATE TRIGGER trg_workspace_whatsapp_updated
  BEFORE UPDATE ON public.workspace_whatsapp_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_whatsapp_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_usuarios_pareados_updated ON public.whatsapp_usuarios_pareados;
CREATE TRIGGER trg_whatsapp_usuarios_pareados_updated
  BEFORE UPDATE ON public.whatsapp_usuarios_pareados
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_whatsapp_updated_at();

-- 5. RLS (Row Level Security)
ALTER TABLE public.workspace_whatsapp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_usuarios_pareados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mensagens_processadas ENABLE ROW LEVEL SECURITY;

-- Políticas para workspace_whatsapp_integrations
CREATE POLICY "Permitir leitura de integracao whatsapp para membros do workspace"
  ON public.workspace_whatsapp_integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_whatsapp_integrations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Permitir escrita de integracao whatsapp apenas para admins"
  ON public.workspace_whatsapp_integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_whatsapp_integrations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Políticas para whatsapp_usuarios_pareados
CREATE POLICY "Permitir leitura de usuarios pareados para membros do workspace"
  ON public.whatsapp_usuarios_pareados
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_usuarios_pareados.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Permitir gerenciamento de pareamento apenas para admins"
  ON public.whatsapp_usuarios_pareados
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_usuarios_pareados.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Políticas para whatsapp_mensagens_processadas
CREATE POLICY "Permitir leitura de mensagens whatsapp para membros do workspace"
  ON public.whatsapp_mensagens_processadas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_mensagens_processadas.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Permitir escrita de mensagens whatsapp para membros do workspace"
  ON public.whatsapp_mensagens_processadas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_mensagens_processadas.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
