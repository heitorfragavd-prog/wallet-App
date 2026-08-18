-- Rollback: 20260818030000_wallet_ai_action_proposals.down.sql
-- Remove a tabela wallet_ai_action_proposals

DROP TABLE IF EXISTS public.wallet_ai_action_proposals CASCADE;
