-- =============================================================================
-- Migration 89: Central de Conversas Inteligentes — Grupos Operacionais,
-- Participantes, Permissões Granulares, Anexos e Hardening RLS / Realtime
-- =============================================================================

BEGIN;

-- ─── 1. Evolução de telegram_grupos_config (preservando dados existentes) ────

ALTER TABLE public.telegram_grupos_config
  ALTER COLUMN chat_id DROP NOT NULL;

ALTER TABLE public.telegram_grupos_config
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS funcionalidades_autorizadas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normaliza tipos legados conhecidos caso existam
UPDATE public.telegram_grupos_config
SET tipo_grupo = CASE
  WHEN tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja') THEN tipo_grupo
  WHEN lower(coalesce(nome_grupo, '')) LIKE '%fechamento%' THEN 'fechamento'
  WHEN lower(coalesce(nome_grupo, '')) LIKE '%boleto%' OR lower(coalesce(nome_grupo, '')) LIKE '%nota%' OR lower(coalesce(nome_grupo, '')) LIKE '%nfe%' THEN 'nfe_boletos'
  WHEN lower(coalesce(nome_grupo, '')) LIKE '%conta%' OR lower(coalesce(nome_grupo, '')) LIKE '%financeir%' THEN 'contas_empresa'
  ELSE 'conversas_loja'
END
WHERE tipo_grupo NOT IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja');

ALTER TABLE public.telegram_grupos_config
  DROP CONSTRAINT IF EXISTS chk_telegram_grupos_config_tipo_grupo;

ALTER TABLE public.telegram_grupos_config
  ADD CONSTRAINT chk_telegram_grupos_config_tipo_grupo
  CHECK (tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja'));

CREATE INDEX IF NOT EXISTS idx_telegram_grupos_config_workspace_ativo
  ON public.telegram_grupos_config (workspace_id, ativo, tipo_grupo);

-- ─── 2. Tabela de Participantes Autorizados por Grupo ────────────────────────

CREATE TABLE IF NOT EXISTS public.grupo_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.telegram_grupos_config(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_no_grupo text NOT NULL DEFAULT 'operador'
    CHECK (role_no_grupo IN ('admin_grupo', 'operador', 'leitor')),
  permissoes jsonb NOT NULL DEFAULT jsonb_build_object(
    'ler', true,
    'enviar_mensagens', true,
    'enviar_documentos', true,
    'confirmar_operacoes', false,
    'gerenciar_grupo', false
  ),
  ativo boolean NOT NULL DEFAULT true,
  autorizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_grupo_participantes_grupo_user UNIQUE (grupo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_grupo_participantes_user_ativo
  ON public.grupo_participantes (user_id, workspace_id, ativo);

CREATE INDEX IF NOT EXISTS idx_grupo_participantes_grupo_ativo
  ON public.grupo_participantes (grupo_id, ativo);

-- Trigger de integridade para grupo_participantes:
-- 1) Workspace deve bater com o workspace do grupo
-- 2) Grupo 'contas_empresa' aceita apenas proprietário do workspace ou admin ativo do workspace
CREATE OR REPLACE FUNCTION public.enforce_grupo_participante_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_ws uuid;
  v_tipo_grupo text;
  v_is_exec boolean := false;
  v_is_member boolean := false;
BEGIN
  SELECT g.workspace_id, g.tipo_grupo
    INTO v_group_ws, v_tipo_grupo
  FROM public.telegram_grupos_config g
  WHERE g.id = NEW.grupo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo operacional (%) não encontrado.', NEW.grupo_id;
  END IF;

  IF v_group_ws IS NOT NULL THEN
    NEW.workspace_id := v_group_ws;
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = NEW.workspace_id AND w.user_id = NEW.user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = NEW.workspace_id
        AND wm.user_id = NEW.user_id
        AND wm.active = true
        AND wm.role IN ('owner', 'proprietario', 'admin', 'administrador')
    )
  ) INTO v_is_exec;

  SELECT (
    v_is_exec
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = NEW.workspace_id
        AND wm.user_id = NEW.user_id
        AND wm.active = true
    )
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Usuário (%) não é membro ativo do workspace (%) do grupo.', NEW.user_id, NEW.workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF v_tipo_grupo = 'contas_empresa' AND NOT v_is_exec THEN
    RAISE EXCEPTION 'Grupo Contas da Empresa é restrito ao proprietário e administradores explicitamente autorizados.'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_grupo_participante_rules ON public.grupo_participantes;
