-- ============================================================================
-- MIGRATION 83: HARDENING RLS E AUTORIZAÇÃO DE PREFERÊNCIAS DE NOTIFICAÇÃO
-- ETAPA 05 — GATE 0.1: BLINDAGEM CONTRA BYPASS DE AUTORIZAÇÃO E REFERÊNCIAS AMBÍGUAS
-- ============================================================================

-- 1. Função desambiguada: verifica se usuário é gestor (owner ou admin) do workspace
CREATE OR REPLACE FUNCTION is_workspace_manager(ws_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF u_id IS NULL OR ws_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- É proprietário do workspace
  IF EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = ws_id AND w.user_id = u_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- É membro com cargo owner ou admin e ativo (coluna active = TRUE)
  IF EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id = u_id
      AND wm.role IN ('owner', 'admin')
      AND wm.active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função desambiguada: verifica se usuário é membro ativo do workspace
CREATE OR REPLACE FUNCTION is_active_workspace_member(ws_id UUID, u_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF u_id IS NULL OR ws_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Proprietário do workspace é membro ativo por definição
  IF EXISTS (
    SELECT 1 FROM workspaces w
    WHERE w.id = ws_id AND w.user_id = u_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Membro ativo registrado em workspace_members
  IF EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id = u_id
      AND wm.active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualização do Trigger de Segurança com Separação Estrita de Privilégios
CREATE OR REPLACE FUNCTION trg_enforce_notification_preferences_security()
RETURNS TRIGGER AS $$
DECLARE
  is_owner BOOLEAN;
  caller_id UUID;
  caller_is_manager BOOLEAN;
  is_member_active BOOLEAN;
BEGIN
  -- 1. Validação de filiação ao workspace: o destinatário DEVE ser membro ativo
  is_member_active := is_active_workspace_member(NEW.workspace_id, NEW.user_id);
  IF NOT is_member_active THEN
    RAISE EXCEPTION 'Destinatário não é membro ativo deste workspace.';
  END IF;

  -- 2. Verifica se o destinatário é o proprietário real do workspace
  SELECT (w.user_id = NEW.user_id) INTO is_owner
  FROM workspaces w
  WHERE w.id = NEW.workspace_id;

  -- Regra A: Categoria 'ceo_executivo' NUNCA pode ser autorizada ou habilitada para não-proprietários
  IF NEW.categoria = 'ceo_executivo' AND (is_owner IS NULL OR is_owner = FALSE) THEN
    NEW.autorizado := FALSE;
    NEW.habilitado := FALSE;
  END IF;

  caller_id := auth.uid();
  IF caller_id IS NOT NULL THEN
    caller_is_manager := is_workspace_manager(NEW.workspace_id, caller_id);

    -- Regra B (INSERT): Se quem está inserindo NÃO for gestor do workspace:
    -- Funcionário não pode conceder autorização para si mesmo em categorias restritas
    IF TG_OP = 'INSERT' AND NOT caller_is_manager THEN
      IF NEW.categoria IN ('financeiro', 'fechamento_caixa', 'seguranca', 'ceo_executivo') THEN
        NEW.autorizado := FALSE;
      END IF;
    END IF;

    -- Regra C (UPDATE): Funcionário comum NÃO pode alterar o campo 'autorizado'
    IF TG_OP = 'UPDATE' AND NOT caller_is_manager THEN
      IF OLD.autorizado IS DISTINCT FROM NEW.autorizado THEN
        RAISE EXCEPTION 'Apenas proprietários e administradores do workspace podem alterar a autorização de notificações.';
      ELSE
        NEW.autorizado := OLD.autorizado;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recriação do Trigger
DROP TRIGGER IF EXISTS trg_check_notif_pref_security ON user_notification_preferences;
CREATE TRIGGER trg_check_notif_pref_security
  BEFORE INSERT OR UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION trg_enforce_notification_preferences_security();

-- 5. Endurecimento das Políticas RLS
-- Remove políticas antigas da Migration 82
DROP POLICY IF EXISTS "policy_user_notif_pref_select" ON user_notification_preferences;
DROP POLICY IF EXISTS "policy_user_notif_pref_insert" ON user_notification_preferences;
DROP POLICY IF EXISTS "policy_user_notif_pref_update" ON user_notification_preferences;
DROP POLICY IF EXISTS "policy_user_notif_pref_delete" ON user_notification_preferences;

-- Nova Política SELECT: Membro ativo vê suas próprias preferências OU gestores veem dos membros
CREATE POLICY "policy_user_notif_pref_select_v2"
  ON user_notification_preferences
  FOR SELECT
  USING (
    (auth.uid() = user_id AND is_active_workspace_member(workspace_id, auth.uid()))
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- Nova Política INSERT: Membro ativo insere para si mesmo OU gestor insere para membro ativo
CREATE POLICY "policy_user_notif_pref_insert_v2"
  ON user_notification_preferences
  FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id AND is_active_workspace_member(workspace_id, auth.uid()))
    OR (is_workspace_manager(workspace_id, auth.uid()) AND is_active_workspace_member(workspace_id, user_id))
  );

-- Nova Política UPDATE: Membro ativo edita suas preferências OU gestor edita as do membro
CREATE POLICY "policy_user_notif_pref_update_v2"
  ON user_notification_preferences
  FOR UPDATE
  USING (
    (auth.uid() = user_id AND is_active_workspace_member(workspace_id, auth.uid()))
    OR is_workspace_manager(workspace_id, auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id AND is_active_workspace_member(workspace_id, auth.uid()))
    OR is_workspace_manager(workspace_id, auth.uid())
  );

-- Nova Política DELETE: APENAS GESTORES DO WORKSPACE podem excluir preferências (impede bypass de delete+reinsert por funcionários)
CREATE POLICY "policy_user_notif_pref_delete_v2"
  ON user_notification_preferences
  FOR DELETE
  USING (
    is_workspace_manager(workspace_id, auth.uid())
  );
