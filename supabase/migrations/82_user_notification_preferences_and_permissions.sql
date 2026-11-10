-- ============================================================================
-- MIGRATION 82: MODELO DE PREFERÊNCIAS INDIVIDUAIS E PERMISSÕES DE NOTIFICAÇÃO
-- ETAPA 05 — ENTREGA B: PREFERÊNCIAS INDIVIDUAIS, RBAC E HORÁRIO SILENCIOSO
-- ============================================================================

-- 1. Criação da tabela user_notification_preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  canal TEXT NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  autorizado BOOLEAN NOT NULL DEFAULT TRUE,
  prioridade_minima TEXT NOT NULL DEFAULT 'normal',
  horario_silencio_inicio TIME WITHOUT TIME ZONE DEFAULT '22:00',
  horario_silencio_fim TIME WITHOUT TIME ZONE DEFAULT '07:00',
  fuso_horario TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validações de integridade
  CONSTRAINT chk_categoria_valida CHECK (
    categoria IN (
      'financeiro',
      'fechamento_caixa',
      'boletos',
      'operacional',
      'estoque_nfe',
      'ceo_executivo',
      'seguranca'
    )
  ),
  CONSTRAINT chk_canal_valido CHECK (
    canal IN ('app', 'push', 'telegram', 'whatsapp')
  ),
  CONSTRAINT chk_prioridade_valida CHECK (
    prioridade_minima IN ('informativa', 'normal', 'importante', 'critica')
  ),
  -- Impede duplicação de preferências para a mesma tupla
  CONSTRAINT uq_user_workspace_categoria_canal UNIQUE (user_id, workspace_id, categoria, canal)
);

-- 2. Índices para performance em despachos de alta frequência
CREATE INDEX IF NOT EXISTS idx_user_notif_pref_lookup
  ON user_notification_preferences (workspace_id, user_id, categoria, canal)
  WHERE autorizado = TRUE AND habilitado = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_notif_pref_user
  ON user_notification_preferences (user_id, workspace_id);

-- 3. Habilitação de RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- 4. Função auxiliar: checa se usuário é gestor (owner ou admin) do workspace
CREATE OR REPLACE FUNCTION is_workspace_manager(ws_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- É proprietário do workspace
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = ws_id AND user_id = u_id) THEN
    RETURN TRUE;
  END IF;

  -- É membro com cargo owner ou admin e ativo
  IF EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id
      AND user_id = u_id
      AND role IN ('owner', 'admin')
      AND active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Políticas RLS
-- SELECT: Usuário vê suas próprias preferências OU gestores veem as de membros do workspace
DROP POLICY IF EXISTS "policy_user_notif_pref_select" ON user_notification_preferences;
CREATE POLICY "policy_user_notif_pref_select"
  ON user_notification_preferences
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- INSERT: Usuário cria suas preferências OU gestor cria para membro
DROP POLICY IF EXISTS "policy_user_notif_pref_insert" ON user_notification_preferences;
CREATE POLICY "policy_user_notif_pref_insert"
  ON user_notification_preferences
  WITH CHECK (
    (auth.uid() = user_id AND (
      EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = workspace_id AND user_id = auth.uid() AND active = TRUE)
    ))
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- UPDATE: Usuário edita suas próprias preferências OU gestor edita do membro
DROP POLICY IF EXISTS "policy_user_notif_pref_update" ON user_notification_preferences;
CREATE POLICY "policy_user_notif_pref_update"
  ON user_notification_preferences
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR is_workspace_manager(workspace_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- DELETE: Usuário ou gestor
DROP POLICY IF EXISTS "policy_user_notif_pref_delete" ON user_notification_preferences;
CREATE POLICY "policy_user_notif_pref_delete"
  ON user_notification_preferences
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- 6. Trigger de Segurança: Bloqueio do CEO e Proteção de 'autorizado'
CREATE OR REPLACE FUNCTION trg_enforce_notification_preferences_security()
RETURNS TRIGGER AS $$
DECLARE
  is_owner BOOLEAN;
  caller_id UUID;
  caller_is_manager BOOLEAN;
BEGIN
  -- Verifica se o destinatário é o dono real do workspace
  SELECT (workspaces.user_id = NEW.user_id) INTO is_owner
  FROM workspaces
  WHERE workspaces.id = NEW.workspace_id;

  -- Regra A: categoria 'ceo_executivo' NUNCA pode ser autorizada para não-proprietários
  IF NEW.categoria = 'ceo_executivo' AND (is_owner IS NULL OR is_owner = FALSE) THEN
    NEW.autorizado := FALSE;
    NEW.habilitado := FALSE;
  END IF;

  -- Regra B: Em UPDATE, membro comum NÃO PODE alterar o campo 'autorizado'
  IF TG_OP = 'UPDATE' THEN
    caller_id := auth.uid();
    IF caller_id IS NOT NULL AND OLD.autorizado IS DISTINCT FROM NEW.autorizado THEN
      caller_is_manager := is_workspace_manager(NEW.workspace_id, caller_id);
      IF NOT caller_is_manager THEN
        RAISE EXCEPTION 'Apenas proprietários e administradores do workspace podem alterar a autorização de notificações.';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_notif_pref_security ON user_notification_preferences;
CREATE TRIGGER trg_check_notif_pref_security
  BEFORE INSERT OR UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION trg_enforce_notification_preferences_security();

-- 7. Adiciona à publicação Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_notification_preferences;
  END IF;
END $$;

ALTER TABLE user_notification_preferences REPLICA IDENTITY FULL;
