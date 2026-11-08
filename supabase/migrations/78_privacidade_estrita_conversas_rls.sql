-- Migration 78: Privacidade Estrita das Conversas e Consolidação de RLS
-- Hardening da Etapa 03 do Wallet CEO 3.0 (Gate 1)
--
-- Garante que conversas executivas (CEO) e operacionais (Wallet IA) sejam estritamente
-- privadas do criador (user_id = auth.uid()). Conversas corporativas compartilhadas só
-- são acessíveis por outros membros se explicitamente classificadas com is_shared = true
-- e exclusivamente no cérebro operacional (agent_type = 'operational'). Conversas do CEO
-- NUNCA são compartilhadas com a equipe operacional.

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

-- 2. Limpeza de políticas duplicadas e permissivas em wallet_ai_conversations
DROP POLICY IF EXISTS "wallet_ai_conversations_select" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_select_policy" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_select_strict" ON public.wallet_ai_conversations;

DROP POLICY IF EXISTS "wallet_ai_conversations_insert" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_insert_policy" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_insert_strict" ON public.wallet_ai_conversations;

DROP POLICY IF EXISTS "wallet_ai_conversations_update" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_update_policy" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_update_strict" ON public.wallet_ai_conversations;

DROP POLICY IF EXISTS "wallet_ai_conversations_delete" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_delete_policy" ON public.wallet_ai_conversations;
DROP POLICY IF EXISTS "wallet_ai_conversations_delete_strict" ON public.wallet_ai_conversations;

-- 3. Políticas Canônicas Estritas para wallet_ai_conversations
ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_ai_conversations_select_strict" ON public.wallet_ai_conversations
FOR SELECT USING (
  -- 1. O próprio autor sempre pode ver suas conversas (CEO ou Operacional)
  (user_id = auth.uid())
  OR
  -- 2. Membros do mesmo workspace só veem conversas operacionais explicitamente compartilhadas
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

CREATE POLICY "wallet_ai_conversations_insert_strict" ON public.wallet_ai_conversations
FOR INSERT WITH CHECK (
  user_id = auth.uid()
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
);

CREATE POLICY "wallet_ai_conversations_update_strict" ON public.wallet_ai_conversations
FOR UPDATE USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  AND workspace_id = wallet_ai_conversations.workspace_id
);

CREATE POLICY "wallet_ai_conversations_delete_strict" ON public.wallet_ai_conversations
FOR DELETE USING (
  user_id = auth.uid()
);

-- 4. Limpeza e Políticas Canônicas Estritas para wallet_ai_messages
DROP POLICY IF EXISTS "wallet_ai_messages_select" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_select_policy" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_select_strict" ON public.wallet_ai_messages;

DROP POLICY IF EXISTS "wallet_ai_messages_insert" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_insert_policy" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_insert_strict" ON public.wallet_ai_messages;

DROP POLICY IF EXISTS "wallet_ai_messages_update" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_update_policy" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_update_strict" ON public.wallet_ai_messages;

DROP POLICY IF EXISTS "wallet_ai_messages_delete" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_delete_policy" ON public.wallet_ai_messages;
DROP POLICY IF EXISTS "wallet_ai_messages_delete_strict" ON public.wallet_ai_messages;

ALTER TABLE public.wallet_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_ai_messages_select_strict" ON public.wallet_ai_messages
FOR SELECT USING (
  -- Mensagens criadas pelo próprio usuário
  (user_id = auth.uid())
  OR
  -- Ou pertencentes a uma conversa compartilhada legítima
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

CREATE POLICY "wallet_ai_messages_insert_strict" ON public.wallet_ai_messages
FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "wallet_ai_messages_update_strict" ON public.wallet_ai_messages
FOR UPDATE USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "wallet_ai_messages_delete_strict" ON public.wallet_ai_messages
FOR DELETE USING (
  user_id = auth.uid()
);
