-- =========================================================================
-- Migration: 20261011120000_sec_audit_maximum_hardening.sql
-- SEC-AUDIT: Hardening Máximo de RLS, Catálogos e Isolamento de Dados
-- =========================================================================

-- 1. NOTAS FISCAIS DE COMPRA & ITENS (VULN-01)
-- Revoga policies abertas com USING (true) e ativa isolamento por usuário e workspace
ALTER TABLE IF EXISTS public.notas_fiscais_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nf_compra_all ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_user_isolation ON public.notas_fiscais_compra;

CREATE POLICY nf_compra_user_isolation ON public.notas_fiscais_compra
FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
)
WITH CHECK (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
);

ALTER TABLE IF EXISTS public.nf_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nf_itens_all ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_user_isolation ON public.nf_itens;

CREATE POLICY nf_itens_user_isolation ON public.nf_itens
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND n.user_id = auth.uid()
      AND (n.workspace_id IS NULL OR public.tem_acesso_workspace(n.workspace_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND n.user_id = auth.uid()
      AND (n.workspace_id IS NULL OR public.tem_acesso_workspace(n.workspace_id))
  )
);

-- 2. HISTÓRICO DE CUSTO DE PRODUTO (VULN-01)
ALTER TABLE IF EXISTS public.historico_custo_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historico_custo_all ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_user_isolation ON public.historico_custo_produto;

CREATE POLICY historico_custo_user_isolation ON public.historico_custo_produto
FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
)
WITH CHECK (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
);

-- 3. PRODUTOS EYEMOBILE (VULN-01)
ALTER TABLE IF EXISTS public.produtos_eyemobile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produtos_eyemobile_all ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_user_isolation ON public.produtos_eyemobile;

CREATE POLICY produtos_eyemobile_user_isolation ON public.produtos_eyemobile
FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
)
WITH CHECK (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
);

-- 4. TRANSCRIÇÕES DE ÁUDIO (VULN-01)
ALTER TABLE IF EXISTS public.audio_transcricoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audio_transcricoes_all ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_user_isolation ON public.audio_transcricoes;

CREATE POLICY audio_transcricoes_user_isolation ON public.audio_transcricoes
FOR ALL TO authenticated
USING (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
)
WITH CHECK (
  auth.uid() = user_id
  AND (workspace_id IS NULL OR public.tem_acesso_workspace(workspace_id))
);

-- 5. EYEMOBILE CACHE (VULN-02)
-- Tabela de cache interno: remove acesso público de usuários comuns e restringe a service_role
ALTER TABLE IF EXISTS public.eyemobile_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo aos usuarios autenticados em eyemobile_cache" ON public.eyemobile_cache;
REVOKE ALL ON public.eyemobile_cache FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.eyemobile_cache TO service_role;

-- 6. CHANNEL MAPPINGS (VULN-03)
-- Corrige a política sem TO service_role que herdava PUBLIC
ALTER TABLE IF EXISTS public.channel_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage channel_mappings" ON public.channel_mappings;
CREATE POLICY "Service role can manage channel_mappings"
ON public.channel_mappings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. IA LEITURA ERROS (VULN-03)
-- Corrige a política sem TO service_role que expunha logs a todos os usuários
ALTER TABLE IF EXISTS public.ia_leitura_erros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manage ia_leitura_erros" ON public.ia_leitura_erros;
CREATE POLICY "Service role manage ia_leitura_erros"
ON public.ia_leitura_erros FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. INFRAESTRUTURA DE SEGURANÇA E RATE LIMIT (VULN-04)
-- Ativação formal de RLS nas tabelas auxiliares
ALTER TABLE IF EXISTS public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_token_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.investimentos_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limits FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.rate_limits TO service_role;

REVOKE ALL ON public.ai_token_reservations FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.ai_token_reservations TO service_role;

REVOKE ALL ON public.investimentos_sessions FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.investimentos_sessions TO service_role;