CREATE TRIGGER trg_enforce_grupo_participante_rules
  BEFORE INSERT OR UPDATE ON public.grupo_participantes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_grupo_participante_rules();

-- ─── 3. Funções Auxiliares de Segurança e Autorização por Grupo ──────────────

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_workspace_id AND w.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_executive(p_workspace_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = p_workspace_id AND w.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = p_user_id
        AND wm.active = true
        AND wm.role IN ('owner', 'proprietario', 'admin', 'administrador')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_group(p_grupo_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
  v_tipo text;
  v_ativo boolean;
BEGIN
  IF p_grupo_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT g.workspace_id, g.tipo_grupo, g.ativo
    INTO v_ws, v_tipo, v_ativo
  FROM public.telegram_grupos_config g
  WHERE g.id = p_grupo_id;

  IF NOT FOUND OR v_ws IS NULL THEN
    RETURN false;
  END IF;

  -- Proprietário do workspace sempre pode auditar/gerenciar seus grupos no workspace
  IF public.is_workspace_owner(v_ws, p_user_id) THEN
    RETURN true;
  END IF;

  IF v_ativo IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  -- Grupo Contas da Empresa: além de estar ativo em grupo_participantes, exige papel admin/owner ativo
  IF v_tipo = 'contas_empresa' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.grupo_participantes gp
      JOIN public.workspace_members wm
        ON wm.workspace_id = gp.workspace_id AND wm.user_id = gp.user_id
      WHERE gp.grupo_id = p_grupo_id
        AND gp.workspace_id = v_ws
        AND gp.user_id = p_user_id
        AND gp.ativo = true
        AND wm.active = true
        AND wm.role IN ('owner', 'proprietario', 'admin', 'administrador')
    );
  END IF;

  -- Demais grupos operacionais: exige membro ativo no workspace E participação explícita ativa no grupo
  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_participantes gp
    JOIN public.workspace_members wm
      ON wm.workspace_id = gp.workspace_id AND wm.user_id = gp.user_id
    WHERE gp.grupo_id = p_grupo_id
      AND gp.workspace_id = v_ws
      AND gp.user_id = p_user_id
      AND gp.ativo = true
      AND wm.active = true
      AND coalesce((gp.permissoes->>'ler')::boolean, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_group_message(p_grupo_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
  v_ativo boolean;
BEGIN
  IF NOT public.user_can_access_group(p_grupo_id, p_user_id) THEN
    RETURN false;
  END IF;

  SELECT g.workspace_id, g.ativo INTO v_ws, v_ativo
  FROM public.telegram_grupos_config g
  WHERE g.id = p_grupo_id;

  IF v_ws IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_workspace_owner(v_ws, p_user_id) THEN
    RETURN true;
  END IF;

  IF v_ativo IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_participantes gp
    WHERE gp.grupo_id = p_grupo_id
      AND gp.user_id = p_user_id
      AND gp.ativo = true
      AND gp.role_no_grupo IN ('admin_grupo', 'operador')
      AND coalesce((gp.permissoes->>'enviar_mensagens')::boolean, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_confirm_group_operation(p_grupo_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
  v_ativo boolean;
BEGIN
  IF NOT public.user_can_access_group(p_grupo_id, p_user_id) THEN
    RETURN false;
  END IF;

  SELECT g.workspace_id, g.ativo INTO v_ws, v_ativo
  FROM public.telegram_grupos_config g
  WHERE g.id = p_grupo_id;

  IF v_ws IS NULL OR v_ativo IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF public.is_workspace_owner(v_ws, p_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grupo_participantes gp
    WHERE gp.grupo_id = p_grupo_id
      AND gp.user_id = p_user_id
      AND gp.ativo = true
      AND gp.role_no_grupo IN ('admin_grupo', 'operador')
      AND coalesce((gp.permissoes->>'confirmar_operacoes')::boolean, false) = true
  );
END;
$$;

-- ─── 4. Extensão de wallet_ai_conversations e wallet_ai_messages ─────────────

ALTER TABLE public.wallet_ai_conversations
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.telegram_grupos_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'idle'
    CHECK (processing_status IN ('idle', 'processing', 'awaiting_confirmation', 'error')),
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wallet_ai_conversations_ws_grupo
  ON public.wallet_ai_conversations (workspace_id, grupo_id, is_archived, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ai_active_group_conv
  ON public.wallet_ai_conversations (workspace_id, grupo_id)
  WHERE is_group = true AND is_archived = false AND grupo_id IS NOT NULL;

ALTER TABLE public.wallet_ai_messages
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_role text,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_ai_messages_conv_created
  ON public.wallet_ai_messages (conversation_id, created_at ASC);

-- Atualiza função de integridade de grupos para garantir vínculo consistente com grupo_id
CREATE OR REPLACE FUNCTION public.enforce_conversation_group_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_ws uuid;
BEGIN
  IF NEW.grupo_id IS NOT NULL THEN
    SELECT g.workspace_id INTO v_group_ws
    FROM public.telegram_grupos_config g
    WHERE g.id = NEW.grupo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo informado (%) não existe.', NEW.grupo_id;
    END IF;

    IF v_group_ws IS NOT NULL AND NEW.workspace_id IS DISTINCT FROM v_group_ws THEN
      RAISE EXCEPTION 'Workspace da conversa (%) diverge do workspace do grupo (%).', NEW.workspace_id, v_group_ws
        USING ERRCODE = '42501';
    END IF;

    NEW.is_group := true;
    NEW.is_shared := true;
  END IF;

  IF NEW.is_group = true AND NEW.agent_type = 'ceo' THEN
    RAISE EXCEPTION 'Conversas em grupo não podem operar sob o perfil restrito WALLET CEO'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_group = true THEN
    NEW.is_shared := true;
  END IF;

  RETURN NEW;
END;
$$;

-- Atualiza last_message_preview / last_message_at / updated_at na conversa ao inserir mensagem
CREATE OR REPLACE FUNCTION public.touch_wallet_ai_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wallet_ai_conversations
  SET
    last_channel = coalesce(NEW.channel, last_channel),
    last_message_at = coalesce(NEW.created_at, now()),
    last_message_preview = CASE
      WHEN coalesce(trim(NEW.content), '') <> '' THEN left(trim(NEW.content), 160)
      WHEN coalesce(trim(NEW.attachment_name), '') <> '' THEN '📎 ' || left(trim(NEW.attachment_name), 120)
      ELSE last_message_preview
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_wallet_ai_conversation_on_message ON public.wallet_ai_messages;
CREATE TRIGGER trg_touch_wallet_ai_conversation_on_message
  AFTER INSERT ON public.wallet_ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_wallet_ai_conversation_on_message();

-- ─── 5. Controle de Leitura / Não Lidas por Usuário ──────────────────────────

CREATE TABLE IF NOT EXISTS public.grupo_conversas_leitura (
  conversation_id uuid NOT NULL REFERENCES public.wallet_ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_grupo_conversas_leitura_user_ws
  ON public.grupo_conversas_leitura (user_id, workspace_id);

-- ─── 6. Anexos de Mensagens e Metadados de Mídia ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_ai_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.wallet_ai_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wallet_ai_conversations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.telegram_grupos_config(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket text NOT NULL DEFAULT 'chat-attachments',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  source_channel text NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web', 'telegram', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_message_attachments_conv
  ON public.wallet_ai_message_attachments (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_message_attachments_grupo
  ON public.wallet_ai_message_attachments (grupo_id, created_at DESC)
  WHERE grupo_id IS NOT NULL;

-- ─── 7. Extensão de wallet_ai_action_proposals e fechamentos_caixa ───────────

ALTER TABLE public.wallet_ai_action_proposals
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.telegram_grupos_config(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ai_action_proposals_grupo_status
  ON public.wallet_ai_action_proposals (grupo_id, status, created_at DESC)
  WHERE grupo_id IS NOT NULL;

ALTER TABLE public.fechamentos_caixa
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.telegram_grupos_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.wallet_ai_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS anexo_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_ws_data
  ON public.fechamentos_caixa (workspace_id, data_fechamento DESC);

-- ─── 8. Endurecimento Total de RLS (Fechamento de Brechas Descobertas) ────────

-- 8A. telegram_grupos_config: remover policy pública aberta e aplicar escopo estrito
ALTER TABLE public.telegram_grupos_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read telegram_grupos_config" ON public.telegram_grupos_config;
DROP POLICY IF EXISTS "telegram_grupos_config_select_authorized" ON public.telegram_grupos_config;
DROP POLICY IF EXISTS "telegram_grupos_config_insert_admin" ON public.telegram_grupos_config;
DROP POLICY IF EXISTS "telegram_grupos_config_update_admin" ON public.telegram_grupos_config;
DROP POLICY IF EXISTS "telegram_grupos_config_delete_admin" ON public.telegram_grupos_config;

CREATE POLICY "telegram_grupos_config_select_authorized"
  ON public.telegram_grupos_config
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND (
      public.is_workspace_executive(workspace_id, auth.uid())
      OR public.user_can_access_group(id, auth.uid())
    )
  );

CREATE POLICY "telegram_grupos_config_insert_admin"
  ON public.telegram_grupos_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.is_workspace_executive(workspace_id, auth.uid())
  );

CREATE POLICY "telegram_grupos_config_update_admin"
  ON public.telegram_grupos_config
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_executive(workspace_id, auth.uid())
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.is_workspace_executive(workspace_id, auth.uid())
  );

CREATE POLICY "telegram_grupos_config_delete_admin"
  ON public.telegram_grupos_config
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_executive(workspace_id, auth.uid())
  );

-- 8B. grupo_participantes
ALTER TABLE public.grupo_participantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grupo_participantes_select_authorized" ON public.grupo_participantes;
DROP POLICY IF EXISTS "grupo_participantes_insert_admin" ON public.grupo_participantes;
DROP POLICY IF EXISTS "grupo_participantes_update_admin" ON public.grupo_participantes;
DROP POLICY IF EXISTS "grupo_participantes_delete_admin" ON public.grupo_participantes;

CREATE POLICY "grupo_participantes_select_authorized"
  ON public.grupo_participantes
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_workspace_executive(workspace_id, auth.uid())
    OR public.user_can_access_group(grupo_id, auth.uid())
  );

CREATE POLICY "grupo_participantes_insert_admin"
  ON public.grupo_participantes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_workspace_executive(workspace_id, auth.uid())
  );

CREATE POLICY "grupo_participantes_update_admin"
  ON public.grupo_participantes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_workspace_executive(workspace_id, auth.uid())
  )
  WITH CHECK (
    public.is_workspace_executive(workspace_id, auth.uid())
  );

CREATE POLICY "grupo_participantes_delete_admin"
  ON public.grupo_participantes
  FOR DELETE
  TO authenticated
  USING (
    public.is_workspace_executive(workspace_id, auth.uid())
  );

-- 8C. fechamentos_caixa: remover policy pública aberta e restringir ao grupo Fechamento/Admins
ALTER TABLE public.fechamentos_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read fechamentos_caixa" ON public.fechamentos_caixa;
DROP POLICY IF EXISTS "fechamentos_caixa_select_authorized" ON public.fechamentos_caixa;
DROP POLICY IF EXISTS "fechamentos_caixa_insert_authorized" ON public.fechamentos_caixa;
DROP POLICY IF EXISTS "fechamentos_caixa_update_authorized" ON public.fechamentos_caixa;
DROP POLICY IF EXISTS "fechamentos_caixa_delete_admin" ON public.fechamentos_caixa;

CREATE POLICY "fechamentos_caixa_select_authorized"
  ON public.fechamentos_caixa
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND (
      public.is_workspace_executive(workspace_id, auth.uid())
      OR (grupo_id IS NOT NULL AND public.user_can_access_group(grupo_id, auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.telegram_grupos_config g
        WHERE g.workspace_id = fechamentos_caixa.workspace_id
          AND g.tipo_grupo = 'fechamento'
          AND public.user_can_access_group(g.id, auth.uid())
      )
    )
  );

CREATE POLICY "fechamentos_caixa_insert_authorized"
  ON public.fechamentos_caixa
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND (
      public.is_workspace_executive(workspace_id, auth.uid())
      OR (grupo_id IS NOT NULL AND public.user_can_confirm_group_operation(grupo_id, auth.uid()))
    )
  );

CREATE POLICY "fechamentos_caixa_update_authorized"
  ON public.fechamentos_caixa
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND (
      public.is_workspace_executive(workspace_id, auth.uid())
      OR (grupo_id IS NOT NULL AND public.user_can_confirm_group_operation(grupo_id, auth.uid()))
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND (
      public.is_workspace_executive(workspace_id, auth.uid())
      OR (grupo_id IS NOT NULL AND public.user_can_confirm_group_operation(grupo_id, auth.uid()))
    )
  );

CREATE POLICY "fechamentos_caixa_delete_admin"
  ON public.fechamentos_caixa
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_executive(workspace_id, auth.uid())
  );

-- 8D. wallet_ai_conversations: isolar estritamente por participante do grupo OU dono privado/CEO
DROP POLICY IF EXISTS "wallet_ai_conversations_select_strict" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_insert_strict" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_update_strict" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_delete_strict" ON public.wallet_ai_conversations;

CREATE POLICY "wallet_ai_conversations_select_strict"
  ON public.wallet_ai_conversations
  FOR SELECT
  TO authenticated
  USING (
    (
      is_group = false
      AND is_shared = false
      AND user_id = auth.uid()
      AND (
        agent_type = 'operational'
        OR (agent_type = 'ceo' AND public.is_workspace_executive(workspace_id, auth.uid()))
      )
    )
    OR (
      agent_type = 'operational'
      AND is_group = true
      AND is_shared = true
      AND grupo_id IS NOT NULL
      AND public.user_can_access_group(grupo_id, auth.uid())
    )
  );

CREATE POLICY "wallet_ai_conversations_insert_strict"
  ON public.wallet_ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        is_group = false
        AND is_shared = false
        AND (
          public.is_workspace_owner(workspace_id, auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.active = true
          )
        )
        AND (
          agent_type = 'operational'
          OR (agent_type = 'ceo' AND public.is_workspace_executive(workspace_id, auth.uid()))
        )
      )
      OR (
        agent_type = 'operational'
        AND is_group = true
        AND is_shared = true
        AND grupo_id IS NOT NULL
        AND public.user_can_access_group(grupo_id, auth.uid())
      )
    )
  );

