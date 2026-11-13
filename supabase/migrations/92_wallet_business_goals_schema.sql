-- ==============================================================================
-- Migration 92: Schema de Metas Empresariais do Workspace (Wallet CEO 3.0)
-- Etapa 09 - Metas Semanais e Mensais Inteligentes (Gates 1 e 2)
-- ==============================================================================

-- 1. Criação da tabela de metas empresariais segregada de metas pessoais
CREATE TABLE IF NOT EXISTS public.wallet_business_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  titulo TEXT NOT NULL,
  indicador VARCHAR(50) NOT NULL CHECK (indicador IN (
    'faturamento',
    'pedidos',
    'ticket_medio',
    'despesas',
    'resultado_operacional',
    'margem',
    'produto_categoria',
    'combos'
  )),
  periodo_tipo VARCHAR(20) NOT NULL CHECK (periodo_tipo IN ('semanal', 'mensal')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER CHECK (mes IS NULL OR (mes >= 1 AND mes <= 12)),
  semana_do_ano INTEGER CHECK (semana_do_ano IS NULL OR (semana_do_ano >= 1 AND semana_do_ano <= 53)),
  valor_alvo NUMERIC NOT NULL CHECK (valor_alvo >= 0),
  valor_realizado NUMERIC NOT NULL DEFAULT 0,
  unidade VARCHAR(20) NOT NULL DEFAULT 'BRL' CHECK (unidade IN ('BRL', 'quantidade', 'percentual')),
  categoria_ou_produto TEXT,
  eyemobile_product_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'pausada', 'cancelada')),
  descricao TEXT,
  observacoes TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_business_goals_dates_check CHECK (data_fim >= data_inicio)
);

-- 2. Índices de performance por workspace, período e indicador
CREATE INDEX IF NOT EXISTS idx_wallet_business_goals_ws_period 
  ON public.wallet_business_goals (workspace_id, periodo_tipo, status, data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_wallet_business_goals_indicador
  ON public.wallet_business_goals (workspace_id, indicador);

-- 3. Trigger de imutabilidade e governança executiva
CREATE OR REPLACE FUNCTION public.validar_wallet_business_goals_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: o workspace_id é obrigatório para metas empresariais.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Apenas o proprietário ou administrador executivo pode criar metas empresariais
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace pode cadastrar metas empresariais.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Imutabilidade do workspace_id
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de uma meta empresarial.';
    END IF;

    -- Apenas proprietário executivo pode alterar metas
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace tem permissão para alterar metas empresariais.';
    END IF;

    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.tem_acesso_executivo_proprietario(OLD.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário do workspace tem permissão para remover metas empresariais.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_wallet_business_goals ON public.wallet_business_goals;
CREATE TRIGGER trg_validar_wallet_business_goals
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallet_business_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_wallet_business_goals_governance();

-- 4. Habilitar RLS
ALTER TABLE public.wallet_business_goals ENABLE ROW LEVEL SECURITY;

-- Política de leitura: membros do workspace podem consultar
DROP POLICY IF EXISTS "wallet_business_goals_select" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_select"
  ON public.wallet_business_goals
  FOR SELECT
  USING (
    coalesce(auth.role() = 'service_role', false)
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = wallet_business_goals.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wallet_business_goals.workspace_id
        AND wm.user_id = auth.uid()
        AND coalesce(wm.active, true) = true
    )
  );

-- Políticas de mutação (INSERT, UPDATE, DELETE): apenas proprietário
DROP POLICY IF EXISTS "wallet_business_goals_insert" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_insert"
  ON public.wallet_business_goals
  FOR INSERT
  WITH CHECK (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );

DROP POLICY IF EXISTS "wallet_business_goals_update" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_update"
  ON public.wallet_business_goals
  FOR UPDATE
  USING (
    public.tem_acesso_executivo_proprietario(workspace_id)
  )
  WITH CHECK (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );

DROP POLICY IF EXISTS "wallet_business_goals_delete" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_delete"
  ON public.wallet_business_goals
  FOR DELETE
  USING (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );
