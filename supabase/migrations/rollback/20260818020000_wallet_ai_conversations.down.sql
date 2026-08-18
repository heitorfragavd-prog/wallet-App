-- Rollback: 20260818020000_wallet_ai_conversations.down.sql
-- Remove com segurança as tabelas e políticas criadas na migration de conversas

DROP TABLE IF EXISTS public.wallet_ai_messages CASCADE;
DROP TABLE IF EXISTS public.wallet_ai_conversations CASCADE;