CREATE POLICY "wallet_ai_conversations_update_strict"
  ON public.wallet_ai_conversations
  FOR UPDATE
  TO authenticated
  USING (
    (is_group = false AND is_shared = false AND user_id = auth.uid())
    OR (
      agent_type = 'operational'
      AND is_group = true
      AND grupo_id IS NOT NULL
      AND (
        public.is_workspace_executive(workspace_id, auth.uid())
        OR public.user_can_write_group_message(grupo_id, auth.uid())
      )
    )
  )
  WITH CHECK (
    (is_group = false AND is_shared = false AND user_id = auth.uid())
    OR (
      agent_type = 'operational'
      AND is_group = true
      AND grupo_id IS NOT NULL
      AND (
        public.is_workspace_executive(workspace_id, auth.uid())
        OR public.user_can_write_group_message(grupo_id, auth.uid())
      )
    )
  );

CREATE POLICY "wallet_ai_conversations_delete_strict"
  ON public.wallet_ai_conversations
  FOR DELETE
  TO authenticated
  USING (
    (is_group = false AND user_id = auth.uid())
    OR public.is_workspace_owner(workspace_id, auth.uid())
  );

-- 8E. wallet_ai_messages: estrito por conversa privada ou grupo autorizado
DROP POLICY IF EXISTS "wallet_ai_messages_select_strict" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_insert_strict" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_update_strict" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_delete_strict" ON public.wallet_ai_messages;

