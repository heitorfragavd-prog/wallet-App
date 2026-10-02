-- Migration: 20261002061000_isolate_divipay_by_workspace.sql
-- Objetivo: SEC-001 - Isolar configurações e transações Divipay por workspace
-- REGRA DE SEGURANÇA: NÃO permite workspace_id NULL nem bypass de tenancy.
-- ATENÇÃO: NUNCA executar automaticamente no ambiente remoto sem autorização explícita do usuário.
--
-- ORDEM DETERMINÍSTICA E TRANSACIONAL:
--   ETAPA 1: Adicionar coluna workspace_id (nullable) nas tabelas Divipay
--   ETAPA 2: Pré-validação e Backfill defensivo da configuração da Rodo Point PJ (com assertions de rows)
--   ETAPA 3: Criar Unique Constraint por (user_id, workspace_id) e aplicar NOT NULL
--   ETAPA 4: Criar Índices de busca por workspace_id
--   ETAPA 5: Endurecer Políticas RLS (estrito, sem NULL bypass, com tem_acesso_workspace)

-- ============================================================================
-- ETAPA 1: Adicionar coluna workspace_id
-- ============================================================================

ALTER TABLE public.divipay_config
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.divipay_transacoes
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'divipay_conciliacoes'
  ) THEN
    ALTER TABLE public.divipay_conciliacoes
      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- ETAPA 2: Backfill Defensivo com Guardas Estritas (Fail-Closed)
-- ============================================================================

DO $$
DECLARE
  v_target_config_id CONSTANT UUID := 'bddeabcb-7ec5-4c7c-8fdd-b105173a0c40'::uuid;
  v_expected_user_id CONSTANT UUID := '0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0'::uuid;
  v_rodo_point_ws_id CONSTANT UUID := '2af415b6-76aa-4134-8133-a9b405671c1c'::uuid;
  v_config_record RECORD;
  v_ws_record RECORD;
  v_rows_updated INTEGER := 0;
  v_null_configs_count INTEGER := 0;
BEGIN
  -- 2.1 Verificar se a configuração existe
  SELECT id, user_id, workspace_id INTO v_config_record
  FROM public.divipay_config
  WHERE id = v_target_config_id;

  IF NOT FOUND THEN
    -- Se a configuração já não existir ou for ambiente limpo, apenas verifica se há órfãos
    SELECT COUNT(*) INTO v_null_configs_count FROM public.divipay_config WHERE workspace_id IS NULL;
    IF v_null_configs_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION ABORTADA: Existem % configurações Divipay com workspace_id NULL desconhecidas.', v_null_configs_count;
    END IF;
    RETURN;
  END IF;

  -- 2.2 Se já estiver associada, validar se é exatamente a Conta Rodo Point
  IF v_config_record.workspace_id IS NOT NULL THEN
    IF v_config_record.workspace_id <> v_rodo_point_ws_id THEN
      RAISE EXCEPTION 'MIGRATION ABORTADA: Configuração % já associada a workspace inesperado % (esperado Rodo Point %).',
        v_target_config_id, v_config_record.workspace_id, v_rodo_point_ws_id;
    END IF;
    -- Já associada corretamente (reexecução idempotente)
    RETURN;
  END IF;

  -- 2.3 Validar integridade do usuário dono
  IF v_config_record.user_id <> v_expected_user_id THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA: Configuração % pertence a user_id inesperado % (esperado %).',
      v_target_config_id, v_config_record.user_id, v_expected_user_id;
  END IF;

  -- 2.4 Validar existência e atributos do workspace Conta Rodo Point PJ
  SELECT id, user_id, nome, tipo INTO v_ws_record
  FROM public.workspaces
  WHERE id = v_rodo_point_ws_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA: Workspace Conta Rodo Point % não encontrado no banco de dados.', v_rodo_point_ws_id;
  END IF;

  IF v_ws_record.tipo <> 'PJ' THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA: Workspace % possui tipo % (esperado PJ).', v_rodo_point_ws_id, v_ws_record.tipo;
  END IF;

  -- 2.5 Executar o Backfill de forma atômica
  UPDATE public.divipay_config
  SET workspace_id = v_rodo_point_ws_id
  WHERE id = v_target_config_id
    AND user_id = v_expected_user_id
    AND workspace_id IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- 2.6 GUARDA ESTRITA: Exatamente 1 registro deve ser atualizado
  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA: Backfill falhou. Linhas afetadas: % (esperado exatamente 1).', v_rows_updated;
  END IF;

  -- 2.7 Garantir que não restou nenhuma configuração órfã não mapeada
  SELECT COUNT(*) INTO v_null_configs_count
  FROM public.divipay_config
  WHERE workspace_id IS NULL;

  IF v_null_configs_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTADA: Ainda existem % configurações com workspace_id NULL após o backfill.', v_null_configs_count;
  END IF;
