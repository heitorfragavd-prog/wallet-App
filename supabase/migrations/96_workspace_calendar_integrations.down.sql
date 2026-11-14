-- Rollback da Migration 96
DROP TABLE IF EXISTS public.calendar_eventos_sincronizados CASCADE;
DROP TABLE IF EXISTS public.workspace_calendar_integrations CASCADE;
