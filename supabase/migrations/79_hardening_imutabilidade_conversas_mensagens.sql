-- Migration 79: Hardening de Imutabilidade de Conversas e Mensagens (Gate 0 - Etapa 04)
-- 
-- Garante:
-- 1. Imutabilidade absoluta do cérebro (agent_type): impede reclassificação entre CEO e Operacional.
-- 2. Imutabilidade de autoria (user_id) e escopo corporativo (workspace_id).
-- 3. Blindagem de conversas executivas (CEO): NUNCA podem ser compartilhadas (is_shared = false).
-- 4. Proteção estrita de integridade em wallet_ai_messages (conversation_id, workspace_id, user_id imutáveis).
-- 5. RLS dinâmico de leitura de mensagens atrelado ao status ativo da conversa correspondente.

-- 1. Trigger refinado de proteção em wallet_ai_conversations
CREATE OR REPLACE FUNCTION public.trg_protect_wallet_ai_conversations_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A. Impede alteração do cérebro da conversa (agent_type é imutável)
  IF NEW.agent_type <> OLD.agent_type THEN
    RAISE EXCEPTION 'Operação negada: a identidade do cérebro (agent_type) é imutável durante toda a vida da conversa.';
  END IF;

  -- B. Impede transferência de posse da conversa
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido transferir a posse de uma conversa de IA.';
  END IF;

  -- C. Impede alteração de workspace
  IF NEW.workspace_id <> OLD.workspace_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido mover conversas entre workspaces.';
  END IF;

  -- D. Conversas do CEO são estritamente privadas (NUNCA podem ser compartilhadas)
  IF NEW.agent_type = 'ceo' AND NEW.is_shared = true THEN
    RAISE EXCEPTION 'Operação negada: conversas do WALLET CEO são estritamente executivas e não podem ser compartilhadas.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ai_conversations_update_guard ON public.wallet_ai_conversations;
CREATE TRIGGER trg_wallet_ai_conversations_update_guard
BEFORE UPDATE ON public.wallet_ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_wallet_ai_conversations_update();

-- 2. Trigger de proteção e integridade para wallet_ai_messages
CREATE OR REPLACE FUNCTION public.trg_protect_wallet_ai_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A. Impede alteração da conversa associada
  IF NEW.conversation_id <> OLD.conversation_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido alterar a conversa associada de uma mensagem de IA.';
  END IF;

  -- B. Impede alteração de workspace da mensagem
  IF NEW.workspace_id <> OLD.workspace_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido mover mensagens entre workspaces.';
  END IF;

  -- C. Impede alteração do autor da mensagem
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido alterar a autoria de uma mensagem de IA.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ai_messages_update_guard ON public.wallet_ai_messages;
CREATE TRIGGER trg_wallet_ai_messages_update_guard
BEFORE UPDATE ON public.wallet_ai_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_wallet_ai_messages_update();

-- 3. Atualização da política RLS de leitura de wallet_ai_messages
-- Assegura que a leitura de mensagens respeita as permissões ATIVAS da conversa correspondente.
DROP POLICY IF EXISTS "wallet_ai_messages_select_strict" ON public.wallet_ai_messages;

CREATE POLICY "wallet_ai_messages_select_strict" ON public.wallet_ai_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.wallet_ai_conversations c
    WHERE c.id = wallet_ai_messages.conversation_id
      AND (
        -- Cenário 1: Mensagens da própria conversa privada do autor
        (
          c.user_id = auth.uid()
          AND (
            c.agent_type = 'operational'
            OR (
              c.agent_type = 'ceo'
              AND (
                -- Vínculo executivo ativo no workspace da conversa
                EXISTS (
                  SELECT 1 FROM public.workspaces w
                  WHERE w.id = c.workspace_id AND w.user_id = auth.uid()
                )
                OR EXISTS (
                  SELECT 1 FROM public.workspace_members wm
                  WHERE wm.workspace_id = c.workspace_id
                    AND wm.user_id = auth.uid()
                    AND wm.active = true
                    AND wm.role IN ('owner', 'proprietario', 'admin', 'administrador')
                )
              )
            )
          )
        )
        OR
        -- Cenário 2: Conversa operacional compartilhada corporativa
        (
          c.is_shared = true
          AND c.agent_type = 'operational'
          AND (
            EXISTS (
              SELECT 1 FROM public.workspaces w
              WHERE w.id = c.workspace_id
                AND w.user_id = auth.uid()
            )
            OR
            EXISTS (
              SELECT 1 FROM public.workspace_members wm
              WHERE wm.workspace_id = c.workspace_id
                AND wm.user_id = auth.uid()
                AND wm.active = true
            )
          )
        )
      )
  )
);

-- 4. Índice composto para aceleração de joins e RLS de mensagens
CREATE INDEX IF NOT EXISTS idx_wallet_ai_messages_strict_lookup
ON public.wallet_ai_messages (conversation_id, workspace_id, user_id);
