-- Migration: 20261002061000_isolate_divipay_by_workspace.sql
-- Objetivo: SEC-001 - Isolar configurações e transações Divipay por workspace
-- REGRA DE SEGURANÇA: NÃO permite workspace_id NULL nem bypass de tenancy.
-- ATENÇÃO: NUNCA executar automaticamente no ambiente remoto sem autorização explícita do usuário.

-- 1. Adicionar workspace_id na tabela divipay_config
ALTER TABLE public.divipay_config
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Adicionar workspace_id na tabela divipay_transacoes
ALTER TABLE public.divipay_transacoes
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 3. Adicionar workspace_id na tabela divipay_conciliacoes se existir
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

-- 4. Criar índices para busca de alta performance por workspace
CREATE INDEX IF NOT EXISTS idx_divipay_config_workspace ON public.divipay_config(workspace_id);
CREATE INDEX IF NOT EXISTS idx_divipay_transacoes_workspace ON public.divipay_transacoes(workspace_id);

-- 5. Atualizar RLS da tabela divipay_config com isolamento ESTRITO
-- REGRA SEC-001: workspace_id NÃO pode ser NULL para acesso da aplicação.
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

-- 6. Atualizar RLS da tabela divipay_transacoes com isolamento ESTRITO
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

-- 7. Atualizar RLS da tabela divipay_conciliacoes se existir
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
