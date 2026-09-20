-- Migration: 20260904120000_wallet_ai_action_proposals_columns.sql
-- Descrição: Adiciona colunas canônicas risk_level e conversation_id à tabela wallet_ai_action_proposals de forma retrocompatível e segura.

-- 1. Adicionar risk_level
ALTER TABLE public.wallet_ai_action_proposals
    ADD COLUMN IF NOT EXISTS risk_level TEXT;

-- 2. Restrição de validação para risk_level (LOW, MEDIUM, HIGH)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ai_action_proposals_risk_level_check'
    ) THEN
        ALTER TABLE public.wallet_ai_action_proposals
            ADD CONSTRAINT wallet_ai_action_proposals_risk_level_check
            CHECK (risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH'));
    END IF;
END $$;

-- 3. Adicionar conversation_id
ALTER TABLE public.wallet_ai_action_proposals
    ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- 4. Índice para busca de propostas por conversa no workspace
CREATE INDEX IF NOT EXISTS idx_wallet_ai_actions_conversation
    ON public.wallet_ai_action_proposals (workspace_id, conversation_id)
    WHERE conversation_id IS NOT NULL;
