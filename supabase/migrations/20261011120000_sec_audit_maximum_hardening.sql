-- =========================================================================
-- Migration: 20261011120000_sec_audit_maximum_hardening.sql
-- SEC-AUDIT: Hardening Máximo de RLS, Catálogos e Isolamento de Dados
-- Corrigido: Bloqueadores 01 (audio_transcricoes) e 02 (colaboradores em workspaces)
-- Revisão Complementar: Imutabilidade de Tenancy/Ownership e Restrição de Delete
-- =========================================================================

-- Função canônica segura para verificação de acesso ao workspace
CREATE OR REPLACE FUNCTION public.tem_acesso_workspace(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      p_workspace_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.workspaces w
          WHERE w.id = p_workspace_id
            AND w.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE wm.workspace_id = p_workspace_id
            AND wm.user_id = auth.uid()
            AND wm.active
            AND wm.role = 'admin'
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.tem_acesso_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tem_acesso_workspace(uuid) TO authenticated, service_role;

-- Função de salvaguarda: Impede transferência entre workspaces e adulteração de autoria (user_id)
CREATE OR REPLACE FUNCTION public.impedir_alteracao_tenant_e_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Operação não permitida: workspace_id não pode ser alterado após a criação.';
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Operação não permitida: user_id original não pode ser alterado.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_alteracao_tenant_e_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.impedir_alteracao_tenant_e_owner() TO authenticated, service_role;

-- Função de salvaguarda para itens de NF: Impede desassociação ou migração de nota fiscal
CREATE OR REPLACE FUNCTION public.impedir_alteracao_nf_item_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.nf_id IS DISTINCT FROM NEW.nf_id THEN
    RAISE EXCEPTION 'Operação não permitida: nf_id do item não pode ser alterado após a criação.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_alteracao_nf_item_parent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.impedir_alteracao_nf_item_parent() TO authenticated, service_role;

-- 1. NOTAS FISCAIS DE COMPRA & ITENS (VULN-01 & BLOQUEADOR 02)
ALTER TABLE IF EXISTS public.notas_fiscais_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nf_compra_all ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_user_isolation ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_select ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_insert ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_update ON public.notas_fiscais_compra;
DROP POLICY IF EXISTS nf_compra_delete ON public.notas_fiscais_compra;

CREATE POLICY nf_compra_select ON public.notas_fiscais_compra
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY nf_compra_insert ON public.notas_fiscais_compra
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
    OR workspace_id IS NULL
  )
);

CREATE POLICY nf_compra_update ON public.notas_fiscais_compra
FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
)
WITH CHECK (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

-- Delete restrito ao autor da nota ou ao proprietário do workspace
CREATE POLICY nf_compra_delete ON public.notas_fiscais_compra
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = notas_fiscais_compra.workspace_id
        AND w.user_id = auth.uid()
    )
  )
);

DROP TRIGGER IF EXISTS trg_nf_compra_tenant_immutable ON public.notas_fiscais_compra;
CREATE TRIGGER trg_nf_compra_tenant_immutable
  BEFORE UPDATE OF workspace_id, user_id
  ON public.notas_fiscais_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_alteracao_tenant_e_owner();

-- NF ITENS
ALTER TABLE IF EXISTS public.nf_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nf_itens_all ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_user_isolation ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_select ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_insert ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_update ON public.nf_itens;
DROP POLICY IF EXISTS nf_itens_delete ON public.nf_itens;

CREATE POLICY nf_itens_select ON public.nf_itens
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND (
        (n.workspace_id IS NOT NULL AND public.tem_acesso_workspace(n.workspace_id))
        OR (n.workspace_id IS NULL AND n.user_id = auth.uid())
      )
  )
);

CREATE POLICY nf_itens_insert ON public.nf_itens
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND (
        (n.workspace_id IS NOT NULL AND public.tem_acesso_workspace(n.workspace_id))
        OR (n.workspace_id IS NULL AND n.user_id = auth.uid())
      )
  )
);

CREATE POLICY nf_itens_update ON public.nf_itens
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND (
        (n.workspace_id IS NOT NULL AND public.tem_acesso_workspace(n.workspace_id))
        OR (n.workspace_id IS NULL AND n.user_id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND (
        (n.workspace_id IS NOT NULL AND public.tem_acesso_workspace(n.workspace_id))
        OR (n.workspace_id IS NULL AND n.user_id = auth.uid())
      )
  )
);

