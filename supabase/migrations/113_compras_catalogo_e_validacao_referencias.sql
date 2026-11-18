-- =============================================================================
-- Migration 113: Auditoria do Catálogo, Status de Validação de Referências
-- e Correção de Fornecedor (Red Bull / Coca-Cola) (Etapa 4D.1 - Gates 1 e 2)
-- =============================================================================

-- 1. Adicionar colunas de governança e validação de referências
ALTER TABLE public.compras_produtos_referencia
  ADD COLUMN IF NOT EXISTS validacao_status TEXT NOT NULL DEFAULT 'pendente_validacao',
  ADD COLUMN IF NOT EXISTS fornecedor_original TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auditoria_motivo TEXT DEFAULT NULL;

-- 2. Constraint de verificação para validacao_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_compras_produtos_ref_validacao_status'
  ) THEN
    ALTER TABLE public.compras_produtos_referencia
      ADD CONSTRAINT chk_compras_produtos_ref_validacao_status
      CHECK (validacao_status IN ('confirmado', 'pendente_validacao', 'divergente'));
  END IF;
END;
$$;

-- 3. Correção de Fornecedor: Red Bull cadastrado indevidamente na Coca-Cola
-- A SPAL/Coca-Cola não fabrica nem distribui Red Bull (distribui Monster).
-- Reclassificamos Red Bull para o fornecedor Ceasa (canal atacadista) como 'pendente_validacao'.
DO $$
DECLARE
  v_ws_id UUID;
  v_forn_ceasa UUID;
BEGIN
  SELECT id INTO v_ws_id
    FROM public.workspaces
   WHERE nome ILIKE '%rodo%' OR id = '2af415b6-76aa-4134-8133-a9b405671c1c'
   LIMIT 1;

  IF v_ws_id IS NOT NULL THEN
    SELECT id INTO v_forn_ceasa
      FROM public.compras_fornecedores_calendario
     WHERE workspace_id = v_ws_id AND fornecedor_nome = 'Ceasa'
     LIMIT 1;

    -- Atualiza Red Bull retirando da Coca-Cola e apontando Ceasa/Atacado
    UPDATE public.compras_produtos_referencia
       SET fornecedor_original = 'Coca-Cola',
           fornecedor_nome = 'Ceasa',
           fornecedor_id = v_forn_ceasa,
           validacao_status = 'pendente_validacao',
           auditoria_motivo = 'Red Bull não é distribuído pela Coca-Cola (SPAL). Reclassificado para canal Ceasa com validação pendente.'
     WHERE workspace_id = v_ws_id
       AND produto_nome ILIKE 'Red Bull%'
       AND fornecedor_nome = 'Coca-Cola';

    -- Marca produtos com histórico operacional claro como 'confirmado'
    UPDATE public.compras_produtos_referencia
       SET validacao_status = 'confirmado'
     WHERE workspace_id = v_ws_id
       AND fornecedor_nome IN ('Salgados', 'Coca-Cola', 'Ambev')
       AND produto_nome IN (
         'Coxinha', 'Coxinha C/ Catupiry', 'Kibe', 'Pão de Batata',
         'Coca 350ml original', 'Coca 350ml zero', 'Coca 2L pet', 'Monster ENERGY',
         'Guaraná Antarctica lata', 'Pepsi lata', 'Água Mineral Com Gás 500ml', 'Água Mineral Sem Gás 500ml'
       );
  END IF;
END;
$$;

