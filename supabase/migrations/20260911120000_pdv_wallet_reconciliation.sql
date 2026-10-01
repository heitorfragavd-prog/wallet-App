-- Migration: Conciliação PDV -> Carteira (Fatia 1)
-- Versão: 20260911120000_pdv_wallet_reconciliation.sql
-- Descrição:
-- 1. Cria tabela `pdv_conciliacoes` com campos monetários estritamente em BIGINT (centavos).
-- 2. Índice único `(workspace_id, external_transaction_id)` garantindo idempotência multi-tenant.
-- 3. RLS habilitado e configurado via `public.tem_acesso_workspace(workspace_id)`.
-- 4. RPC atômica `public.reconcile_pdv_transaction` com `SECURITY DEFINER` e `SET search_path = public, pg_temp`.
-- 5. Validação rigorosa de pertencimento da carteira (`contas_usuario`) ao workspace e permissão do usuário.

-- 1. Criação da tabela de conciliação PDV -> Carteira
CREATE TABLE IF NOT EXISTS public.pdv_conciliacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  external_transaction_id TEXT NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.contas_usuario(id) ON DELETE RESTRICT,
  gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents >= 0),
  fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  net_amount_cents BIGINT NOT NULL CHECK (net_amount_cents >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  payment_method TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'conciliada' CHECK (status IN ('pendente', 'conciliada', 'estornada', 'falha')),
  reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transacao_receita_id UUID REFERENCES public.transacoes(id) ON DELETE SET NULL,
  transacao_taxa_id UUID REFERENCES public.transacoes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Invariante contábil: valor líquido deve ser igual ao valor bruto subtraído da taxa
  CONSTRAINT pdv_conciliacoes_amounts_check CHECK (net_amount_cents = (gross_amount_cents - fee_cents))
);

-- 2. Índice único para garantia de idempotência estrita por workspace (multi-tenant)
CREATE UNIQUE INDEX IF NOT EXISTS pdv_conciliacoes_workspace_external_uidx
  ON public.pdv_conciliacoes (workspace_id, external_transaction_id);

