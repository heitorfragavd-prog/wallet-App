-- ============================================================================
-- Migration 72: Remediação de Políticas RLS Permissivas
-- ============================================================================

-- 1. Remediação de colaborador_escalas
DROP POLICY IF EXISTS "Permitir tudo aos usuarios autenticados em escalas" ON public.colaborador_escalas;
DROP POLICY IF EXISTS "Acesso restrito por workspace para colaborador_escalas" ON public.colaborador_escalas;

ALTER TABLE public.colaborador_escalas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso restrito por workspace para colaborador_escalas"
ON public.colaborador_escalas
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = colaborador_escalas.workspace_id
      AND w.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = colaborador_escalas.workspace_id
      AND w.user_id = auth.uid()
  )
);

-- 2. Remediação de eyemobile_cache (acesso exclusivo a service_role)
DROP POLICY IF EXISTS "Permitir tudo aos usuarios autenticados em eyemobile_cache" ON public.eyemobile_cache;
DROP POLICY IF EXISTS "Acesso service role eyemobile_cache" ON public.eyemobile_cache;

ALTER TABLE public.eyemobile_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso service role eyemobile_cache"
ON public.eyemobile_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
