-- LOCAL APENAS -- NAO APLICAR REMOTAMENTE
-- REVOKE SELECT de authenticated em ia_configuracoes + RPC SECURITY DEFINER
-- Auditoria policies existentes (migration 41):
--   SELECT  USING (user_id = auth.uid())  => isola linha, nao coluna
--   INSERT  WITH CHECK (user_id = auth.uid())
--   UPDATE  USING (user_id = auth.uid())
--   DELETE  USING (user_id = auth.uid())
-- Resposta as perguntas de seguranca:
--   authenticated SELECT api_key DIRETO?    NAO (apos REVOKE)
--   authenticated INSERT api_key?           SIM (necessario para configurar)
--   authenticated UPDATE propria api_key?   SIM (necessario para reconfigurar)
--   authenticated UPDATE api_key de outro?  NAO (RLS: user_id = auth.uid())
--   anon?                                   NAO
--   service_role?                           SIM (bypassa RLS, Edge Functions)
BEGIN;
REVOKE SELECT ON public.ia_configuracoes FROM authenticated;
GRANT SELECT (id, user_id, modelo, created_at, updated_at) ON public.ia_configuracoes TO authenticated;
GRANT INSERT ON public.ia_configuracoes TO authenticated;
GRANT UPDATE ON public.ia_configuracoes TO authenticated;
GRANT DELETE ON public.ia_configuracoes TO authenticated;
DROP FUNCTION IF EXISTS public.get_ia_config_status();
CREATE OR REPLACE FUNCTION public.get_ia_config_status()
RETURNS TABLE(id UUID, modelo TEXT, api_key_configurada BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT c.id, c.modelo, (length(trim(c.api_key)) > 0) AS api_key_configurada
  FROM public.ia_configuracoes c WHERE c.user_id = auth.uid() LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_ia_config_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ia_config_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ia_config_status() TO authenticated;
COMMIT;