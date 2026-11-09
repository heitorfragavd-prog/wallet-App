-- Migration 78: Privacidade Estrita das Conversas e Consolidação de RLS
-- Hardening da Etapa 03 do Wallet CEO 3.0 (Gate 1 e Gate 3)
--
-- Garante que conversas executivas (CEO) e operacionais (Wallet IA) sejam estritamente
-- privadas do criador (user_id = auth.uid()). Conversas corporativas compartilhadas só
-- são acessíveis por outros membros se explicitamente classificadas com is_shared = true
-- e exclusivamente no cérebro operacional (agent_type = 'operational'). Conversas do CEO
-- NUNCA são compartilhadas com a equipe operacional.
--
-- Inclui proteção contra:
-- - Escalada maliciosa de agent_type via UPDATE.
-- - Compartilhamento indevido de conversas executivas.
-- - Vazamento de conversas entre workspaces.
-- - Limpeza dinâmica de todas as políticas legadas permissivas.

-- 1. Coluna is_shared na tabela wallet_ai_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_conversations' AND column_name = 'is_shared'
  ) THEN
    ALTER TABLE public.wallet_ai_conversations 
    ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Índice composto para performance e isolamento estrito
CREATE INDEX IF NOT EXISTS idx_wallet_ai_conversations_strict_privacy
ON public.wallet_ai_conversations (workspace_id, agent_type, user_id, is_shared);

-- 3. Limpeza DINÂMICA de TODAS as políticas preexistentes (conhecidas ou legadas)
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'wallet_ai_conversations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wallet_ai_conversations', pol.policyname);
  END LOOP;

  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'wallet_ai_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wallet_ai_messages', pol.policyname);
  END LOOP;
END $$;

-- 4. Habilita RLS estrito nas tabelas de IA
ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ai_messages ENABLE ROW LEVEL SECURITY;

-- 5. Políticas Canônicas Estritas para wallet_ai_conversations

-- SELECT:
-- 1. O próprio autor sempre pode ver suas conversas privadas (CEO ou Operacional).
--    Para conversas do CEO, exige-se adicionalmente vínculo executivo ativo (proprietário ou admin).
-- 2. Membros ativos do mesmo workspace só veem conversas operacionais explicitamente compartilhadas (is_shared = true).
CREATE POLICY "wallet_ai_conversations_select_strict" ON public.wallet_ai_conversations
FOR SELECT USING (
  (
    user_id = auth.uid()
    AND (
      agent_type = 'operational'
      OR (
        agent_type = 'ceo'
        AND (
          EXISTS (
            SELECT 1 FROM public.workspaces w
            WHERE w.id = wallet_ai_conversations.workspace_id AND w.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.active = true
              AND wm.role IN ('admin', 'owner', 'proprietario', 'administrador')
          )
        )
      )
    )
  )
  OR
  (
    is_shared = true
    AND agent_type = 'operational'
    AND (
      EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = wallet_ai_conversations.workspace_id
          AND w.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.active = true
      )
    )
  )
);

-- INSERT:
-- O usuário deve ser o autor (user_id = auth.uid()).
-- Conversas do CEO só podem ser criadas por donos ou admins executivos e NUNCA compartilhadas.
-- Conversas operacionais podem ser criadas por membros autorizados do workspace.
CREATE POLICY "wallet_ai_conversations_insert_strict" ON public.wallet_ai_conversations
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND (
    (
      agent_type = 'ceo'
      AND is_shared = false
      AND (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = wallet_ai_conversations.workspace_id AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active = true
            AND wm.role IN ('admin', 'owner', 'proprietario', 'administrador')
        )
      )
    )
    OR
    (
      agent_type = 'operational'
      AND (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = wallet_ai_conversations.workspace_id AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active = true
        )
      )
    )
  )
);

-- UPDATE:
-- Apenas o próprio criador pode atualizar metadados.
-- O workspace_id não pode ser alterado.
-- Conversas do CEO nunca podem se tornar compartilhadas (is_shared = true).
-- Conversas operacionais só podem ser elevadas a CEO por donos ou admins executivos.
CREATE POLICY "wallet_ai_conversations_update_strict" ON public.wallet_ai_conversations
FOR UPDATE USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  AND workspace_id = wallet_ai_conversations.workspace_id
  AND NOT (agent_type = 'ceo' AND is_shared = true)
  AND (
    agent_type = 'operational'
    OR (
      agent_type = 'ceo'
      AND (
        EXISTS (
          SELECT 1 FROM public.workspaces w
          WHERE w.id = wallet_ai_conversations.workspace_id AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active = true
            AND wm.role IN ('admin', 'owner', 'proprietario', 'administrador')
        )
      )
    )
  )
);

-- DELETE:
-- Apenas o criador pode deletar sua conversa.
CREATE POLICY "wallet_ai_conversations_delete_strict" ON public.wallet_ai_conversations
FOR DELETE USING (
  user_id = auth.uid()
);

-- 6. Trigger de Proteção e Validação Server-Side no UPDATE
CREATE OR REPLACE FUNCTION public.trg_protect_wallet_ai_conversations_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Impede transferência de posse da conversa
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido transferir a posse de uma conversa de IA.';
  END IF;

  -- 2. Impede alteração de workspace
  IF NEW.workspace_id <> OLD.workspace_id THEN
    RAISE EXCEPTION 'Operação negada: não é permitido mover conversas entre workspaces.';
  END IF;

  -- 3. Conversas do CEO são estritamente privadas (NUNCA podem ser compartilhadas)
  IF NEW.agent_type = 'ceo' AND NEW.is_shared = true THEN
    RAISE EXCEPTION 'Operação negada: conversas do WALLET CEO são estritamente executivas e não podem ser compartilhadas.';
  END IF;

  -- 4. Impede que usuário comum altere agent_type de operational para ceo
  IF OLD.agent_type <> NEW.agent_type AND NEW.agent_type = 'ceo' THEN
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = OLD.workspace_id AND w.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = OLD.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.active = true
          AND wm.role IN ('admin', 'owner', 'proprietario', 'administrador')
      )
    ) THEN
      RAISE EXCEPTION 'Operação negada: apenas proprietários e administradores executivos podem classificar conversas como CEO.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ai_conversations_update_guard ON public.wallet_ai_conversations;
CREATE TRIGGER trg_wallet_ai_conversations_update_guard
BEFORE UPDATE ON public.wallet_ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_wallet_ai_conversations_update();

-- 7. Políticas Canônicas Estritas para wallet_ai_messages

-- SELECT:
-- Mensagens criadas pelo próprio usuário OU mensagens de conversa compartilhada válida.
CREATE POLICY "wallet_ai_messages_select_strict" ON public.wallet_ai_messages
FOR SELECT USING (
  (user_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM public.wallet_ai_conversations c
    WHERE c.id = wallet_ai_messages.conversation_id
      AND c.is_shared = true
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
);

-- INSERT:
-- Usuário só pode inserir mensagens se tiver acesso legítimo à conversa associada.
CREATE POLICY "wallet_ai_messages_insert_strict" ON public.wallet_ai_messages
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.wallet_ai_conversations c
    WHERE c.id = wallet_ai_messages.conversation_id
      AND c.workspace_id = wallet_ai_messages.workspace_id
      AND (
        (c.user_id = auth.uid())
        OR (
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

-- UPDATE:
CREATE POLICY "wallet_ai_messages_update_strict" ON public.wallet_ai_messages
FOR UPDATE USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

-- DELETE:
CREATE POLICY "wallet_ai_messages_delete_strict" ON public.wallet_ai_messages
FOR DELETE USING (
  user_id = auth.uid()
);
