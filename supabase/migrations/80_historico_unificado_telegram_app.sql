-- Migration 80: Histórico Unificado Telegram + Web App (Etapa 04)
-- 
-- 1. Suporte canônico a múltiplos canais (web e telegram) nas tabelas centrais de IA.
-- 2. Vinculação segura e efêmera de tokens de pareamento do Telegram (com TTL de 10 min, user_id e workspace_id).
-- 3. Índices de continuidade de sessão operacional de 4 horas e deduplicação de mensagens.

-- 1. Evolução da tabela wallet_ai_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_conversations' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.wallet_ai_conversations 
    ADD COLUMN channel text NOT NULL DEFAULT 'web';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_conversations' AND column_name = 'last_channel'
  ) THEN
    ALTER TABLE public.wallet_ai_conversations 
    ADD COLUMN last_channel text NOT NULL DEFAULT 'web';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_conversations' AND column_name = 'external_chat_id'
  ) THEN
    ALTER TABLE public.wallet_ai_conversations 
    ADD COLUMN external_chat_id text;
  END IF;
END $$;

-- 2. Evolução da tabela wallet_ai_messages
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_messages' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.wallet_ai_messages 
    ADD COLUMN channel text NOT NULL DEFAULT 'web';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wallet_ai_messages' AND column_name = 'external_message_id'
  ) THEN
    ALTER TABLE public.wallet_ai_messages 
    ADD COLUMN external_message_id text;
  END IF;
END $$;

-- 3. Evolução da tabela telegram_link_tokens para pareamento seguro criptográfico
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_link_tokens' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.telegram_link_tokens 
    ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_link_tokens' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.telegram_link_tokens 
    ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'telegram_link_tokens' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.telegram_link_tokens 
    ADD COLUMN expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes');
  END IF;
END $$;

-- 4. RLS para telegram_link_tokens
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_link_tokens_user_manage" ON public.telegram_link_tokens;
CREATE POLICY "telegram_link_tokens_user_manage" ON public.telegram_link_tokens
FOR ALL USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "telegram_link_tokens_service_role" ON public.telegram_link_tokens;
CREATE POLICY "telegram_link_tokens_service_role" ON public.telegram_link_tokens
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 5. Índices de Otimização e Deduplicação
CREATE INDEX IF NOT EXISTS idx_wallet_ai_conversations_active_lookup 
ON public.wallet_ai_conversations (workspace_id, user_id, agent_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_messages_channel 
ON public.wallet_ai_messages (conversation_id, channel);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ai_messages_external_dedup 
ON public.wallet_ai_messages (conversation_id, external_message_id) 
WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_active 
ON public.telegram_link_tokens (token, usado, expires_at);
