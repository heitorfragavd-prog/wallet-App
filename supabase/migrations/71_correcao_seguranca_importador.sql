-- ============================================================================
-- Migration 71: Correção de Segurança e Integridade Definitiva do Importador de Faturas
-- ============================================================================

-- 1. Garantir coluna workspace_id na tabela contas_usuario
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'contas_usuario' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.contas_usuario 
    ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Recriação dos Índices Únicos para suporte estrito a workspace_id IS NULL e IS NOT NULL
DROP INDEX IF EXISTS public.idx_fatura_documento_unico;
DROP INDEX IF EXISTS public.idx_fatura_documento_unico_ws;
DROP INDEX IF EXISTS public.idx_fatura_documento_unico_no_ws;

CREATE UNIQUE INDEX idx_fatura_documento_unico_ws
ON public.fatura_cartao_importacoes (workspace_id, conta_id, hash_documento)
WHERE workspace_id IS NOT NULL AND hash_documento IS NOT NULL;

CREATE UNIQUE INDEX idx_fatura_documento_unico_no_ws
ON public.fatura_cartao_importacoes (conta_id, hash_documento)
WHERE workspace_id IS NULL AND hash_documento IS NOT NULL;

DROP INDEX IF EXISTS public.idx_transacoes_hash_unique;
DROP INDEX IF EXISTS public.idx_transacoes_hash_unique_ws;
DROP INDEX IF EXISTS public.idx_transacoes_hash_unique_no_ws;

CREATE UNIQUE INDEX idx_transacoes_hash_unique_ws
ON public.transacoes (workspace_id, cartao_id, mes_referencia, hash_importacao)
WHERE workspace_id IS NOT NULL AND hash_importacao IS NOT NULL;

CREATE UNIQUE INDEX idx_transacoes_hash_unique_no_ws
ON public.transacoes (cartao_id, mes_referencia, hash_importacao)
WHERE workspace_id IS NULL AND hash_importacao IS NOT NULL;

