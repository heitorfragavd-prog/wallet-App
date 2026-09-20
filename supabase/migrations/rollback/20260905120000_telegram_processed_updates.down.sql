-- Rollback: 20260905120000_telegram_processed_updates.down.sql
-- Reversão da tabela de idempotência distribuída do Telegram

DROP INDEX IF EXISTS public.idx_telegram_processed_updates_expires_at;
DROP TABLE IF EXISTS public.telegram_processed_updates;
