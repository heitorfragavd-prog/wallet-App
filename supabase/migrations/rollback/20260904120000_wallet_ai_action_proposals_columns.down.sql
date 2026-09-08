-- Rollback: 20260904120000_wallet_ai_action_proposals_columns.down.sql
-- Remove índices e colunas adicionadas

DROP INDEX IF EXISTS public.idx_wallet_ai_actions_conversation;

ALTER TABLE public.wallet_ai_action_proposals
    DROP CONSTRAINT IF EXISTS wallet_ai_action_proposals_risk_level_check;

ALTER TABLE public.wallet_ai_action_proposals
    DROP COLUMN IF EXISTS risk_level;

ALTER TABLE public.wallet_ai_action_proposals
    DROP COLUMN IF EXISTS conversation_id;
