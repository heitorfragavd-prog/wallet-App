-- ============================================================================
-- Migration 70: Importação Segura e Atômica de Fatura de Cartão de Crédito
-- ============================================================================

-- 1. Colunas em fatura_cartao_importacoes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fatura_cartao_importacoes' AND column_name = 'total_lancamentos') THEN
    ALTER TABLE public.fatura_cartao_importacoes ADD COLUMN total_lancamentos NUMERIC(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fatura_cartao_importacoes' AND column_name = 'ajustes_fatura') THEN
    ALTER TABLE public.fatura_cartao_importacoes ADD COLUMN ajustes_fatura NUMERIC(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fatura_cartao_importacoes' AND column_name = 'hash_documento') THEN
    ALTER TABLE public.fatura_cartao_importacoes ADD COLUMN hash_documento TEXT;
  END IF;
END $$;

-- 2. Colunas em transacoes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'importacao_id') THEN
    ALTER TABLE public.transacoes ADD COLUMN importacao_id UUID REFERENCES public.fatura_cartao_importacoes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'hash_importacao') THEN
    ALTER TABLE public.transacoes ADD COLUMN hash_importacao TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'numero_linha_importacao') THEN
    ALTER TABLE public.transacoes ADD COLUMN numero_linha_importacao INT;
  END IF;
END $$;

-- 3. Índices de integridade e desempenho
CREATE UNIQUE INDEX IF NOT EXISTS idx_fatura_documento_unico
ON public.fatura_cartao_importacoes (
  workspace_id,
  conta_id,
  hash_documento
)
WHERE hash_documento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transacoes_importacao_id
ON public.transacoes (importacao_id);

CREATE INDEX IF NOT EXISTS idx_transacoes_cartao_mes
ON public.transacoes (cartao_id, mes_referencia);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_hash_unique
ON public.transacoes (
  workspace_id,
  cartao_id,
  mes_referencia,
  hash_importacao
)
WHERE hash_importacao IS NOT NULL;

