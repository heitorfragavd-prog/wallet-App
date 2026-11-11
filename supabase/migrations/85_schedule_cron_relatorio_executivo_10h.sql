-- ==============================================================================
-- Migration 85: Agendamento Diário às 10h do Relatório Executivo (Wallet CEO)
-- Etapa 06 - Entrega D (pg_cron agendado para 10:00 BRT = 13:00 UTC)
-- ==============================================================================

DO $$
BEGIN
  -- 1. Remove agendamento anterior se já existir
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-relatorio-executivo-10h') THEN
    PERFORM cron.unschedule('cron-relatorio-executivo-10h');
  END IF;

  -- 2. Cadastra novo agendamento diário para 10:00 da manhã (America/Sao_Paulo) = 13:00 UTC
  -- Cron schedule: '0 13 * * *' (Todo dia às 13:00 UTC)
  PERFORM cron.schedule(
    'cron-relatorio-executivo-10h',
    '0 13 * * *',
    $cmd$SELECT public.cron_dispatch_edge_function('cron-relatorio-executivo-10h', 'cron-relatorio-executivo', '{}'::jsonb);$cmd$
  );
END $$;
