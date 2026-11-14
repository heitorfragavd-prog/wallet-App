-- Rollback Migration 95: workspace_gmail_integrations e gmail_mensagens_processadas
DROP TABLE IF EXISTS public.gmail_mensagens_processadas CASCADE;
DROP TABLE IF EXISTS public.workspace_gmail_integrations CASCADE;