-- 3. Drop de versões anteriores da RPC
DROP FUNCTION IF EXISTS public.importar_fatura_atomica(UUID, UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.importar_fatura_atomica(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB);

-- 4. Nova RPC Segura com validações completas
CREATE OR REPLACE FUNCTION public.importar_fatura_atomica(
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
  v_user_id UUID := auth.uid();
  v_importacao_id UUID;
  v_item RECORD;
  v_count INT := 0;
  v_cartao_valido BOOLEAN;
  v_soma_lancamentos NUMERIC(15,2);
  v_total_linhas INT;
  v_distinct_hashes INT;
  v_distinct_linhas INT;
  v_categoria_valida BOOLEAN;
BEGIN
  -- A. Autenticação estrita no banco
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado no Supabase';
  END IF;

  -- B. Validação de Cartão e Vínculo com Workspace
  IF p_cartao_id IS NULL THEN
    RAISE EXCEPTION 'Cartão não especificado para importação';
  END IF;

  IF p_workspace_id IS NOT NULL THEN
    -- Validar que o workspace pertence ao usuário
    IF NOT EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = p_workspace_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Workspace inválido ou não pertence ao usuário autenticado';
    END IF;

    -- Validar que o cartão pertence ao usuário E ao workspace informado
    SELECT EXISTS(
      SELECT 1 FROM public.contas_usuario
      WHERE id = p_cartao_id 
        AND user_id = v_user_id 
        AND (workspace_id = p_workspace_id OR workspace_id IS NULL)
    ) INTO v_cartao_valido;

    IF NOT v_cartao_valido THEN
      RAISE EXCEPTION 'Cartão não encontrado ou não pertence ao workspace informado';
    END IF;
  ELSE
    -- Escopo pessoal: validar cartão do usuário
    SELECT EXISTS(
      SELECT 1 FROM public.contas_usuario
      WHERE id = p_cartao_id 
        AND user_id = v_user_id 
        AND workspace_id IS NULL
    ) INTO v_cartao_valido;

    IF NOT v_cartao_valido THEN
      RAISE EXCEPTION 'Cartão não encontrado ou pertence a um workspace corporativo';
    END IF;
  END IF;

  -- C. Validação de Competência (estritamente YYYY-MM de 01 a 12)
  IF p_mes_referencia IS NULL OR p_mes_referencia !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mês de referência inválido: %. Formato esperado: YYYY-MM (01 a 12)', p_mes_referencia;
  END IF;

  -- D. Validação de Formato SHA-256 do Hash do Documento (64 caracteres hexadecimais)
  IF p_hash_documento IS NULL OR p_hash_documento !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Hash do documento inválido ou ausente. Formato esperado: SHA-256 hexadecimal (64 caracteres)';
  END IF;

  -- E. Validação de Estrutura do JSON
  IF p_transacoes IS NULL OR jsonb_typeof(p_transacoes) != 'array' OR jsonb_array_length(p_transacoes) = 0 THEN
    RAISE EXCEPTION 'Array de transações inválido ou vazio';
  END IF;

  v_total_linhas := jsonb_array_length(p_transacoes);

  -- F. Validação de Unicidade Interna dos Hashes e Números de Linha no JSON
  SELECT COUNT(DISTINCT (elem->>'hash_importacao')), COUNT(DISTINCT (elem->>'numero_linha'))
  INTO v_distinct_hashes, v_distinct_linhas
  FROM jsonb_array_elements(p_transacoes) elem;

  IF v_distinct_hashes != v_total_linhas THEN
    RAISE EXCEPTION 'Detectada repetição de hash_importacao dentro do mesmo lote enviado';
  END IF;

  IF v_distinct_linhas != v_total_linhas THEN
    RAISE EXCEPTION 'Detectada repetição de numero_linha dentro do mesmo lote enviado';
  END IF;

  -- G. Recálculo dos Totais no Banco de Dados
  SELECT COALESCE(SUM((elem->>'valor')::NUMERIC(15,2)), 0)
  INTO v_soma_lancamentos
  FROM jsonb_array_elements(p_transacoes) elem;

  IF ABS(v_soma_lancamentos - COALESCE(p_total_lancamentos, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Divergência financeira: soma dos itens calculada no banco (R$ %) difere do total de lançamentos informado (R$ %)', 
      v_soma_lancamentos, p_total_lancamentos;
  END IF;

  IF ABS((COALESCE(p_total_lancamentos, 0) + COALESCE(p_ajustes_fatura, 0)) - COALESCE(p_total_fatura, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Divergência na fatura: total informado (R$ %) difere da soma de lançamentos (R$ %) + ajustes (R$ %)', 
      p_total_fatura, p_total_lancamentos, p_ajustes_fatura;
  END IF;

  -- H. Verificação de Duplicidade de Documento no Banco (bloqueio atômico)
  IF p_workspace_id IS NOT NULL THEN
    IF EXISTS(
      SELECT 1 FROM public.fatura_cartao_importacoes
      WHERE conta_id = p_cartao_id
        AND workspace_id = p_workspace_id
        AND hash_documento = p_hash_documento
    ) THEN
      RAISE EXCEPTION 'Esta fatura já foi importada anteriormente no workspace (hash duplicado)';
    END IF;
  ELSE
    IF EXISTS(
      SELECT 1 FROM public.fatura_cartao_importacoes
      WHERE conta_id = p_cartao_id
        AND workspace_id IS NULL
        AND hash_documento = p_hash_documento
    ) THEN
      RAISE EXCEPTION 'Esta fatura já foi importada anteriormente no escopo pessoal (hash duplicado)';
    END IF;
  END IF;

  -- 1. Inserção do Cabeçalho Oficial
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
    v_user_id,
    p_workspace_id,
    p_cartao_id,
    p_mes_referencia,
    p_vencimento,
    p_total_lancamentos,
    p_total_fatura,
    p_ajustes_fatura,
    p_hash_documento,
    p_hash_documento,
    v_total_linhas
  )
  RETURNING id INTO v_importacao_id;

  -- 2. Inserção das Transações
  FOR v_item IN
    SELECT 
      (elem->>'data')::DATE AS data_transacao,
      trim(elem->>'descricao') AS descricao,
      (elem->>'valor')::NUMERIC(15,2) AS valor,
      (elem->>'categoria_id')::UUID AS categoria_id,
      (elem->>'parcela_atual')::INT AS parcela_atual,
      (elem->>'total_parcelas')::INT AS total_parcelas,
      (elem->>'numero_linha')::INT AS numero_linha,
      (elem->>'hash_importacao')::TEXT AS hash_importacao
    FROM jsonb_array_elements(p_transacoes) AS elem
  LOOP
    IF v_item.descricao IS NULL OR length(v_item.descricao) = 0 THEN
      RAISE EXCEPTION 'Descrição inválida ou vazia na linha %', v_item.numero_linha;
    END IF;

    IF v_item.valor IS NULL OR v_item.valor <= 0 THEN
      RAISE EXCEPTION 'Valor da transação inválido: % na linha %', v_item.descricao, v_item.numero_linha;
    END IF;

    IF v_item.data_transacao IS NULL THEN
      RAISE EXCEPTION 'Data da transação inválida para: % na linha %', v_item.descricao, v_item.numero_linha;
    END IF;

    IF v_item.numero_linha IS NULL OR v_item.numero_linha <= 0 THEN
      RAISE EXCEPTION 'Número de linha inválido para: %', v_item.descricao;
    END IF;

    IF v_item.hash_importacao IS NULL OR v_item.hash_importacao !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Hash de importação inválido na linha %. Formato esperado: SHA-256 (64 hex)', v_item.numero_linha;
    END IF;

    -- Validação de integridade de parcelamento
    IF (v_item.parcela_atual IS NOT NULL AND v_item.total_parcelas IS NULL) OR
       (v_item.parcela_atual IS NULL AND v_item.total_parcelas IS NOT NULL) THEN
      RAISE EXCEPTION 'Parcelamento incompleto na linha %: informe parcela atual e total de parcelas', v_item.numero_linha;
    END IF;

    IF v_item.parcela_atual IS NOT NULL AND (v_item.parcela_atual < 1 OR v_item.total_parcelas < v_item.parcela_atual) THEN
      RAISE EXCEPTION 'Parcelamento inválido (%/%) na linha %', v_item.parcela_atual, v_item.total_parcelas, v_item.numero_linha;
    END IF;

    -- Validação de categoria (se informada)
    IF v_item.categoria_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.categorias 
        WHERE id = v_item.categoria_id AND (user_id = v_user_id OR user_id IS NULL)
      ) INTO v_categoria_valida;

      IF NOT v_categoria_valida THEN
        RAISE EXCEPTION 'Categoria inválida ou não pertencente ao usuário na linha %', v_item.numero_linha;
      END IF;
    END IF;

    -- Semântica correta: cartao_id preenchido com o cartão, conta_id permanece NULL
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
      v_user_id,
      p_workspace_id,
      'despesa',
      CASE 
        WHEN v_item.total_parcelas IS NOT NULL AND v_item.total_parcelas > 1 
        THEN v_item.descricao || ' (' || COALESCE(v_item.parcela_atual, 1) || '/' || v_item.total_parcelas || ')'
        ELSE v_item.descricao
      END,
      v_item.valor,
      v_item.data_transacao,
      p_mes_referencia,
      v_item.categoria_id,
      p_cartao_id,
      NULL, -- conta_id permanece NULL para transações de cartão de crédito
      'cartao_credito',
      v_item.parcela_atual,
      v_item.total_parcelas,
      v_importacao_id,
      v_item.hash_importacao,
      v_item.numero_linha
    );

    v_count := v_count + 1;
  END LOOP;

  -- 3. Retorno com sucesso
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

-- 5. Permissões de Execução
REVOKE ALL ON FUNCTION public.importar_fatura_atomica(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_fatura_atomica(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
