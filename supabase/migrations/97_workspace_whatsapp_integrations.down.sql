-- Down Migration 97: workspace_whatsapp_integrations & whatsapp_usuarios_pareados
DROP TABLE IF EXISTS public.whatsapp_mensagens_processadas CASCADE;
DROP TABLE IF EXISTS public.whatsapp_usuarios_pareados CASCADE;
DROP TABLE IF EXISTS public.workspace_whatsapp_integrations CASCADE;
DROP FUNCTION IF EXISTS public.handle_whatsapp_updated_at() CASCADE;