-- Delete do item permitido para o autor da NF ou proprietário do workspace
CREATE POLICY nf_itens_delete ON public.nf_itens
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais_compra n
    WHERE n.id = nf_itens.nf_id
      AND (
        n.user_id = auth.uid()
        OR (
          n.workspace_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.workspaces w
            WHERE w.id = n.workspace_id
              AND w.user_id = auth.uid()
          )
        )
      )
  )
);

DROP TRIGGER IF EXISTS trg_nf_itens_parent_immutable ON public.nf_itens;
CREATE TRIGGER trg_nf_itens_parent_immutable
  BEFORE UPDATE OF nf_id
  ON public.nf_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_alteracao_nf_item_parent();

-- 2. HISTÓRICO DE CUSTO DE PRODUTO (VULN-01 & BLOQUEADOR 02)
ALTER TABLE IF EXISTS public.historico_custo_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historico_custo_all ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_user_isolation ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_select ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_insert ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_update ON public.historico_custo_produto;
DROP POLICY IF EXISTS historico_custo_delete ON public.historico_custo_produto;

CREATE POLICY historico_custo_select ON public.historico_custo_produto
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY historico_custo_insert ON public.historico_custo_produto
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
    OR workspace_id IS NULL
  )
);

CREATE POLICY historico_custo_update ON public.historico_custo_produto
FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
)
WITH CHECK (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY historico_custo_delete ON public.historico_custo_produto
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = historico_custo_produto.workspace_id
        AND w.user_id = auth.uid()
    )
  )
);

DROP TRIGGER IF EXISTS trg_historico_custo_tenant_immutable ON public.historico_custo_produto;
CREATE TRIGGER trg_historico_custo_tenant_immutable
  BEFORE UPDATE OF workspace_id, user_id
  ON public.historico_custo_produto
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_alteracao_tenant_e_owner();

-- 3. PRODUTOS EYEMOBILE (VULN-01 & BLOQUEADOR 02)
ALTER TABLE IF EXISTS public.produtos_eyemobile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS produtos_eyemobile_all ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_user_isolation ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_select ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_insert ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_update ON public.produtos_eyemobile;
DROP POLICY IF EXISTS produtos_eyemobile_delete ON public.produtos_eyemobile;

CREATE POLICY produtos_eyemobile_select ON public.produtos_eyemobile
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY produtos_eyemobile_insert ON public.produtos_eyemobile
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
    OR workspace_id IS NULL
  )
);

CREATE POLICY produtos_eyemobile_update ON public.produtos_eyemobile
FOR UPDATE TO authenticated
USING (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
)
WITH CHECK (
  (workspace_id IS NOT NULL AND public.tem_acesso_workspace(workspace_id))
  OR (workspace_id IS NULL AND auth.uid() = user_id)
);

CREATE POLICY produtos_eyemobile_delete ON public.produtos_eyemobile
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = produtos_eyemobile.workspace_id
        AND w.user_id = auth.uid()
    )
  )
);

DROP TRIGGER IF EXISTS trg_produtos_eyemobile_tenant_immutable ON public.produtos_eyemobile;
CREATE TRIGGER trg_produtos_eyemobile_tenant_immutable
  BEFORE UPDATE OF workspace_id, user_id
  ON public.produtos_eyemobile
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_alteracao_tenant_e_owner();

-- 4. TRANSCRIÇÕES DE ÁUDIO (VULN-01 & BLOQUEADOR 01: isolamento exclusivo por usuário)
ALTER TABLE IF EXISTS public.audio_transcricoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audio_transcricoes_all ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_user_isolation ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_select ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_insert ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_update ON public.audio_transcricoes;
DROP POLICY IF EXISTS audio_transcricoes_delete ON public.audio_transcricoes;

CREATE POLICY audio_transcricoes_select ON public.audio_transcricoes
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY audio_transcricoes_insert ON public.audio_transcricoes
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY audio_transcricoes_update ON public.audio_transcricoes
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY audio_transcricoes_delete ON public.audio_transcricoes
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

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