-- 4. Função RPC Atômica e Protegida (SECURITY DEFINER com search_path seguro)
CREATE OR REPLACE FUNCTION public.importar_fatura_atomica(
  p_user_id UUID,
  p_workspace_id UUID,
  p_cartao_id UUID,
  p_mes_referencia TEXT,
  p_vencimento DATE,
  p_total_lancamentos NUMERIC,
  p_total_fatura NUMERIC,
  p_ajustes_fatura NUMERIC,
  p_hash_documento TEXT,
  p_transacoes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_importacao_id UUID;
  v_item RECORD;
  v_count INT := 0;
  v_conta_existe BOOLEAN;
BEGIN
  -- Validar parâmetros essenciais
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não especificado para importação';
  END IF;

  IF p_cartao_id IS NULL THEN
    RAISE EXCEPTION 'Cartão não especificado para importação';
  END IF;

  IF p_mes_referencia IS NULL OR p_mes_referencia !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Mês de referência inválido. Formato esperado: YYYY-MM';
  END IF;

  IF p_transacoes IS NULL OR jsonb_array_length(p_transacoes) = 0 THEN
    RAISE EXCEPTION 'Nenhuma transação fornecida para importação';
  END IF;

  -- Validar se o chamador autenticado é o próprio usuário (Defesa em Profundidade)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Acesso negado: você não pode importar dados para outro usuário';
  END IF;

  -- Validar se o cartão pertence ao usuário autenticado
  SELECT EXISTS(
    SELECT 1 FROM public.contas_usuario
    WHERE id = p_cartao_id AND user_id = p_user_id
  ) INTO v_conta_existe;

  IF NOT v_conta_existe THEN
    RAISE EXCEPTION 'Cartão não encontrado ou não pertence ao usuário';
  END IF;

  -- Validar se documento idêntico já foi importado no cartão/workspace
  IF p_hash_documento IS NOT NULL THEN
    IF EXISTS(
      SELECT 1 FROM public.fatura_cartao_importacoes
      WHERE conta_id = p_cartao_id
        AND hash_documento = p_hash_documento
        AND (workspace_id IS NOT DISTINCT FROM p_workspace_id)
    ) THEN
      RAISE EXCEPTION 'Esta fatura já foi importada anteriormente (hash duplicado)';
    END IF;
  END IF;

  -- 1. Criar registro de cabeçalho da importação
  INSERT INTO public.fatura_cartao_importacoes (
    user_id,
    workspace_id,
    conta_id,
    mes_referencia,
    vencimento,
    total_lancamentos,
    total_fatura,
    ajustes_fatura,
    hash_documento,
    hash_transacoes,
    transacoes_criadas
  ) VALUES (
    p_user_id,
    p_workspace_id,
    p_cartao_id,
    p_mes_referencia,
    p_vencimento,
    p_total_lancamentos,
    p_total_fatura,
    p_ajustes_fatura,
    p_hash_documento,
    p_hash_documento,
    jsonb_array_length(p_transacoes)
  )
  RETURNING id INTO v_importacao_id;

  -- 2. Inserir todas as transações vinculadas ao importacao_id
  FOR v_item IN
    SELECT 
      (elem->>'data')::DATE AS data_transacao,
      (elem->>'descricao')::TEXT AS descricao,
      (elem->>'valor')::NUMERIC(15,2) AS valor,
      (elem->>'categoria_id')::UUID AS categoria_id,
      (elem->>'parcela_atual')::INT AS parcela_atual,
      (elem->>'total_parcelas')::INT AS total_parcelas,
      (elem->>'numero_linha')::INT AS numero_linha,
      (elem->>'hash_importacao')::TEXT AS hash_importacao
    FROM jsonb_array_elements(p_transacoes) AS elem
  LOOP
    IF v_item.valor IS NULL OR v_item.valor <= 0 THEN
      RAISE EXCEPTION 'Valor da transação inválido: % na linha %', v_item.descricao, v_item.numero_linha;
    END IF;

    IF v_item.data_transacao IS NULL THEN
      RAISE EXCEPTION 'Data da transação inválida para: %', v_item.descricao;
    END IF;

    INSERT INTO public.transacoes (
      user_id,
      workspace_id,
      tipo,
      descricao,
      valor,
      data,
      mes_referencia,
      categoria_id,
      cartao_id,
      conta_id,
      metodo_pagamento,
      parcela_atual,
      total_parcelas,
      importacao_id,
      hash_importacao,
      numero_linha_importacao
    ) VALUES (
      p_user_id,
      p_workspace_id,
      'despesa',
      CASE 
        WHEN v_item.total_parcelas IS NOT NULL AND v_item.total_parcelas > 1 
        THEN v_item.descricao || ' (' || COALESCE(v_item.parcela_atual, 1) || '/' || v_item.total_parcelas || ')'
        ELSE v_item.descricao
      END,
      v_item.valor, -- Salva estritamente o valor mensal da parcela exibido no PDF
      v_item.data_transacao,
      p_mes_referencia,
      v_item.categoria_id,
      p_cartao_id,
      p_cartao_id,
      'cartao_credito',
      v_item.parcela_atual,
      v_item.total_parcelas,
      v_importacao_id,
      v_item.hash_importacao,
      v_item.numero_linha
    );

    v_count := v_count + 1;
  END LOOP;

  -- 3. Retornar resumo da importação com sucesso
  RETURN jsonb_build_object(
    'success', true,
    'importacao_id', v_importacao_id,
    'transacoes_criadas', v_count,
    'total_fatura', p_total_fatura,
    'total_lancamentos', p_total_lancamentos,
    'ajustes_fatura', p_ajustes_fatura
  );
END;
$$;

-- 5. Permissões de Segurança estritas
REVOKE ALL ON FUNCTION public.importar_fatura_atomica(UUID, UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_fatura_atomica(UUID, UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated, service_role;
