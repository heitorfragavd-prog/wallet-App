-- Migration 74: Endurecimento Importador Fatura + Rastreabilidade
-- Adiciona colunas de rastreabilidade e corrige segurança

-- 1. Adicionar colunas de rastreabilidade na tabela transacoes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'importacao_id') THEN
    ALTER TABLE public.transacoes ADD COLUMN importacao_id UUID REFERENCES public.fatura_cartao_importacoes(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'hash_importacao') THEN
    ALTER TABLE public.transacoes ADD COLUMN hash_importacao TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'numero_linha') THEN
    ALTER TABLE public.transacoes ADD COLUMN numero_linha INTEGER;
  END IF;
END $$;

-- Índice para busca rápida por hash de importação
CREATE INDEX IF NOT EXISTS idx_transacoes_hash_importacao 
  ON public.transacoes(hash_importacao) 
  WHERE hash_importacao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transacoes_importacao_id 
  ON public.transacoes(importacao_id) 
  WHERE importacao_id IS NOT NULL;

-- 2. Corrigir RLS da tabela colaborador_escalas (estava permissiva)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_select_all'
  ) THEN
    DROP POLICY "colaborador_escalas_select_all" ON public.colaborador_escalas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_insert_all'
  ) THEN
    DROP POLICY "colaborador_escalas_insert_all" ON public.colaborador_escalas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_update_all'
  ) THEN
    DROP POLICY "colaborador_escalas_update_all" ON public.colaborador_escalas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_delete_all'
  ) THEN
    DROP POLICY "colaborador_escalas_delete_all" ON public.colaborador_escalas;
  END IF;
END $$;

-- Criar políticas seguras baseadas em workspace (via colaborador)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_select_workspace'
  ) THEN
    CREATE POLICY "colaborador_escalas_select_workspace" ON public.colaborador_escalas
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.colaboradores c
          WHERE c.id = colaborador_escalas.colaborador_id
          AND (c.user_id = auth.uid() OR c.workspace_id IN (
            SELECT w.id FROM public.workspaces w 
            WHERE w.user_id = auth.uid()
          ))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_insert_workspace'
  ) THEN
    CREATE POLICY "colaborador_escalas_insert_workspace" ON public.colaborador_escalas
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.colaboradores c
          WHERE c.id = colaborador_escalas.colaborador_id
          AND (c.user_id = auth.uid() OR c.workspace_id IN (
            SELECT w.id FROM public.workspaces w 
            WHERE w.user_id = auth.uid()
          ))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_update_workspace'
  ) THEN
    CREATE POLICY "colaborador_escalas_update_workspace" ON public.colaborador_escalas
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.colaboradores c
          WHERE c.id = colaborador_escalas.colaborador_id
          AND (c.user_id = auth.uid() OR c.workspace_id IN (
            SELECT w.id FROM public.workspaces w 
            WHERE w.user_id = auth.uid()
          ))
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'colaborador_escalas' 
    AND policyname = 'colaborador_escalas_delete_workspace'
  ) THEN
    CREATE POLICY "colaborador_escalas_delete_workspace" ON public.colaborador_escalas
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.colaboradores c
          WHERE c.id = colaborador_escalas.colaborador_id
          AND (c.user_id = auth.uid() OR c.workspace_id IN (
            SELECT w.id FROM public.workspaces w 
            WHERE w.user_id = auth.uid()
          ))
        )
      );
  END IF;
END $$;

-- 3. Garantir workspace_id em colaborador_custos
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'colaborador_custos' AND column_name = 'workspace_id') THEN
    ALTER TABLE public.colaborador_custos ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id);
  END IF;
END $$;

-- Trigger para preencher workspace_id automaticamente a partir do colaborador
CREATE OR REPLACE FUNCTION public.preencher_workspace_id_custo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT c.workspace_id INTO NEW.workspace_id
    FROM public.colaboradores c
    WHERE c.id = NEW.colaborador_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_preencher_workspace_custo'
  ) THEN
    CREATE TRIGGER trigger_preencher_workspace_custo
      BEFORE INSERT ON public.colaborador_custos
      FOR EACH ROW
      EXECUTE FUNCTION public.preencher_workspace_id_custo();
  END IF;
END $$;
