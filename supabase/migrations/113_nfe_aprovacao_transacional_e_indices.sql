-- =============================================================================
-- Migration 113: Operação Transacional Real e Índices para Aprovação de NF-e
-- WALLET CEO 3.0: Gates 1, 2, 3, 4 e 5
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ÍNDICES DE PERFORMANCE E OTIMIZAÇÃO DE EGRESS (GATE 4)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nf_compra_ws_chave 
  ON public.notas_fiscais_compra (workspace_id, chave_acesso);

CREATE INDEX IF NOT EXISTS idx_dividas_ws_doc_fav 
  ON public.dividas (workspace_id, documento_favorecido);

CREATE INDEX IF NOT EXISTS idx_dividas_ws_status 
  ON public.dividas (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_gmail_proc_ws_divida 
  ON public.gmail_mensagens_processadas (workspace_id, divida_id) 
  WHERE divida_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_despesas_ws_status_val 
  ON public.despesas (workspace_id, status, valor, data);

-- -----------------------------------------------------------------------------
-- 2. FUNÇÃO AUXILIAR: GARANTIR NOTA FISCAL DE COMPRA E ITENS (ATÔMICA)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_garantir_nfe_compra_e_itens(
  p_workspace_id UUID,
  p_user_id UUID,
  p_chave_acesso TEXT,
  p_numero_nota TEXT,
  p_fornecedor TEXT,
  p_cnpj_fornecedor TEXT,
  p_valor_total NUMERIC,
  p_valor_produtos NUMERIC,
  p_origem TEXT,
  p_itens JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nf_id UUID;
  v_item JSONB;
BEGIN
  IF p_chave_acesso IS NULL OR trim(p_chave_acesso) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_nf_id
    FROM public.notas_fiscais_compra
   WHERE workspace_id = p_workspace_id
     AND chave_acesso = p_chave_acesso
   LIMIT 1;

  IF v_nf_id IS NULL THEN
    INSERT INTO public.notas_fiscais_compra (
      user_id, workspace_id, numero_nf, fornecedor, cnpj_fornecedor,
      valor_total, valor_produtos, chave_acesso, status, origem
    ) VALUES (
      p_user_id, p_workspace_id, p_numero_nota, p_fornecedor, p_cnpj_fornecedor,
      p_valor_total, COALESCE(p_valor_produtos, p_valor_total), p_chave_acesso, 'aprovada', COALESCE(p_origem, 'gmail')
    ) RETURNING id INTO v_nf_id;
  END IF;

  -- Inserir itens se houver e ainda não existirem
  IF v_nf_id IS NOT NULL AND p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' AND jsonb_array_length(p_itens) > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.nf_itens WHERE nf_id = v_nf_id) THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
        INSERT INTO public.nf_itens (
          nf_id, codigo_produto, descricao, ncm, cfop, unidade,
          quantidade, valor_unitario, valor_total, custo_unitario_liquido,
          status_estoque
        ) VALUES (
          v_nf_id,
          COALESCE(v_item->>'codigoProduto', v_item->>'codigo', ''),
          COALESCE(v_item->>'descricao', ''),
          COALESCE(v_item->>'ncm', ''),
          COALESCE(v_item->>'cfop', ''),
          COALESCE(v_item->>'unidade', 'UN'),
          COALESCE((v_item->>'quantidade')::NUMERIC, 1),
          COALESCE((v_item->>'valorUnitario')::NUMERIC, 0),
          COALESCE((v_item->>'valorTotal')::NUMERIC, 0),
          COALESCE((v_item->>'custoUnitarioLiquido')::NUMERIC, (v_item->>'valorUnitario')::NUMERIC, 0),
          'pendente'
        );
      END LOOP;
    END IF;
  END IF;

  RETURN v_nf_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC PRINCIPAL: APROVAÇÃO ATÔMICA E TRANSAÇÃO REAL NO POSTGRESQL (GATES 1 A 5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_aprovar_nfe_transacional(
  p_workspace_id UUID,
  p_user_id UUID,
  p_chave_acesso TEXT,
  p_numero_nota TEXT,
  p_cnpj_fornecedor TEXT,
  p_razao_social TEXT,
  p_valor_total NUMERIC,
  p_valor_produtos NUMERIC,
  p_data_vencimento DATE,
  p_duplicatas JSONB DEFAULT '[]'::jsonb,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_origem TEXT DEFAULT 'gmail',
  p_ignorar_suspeita BOOLEAN DEFAULT FALSE,
  p_justificativa_excecao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_exec BOOLEAN := FALSE;
  v_is_service_role BOOLEAN := FALSE;
  v_effective_user_id UUID;
  v_clean_cnpj TEXT;
  v_clean_chave TEXT;
  v_clean_num_nota TEXT;
  v_divida_id UUID := NULL;
  v_divida_existente RECORD;
  v_despesa_existente RECORD;
  v_suspeita RECORD;
  v_nf_compra_id UUID := NULL;
  v_dups_count INTEGER := 0;
  v_p1_id UUID := NULL;
  v_ids_criados UUID[] := ARRAY[]::UUID[];
  v_i INTEGER;
  v_dup_item JSONB;
  v_dup_val NUMERIC;
  v_dup_venc DATE;
  v_desc_item TEXT;
BEGIN
  -- 1. IDENTIFICAÇÃO DE PAPEL E SEGURANÇA MULTI-TENANT
  IF current_user = 'postgres' OR COALESCE(auth.role(), '') = 'service_role' THEN
    v_is_service_role := TRUE;
    v_effective_user_id := p_user_id;
  ELSE
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Autenticação necessária para aprovação financeira'
        USING ERRCODE = '42501';
    END IF;

    -- Validar se o usuário é membro ativo do workspace
    IF NOT public.is_active_workspace_member(p_workspace_id, v_caller_id) THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Usuário não é membro ativo deste workspace'
        USING ERRCODE = '42501';
    END IF;

    v_effective_user_id := v_caller_id;
  END IF;

  -- 2. GATE 3: AUTORIZAÇÃO DE EXCEÇÕES DE DUPLICIDADE
  IF p_ignorar_suspeita THEN
    -- Apenas executivos/administradores (owner/admin) podem ignorar suspeita
    IF NOT v_is_service_role THEN
      v_is_exec := public.is_workspace_executive(p_workspace_id, v_effective_user_id);
      IF NOT v_is_exec THEN
        RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Apenas administradores podem autorizar exceção de duplicidade financeira'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Justificativa obrigatória (mínimo 10 caracteres)
    IF p_justificativa_excecao IS NULL OR length(trim(p_justificativa_excecao)) < 10 THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Justificativa obrigatória (mínimo 10 caracteres) para autorizar exceção de duplicidade'
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 3. GATE 4: VALIDAÇÃO DE VENCIMENTO E VALORES (NÃO INVENTAR VENCIMENTOS)
  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Valor total da NF-e deve ser maior que zero'
      USING ERRCODE = '22000';
  END IF;

  IF p_data_vencimento IS NULL THEN
    RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Data de vencimento não comprovada no documento fiscal. Conforme política de segurança financeira (Gate 4), é proibido atribuir vencimentos fictícios. Requer conferência humana da data.'
      USING ERRCODE = '22000';
  END IF;

  v_clean_cnpj := regexp_replace(COALESCE(p_cnpj_fornecedor, ''), '\D', '', 'g');
  v_clean_chave := trim(COALESCE(p_chave_acesso, ''));
  v_clean_num_nota := trim(COALESCE(p_numero_nota, ''));

  -- 4. GATE 2 & GATE 3: DEDUPLICAÇÃO DETERMINÍSTICA FORTE
  -- Match 1: Chave de Acesso (44 dígitos) em dividas
  IF v_clean_chave <> '' THEN
    SELECT id, descricao, valor_total, valor_pago, data_vencimento, status
      INTO v_divida_existente
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND descricao ILIKE '%' || v_clean_chave || '%'
     LIMIT 1;
  END IF;

  -- Match 2: Número da Nota + CNPJ do fornecedor em dividas
  IF v_divida_existente.id IS NULL AND v_clean_num_nota <> '' AND v_clean_cnpj <> '' THEN
    SELECT id, descricao, valor_total, valor_pago, data_vencimento, status
      INTO v_divida_existente
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND regexp_replace(COALESCE(documento_favorecido, ''), '\D', '', 'g') = v_clean_cnpj
       AND (
         descricao ILIKE '%' || v_clean_num_nota || '%'
         OR descricao ILIKE '%NF ' || v_clean_num_nota || '%'
         OR descricao ILIKE '%NF-e ' || v_clean_num_nota || '%'
       )
     LIMIT 1;
  END IF;

  -- Match 3: Vinculação já existente em gmail_mensagens_processadas
  IF v_divida_existente.id IS NULL AND v_clean_chave <> '' THEN
    SELECT d.id, d.descricao, d.valor_total, d.valor_pago, d.data_vencimento, d.status
      INTO v_divida_existente
      FROM public.gmail_mensagens_processadas g
      JOIN public.dividas d ON d.id = g.divida_id
     WHERE g.workspace_id = p_workspace_id
       AND g.divida_id IS NOT NULL
       AND g.detalhes_extracao->>'chave_acesso' = v_clean_chave
     LIMIT 1;
  END IF;

  -- Match 4: Despesa paga existente com mesma chave ou número de nota e CNPJ
  IF v_divida_existente.id IS NULL AND v_clean_chave <> '' THEN
    SELECT id, descricao, valor, data, status
      INTO v_despesa_existente
      FROM public.despesas
     WHERE workspace_id = p_workspace_id
       AND status = 'pago'
       AND (
         observacoes ILIKE '%' || v_clean_chave || '%'
         OR (v_clean_num_nota <> '' AND descricao ILIKE '%' || v_clean_num_nota || '%' AND abs(valor - p_valor_total) < 0.05)
       )
     LIMIT 1;
  END IF;

  -- SE ENCONTROU DÍVIDA CORRESPONDENTE DETERMINÍSTICA:
  IF v_divida_existente.id IS NOT NULL THEN
    -- Preservação de contas quitadas:
    IF v_divida_existente.status IN ('paga', 'quitada') THEN
      -- Atualiza gmail_mensagens_processadas
      IF v_clean_chave <> '' THEN
        UPDATE public.gmail_mensagens_processadas
           SET divida_id = v_divida_existente.id,
               status = 'processado'
         WHERE workspace_id = p_workspace_id
           AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
      END IF;

      -- Persiste nota fiscal e itens para estoque/CMV se não existirem
      v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
        p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
        p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
      );

      RETURN jsonb_build_object(
        'success', true,
        'divida_id', v_divida_existente.id,
        'status', 'already_paid',
        'is_quitada', true,
        'ja_existia', true,
        'message', 'Documento fiscal vinculado com sucesso à dívida quitada existente, preservando o pagamento e histórico.'
      );
    ELSE
      -- Dívida pendente existente: vincula sem duplicar
      IF v_clean_chave <> '' THEN
        UPDATE public.gmail_mensagens_processadas
           SET divida_id = v_divida_existente.id,
               status = 'processado'
         WHERE workspace_id = p_workspace_id
           AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
      END IF;

      v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
        p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
        p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
      );

      RETURN jsonb_build_object(
        'success', true,
        'divida_id', v_divida_existente.id,
        'status', 'already_exists',
        'is_quitada', false,
        'ja_existia', true,
        'message', 'Documento fiscal vinculado à dívida pendente já existente.'
      );
    END IF;
  END IF;

  -- SE ENCONTROU DESPESA PAGA CORRESPONDENTE:
  IF v_despesa_existente.id IS NOT NULL THEN
    v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
      p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
      p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
    );

    RETURN jsonb_build_object(
      'success', true,
      'despesa_id', v_despesa_existente.id,
      'status', 'already_paid',
      'is_quitada', true,
      'ja_existia', true,
      'message', 'Documento fiscal vinculado a pagamento/despesa já liquidado.'
    );
  END IF;

  -- 5. GATE 2: SUSPEITA DE DUPLICIDADE (HEURÍSTICA DE REVISÃO)
  IF NOT p_ignorar_suspeita THEN
    SELECT id, descricao, credor, valor_total, data_vencimento, status
      INTO v_suspeita
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND abs(valor_total - p_valor_total) < 0.05
       AND data_vencimento = p_data_vencimento
       AND (
         (v_clean_cnpj <> '' AND regexp_replace(COALESCE(documento_favorecido, ''), '\D', '', 'g') = v_clean_cnpj)
         OR (p_razao_social <> '' AND credor ILIKE '%' || split_part(p_razao_social, ' ', 1) || '%')
       )
     LIMIT 1;

    IF v_suspeita.id IS NOT NULL THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_SUSPECTED_DUPLICATE: Já existe uma dívida com valor de R$ % e vencimento em % do fornecedor "%" (Status: %, ID: %). Associação automática bloqueada por segurança. Requer conferência humana.'
        , p_valor_total, p_data_vencimento, v_suspeita.credor, v_suspeita.status, v_suspeita.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. GATE 4 & GATE 1: CRIAÇÃO ATÔMICA DA DÍVIDA COM PARCELAMENTO REAL
  IF p_duplicatas IS NOT NULL AND jsonb_typeof(p_duplicatas) = 'array' AND jsonb_array_length(p_duplicatas) > 1 THEN
    v_dups_count := jsonb_array_length(p_duplicatas);

    -- Parcela 1
    v_dup_item := p_duplicatas->0;
    v_dup_val := (v_dup_item->>'valor')::NUMERIC;
    v_dup_venc := (v_dup_item->>'vencimento')::DATE;
    v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — Parcela 1/' || v_dups_count || ' — ' || p_razao_social;
    IF v_clean_chave <> '' THEN
      v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
    END IF;

    INSERT INTO public.dividas (
      user_id, workspace_id, descricao, credor, documento_favorecido,
      valor_total, valor_pago, valor_restante, data_vencimento,
      status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
      parcela_atual, total_parcelas
    ) VALUES (
      v_effective_user_id, p_workspace_id, v_desc_item, p_razao_social, v_clean_cnpj,
      v_dup_val, 0, v_dup_val, v_dup_venc,
      'pendente', 'boleto', v_dups_count, 0,
      1, v_dups_count
    ) RETURNING id INTO v_p1_id;

    v_ids_criados := array_append(v_ids_criados, v_p1_id);

    -- Parcelas 2..N com parent_id = v_p1_id
    FOR v_i IN 1..(v_dups_count - 1) LOOP
      v_dup_item := p_duplicatas->v_i;
      v_dup_val := (v_dup_item->>'valor')::NUMERIC;
      v_dup_venc := (v_dup_item->>'vencimento')::DATE;
      v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — Parcela ' || (v_i + 1) || '/' || v_dups_count || ' — ' || p_razao_social;
      IF v_clean_chave <> '' THEN
        v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
      END IF;

      INSERT INTO public.dividas (
        user_id, workspace_id, parent_id, descricao, credor, documento_favorecido,
        valor_total, valor_pago, valor_restante, data_vencimento,
        status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
        parcela_atual, total_parcelas
      ) VALUES (
        v_effective_user_id, p_workspace_id, v_p1_id, v_desc_item, p_razao_social, v_clean_cnpj,
        v_dup_val, 0, v_dup_val, v_dup_venc,
        'pendente', 'boleto', v_dups_count, 0,
        v_i + 1, v_dups_count
      ) RETURNING id INTO v_divida_id;

      v_ids_criados := array_append(v_ids_criados, v_divida_id);
    END LOOP;

    v_divida_id := v_p1_id;
  ELSE
    -- Parcela Única
    v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — ' || p_razao_social;
    IF v_clean_chave <> '' THEN
      v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
    END IF;

    INSERT INTO public.dividas (
      user_id, workspace_id, descricao, credor, documento_favorecido,
      valor_total, valor_pago, valor_restante, data_vencimento,
      status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
      parcela_atual, total_parcelas
    ) VALUES (
      v_effective_user_id, p_workspace_id, v_desc_item, p_razao_social, v_clean_cnpj,
      p_valor_total, 0, p_valor_total, p_data_vencimento,
      'pendente', 'boleto', 1, 0,
      1, 1
    ) RETURNING id INTO v_divida_id;

    v_ids_criados := array_append(v_ids_criados, v_divida_id);
  END IF;

  -- 7. GATE 1 & GATE 5: PERSISTÊNCIA ATÔMICA DA NOTA E ITENS FISCAIS
  v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
    p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
    p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
  );

  -- 8. VINCULAÇÃO NO GMAIL
  IF v_clean_chave <> '' THEN
    UPDATE public.gmail_mensagens_processadas
       SET divida_id = v_divida_id,
           status = 'processado'
     WHERE workspace_id = p_workspace_id
       AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'divida_id', v_divida_id,
    'dividas_ids', to_jsonb(v_ids_criados),
    'nf_compra_id', v_nf_compra_id,
    'status', 'criada_pendente',
    'total_parcelas', array_length(v_ids_criados, 1),
    'ja_existia', false
  );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.rpc_aprovar_nfe_transacional TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_garantir_nfe_compra_e_itens TO authenticated, service_role;