-- Índices secundários para performance em relatórios e auditorias
CREATE INDEX IF NOT EXISTS idx_pdv_conciliacoes_wallet_occurred
  ON public.pdv_conciliacoes (wallet_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdv_conciliacoes_workspace_status
  ON public.pdv_conciliacoes (workspace_id, status);

-- 3. Habilitação de RLS
ALTER TABLE public.pdv_conciliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários visualizam conciliações do seu workspace" ON public.pdv_conciliacoes;
CREATE POLICY "Usuários visualizam conciliações do seu workspace"
  ON public.pdv_conciliacoes FOR SELECT
  TO authenticated
  USING (public.tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "Usuários inserem conciliações no seu workspace" ON public.pdv_conciliacoes;
CREATE POLICY "Usuários inserem conciliações no seu workspace"
  ON public.pdv_conciliacoes FOR INSERT
  TO authenticated
  WITH CHECK (public.tem_acesso_workspace(workspace_id));

DROP POLICY IF EXISTS "Usuários atualizam conciliações do seu workspace" ON public.pdv_conciliacoes;
CREATE POLICY "Usuários atualizam conciliações do seu workspace"
  ON public.pdv_conciliacoes FOR UPDATE
  TO authenticated
  USING (public.tem_acesso_workspace(workspace_id))
  WITH CHECK (public.tem_acesso_workspace(workspace_id));

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS update_pdv_conciliacoes_updated_at ON public.pdv_conciliacoes;
CREATE TRIGGER update_pdv_conciliacoes_updated_at
  BEFORE UPDATE ON public.pdv_conciliacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC atômica e idempotente de conciliação PDV
CREATE OR REPLACE FUNCTION public.reconcile_pdv_transaction(
  p_external_id TEXT,
  p_wallet_id UUID,
  p_gross_amount_cents BIGINT,
  p_fee_cents BIGINT,
  p_net_amount_cents BIGINT,
  p_occurred_at TIMESTAMPTZ,
  p_payment_method TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wallet_record RECORD;
  v_workspace_id UUID;
  v_existing_conciliacao RECORD;
  v_conciliacao_id UUID;
  v_transacao_receita_id UUID;
  v_transacao_taxa_id UUID;
  v_gross_decimal NUMERIC(15,2);
  v_fee_decimal NUMERIC(15,2);
  v_occurred_date DATE;
  v_default_receita_cat UUID;
  v_default_taxa_cat UUID;
BEGIN
  -- A. Validação de autenticação
  IF v_user_id IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado no Supabase';
  END IF;

  -- B. Validação de parâmetros obrigatórios
  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION 'ID externo da transação PDV é obrigatório';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'ID da carteira (conta) é obrigatório';
  END IF;

  IF p_gross_amount_cents IS NULL OR p_gross_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor bruto em centavos inválido';
  END IF;

  IF p_fee_cents IS NULL OR p_fee_cents < 0 THEN
    RAISE EXCEPTION 'Valor da taxa em centavos inválido';
  END IF;

  IF p_net_amount_cents IS NULL OR p_net_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor líquido em centavos inválido';
  END IF;

  -- Invariante contábil estrita
  IF p_net_amount_cents <> (p_gross_amount_cents - p_fee_cents) THEN
    RAISE EXCEPTION 'Invariante violada: net_amount_cents (%) deve ser igual a gross_amount_cents (%) - fee_cents (%)',
      p_net_amount_cents, p_gross_amount_cents, p_fee_cents;
  END IF;

  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Data/hora da ocorrência é obrigatória';
  END IF;

  -- C. Validação de Carteira e Autorização Anti-IDOR
  SELECT id, user_id, workspace_id, tipo, saldo_atual
  INTO v_wallet_record
  FROM public.contas_usuario
  WHERE id = p_wallet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carteira especificada (ID: %) não foi encontrada', p_wallet_id;
  END IF;

  v_workspace_id := v_wallet_record.workspace_id;

  -- Se a carteira não possuir workspace_id, deduzir pelo default do proprietário
  IF v_workspace_id IS NULL THEN
    SELECT id INTO v_workspace_id
    FROM public.workspaces
    WHERE user_id = v_wallet_record.user_id AND is_default = true
    LIMIT 1;

    IF v_workspace_id IS NULL THEN
      SELECT id INTO v_workspace_id
      FROM public.workspaces
      WHERE user_id = v_wallet_record.user_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Impossível determinar o workspace vinculado à carteira %', p_wallet_id;
  END IF;

  -- Validação estrita de autorização multi-tenant no workspace (anti-IDOR)
  IF NOT public.tem_acesso_workspace(v_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não tem permissão para operar no workspace desta carteira';
  END IF;

  -- D. Verificação de idempotência estrita
  SELECT id, status, transacao_receita_id, transacao_taxa_id, gross_amount_cents, fee_cents, net_amount_cents
  INTO v_existing_conciliacao
  FROM public.pdv_conciliacoes
  WHERE workspace_id = v_workspace_id
    AND external_transaction_id = p_external_id;

  IF FOUND THEN
    -- Transação já foi conciliada anteriormente de forma idempotente
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_reconciled',
      'idempotent', true,
      'conciliacao_id', v_existing_conciliacao.id,
      'workspace_id', v_workspace_id,
      'external_id', p_external_id,
      'transacao_receita_id', v_existing_conciliacao.transacao_receita_id,
      'transacao_taxa_id', v_existing_conciliacao.transacao_taxa_id,
      'net_amount_cents', v_existing_conciliacao.net_amount_cents
    );
  END IF;

  -- E. Conversão segura de centavos para numeric da tabela transacoes
  v_gross_decimal := ROUND((p_gross_amount_cents::NUMERIC / 100.0), 2);
  v_fee_decimal   := ROUND((p_fee_cents::NUMERIC / 100.0), 2);
  v_occurred_date := (p_occurred_at AT TIME ZONE 'America/Sao_Paulo')::DATE;

  -- Buscar categorias padrão configuradas se existirem no Eyemobile
  SELECT default_categoria_receita_id, default_categoria_taxa_id
  INTO v_default_receita_cat, v_default_taxa_cat
  FROM public.eyemobile_config
  WHERE user_id = v_wallet_record.user_id
  LIMIT 1;

  -- Inserir transação de receita (bruta) se houver valor positivo
  IF v_gross_decimal > 0 THEN
    INSERT INTO public.transacoes (
      user_id,
      workspace_id,
      conta_id,
      categoria_id,
      tipo,
      descricao,
      valor,
      data,
      metodo_pagamento,
      observacoes,
      created_at
    ) VALUES (
      v_wallet_record.user_id,
      v_workspace_id,
      p_wallet_id,
      v_default_receita_cat,
      'receita',
      'Venda PDV #' || p_external_id,
      v_gross_decimal,
      v_occurred_date,
      LOWER(COALESCE(p_payment_method, 'outros')),
      'Conciliação automática PDV | ExtID: ' || p_external_id,
      p_occurred_at
    )
    RETURNING id INTO v_transacao_receita_id;
  END IF;

  -- Inserir transação de despesa (taxa de máquina/operação) se houver taxa
  IF v_fee_decimal > 0 THEN
    INSERT INTO public.transacoes (
      user_id,
      workspace_id,
      conta_id,
      categoria_id,
      tipo,
      descricao,
      valor,
      data,
      metodo_pagamento,
      observacoes,
      created_at
    ) VALUES (
      v_wallet_record.user_id,
      v_workspace_id,
      p_wallet_id,
      v_default_taxa_cat,
      'despesa',
      'Taxa PDV #' || p_external_id,
      v_fee_decimal,
      v_occurred_date,
      LOWER(COALESCE(p_payment_method, 'outros')),
      'Taxa de operação PDV | ExtID: ' || p_external_id,
      p_occurred_at
    )
    RETURNING id INTO v_transacao_taxa_id;
  END IF;

  -- F. Registrar o registro de conciliação auditável com constraint única
  INSERT INTO public.pdv_conciliacoes (
    workspace_id,
    external_transaction_id,
    wallet_id,
    gross_amount_cents,
    fee_cents,
    net_amount_cents,
    occurred_at,
    payment_method,
    metadata,
    status,
    reconciled_by,
    transacao_receita_id,
    transacao_taxa_id
  ) VALUES (
    v_workspace_id,
    p_external_id,
    p_wallet_id,
    p_gross_amount_cents,
    p_fee_cents,
    p_net_amount_cents,
    p_occurred_at,
    p_payment_method,
    COALESCE(p_metadata, '{}'::jsonb),
    'conciliada',
    v_user_id,
    v_transacao_receita_id,
    v_transacao_taxa_id
  )
  RETURNING id INTO v_conciliacao_id;

  -- G. Atualização do saldo acumulado da carteira (se coluna existir)
  UPDATE public.contas_usuario
  SET saldo_atual = COALESCE(saldo_atual, 0) + (ROUND((p_net_amount_cents::NUMERIC / 100.0), 2))
  WHERE id = p_wallet_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'reconciled',
    'idempotent', false,
    'conciliacao_id', v_conciliacao_id,
    'workspace_id', v_workspace_id,
    'external_id', p_external_id,
    'gross_amount_cents', p_gross_amount_cents,
    'fee_cents', p_fee_cents,
    'net_amount_cents', p_net_amount_cents,
    'transacao_receita_id', v_transacao_receita_id,
    'transacao_taxa_id', v_transacao_taxa_id
  );
END;
$$;

-- Permissões de execução
REVOKE ALL ON FUNCTION public.reconcile_pdv_transaction(TEXT, UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_pdv_transaction(TEXT, UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, JSONB) TO authenticated, service_role;