CREATE POLICY "wallet_ai_messages_select_strict"
  ON public.wallet_ai_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_ai_conversations c
      WHERE c.id = wallet_ai_messages.conversation_id
        AND (
          (
            c.is_group = false
            AND c.is_shared = false
            AND c.user_id = auth.uid()
            AND (
              c.agent_type = 'operational'
              OR (c.agent_type = 'ceo' AND public.is_workspace_executive(c.workspace_id, auth.uid()))
            )
          )
          OR (
            c.agent_type = 'operational'
            AND c.is_group = true
            AND c.is_shared = true
            AND c.grupo_id IS NOT NULL
            AND public.user_can_access_group(c.grupo_id, auth.uid())
          )
        )
    )
  );

CREATE POLICY "wallet_ai_messages_insert_strict"
  ON public.wallet_ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wallet_ai_conversations c
      WHERE c.id = wallet_ai_messages.conversation_id
        AND c.workspace_id = wallet_ai_messages.workspace_id
        AND (
          (
            c.is_group = false
            AND c.is_shared = false
            AND c.user_id = auth.uid()
            AND (
              c.agent_type = 'operational'
              OR (c.agent_type = 'ceo' AND public.is_workspace_executive(c.workspace_id, auth.uid()))
            )
          )
          OR (
            c.agent_type = 'operational'
            AND c.is_group = true
            AND c.is_shared = true
            AND c.grupo_id IS NOT NULL
            AND public.user_can_write_group_message(c.grupo_id, auth.uid())
          )
        )
    )
  );

