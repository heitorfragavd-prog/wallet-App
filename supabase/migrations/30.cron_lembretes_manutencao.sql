-- Configurar cron job para processar lembretes de manutenção diariamente
-- Requer extensão pg_cron

-- ============================================================================
-- HABILITAR EXTENSÃO PG_CRON
-- ============================================================================

-- Verificar se pg_cron está disponível e habilitá-la
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- CONFIGURAR CRON JOB PARA LEMBRETES DE MANUTENÇÃO
-- ============================================================================

-- Remover job existente se houver (para permitir re-execução da migration)
SELECT cron.unschedule('processar-lembretes-manutencao')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'processar-lembretes-manutencao'
);

-- Criar cron job para executar diariamente às 8h da manhã (horário do servidor)
-- Ajuste o horário conforme necessário para seu timezone
SELECT cron.schedule(
  'processar-lembretes-manutencao',  -- Nome do job
  '0 8 * * *',                        -- Cron expression: todos os dias às 8h
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/processar-lembretes-manutencao',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- ============================================================================
-- CONFIGURAÇÕES ALTERNATIVAS DE HORÁRIO
-- ============================================================================

-- Exemplos de cron expressions:
-- '0 8 * * *'     - Todos os dias às 8h
-- '0 9 * * *'     - Todos os dias às 9h
-- '0 */6 * * *'   - A cada 6 horas
-- '0 8,20 * * *'  - Às 8h e às 20h todos os dias
-- '0 8 * * 1-5'   - Às 8h de segunda a sexta

-- Para alterar o horário, execute:
-- SELECT cron.unschedule('processar-lembretes-manutencao');
-- SELECT cron.schedule('processar-lembretes-manutencao', 'NOVA_EXPRESSAO', $$...$$);

-- ============================================================================
-- VERIFICAR JOBS AGENDADOS
-- ============================================================================

-- Para ver todos os jobs agendados:
-- SELECT * FROM cron.job;

-- Para ver o histórico de execuções:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobname = 'processar-lembretes-manutencao' 
-- ORDER BY start_time DESC 
-- LIMIT 10;

-- ============================================================================
-- CONFIGURAÇÕES DO SISTEMA (NECESSÁRIAS PARA O CRON)
-- ============================================================================

-- Estas configurações devem ser definidas no Supabase Dashboard ou via SQL
-- Settings > Database > Custom Postgres Configuration

-- Exemplo de como definir (ajuste os valores para seu projeto):
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://seu-projeto.supabase.co';
-- ALTER DATABASE postgres SET app.settings.supabase_service_role_key = 'sua-service-role-key';

-- ============================================================================
-- MONITORAMENTO E TROUBLESHOOTING
-- ============================================================================

-- Ver últimas execuções do job
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';

-- Para testar manualmente a edge function:
-- curl -X POST 'https://seu-projeto.supabase.co/functions/v1/processar-lembretes-manutencao' \
--   -H 'Authorization: Bearer SUA_SERVICE_ROLE_KEY' \
--   -H 'Content-Type: application/json'

-- ============================================================================
-- ALTERNATIVA: USAR SUPABASE CRON (se pg_cron não estiver disponível)
-- ============================================================================

-- Se pg_cron não estiver disponível no seu plano Supabase, você pode:
-- 1. Usar um serviço externo de cron (como cron-job.org, EasyCron, etc)
-- 2. Usar GitHub Actions com schedule
-- 3. Usar um serviço de cloud functions com timer (AWS Lambda, Google Cloud Functions)

-- Exemplo de GitHub Actions (.github/workflows/process-reminders.yml):
-- name: Process Maintenance Reminders
-- on:
--   schedule:
--     - cron: '0 8 * * *'  # Todos os dias às 8h UTC
-- jobs:
--   process:
--     runs-on: ubuntu-latest
--     steps:
--       - name: Call Edge Function
--         run: |
--           curl -X POST '${{ secrets.SUPABASE_URL }}/functions/v1/processar-lembretes-manutencao' \
--             -H 'Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}' \
--             -H 'Content-Type: application/json'

-- ============================================================================
-- DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON EXTENSION pg_cron IS 'Extensão para agendamento de jobs no PostgreSQL';

-- Informações sobre o job
DO $$
BEGIN
  RAISE NOTICE 'Cron job "processar-lembretes-manutencao" configurado com sucesso';
  RAISE NOTICE 'Horário: Todos os dias às 8h (horário do servidor)';
  RAISE NOTICE 'Edge Function: /functions/v1/processar-lembretes-manutencao';
  RAISE NOTICE 'Para verificar execuções: SELECT * FROM cron.job_run_details WHERE jobname = ''processar-lembretes-manutencao''';
END $$;

