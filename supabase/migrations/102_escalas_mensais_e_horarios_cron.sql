-- =============================================================================
-- Migration 102: Preparação de Escalas Mensais no Servidor e Horários Exatos do Cron
-- Etapa 3E.1 - Gates 4 e 9
-- =============================================================================

-- 1. Expansão de configurações para automação da escala mensal
ALTER TABLE public.escalas_config
  ADD COLUMN IF NOT EXISTS ativo_mensal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS escala_mensal_dia integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS escala_mensal_horario text NOT NULL DEFAULT '06:00';

-- 2. Atualização dos horários no pg_cron com o fuso horário oficial (America/Sao_Paulo, UTC-3)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamentos antigos para reconfiguração idônea
    PERFORM cron.unschedule(jobid) 
       FROM cron.job 
      WHERE jobname IN ('folguistas-consulta-segunda', 'folguistas-confirmacao-sexta', 'folguistas-escala-mensal');

    -- 2.1 Segunda-feira às 09h00 de Brasília (12h00 UTC)
    PERFORM cron.schedule(
      'folguistas-consulta-segunda',
      '0 12 * * 1',
      $cron$SELECT public.cron_dispatch_edge_function('folguistas-consulta-segunda', 'cron-folguistas-escalas', '{"action": "consulta_segunda"}'::jsonb);$cron$
    );

    -- 2.2 Sexta-feira às 14h00 de Brasília (17h00 UTC - Gate 9)
    PERFORM cron.schedule(
      'folguistas-confirmacao-sexta',
      '0 17 * * 5',
      $cron$SELECT public.cron_dispatch_edge_function('folguistas-confirmacao-sexta', 'cron-folguistas-escalas', '{"action": "confirmacao_sexta"}'::jsonb);$cron$
    );

    -- 2.3 Primeiro dia do mês às 06h00 de Brasília (09h00 UTC - Gate 4 & 9)
    PERFORM cron.schedule(
      'folguistas-escala-mensal',
      '0 9 1 * *',
      $cron$SELECT public.cron_dispatch_edge_function('folguistas-escala-mensal', 'cron-folguistas-escalas', '{"action": "preparar_escala_mensal"}'::jsonb);$cron$
    );
  END IF;
END $$;