CREATE POLICY "wallet_ai_messages_update_strict"
  ON public.wallet_ai_messages
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wallet_ai_messages_delete_strict"
  ON public.wallet_ai_messages
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 8F. grupo_conversas_leitura
ALTER TABLE public.grupo_conversas_leitura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grupo_conversas_leitura_own" ON public.grupo_conversas_leitura;
CREATE POLICY "grupo_conversas_leitura_own"
  ON public.grupo_conversas_leitura
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 8G. wallet_ai_message_attachments
ALTER TABLE public.wallet_ai_message_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_ai_message_attachments_select" ON public.wallet_ai_message_attachments;
DROP POLICY IF EXISTS "wallet_ai_message_attachments_insert" ON public.wallet_ai_message_attachments;

CREATE POLICY "wallet_ai_message_attachments_select"
  ON public.wallet_ai_message_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_ai_conversations c
      WHERE c.id = wallet_ai_message_attachments.conversation_id
        AND (
          (c.is_group = false AND c.is_shared = false AND c.user_id = auth.uid())
          OR (c.agent_type = 'operational' AND c.is_group = true AND c.grupo_id IS NOT NULL AND public.user_can_access_group(c.grupo_id, auth.uid()))
        )
    )
  );

CREATE POLICY "wallet_ai_message_attachments_insert"
  ON public.wallet_ai_message_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wallet_ai_conversations c
      WHERE c.id = wallet_ai_message_attachments.conversation_id
        AND c.workspace_id = wallet_ai_message_attachments.workspace_id
        AND (
          (c.is_group = false AND c.is_shared = false AND c.user_id = auth.uid())
          OR (c.agent_type = 'operational' AND c.is_group = true AND c.grupo_id IS NOT NULL AND public.user_can_write_group_message(c.grupo_id, auth.uid()))
        )
    )
  );

