-- ============================================================================
-- MIGRATION 81: HOMOLOGAÇÃO ETAPA 04 - SEGURANÇA, ISOLAMENTO DE GRUPOS E REALTIME
-- ============================================================================

-- 1. Coluna is_group em wallet_ai_conversations para isolamento estrito de grupos
ALTER TABLE wallet_ai_conversations
ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Triggers de integridade para isolamento de grupos e CEO
-- Grupos NUNCA podem ser cérebro executivo CEO (apenas operational)
-- Cérebro executivo CEO NUNCA pode ter is_group = true
CREATE OR REPLACE FUNCTION trg_enforce_conversation_group_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_group = TRUE AND NEW.agent_type = 'ceo' THEN
    RAISE EXCEPTION 'Grupos corporativos não podem utilizar o cérebro executivo CEO (agent_type deve ser operational)';
  END IF;

  IF NEW.agent_type = 'ceo' AND NEW.is_group = TRUE THEN
    RAISE EXCEPTION 'Cérebro executivo CEO é estritamente privado individual e não pode ser associado a grupos';
  END IF;

  IF NEW.is_group = TRUE THEN
    NEW.is_shared := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_conversation_group_rules ON wallet_ai_conversations;
CREATE TRIGGER trg_check_conversation_group_rules
BEFORE INSERT OR UPDATE ON wallet_ai_conversations
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_conversation_group_rules();

-- 3. Índices de busca de conversas ativas segregadas (Grupo vs Privado)
CREATE INDEX IF NOT EXISTS idx_conversations_group_active
ON wallet_ai_conversations (workspace_id, external_chat_id, updated_at DESC)
WHERE is_group = TRUE AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_private_active
ON wallet_ai_conversations (workspace_id, user_id, updated_at DESC)
WHERE is_group = FALSE AND is_archived = FALSE;

-- 4. Tabela de Rate Limiting para Pareamento do Telegram (proteção contra brute-force)
CREATE TABLE IF NOT EXISTS telegram_link_rate_limits (
  identifier TEXT PRIMARY KEY,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telegram_link_rate_limits ENABLE ROW LEVEL SECURITY;

-- 5. HABILITAÇÃO DO SUPABASE REALTIME PARA MENSAGENS E CONVERSAS
-- Adiciona wallet_ai_messages e wallet_ai_conversations à publicação supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_ai_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallet_ai_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_ai_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallet_ai_conversations;
  END IF;
END $$;

ALTER TABLE wallet_ai_messages REPLICA IDENTITY FULL;
ALTER TABLE wallet_ai_conversations REPLICA IDENTITY FULL;
