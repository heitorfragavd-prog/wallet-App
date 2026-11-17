-- =============================================================================
-- Migration 108: Motor de Cálculo de Pedidos e Agendamento Cron (Etapa 4 - Rodo Point)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gerar_sugestoes_compras_dia(
  p_workspace_id UUID,
  p_data_pedido DATE DEFAULT CURRENT_DATE,
  p_aumento_temporario_pct NUMERIC DEFAULT 0,
  p_fornecedor_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia_semana SMALLINT;
  v_forn RECORD;
  v_prod RECORD;
  v_pedido_id UUID;
  v_aumento NUMERIC;
  v_ref_ajustada NUMERIC;
  v_sugerida NUMERIC;
  v_limite_aplicado BOOLEAN;
  v_total_caixas NUMERIC := 0;
  v_linhas_texto TEXT[];
  v_texto_pedido TEXT;
  v_pedidos_gerados JSONB := '[]'::jsonb;
  v_itens_gerados_count INTEGER := 0;
  v_simulacao BOOLEAN := TRUE;
BEGIN
  -- 1. Obter configuração do workspace
  SELECT simulacao_modo, COALESCE(p_aumento_temporario_pct, aumento_temporario_pct, 0)
    INTO v_simulacao, v_aumento
    FROM public.compras_config
   WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    v_simulacao := TRUE;
    v_aumento := COALESCE(p_aumento_temporario_pct, 0);
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_data_pedido)::smallint;

  -- 2. Selecionar fornecedores agendados para a data
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
    v_total_caixas := 0;
    v_itens_gerados_count := 0;

    -- Criar ou reutilizar pedido sugerido do dia
    INSERT INTO public.compras_pedidos (
      workspace_id,
      fornecedor_id,
      fornecedor_nome,
      data_pedido,
      dia_semana,
      status,
      aumento_temporario_pct,
      simulacao
    ) VALUES (
      p_workspace_id,
      v_forn.id,
      v_forn.fornecedor_nome,
      p_data_pedido,
      v_dia_semana,
      'sugerido',
      v_aumento,
      v_simulacao
    )
    RETURNING id INTO v_pedido_id;

    -- Limpar itens anteriores caso o pedido tenha sido recriado
    DELETE FROM public.compras_pedidos_itens WHERE pedido_id = v_pedido_id;

    -- 3. Calcular para cada produto de referência do fornecedor
    FOR v_prod IN
      SELECT *
        FROM public.compras_produtos_referencia
       WHERE workspace_id = p_workspace_id
         AND fornecedor_nome = v_forn.fornecedor_nome
         AND ativo = TRUE
       ORDER BY produto_nome ASC
    LOOP
      -- Cálculo base
      v_ref_ajustada := v_prod.quantidade_referencia * (1 + v_aumento / 100.0);
      -- Estoque atual simulado ou zero caso não haja sincronismo
      v_sugerida := GREATEST(0, CEIL(v_ref_ajustada - 0));
      v_limite_aplicado := FALSE;

      IF v_prod.limite_max_sugerido IS NOT NULL AND v_prod.limite_max_sugerido > 0 AND v_sugerida > v_prod.limite_max_sugerido THEN
        v_sugerida := v_prod.limite_max_sugerido;
        v_limite_aplicado := TRUE;
      END IF;

      IF v_sugerida > 0 THEN
        v_total_caixas := v_total_caixas + v_sugerida;
        v_itens_gerados_count := v_itens_gerados_count + 1;

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
          limite_aplicado
        ) VALUES (
          v_pedido_id,
          p_workspace_id,
          v_prod.id,
          v_prod.produto_nome,
          v_prod.categoria,
          v_prod.unidade_medida,
          v_prod.quantidade_referencia,
          0,
          v_sugerida,
          v_sugerida,
          v_limite_aplicado
        );

        -- Montar texto formatado conforme o padrão do fornecedor
        IF v_forn.formato_lista = 'salgados_soma' THEN
          v_linhas_texto := array_append(v_linhas_texto, v_prod.produto_nome || ' = ' || v_sugerida::text);
        ELSIF v_forn.formato_lista = 'bebidas_sem_ref' THEN
          v_linhas_texto := array_append(v_linhas_texto, v_prod.produto_nome || ' = ' || v_sugerida::text || ' ' || v_prod.unidade_medida);
        ELSE
          v_linhas_texto := array_append(v_linhas_texto, '- ' || v_prod.produto_nome || ': ' || v_sugerida::text || ' ' || v_prod.unidade_medida);
        END IF;
      END IF;
    END LOOP;

    -- 4. Formatação final do texto do pedido
    IF v_forn.formato_lista = 'salgados_soma' THEN
      v_texto_pedido := '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || v_total_caixas::text || ' | ' || array_to_string(v_linhas_texto, ', ');
    ELSIF v_forn.formato_lista = 'bebidas_sem_ref' THEN
      v_texto_pedido := '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n');
    ELSE
      v_texto_pedido := '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n');
    END IF;

    UPDATE public.compras_pedidos
       SET texto_pedido_formatado = v_texto_pedido,
           updated_at = timezone('utc', now())
     WHERE id = v_pedido_id;

    v_pedidos_gerados := v_pedidos_gerados || jsonb_build_array(
      jsonb_build_object(
        'pedido_id', v_pedido_id,
        'fornecedor_nome', v_forn.fornecedor_nome,
        'total_itens', v_itens_gerados_count,
        'total_unidades', v_total_caixas,
        'texto_pedido', v_texto_pedido,
        'simulacao', v_simulacao
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'data_pedido', p_data_pedido,
    'dia_semana', v_dia_semana,
    'pedidos', v_pedidos_gerados
  );
END;
$$;

-- Permissões estritas da RPC
REVOKE ALL ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, NUMERIC, UUID) TO authenticated, service_role;

-- 5. Agendamento Automático via pg_cron (09h00 Horário de Brasília = 12h00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('compras-automaticas-diarias-09h');
    PERFORM cron.schedule(
      'compras-automaticas-diarias-09h',
      '0 12 * * 1-5', -- Segunda a Sexta às 12h UTC (09h Brasília)
      $cron$
      DO $inner$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN SELECT id FROM public.workspaces LOOP
          PERFORM public.gerar_sugestoes_compras_dia(r.id, CURRENT_DATE);
        END LOOP;
      END;
      $inner$;
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignora defensivamente se pg_cron não estiver habilitado no ambiente local
  RAISE NOTICE 'pg_cron não disponível ou permissão restrita, agendamento postergado para o servidor.';
END;
$$;
