-- ============================================================
-- WALLET APP — SUBETAPA 9.1: FUNDAÇÃO DE IDENTIDADE CANÔNICA DE PRODUTOS
-- Migration: 20260909110000_produto_equivalencias_foundation.sql
-- Descrição: Criação da tabela produto_equivalencias, índices,
--            gatilhos de integridade multi-tenant, RLS com tem_acesso_workspace
--            e vínculo canônico opcional em historico_custo_produto.
-- ============================================================

-- ─── 1. TABELA produto_equivalencias ──────────────────────────
CREATE TABLE IF NOT EXISTS public.produto_equivalencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Identidade do fornecedor (NF / SEFAZ)
  cnpj_fornecedor_normalizado TEXT NOT NULL,
  codigo_produto_fornecedor TEXT NOT NULL,

  -- Snapshots informativos da NF (histórico/auditoria)
  fornecedor_nome TEXT,
  descricao_fornecedor TEXT,
  unidade_fornecedor TEXT,

  -- Produto canônico Eyemobile local
  produto_eyemobile_uuid UUID NOT NULL
    REFERENCES public.produtos_eyemobile(id)
    ON DELETE RESTRICT,

  -- Conversão aprovada (ex: 1 CX = 24 UN -> fator_conversao = 24.000000)
  -- SEM DEFAULT 1: Ausência de informação NÃO significa 1 CX = 1 UN
  fator_conversao NUMERIC(12,6) NOT NULL,

  -- Metadados de auditoria e confiança
  -- FAIL-SAFE: default = false para impedir que sugestões automáticas virem confirmação
  origem_matching TEXT NOT NULL DEFAULT 'manual',
  confirmado_por_usuario BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Restrições de integridade
  CONSTRAINT unq_produto_equivalencia_fornecedor
    UNIQUE (workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor),

  CONSTRAINT chk_produto_equivalencias_fator_positivo
    CHECK (fator_conversao > 0),

  CONSTRAINT chk_produto_equivalencias_cnpj_digitos
    CHECK (cnpj_fornecedor_normalizado ~ '^[0-9]+$'),

  CONSTRAINT chk_produto_equivalencias_codigo_fornecedor_not_empty
    CHECK (TRIM(codigo_produto_fornecedor) <> ''),

  CONSTRAINT chk_produto_equivalencias_origem
    CHECK (origem_matching IN ('manual', 'migracao_legada', 'ean_gtin', 'equivalencia_confirmada', 'sugestao_ia'))
);

-- ─── 2. ÍNDICES DE PERFORMANCE ────────────────────────────────
-- Lookup reverso: encontrar equivalências vinculadas a um determinado produto do Eyemobile
CREATE INDEX IF NOT EXISTS idx_produto_equivalencias_reverso
  ON public.produto_equivalencias(workspace_id, produto_eyemobile_uuid);

-- Lookup por usuário/workspace para listagens administrativas e sincronização
CREATE INDEX IF NOT EXISTS idx_produto_equivalencias_user_ws
  ON public.produto_equivalencias(user_id, workspace_id);


-- ─── 3. TRIGGER AUTOMÁTICO DE updated_at ──────────────────────
DROP TRIGGER IF EXISTS trg_produto_equivalencias_updated_at ON public.produto_equivalencias;
CREATE TRIGGER trg_produto_equivalencias_updated_at
  BEFORE UPDATE ON public.produto_equivalencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── 4. PROTEÇÃO DE INTEGRIDADE MULTI-TENANT (CROSS-WORKSPACE)
-- Garante no banco que a equivalência aponte estritamente para um produto
-- que pertença ao MESMO workspace e ao MESMO usuário.
CREATE OR REPLACE FUNCTION public.validar_produto_equivalencia_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prod_workspace_id UUID;
  v_prod_user_id UUID;
BEGIN
  SELECT workspace_id, user_id
  INTO v_prod_workspace_id, v_prod_user_id
  FROM public.produtos_eyemobile
  WHERE id = NEW.produto_eyemobile_uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto Eyemobile % não encontrado em public.produtos_eyemobile', NEW.produto_eyemobile_uuid;
  END IF;

  IF v_prod_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Workspace mismatch: o produto % pertence ao workspace %, mas a equivalência pertence ao workspace %',
      NEW.produto_eyemobile_uuid, v_prod_workspace_id, NEW.workspace_id;
  END IF;

  IF v_prod_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'User mismatch: o produto % pertence ao usuário %, mas a equivalência foi criada pelo usuário %',
      NEW.produto_eyemobile_uuid, v_prod_user_id, NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_produto_equivalencia_tenant() FROM public;