END $$;

-- ============================================================================
-- ETAPA 3: Constraints e NOT NULL
-- ============================================================================

-- Remover unique legada em user_id apenas (que impedia 1 usuário de ter configs em workspaces distintos)
ALTER TABLE public.divipay_config
  DROP CONSTRAINT IF EXISTS divipay_config_user_id_key;

-- Aplicar constraint única por (user_id, workspace_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'divipay_config_user_workspace_uk'
  ) THEN
    ALTER TABLE public.divipay_config
      ADD CONSTRAINT divipay_config_user_workspace_uk UNIQUE (user_id, workspace_id);
  END IF;
END $$;

-- Tornar workspace_id obrigatório em divipay_config
ALTER TABLE public.divipay_config
  ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================================
-- ETAPA 4: Índices de Alta Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_divipay_config_workspace ON public.divipay_config(workspace_id);
CREATE INDEX IF NOT EXISTS idx_divipay_transacoes_workspace ON public.divipay_transacoes(workspace_id);

-- ============================================================================
-- ETAPA 5: Endurecimento de RLS (Isolamento Estrito Sem Bypass)
-- ============================================================================

DROP POLICY IF EXISTS "Usuários gerenciam sua própria config Divipay" ON public.divipay_config;
DROP POLICY IF EXISTS "Usuários gerenciam sua própria config Divipay por workspace" ON public.divipay_config;

CREATE POLICY "Usuários gerenciam sua própria config Divipay por workspace"
ON public.divipay_config
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND workspace_id IS NOT NULL
  AND public.tem_acesso_workspace(workspace_id)
)
WITH CHECK (
  auth.uid() = user_id
  AND workspace_id IS NOT NULL
  AND public.tem_acesso_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Usuários gerenciam suas próprias transações Divipay" ON public.divipay_transacoes;
DROP POLICY IF EXISTS "Usuários gerenciam suas próprias transações Divipay por workspace" ON public.divipay_transacoes;

CREATE POLICY "Usuários gerenciam suas próprias transações Divipay por workspace"
ON public.divipay_transacoes
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND workspace_id IS NOT NULL
  AND public.tem_acesso_workspace(workspace_id)
)
WITH CHECK (
  auth.uid() = user_id
  AND workspace_id IS NOT NULL
  AND public.tem_acesso_workspace(workspace_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'divipay_conciliacoes'
  ) THEN
    DROP POLICY IF EXISTS "Users can view their own conciliacoes" ON public.divipay_conciliacoes;
    DROP POLICY IF EXISTS "Users can create their own conciliacoes" ON public.divipay_conciliacoes;
    DROP POLICY IF EXISTS "Users can update their own conciliacoes" ON public.divipay_conciliacoes;
    DROP POLICY IF EXISTS "Users can delete their own conciliacoes" ON public.divipay_conciliacoes;
    DROP POLICY IF EXISTS "Usuários gerenciam conciliações Divipay por workspace" ON public.divipay_conciliacoes;

    CREATE POLICY "Usuários gerenciam conciliações Divipay por workspace"
    ON public.divipay_conciliacoes
    FOR ALL
    TO authenticated
    USING (
      auth.uid() = user_id
      AND workspace_id IS NOT NULL
      AND public.tem_acesso_workspace(workspace_id)
    )
    WITH CHECK (
      auth.uid() = user_id
      AND workspace_id IS NOT NULL
      AND public.tem_acesso_workspace(workspace_id)
    );
  END IF;
END $$;
