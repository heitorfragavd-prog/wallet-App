-- Migration 77: Segregação e RLS dos Dois Cérebros de IA (Wallet CEO vs Wallet IA Operacional)
-- Etapa 03 do Wallet CEO 3.0

-- 1. Adicionar agent_type na tabela wallet_ai_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_conversations' AND column_name = 'agent_type'
  ) THEN
    ALTER TABLE public.wallet_ai_conversations 
    ADD COLUMN agent_type text NOT NULL DEFAULT 'operational';

    ALTER TABLE public.wallet_ai_conversations 
    ADD CONSTRAINT chk_wallet_ai_conversations_agent_type 
    CHECK (agent_type IN ('ceo', 'operational'));
  END IF;
END $$;

-- 2. Índice para busca performática e isolada por workspace, agente e usuário
CREATE INDEX IF NOT EXISTS idx_wallet_ai_conversations_agent_type 
ON public.wallet_ai_conversations (workspace_id, agent_type, user_id);

-- 3. Adicionar agent_brain na tabela wallet_ai_telemetry para auditoria e controle de custos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_telemetry' AND column_name = 'agent_brain'
  ) THEN
    ALTER TABLE public.wallet_ai_telemetry 
    ADD COLUMN agent_brain text DEFAULT 'operational';

    ALTER TABLE public.wallet_ai_telemetry 
    ADD CONSTRAINT chk_wallet_ai_telemetry_agent_brain 
    CHECK (agent_brain IN ('ceo', 'operational'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_ai_telemetry_agent_brain 
ON public.wallet_ai_telemetry (workspace_id, agent_brain, created_at DESC);

-- 4. RLS para wallet_ai_conversations:
-- As conversas do CEO (agent_type = 'ceo') são estritamente privadas do criador (user_id = auth.uid()).
-- As conversas operacionais (agent_type = 'operational') podem ser acessadas pelos membros autorizados do workspace.
ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_ai_conversations_select_policy" ON public.wallet_ai_conversations;
CREATE POLICY "wallet_ai_conversations_select_policy" ON public.wallet_ai_conversations
FOR SELECT USING (
  (agent_type = 'ceo' AND user_id = auth.uid()) OR
  (agent_type = 'operational' AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  ))
);

DROP POLICY IF EXISTS "wallet_ai_conversations_insert_policy" ON public.wallet_ai_conversations;
CREATE POLICY "wallet_ai_conversations_insert_policy" ON public.wallet_ai_conversations
FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = wallet_ai_conversations.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "wallet_ai_conversations_update_policy" ON public.wallet_ai_conversations;
CREATE POLICY "wallet_ai_conversations_update_policy" ON public.wallet_ai_conversations
FOR UPDATE USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "wallet_ai_conversations_delete_policy" ON public.wallet_ai_conversations;
CREATE POLICY "wallet_ai_conversations_delete_policy" ON public.wallet_ai_conversations
FOR DELETE USING (
  user_id = auth.uid()
);
