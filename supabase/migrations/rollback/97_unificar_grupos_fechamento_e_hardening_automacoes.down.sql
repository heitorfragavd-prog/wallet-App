-- Rollback da Migration 97
BEGIN;

DROP INDEX IF EXISTS public.uq_telegram_grupos_config_ws_tipo_ativo;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('folguistas-consulta-segunda', 'folguistas-confirmacao-sexta');
  END IF;
END $$;

ALTER TABLE public.escalas_automacoes_log
  DROP CONSTRAINT IF EXISTS chk_escalas_automacoes_log_status_envio,
  DROP COLUMN IF EXISTS status_envio,
  DROP COLUMN IF EXISTS telegram_message_id,
  DROP COLUMN IF EXISTS api_response,
  DROP COLUMN IF EXISTS tentativas,
  DROP COLUMN IF EXISTS erro_detalhes;

COMMIT;
