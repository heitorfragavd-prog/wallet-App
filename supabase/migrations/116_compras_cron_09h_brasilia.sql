-- ==============================================================================
-- MIGRATION 116: CALIBRAÇÃO ESTREITA DO CRON 09h00 DE COMPRAS (FUSO BRASÍLIA)
-- ETAPA 4D.1 - GATES 1 e 8
-- ==============================================================================

-- 1. Elimina sobrecarga ambígua de gerar_sugestoes_compras_dia com 4 parâmetros
DROP FUNCTION IF EXISTS public.gerar_sugestoes_compras_dia(UUID, DATE, NUMERIC, UUID);

-- 2. Correção e Consolidação da RPC gerar_sugestoes_compras_dia (Schema real e 100% alinhado)
CREATE OR REPLACE FUNCTION public.gerar_sugestoes_compras_dia(
  p_workspace_id UUID,
  p_data_pedido DATE DEFAULT CURRENT_DATE,
  p_fornecedor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_authorized BOOLEAN := FALSE;
  v_dia_semana SMALLINT;
  v_forn RECORD;
  v_pedido_id UUID;
  v_pedido_status TEXT;
  v_conferencia_id UUID;
  v_conferencia_status TEXT;
  v_item_ref RECORD;
  v_conf_item RECORD;
  v_qtd_estoque NUMERIC;
  v_status_estoque TEXT;
  v_sugerida NUMERIC;
  v_total_unidades NUMERIC := 0;
  v_itens_gerados_count INTEGER := 0;
  v_itens_pendentes_count INTEGER := 0;
  v_linhas_texto TEXT[] := ARRAY[]::TEXT[];
  v_pedidos_gerados JSONB := '[]'::JSONB;
  v_novo_status TEXT;
  v_simulacao_ativa BOOLEAN := TRUE;
  v_aumento_pct NUMERIC := 0;
  v_canal_forn TEXT;
  v_horario_forn TIME;
  v_item_id UUID;
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

  -- B. Carregar configuração do workspace
  SELECT COALESCE(simulacao_modo, TRUE), COALESCE(aumento_temporario_pct, 0)
    INTO v_simulacao_ativa, v_aumento_pct
    FROM public.compras_config
   WHERE workspace_id = p_workspace_id;

  IF v_simulacao_ativa IS NULL THEN
    v_simulacao_ativa := TRUE;
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_data_pedido)::smallint;

  -- C. Selecionar fornecedores agendados para a data
  FOR v_forn IN
    SELECT *
      FROM public.compras_fornecedores_calendario
     WHERE workspace_id = p_workspace_id
       AND ativo = TRUE
       AND dia_semana = v_dia_semana
       AND (p_fornecedor_id IS NULL OR id = p_fornecedor_id)
       AND (
         periodicidade = 'semanal' OR 
         (periodicidade = 'quinzenal' AND public.is_quinzena_compras_ativa(quinzena_data_base, p_data_pedido))
       )
     ORDER BY ordem_exibicao ASC
  LOOP
    v_linhas_texto := ARRAY[]::TEXT[];
    v_total_unidades := 0;
    v_itens_gerados_count := 0;
    v_itens_pendentes_count := 0;
    v_canal_forn := COALESCE(v_forn.canal_compra, 'direto');
    v_horario_forn := v_forn.horario_disparo;

    -- D. Idempotência: Verificar se já existe pedido para o dia/fornecedor
    SELECT id, status INTO v_pedido_id, v_pedido_status
      FROM public.compras_pedidos
     WHERE workspace_id = p_workspace_id
       AND fornecedor_nome = v_forn.fornecedor_nome
       AND data_pedido = p_data_pedido;

    IF v_pedido_id IS NULL THEN
      INSERT INTO public.compras_pedidos (
        workspace_id,
        fornecedor_id,
        fornecedor_nome,
        data_pedido,
        dia_semana,
        data_sugerida_entrega,
        status,
        canal_envio,
        horario_envio_limite,
        aumento_temporario_pct,
        simulacao,
        metadata
      ) VALUES (
        p_workspace_id,
        v_forn.id,
        v_forn.fornecedor_nome,
        p_data_pedido,
        v_dia_semana,
        p_data_pedido,
        'aguardando_estoque',
        v_canal_forn,
        v_horario_forn,
        v_aumento_pct,
        v_simulacao_ativa,
        jsonb_build_object(
          'formato_lista', COALESCE(v_forn.formato_lista, 'padrao'),
          'total_itens', 0,
          'total_estimado', 0
        )
      )
      RETURNING id INTO v_pedido_id;
    END IF;

    -- E. Localizar ou Criar Sessão de Conferência Matinal
    SELECT id, status INTO v_conferencia_id, v_conferencia_status
      FROM public.compras_estoque_conferencias
     WHERE workspace_id = p_workspace_id
       AND fornecedor_nome = v_forn.fornecedor_nome
       AND data_operacional = p_data_pedido;

    IF v_conferencia_id IS NULL THEN
      INSERT INTO public.compras_estoque_conferencias (
        workspace_id,
        fornecedor_nome,
        data_operacional,
        status,
        origem,
        metadata
      ) VALUES (
        p_workspace_id,
        v_forn.fornecedor_nome,
        p_data_pedido,
        'aguardando',
        'cron_09h',
        jsonb_build_object('origem_disparo', 'cron_09h')
      )
      RETURNING id INTO v_conferencia_id;
    END IF;

    -- F. Iterar sobre Produtos de Referência do Fornecedor
    v_linhas_texto := array_append(v_linhas_texto, '🛒 *PEDIDO: ' || v_forn.fornecedor_nome || '*');
    v_linhas_texto := array_append(v_linhas_texto, '📅 Data: ' || to_char(p_data_pedido, 'DD/MM/YYYY'));
    v_linhas_texto := array_append(v_linhas_texto, '----------------------------------------');

    FOR v_item_ref IN
      SELECT *
        FROM public.compras_produtos_referencia
       WHERE workspace_id = p_workspace_id
         AND (fornecedor_nome = v_forn.fornecedor_nome OR fornecedor_id = v_forn.id)
         AND ativo = TRUE
       ORDER BY produto_nome ASC
    LOOP
      -- Se a referência estiver pendente de validação pela diretoria, sinaliza
      IF v_item_ref.validacao_status = 'pendente_validacao' THEN
        v_linhas_texto := array_append(v_linhas_texto, '⚠️ ' || v_item_ref.produto_nome || ': (referência pendente de validação pela diretoria)');
      END IF;

      -- Verifica se já há contagem informada na conferência
      SELECT quantidade_informada, tipo_informacao
        INTO v_qtd_estoque, v_status_estoque
        FROM public.compras_estoque_conferencias_itens
       WHERE conferencia_id = v_conferencia_id
         AND (produto_referencia_id = v_item_ref.id OR lower(trim(produto_nome)) = lower(trim(v_item_ref.produto_nome)))
       LIMIT 1;

      -- Calcula quantidade sugerida
      IF v_status_estoque = 'confirmado_zero' THEN
        v_sugerida := GREATEST(0, CEIL(v_item_ref.quantidade_referencia * (1 + v_aumento_pct / 100.0)));
        v_status_estoque := 'confirmado_zero';
      ELSIF v_status_estoque = 'confirmado_positivo' AND v_qtd_estoque IS NOT NULL THEN
        v_sugerida := GREATEST(0, CEIL((v_item_ref.quantidade_referencia * (1 + v_aumento_pct / 100.0)) - v_qtd_estoque));
        v_status_estoque := 'confirmado_positivo';
      ELSE
        v_sugerida := NULL;
        v_status_estoque := 'pendente_contagem';
        v_itens_pendentes_count := v_itens_pendentes_count + 1;
      END IF;

      -- UPSERT atômico em compras_pedidos_itens
      SELECT id INTO v_item_id
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
         AND (produto_referencia_id = v_item_ref.id OR lower(trim(produto_nome)) = lower(trim(v_item_ref.produto_nome)));

      IF v_item_id IS NULL THEN
        INSERT INTO public.compras_pedidos_itens (
          pedido_id,
          workspace_id,
          produto_referencia_id,
          produto_nome,
          categoria,
          unidade_medida,
          quantidade_referencia,
          estoque_atual,
          quantidade_sugerida,
          quantidade_ajustada,
          status_estoque,
          limite_aplicado,
          ajuste_manual
        ) VALUES (
          v_pedido_id,
          p_workspace_id,
          v_item_ref.id,
          v_item_ref.produto_nome,
          v_item_ref.categoria,
          v_item_ref.unidade_medida,
          v_item_ref.quantidade_referencia,
          COALESCE(v_qtd_estoque, NULL),
          v_sugerida,
          v_sugerida,
          v_status_estoque,
          FALSE,
          FALSE
        );
      ELSE
        -- Preserva ajuste manual se já existente
        UPDATE public.compras_pedidos_itens
           SET quantidade_sugerida = v_sugerida,
               quantidade_ajustada = CASE WHEN ajuste_manual THEN quantidade_ajustada ELSE v_sugerida END,
               status_estoque = v_status_estoque,
               estoque_atual = COALESCE(v_qtd_estoque, estoque_atual)
         WHERE id = v_item_id;
      END IF;

      v_itens_gerados_count := v_itens_gerados_count + 1;
      v_total_unidades := v_total_unidades + COALESCE(v_sugerida, 0);

      IF v_status_estoque = 'pendente_contagem' THEN
        v_linhas_texto := array_append(v_linhas_texto, '⏳ ' || v_item_ref.produto_nome || ': (aguardando contagem)');
      ELSE
        IF v_forn.formato_lista = 'coca_cola' THEN
          v_linhas_texto := array_append(v_linhas_texto, '• ' || COALESCE(v_sugerida, 0) || ' cx - ' || v_item_ref.produto_nome);
        ELSIF v_forn.formato_lista = 'paodequeijo' THEN
          v_linhas_texto := array_append(v_linhas_texto, '• ' || v_item_ref.produto_nome || ': ' || COALESCE(v_sugerida, 0) || ' pct (' || v_item_ref.unidade_medida || ')');
        ELSE
          v_linhas_texto := array_append(v_linhas_texto, '• ' || v_item_ref.produto_nome || ': ' || COALESCE(v_sugerida, 0) || ' ' || v_item_ref.unidade_medida);
        END IF;
      END IF;
    END LOOP;

    -- G. Atualiza status consolidado do pedido
    IF v_itens_pendentes_count = 0 AND v_itens_gerados_count > 0 THEN
      v_novo_status := 'pedido_calculado';
    ELSIF v_itens_pendentes_count = v_itens_gerados_count THEN
      v_novo_status := 'aguardando_estoque';
    ELSE
      v_novo_status := 'estoque_incompleto';
    END IF;

    -- Não rebaixa status se o pedido já estiver aprovado/enviado
    IF v_pedido_status IN ('aprovado', 'enviado', 'recebido', 'concluido', 'cancelado') THEN
      v_novo_status := v_pedido_status;
    END IF;

    UPDATE public.compras_pedidos
       SET status = v_novo_status,
           texto_pedido_formatado = array_to_string(v_linhas_texto, E'\n'),
           metadata = jsonb_build_object(
             'formato_lista', COALESCE(v_forn.formato_lista, 'padrao'),
             'total_itens', v_itens_gerados_count,
             'total_estimado', v_total_unidades,
             'itens_pendentes', v_itens_pendentes_count
           ),
           updated_at = timezone('utc', now())
     WHERE id = v_pedido_id;

    v_pedidos_gerados := v_pedidos_gerados || jsonb_build_object(
      'pedido_id', v_pedido_id,
      'fornecedor_nome', v_forn.fornecedor_nome,
      'status', v_novo_status,
      'total_itens', v_itens_gerados_count,
      'itens_pendentes', v_itens_pendentes_count
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'sucesso',
    'data_operacional', p_data_pedido,
    'dia_semana', v_dia_semana,
    'total_fornecedores', jsonb_array_length(v_pedidos_gerados),
    'pedidos', v_pedidos_gerados
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, UUID) TO authenticated, service_role;

-- 3. Agendamento Oficial no pg_cron (09h00 Horário de Brasília = 12h00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('compras-automaticas-diarias-09h');
    PERFORM cron.schedule(
      'compras-automaticas-diarias-09h',
      '0 12 * * 1-5',
      $cron$
      DO $inner$
      DECLARE
        r RECORD;
        v_data_brasilia DATE;
      BEGIN
        v_data_brasilia := (timezone('America/Sao_Paulo', now()))::date;
        FOR r IN SELECT id FROM public.workspaces LOOP
          PERFORM public.gerar_sugestoes_compras_dia(r.id, v_data_brasilia);
        END LOOP;
      END;
      $inner$;
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron não disponível ou permissão restrita: %', SQLERRM;
END;
$$;