GRANT EXECUTE ON FUNCTION public.validar_produto_equivalencia_tenant() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validar_produto_equivalencia_tenant ON public.produto_equivalencias;
CREATE TRIGGER trg_validar_produto_equivalencia_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, user_id, produto_eyemobile_uuid
  ON public.produto_equivalencias
  FOR EACH ROW EXECUTE FUNCTION public.validar_produto_equivalencia_tenant();


-- ─── 5. ROW LEVEL SECURITY (RLS) ──────────────────────────────
-- Regra consistente: SELECT compartilhado no workspace via tem_acesso_workspace,
-- Mutações (INSERT, UPDATE, DELETE) restritas ao owner no workspace.
ALTER TABLE public.produto_equivalencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produto_equivalencias_select_policy" ON public.produto_equivalencias;
CREATE POLICY "produto_equivalencias_select_policy"
  ON public.produto_equivalencias
  FOR SELECT
  TO authenticated
  USING (public.tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "produto_equivalencias_insert_policy" ON public.produto_equivalencias;
CREATE POLICY "produto_equivalencias_insert_policy"
  ON public.produto_equivalencias
  FOR INSERT
  TO authenticated
  WITH CHECK (public.tem_acesso_workspace(workspace_id) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "produto_equivalencias_update_policy" ON public.produto_equivalencias;
CREATE POLICY "produto_equivalencias_update_policy"
  ON public.produto_equivalencias
  FOR UPDATE
  TO authenticated
  USING (public.tem_acesso_workspace(workspace_id) AND auth.uid() = user_id)
  WITH CHECK (public.tem_acesso_workspace(workspace_id) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "produto_equivalencias_delete_policy" ON public.produto_equivalencias;
CREATE POLICY "produto_equivalencias_delete_policy"
  ON public.produto_equivalencias
  FOR DELETE
  TO authenticated
  USING (public.tem_acesso_workspace(workspace_id) AND auth.uid() = user_id);


-- ─── 6. ATUALIZAÇÃO DE historico_custo_produto ────────────────
-- Adiciona a chave canônica local para futuras consultas determinísticas.
-- Registros legados permanecem intactos com NULL (NENHUM backfill fuzzy/automático).
ALTER TABLE public.historico_custo_produto
  ADD COLUMN IF NOT EXISTS produto_eyemobile_uuid UUID NULL
  REFERENCES public.produtos_eyemobile(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_historico_custo_produto_eyemobile_uuid
  ON public.historico_custo_produto(workspace_id, produto_eyemobile_uuid)
  WHERE produto_eyemobile_uuid IS NOT NULL;

-- Proteção cross-workspace / tenant para historico_custo_produto
CREATE OR REPLACE FUNCTION public.validar_historico_custo_produto_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prod_workspace_id UUID;
  v_prod_user_id UUID;
BEGIN
  IF NEW.produto_eyemobile_uuid IS NOT NULL THEN
    SELECT workspace_id, user_id
    INTO v_prod_workspace_id, v_prod_user_id
    FROM public.produtos_eyemobile
    WHERE id = NEW.produto_eyemobile_uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto Eyemobile % não encontrado em public.produtos_eyemobile', NEW.produto_eyemobile_uuid;
    END IF;

    IF v_prod_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'Workspace mismatch: o produto % pertence ao workspace %, mas o histórico de custo pertence ao workspace %',
        NEW.produto_eyemobile_uuid, v_prod_workspace_id, NEW.workspace_id;
    END IF;

    IF v_prod_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'User mismatch: o produto % pertence ao usuário %, mas o histórico de custo foi criado pelo usuário %',
        NEW.produto_eyemobile_uuid, v_prod_user_id, NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_historico_custo_produto_tenant() FROM public;
GRANT EXECUTE ON FUNCTION public.validar_historico_custo_produto_tenant() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validar_historico_custo_produto_tenant ON public.historico_custo_produto;
CREATE TRIGGER trg_validar_historico_custo_produto_tenant
  BEFORE INSERT OR UPDATE OF workspace_id, user_id, produto_eyemobile_uuid
  ON public.historico_custo_produto
  FOR EACH ROW EXECUTE FUNCTION public.validar_historico_custo_produto_tenant();