-- 4. Atualizar RPC gerar_sugestoes_compras_dia para respeitar validacao_status
-- e impedir sugestões cegas de itens não confirmados pela diretoria
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

    -- Se já estiver aprovado, enviado ou recebido, PRESERVAR TOTALMENTE
    IF v_pedido_id IS NOT NULL AND v_pedido_status IN ('aprovado', 'enviado', 'recebido') THEN
      v_pedidos_gerados := v_pedidos_gerados || jsonb_build_array(
        jsonb_build_object(
          'pedido_id', v_pedido_id,
          'fornecedor_nome', v_forn.fornecedor_nome,
          'status', v_pedido_status,
          'mensagem', 'Pedido preservado: já se encontra ' || v_pedido_status,
          'idempotente', TRUE
        )
      );
      CONTINUE;
    END IF;

    -- Se não existir, criar pedido base com colunas compatíveis
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
        jsonb_build_object('formato_lista', COALESCE(v_forn.formato_lista, 'padrao'))
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
        total_itens,
        itens_conferidos
      ) VALUES (
        p_workspace_id,
        v_forn.fornecedor_nome,
        p_data_pedido,
        'aguardando',
        'cron_09h',
        0,
        0
      )
      RETURNING id INTO v_conferencia_id;
    END IF;

    -- F. Iterar sobre os Produtos de Referência do Fornecedor
    FOR v_item_ref IN
      SELECT *
        FROM public.compras_produtos_referencia
       WHERE workspace_id = p_workspace_id
         AND fornecedor_nome = v_forn.fornecedor_nome
         AND ativo = TRUE
       ORDER BY categoria ASC, produto_nome ASC
    LOOP
      v_itens_gerados_count := v_itens_gerados_count + 1;

      -- Consulta se já houve contagem física para o produto
      SELECT quantidade_informada, tipo_informacao
        INTO v_conf_item
        FROM public.compras_estoque_conferencias_itens
       WHERE conferencia_id = v_conferencia_id
         AND produto_nome = v_item_ref.produto_nome;

      IF v_conf_item.tipo_informacao = 'confirmado_zero' THEN
        v_qtd_estoque := 0;
        v_status_estoque := 'confirmado_zero';
        v_sugerida := GREATEST(0, CEIL(v_item_ref.quantidade_referencia * (1 + (v_aumento_pct / 100.0))));
      ELSIF v_conf_item.tipo_informacao = 'confirmado_positivo' AND v_conf_item.quantidade_informada IS NOT NULL THEN
        v_qtd_estoque := v_conf_item.quantidade_informada;
        v_status_estoque := 'confirmado_positivo';
        v_sugerida := GREATEST(0, CEIL((v_item_ref.quantidade_referencia - v_qtd_estoque) * (1 + (v_aumento_pct / 100.0))));
      ELSE
        -- Estoque pendente (NUNCA assume zero cego)
        v_qtd_estoque := NULL;
        v_status_estoque := 'pendente_contagem';
        v_sugerida := NULL;
        v_itens_pendentes_count := v_itens_pendentes_count + 1;
      END IF;

      -- Se o item ainda não tiver referência validada formalmente, sinaliza governança
      IF v_item_ref.validacao_status = 'pendente_validacao' THEN
        v_linhas_texto := array_append(
          v_linhas_texto,
          '⚠️ ' || v_item_ref.produto_nome || ': referência pendente de validação pela diretoria'
        );
      ELSIF v_sugerida IS NOT NULL THEN
        v_total_unidades := v_total_unidades + v_sugerida;
        v_linhas_texto := array_append(
          v_linhas_texto,
          '• ' || v_item_ref.produto_nome || ': ' || v_sugerida || ' ' || v_item_ref.unidade_medida
        );
      ELSE
        v_linhas_texto := array_append(
          v_linhas_texto,
          '⏳ ' || v_item_ref.produto_nome || ': aguardando contagem física'
        );
      END IF;

      -- Upsert do item no pedido preservando ajustes manuais pré-existentes
      SELECT id INTO v_item_id
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
         AND produto_nome = v_item_ref.produto_nome;

      IF v_item_id IS NULL THEN
        INSERT INTO public.compras_pedidos_itens (
          pedido_id,
          produto_nome,
          categoria,
          unidade_medida,
          quantidade_referencia,
          estoque_atual,
          quantidade_sugerida,
          status_estoque
        ) VALUES (
          v_pedido_id,
          v_item_ref.produto_nome,
          v_item_ref.categoria,
          v_item_ref.unidade_medida,
          v_item_ref.quantidade_referencia,
          v_qtd_estoque,
          v_sugerida,
          v_status_estoque
        );
      ELSE
        UPDATE public.compras_pedidos_itens
           SET quantidade_referencia = v_item_ref.quantidade_referencia,
               estoque_atual = v_qtd_estoque,
               quantidade_sugerida = v_sugerida,
               status_estoque = v_status_estoque,
               updated_at = NOW()
         WHERE id = v_item_id
           AND quantidade_ajustada IS NULL; -- Preserva ajustes manuais do administrador!
      END IF;
    END LOOP;

    -- G. Determinar Status do Pedido
    IF v_itens_gerados_count = 0 THEN
      v_novo_status := 'sugerido';
    ELSIF v_itens_pendentes_count > 0 THEN
      v_novo_status := 'aguardando_estoque';
    ELSE
      v_novo_status := 'pronto_para_aprovacao';
    END IF;

    -- H. Atualizar Pedido Consolidado
    UPDATE public.compras_pedidos
       SET status = v_novo_status,
           texto_pedido_formatado = '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n'),
           updated_at = NOW()
     WHERE id = v_pedido_id;

    -- Atualiza total de itens na conferência
    UPDATE public.compras_estoque_conferencias
       SET total_itens = v_itens_gerados_count,
           itens_conferidos = (v_itens_gerados_count - v_itens_pendentes_count),
           updated_at = NOW()
     WHERE id = v_conferencia_id;

    v_pedidos_gerados := v_pedidos_gerados || jsonb_build_array(
      jsonb_build_object(
        'pedido_id', v_pedido_id,
        'fornecedor_nome', v_forn.fornecedor_nome,
        'status', v_novo_status,
        'total_itens', v_itens_gerados_count,
        'itens_pendentes', v_itens_pendentes_count,
        'total_unidades', v_total_unidades,
        'texto_pedido', '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n'),
        'simulacao', v_simulacao_ativa
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
REVOKE ALL ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_sugestoes_compras_dia(UUID, DATE, UUID) TO authenticated, service_role;