-- 8H. wallet_ai_action_proposals: permitir visualização/confirmação por participantes autorizados do grupo
DROP POLICY IF EXISTS "wallet_ai_action_proposals_select" ON public.wallet_ai_action_proposals;
DROP POLICY IF EXISTS "wallet_ai_action_proposals_update" ON public.wallet_ai_action_proposals;

CREATE POLICY "wallet_ai_action_proposals_select"
  ON public.wallet_ai_action_proposals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      grupo_id IS NOT NULL
      AND public.user_can_access_group(grupo_id, auth.uid())
    )
    OR (
      conversation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.wallet_ai_conversations c
        WHERE c.id = wallet_ai_action_proposals.conversation_id
          AND c.is_group = true
          AND c.agent_type = 'operational'
          AND c.grupo_id IS NOT NULL
          AND public.user_can_access_group(c.grupo_id, auth.uid())
      )
    )
  );

CREATE POLICY "wallet_ai_action_proposals_update"
  ON public.wallet_ai_action_proposals
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (grupo_id IS NOT NULL AND public.user_can_confirm_group_operation(grupo_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (grupo_id IS NOT NULL AND public.user_can_confirm_group_operation(grupo_id, auth.uid()))
  );

-- 8I. Storage objects para anexos de grupos em chat-attachments (groups/<ws_id>/<grupo_id>/...)
DROP POLICY IF EXISTS "chat_attachments_group_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_group_insert" ON storage.objects;

CREATE POLICY "chat_attachments_group_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'groups'
    AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_can_access_group(((storage.foldername(name))[3])::uuid, auth.uid())
  );

