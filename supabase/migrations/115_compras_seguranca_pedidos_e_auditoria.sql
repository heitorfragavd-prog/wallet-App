-- ==============================================================================
-- MIGRATION 115: SEGURANÇA OPERACIONAL, PROTEÇÃO DE PEDIDOS E VINCULAÇÃO TELEGRAM
-- ETAPA 4D.1 - GATES 4, 5, 6 e 7
-- ==============================================================================

-- 1. Colunas de governança e proteção manual em compras_pedidos_itens
ALTER TABLE public.compras_pedidos_itens
  ADD COLUMN IF NOT EXISTS ajuste_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_ajuste_manual TEXT;

-- 2. Token de vinculação segura de grupo na tabela compras_config
ALTER TABLE public.compras_config
  ADD COLUMN IF NOT EXISTS token_vinculacao_loja TEXT;

-- Preenche token padrão seguro onde ainda não existir
UPDATE public.compras_config
   SET token_vinculacao_loja = 'RODO-LOJA-' || upper(substr(md5(workspace_id::text || 'rodo_loja_sec'), 1, 8))
 WHERE token_vinculacao_loja IS NULL;

-- 3. Refatoração e Blindagem da RPC registrar_item_conferencia_estoque
-- Garante:
-- a) Imutabilidade de pedidos aprovados/enviados/recebidos/concluidos/cancelados
-- b) Preservação de quantidade_ajustada definida manualmente (ajuste_manual = TRUE)
-- c) Não quebra o status 'aguardando_aprovacao' se houver novas conferências tardias
-- d) Registro de origem telegram_audio, telegram_foto ou telegram_texto
CREATE OR REPLACE FUNCTION public.registrar_item_conferencia_estoque(
  p_workspace_id UUID,
  p_fornecedor_nome TEXT,
  p_data_operacional DATE,
  p_produto_nome TEXT,
  p_quantidade_informada NUMERIC,
  p_tipo_informacao TEXT,
  p_origem_tipo TEXT DEFAULT 'telegram_texto',
  p_informado_por_usuario_id UUID DEFAULT NULL,
  p_informado_por_telegram_id BIGINT DEFAULT NULL,
  p_informado_por_nome TEXT DEFAULT NULL,
  p_arquivo_url TEXT DEFAULT NULL,
  p_transcricao TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_authorized BOOLEAN := FALSE;
  v_conferencia_id UUID;
  v_conf_item_id UUID;
  v_pedido_id UUID;
  v_pedido_status TEXT;
  v_ref_id UUID;
  v_ref_qtd NUMERIC := 0;
  v_unidade TEXT := 'unidade';
  v_categoria TEXT := 'Geral';
  v_sugerida NUMERIC;
  v_itens_pendentes INTEGER := 0;
  v_total_itens INTEGER := 0;
  v_novo_status_pedido TEXT;
  v_pedido_protegido BOOLEAN := FALSE;
  v_formato_lista TEXT := 'padrao';
  v_origem_conferencia TEXT;
  v_item_ajustado_manual BOOLEAN := FALSE;
  v_linhas_texto TEXT[];
  v_item_row RECORD;
  v_texto_pedido TEXT;
BEGIN
  -- A. Autenticação e Autorização Estrita
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT public.is_active_workspace_member(p_workspace_id, v_caller_id)
      INTO v_is_authorized;
    IF NOT COALESCE(v_is_authorized, FALSE) THEN
      RAISE EXCEPTION 'Acesso negado: usuário não é membro ativo do workspace'
        USING errcode = '42501';
    END IF;
  ELSE
    IF COALESCE(auth.role(), '') = 'service_role' OR session_user = 'postgres' THEN
      v_is_authorized := TRUE;
    ELSE
      RAISE EXCEPTION 'Acesso negado: contexto não autorizado'
        USING errcode = '42501';
    END IF;
  END IF;

  -- Normaliza origem para a tabela da conferência
  IF p_origem_tipo LIKE 'telegram%' THEN
    v_origem_conferencia := 'telegram';
  ELSE
    v_origem_conferencia := COALESCE(p_origem_tipo, 'manual');
  END IF;

  -- B. Localizar ou Criar Sessão de Conferência do Dia
  SELECT id INTO v_conferencia_id
    FROM public.compras_estoque_conferencias
   WHERE workspace_id = p_workspace_id
     AND fornecedor_nome = p_fornecedor_nome
     AND data_operacional = p_data_operacional;

  IF v_conferencia_id IS NULL THEN
    INSERT INTO public.compras_estoque_conferencias (
      workspace_id,
      fornecedor_nome,
      data_operacional,
      status,
      origem
    ) VALUES (
      p_workspace_id,
      p_fornecedor_nome,
      p_data_operacional,
      'em_conferencia',
      v_origem_conferencia
    ) RETURNING id INTO v_conferencia_id;
  ELSE
    UPDATE public.compras_estoque_conferencias
       SET status = 'em_conferencia',
           updated_at = timezone('utc', now())
     WHERE id = v_conferencia_id;
  END IF;

  -- C. Localizar Produto de Referência Oficial
  SELECT id, quantidade_referencia, unidade_medida, categoria
    INTO v_ref_id, v_ref_qtd, v_unidade, v_categoria
    FROM public.compras_produtos_referencia
   WHERE workspace_id = p_workspace_id
     AND (fornecedor_nome = p_fornecedor_nome OR fornecedor_id IS NULL)
     AND (lower(trim(produto_nome)) = lower(trim(p_produto_nome)) OR p_produto_nome ILIKE produto_nome)
     AND ativo = TRUE
   LIMIT 1;

  -- D. Inserir ou Atualizar Item na Conferência (Idempotência sem duplicatas)
  SELECT id INTO v_conf_item_id
    FROM public.compras_estoque_conferencias_itens
   WHERE conferencia_id = v_conferencia_id
     AND (
       (v_ref_id IS NOT NULL AND produto_referencia_id = v_ref_id) OR
       lower(trim(produto_nome)) = lower(trim(p_produto_nome))
     );

  IF v_conf_item_id IS NULL THEN
    INSERT INTO public.compras_estoque_conferencias_itens (
      conferencia_id,
      workspace_id,
      produto_referencia_id,
      produto_nome,
      quantidade_informada,
      unidade_medida,
      tipo_informacao,
      confianca,
      origem_tipo,
      arquivo_url,
      transcricao,
      informado_por_usuario_id,
      informado_por_telegram_id,
      informado_por_nome,
      informado_em,
      observacoes
    ) VALUES (
      v_conferencia_id,
      p_workspace_id,
      v_ref_id,
      p_produto_nome,
      p_quantidade_informada,
      v_unidade,
      p_tipo_informacao,
      1.0,
      p_origem_tipo,
      p_arquivo_url,
      p_transcricao,
      p_informado_por_usuario_id,
      p_informado_por_telegram_id,
      p_informado_por_nome,
      timezone('utc', now()),
      p_observacoes
    ) RETURNING id INTO v_conf_item_id;
  ELSE
    UPDATE public.compras_estoque_conferencias_itens
       SET quantidade_informada = p_quantidade_informada,
           tipo_informacao = p_tipo_informacao,
           origem_tipo = p_origem_tipo,
           arquivo_url = COALESCE(p_arquivo_url, arquivo_url),
           transcricao = COALESCE(p_transcricao, transcricao),
           informado_por_nome = COALESCE(p_informado_por_nome, informado_por_nome),
           informado_em = timezone('utc', now()),
           observacoes = COALESCE(p_observacoes, observacoes),
           updated_at = timezone('utc', now())
     WHERE id = v_conf_item_id;
  END IF;

  -- E. Verificar se o Pedido Existe e se está Blindado (Gate 6)
  SELECT id, status INTO v_pedido_id, v_pedido_status
    FROM public.compras_pedidos
   WHERE workspace_id = p_workspace_id
     AND fornecedor_nome = p_fornecedor_nome
     AND data_pedido = p_data_operacional;

  IF v_pedido_id IS NOT NULL AND v_pedido_status IN ('aprovado', 'enviado', 'recebido', 'concluido', 'cancelado') THEN
    v_pedido_protegido := TRUE;
  END IF;

  -- F. Atualizar Pedido apenas se NÃO estiver protegido
  IF v_pedido_id IS NOT NULL AND NOT v_pedido_protegido THEN
    -- Calcular nova sugestão
    IF p_tipo_informacao = 'confirmado_zero' THEN
      v_sugerida := GREATEST(0, CEIL(v_ref_qtd));
    ELSIF p_tipo_informacao = 'confirmado_positivo' AND p_quantidade_informada IS NOT NULL THEN
      v_sugerida := GREATEST(0, CEIL(v_ref_qtd - p_quantidade_informada));
    ELSE
      v_sugerida := NULL;
    END IF;

    -- Checa se o item já foi ajustado manualmente
    SELECT COALESCE(ajuste_manual, FALSE) INTO v_item_ajustado_manual
      FROM public.compras_pedidos_itens
     WHERE pedido_id = v_pedido_id
       AND (
         (v_ref_id IS NOT NULL AND produto_referencia_id = v_ref_id) OR
         lower(trim(produto_nome)) = lower(trim(p_produto_nome))
       )
     LIMIT 1;

    -- Atualiza item do pedido correspondente
    UPDATE public.compras_pedidos_itens
       SET estoque_atual = p_quantidade_informada,
           quantidade_sugerida = v_sugerida,
           -- PROTEÇÃO DE AJUSTE MANUAL (Gate 6): não sobrescreve se o usuário fez ajuste manual
           quantidade_ajustada = CASE 
             WHEN v_item_ajustado_manual THEN quantidade_ajustada 
             ELSE v_sugerida 
           END,
           status_estoque = p_tipo_informacao,
           contagem_origem = p_origem_tipo,
           contagem_confirmada_em = timezone('utc', now()),
           conferencia_item_id = v_conf_item_id
     WHERE pedido_id = v_pedido_id
       AND (
         (v_ref_id IS NOT NULL AND produto_referencia_id = v_ref_id) OR
         lower(trim(produto_nome)) = lower(trim(p_produto_nome))
       );

    -- G. Recalcular Status e Formatar Texto do Pedido
    SELECT 
      count(*) AS total,
      count(*) FILTER (WHERE status_estoque = 'pendente_contagem' OR estoque_atual IS NULL) AS pendentes
    INTO v_total_itens, v_itens_pendentes
    FROM public.compras_pedidos_itens
    WHERE pedido_id = v_pedido_id;

    -- Mantém status 'aguardando_aprovacao' se já estiver sob análise da diretoria
    IF v_pedido_status = 'aguardando_aprovacao' THEN
      v_novo_status_pedido := 'aguardando_aprovacao';
    ELSIF v_itens_pendentes = 0 AND v_total_itens > 0 THEN
      v_novo_status_pedido := 'pedido_calculado';
    ELSIF v_itens_pendentes = v_total_itens THEN
      v_novo_status_pedido := 'aguardando_estoque';
    ELSE
      v_novo_status_pedido := 'estoque_incompleto';
    END IF;

    -- Formato da lista a partir do calendário
    SELECT formato_lista INTO v_formato_lista
      FROM public.compras_fornecedores_calendario
     WHERE workspace_id = p_workspace_id
       AND fornecedor_nome = p_fornecedor_nome
     LIMIT 1;

    v_formato_lista := COALESCE(v_formato_lista, 'padrao');

    -- Constrói texto do pedido atualizado
    v_linhas_texto := ARRAY[]::TEXT[];
    v_linhas_texto := array_append(v_linhas_texto, '🛒 *PEDIDO: ' || p_fornecedor_nome || '*');
    v_linhas_texto := array_append(v_linhas_texto, '📅 Data: ' || to_char(p_data_operacional, 'DD/MM/YYYY'));
    v_linhas_texto := array_append(v_linhas_texto, '----------------------------------------');

    FOR v_item_row IN
      SELECT produto_nome, COALESCE(quantidade_ajustada, quantidade_sugerida, 0) AS qtd, unidade_medida, status_estoque
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
       ORDER BY produto_nome
    LOOP
      IF v_item_row.status_estoque = 'pendente_contagem' THEN
        v_linhas_texto := array_append(v_linhas_texto, '⏳ ' || v_item_row.produto_nome || ': (aguardando conferência)');
      ELSE
        IF v_formato_lista = 'coca_cola' THEN
          v_linhas_texto := array_append(v_linhas_texto, '• ' || v_item_row.qtd || ' cx - ' || v_item_row.produto_nome);
        ELSIF v_formato_lista = 'paodequeijo' THEN
          v_linhas_texto := array_append(v_linhas_texto, '• ' || v_item_row.produto_nome || ': ' || v_item_row.qtd || ' pct (' || v_item_row.unidade_medida || ')');
        ELSE
          v_linhas_texto := array_append(v_linhas_texto, '• ' || v_item_row.produto_nome || ': ' || v_item_row.qtd || ' ' || v_item_row.unidade_medida);
        END IF;
      END IF;
    END LOOP;

    v_texto_pedido := array_to_string(v_linhas_texto, E'\n');

    UPDATE public.compras_pedidos
       SET status = v_novo_status_pedido,
           metadata = v_texto_pedido,
           updated_at = timezone('utc', now())
     WHERE id = v_pedido_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'sucesso',
    'conferencia_id', v_conferencia_id,
    'conferencia_item_id', v_conf_item_id,
    'pedido_id', v_pedido_id,
    'pedido_protegido', v_pedido_protegido,
    'pedido_status', COALESCE(v_novo_status_pedido, v_pedido_status),
    'fornecedor_nome', p_fornecedor_nome,
    'produto_nome', p_produto_nome,
    'quantidade_informada', p_quantidade_informada,
    'tipo_informacao', p_tipo_informacao,
    'origem_tipo', p_origem_tipo,
    'total_itens', v_total_itens,
    'itens_pendentes', v_itens_pendentes,
    'ajuste_manual_preservado', v_item_ajustado_manual
  );
END;
$$;

-- Permissões
REVOKE ALL ON FUNCTION public.registrar_item_conferencia_estoque(UUID, TEXT, DATE, TEXT, NUMERIC, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_item_conferencia_estoque(UUID, TEXT, DATE, TEXT, NUMERIC, TEXT, TEXT, UUID, BIGINT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