CREATE POLICY "chat_attachments_group_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'groups'
    AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.user_can_write_group_message(((storage.foldername(name))[3])::uuid, auth.uid())
  );

-- ─── 9. Backfill seguro para grupos existentes e criação de conversas canônicas

-- Garante que o proprietário de cada workspace seja admin_grupo nos grupos já existentes
INSERT INTO public.grupo_participantes (
  grupo_id,
  workspace_id,
  user_id,
  role_no_grupo,
  permissoes,
  ativo,
  autorizado_por
)
SELECT
  g.id,
  g.workspace_id,
  w.user_id,
  'admin_grupo',
  jsonb_build_object(
    'ler', true,
    'enviar_mensagens', true,
    'enviar_documentos', true,
    'confirmar_operacoes', true,
    'gerenciar_grupo', true
  ),
  true,
  w.user_id
FROM public.telegram_grupos_config g
JOIN public.workspaces w ON w.id = g.workspace_id
ON CONFLICT (grupo_id, user_id) DO NOTHING;

-- Preenche metadados padrão nos grupos existentes de fechamento caso estejam vazios
UPDATE public.telegram_grupos_config
SET
  descricao = coalesce(
    nullif(trim(descricao), ''),
    'Conferência diária de fechamento de caixa, recepção de fotos/valores e conciliação automática com o Eyemobile.'
  ),
  funcionalidades_autorizadas = CASE
    WHEN coalesce(array_length(funcionalidades_autorizadas, 1), 0) = 0
      THEN ARRAY['fechamento_caixa', 'conferir_eyemobile', 'receber_foto_envelope', 'propostas_fechamento']
    ELSE funcionalidades_autorizadas
  END,
  updated_at = now()
WHERE tipo_grupo = 'fechamento';

-- Garante conversa canônica ativa na Central de Conversas para os grupos existentes
INSERT INTO public.wallet_ai_conversations (
  workspace_id,
  user_id,
  grupo_id,
  title,
  agent_type,
  is_shared,
  is_group,
  channel,
  last_channel,
  external_chat_id,
  processing_status
)
SELECT
  g.workspace_id,
  w.user_id,
  g.id,
  coalesce(nullif(trim(g.nome_grupo), ''), 'Grupo Operacional'),
  'operational',
  true,
  true,
  CASE WHEN g.chat_id IS NOT NULL THEN 'telegram' ELSE 'web' END,
  CASE WHEN g.chat_id IS NOT NULL THEN 'telegram' ELSE 'web' END,
  CASE WHEN g.chat_id IS NOT NULL THEN g.chat_id::text ELSE NULL END,
  'idle'
FROM public.telegram_grupos_config g
JOIN public.workspaces w ON w.id = g.workspace_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallet_ai_conversations c
  WHERE c.workspace_id = g.workspace_id
    AND c.grupo_id = g.id
    AND c.is_group = true
    AND c.is_archived = false
);

-- ─── 10. Realtime Publication ────────────────────────────────────────────────

ALTER TABLE public.telegram_grupos_config REPLICA IDENTITY FULL;
ALTER TABLE public.grupo_participantes REPLICA IDENTITY FULL;
ALTER TABLE public.fechamentos_caixa REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_ai_action_proposals REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_ai_message_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.grupo_conversas_leitura REPLICA IDENTITY FULL;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'telegram_grupos_config',
    'grupo_participantes',
    'fechamentos_caixa',
    'wallet_ai_action_proposals',
    'wallet_ai_message_attachments',
    'grupo_conversas_leitura'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;

COMMIT;
