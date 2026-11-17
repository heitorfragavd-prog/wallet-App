-- =====================================================================
-- Migration 110: Endurecimento Definitivo de RLS, RPCs e Atomicidade de Compras
-- Etapa 4D - Gate 2 (RLS), Gate 3 (RPC Auth), Gate 4 (Bloqueio Incompleto), Gate 7 (Atomicidade)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REVOGAÇÃO DEFINITIVA DAS POLÍTICAS PERMISSIVAS LEGADAS DA MIGRATION 107
-- ---------------------------------------------------------------------
-- No PostgreSQL, políticas PERMISSIVE são combinadas via OR.
-- As políticas antigas 'compras_*_auth' concediam permissões amplas (ALL)
-- a qualquer membro de workspace, neutralizando as políticas restritivas do 109.
DROP POLICY IF EXISTS "compras_config_auth" ON public.compras_config;
DROP POLICY IF EXISTS "compras_calendario_auth" ON public.compras_fornecedores_calendario;
DROP POLICY IF EXISTS "compras_prod_ref_auth" ON public.compras_produtos_referencia;
DROP POLICY IF EXISTS "compras_pedidos_auth" ON public.compras_pedidos;
DROP POLICY IF EXISTS "compras_itens_auth" ON public.compras_pedidos_itens;

-- Garantir políticas service_role em conferências
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compras_estoque_conferencias' AND policyname = 'compras_conf_service') THEN
    CREATE POLICY "compras_conf_service" ON public.compras_estoque_conferencias FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compras_estoque_conferencias_itens' AND policyname = 'compras_conf_itens_service') THEN
    CREATE POLICY "compras_conf_itens_service" ON public.compras_estoque_conferencias_itens FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. UNICIDADE ATÔMICA EM CONFERÊNCIAS DE ESTOQUE (Gate 7)
-- ---------------------------------------------------------------------
-- Garante que um mesmo produto na mesma conferência de estoque seja atualizado
-- via UPSERT atômico (substituição), impedindo somas ou duplicações indevidas.
CREATE UNIQUE INDEX IF NOT EXISTS uk_compras_conf_itens_produto 
  ON public.compras_estoque_conferencias_itens (conferencia_id, produto_nome);

-- ---------------------------------------------------------------------
-- 3. HARDENING DA RPC gerar_sugestoes_compras_dia (Gate 3)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gerar_sugestoes_compras_dia(UUID, DATE, NUMERIC, UUID);
DROP FUNCTION IF EXISTS public.gerar_sugestoes_compras_dia(UUID, DATE);

CREATE OR REPLACE FUNCTION public.gerar_sugestoes_compras_dia(
  p_workspace_id UUID,
  p_data_pedido DATE,
  p_aumento_temporario_pct NUMERIC DEFAULT NULL,
  p_fornecedor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_exec BOOLEAN := FALSE;
  v_is_member BOOLEAN := FALSE;
  v_dia_semana SMALLINT;
  v_forn RECORD;
  v_prod RECORD;
  v_conf_item RECORD;
  v_pedido_id UUID;
  v_conferencia_id UUID;
  v_pedido_status TEXT;
  v_aumento NUMERIC;
  v_ref_ajustada NUMERIC;
  v_sugerida NUMERIC;
  v_limite_aplicado BOOLEAN;
  v_limite_max NUMERIC;
  v_total_unidades NUMERIC := 0;
  v_linhas_texto TEXT[];
  v_texto_pedido TEXT;
  v_pedidos_gerados JSONB := '[]'::jsonb;
  v_itens_gerados_count INTEGER := 0;
  v_itens_pendentes_count INTEGER := 0;
  v_simulacao BOOLEAN := TRUE;
  v_status_estoque_item TEXT;
  v_status_final_pedido TEXT;
  v_existing_item RECORD;
BEGIN
  -- A. Validação Estrita de Autenticação e Menor Privilégio (Gate 3)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT public.is_active_workspace_member(p_workspace_id, v_caller_id)
      INTO v_is_member;
    IF NOT COALESCE(v_is_member, FALSE) THEN
      RAISE EXCEPTION 'Acesso negado: usuário não é membro ativo deste workspace'
        USING errcode = '42501';
    END IF;

    SELECT public.is_workspace_executive(p_workspace_id, v_caller_id)
      INTO v_is_exec;
    IF NOT COALESCE(v_is_exec, FALSE) THEN
      RAISE EXCEPTION 'Acesso negado: apenas executivos e administradores podem gerar pedidos de compras'
        USING errcode = '42501';
    END IF;
  ELSE
    -- Chamadas internas do sistema: validar se a role é service_role ou usuário de banco postgres
    IF current_user = 'postgres' OR COALESCE(auth.role(), '') = 'service_role' THEN
      v_is_exec := TRUE;
    ELSE
      RAISE EXCEPTION 'Acesso negado: operação requer usuário autenticado ou contexto de serviço seguro'
        USING errcode = '42501';
    END IF;
  END IF;

  -- B. Obter configuração do workspace
  SELECT simulacao_modo, COALESCE(p_aumento_temporario_pct, aumento_temporario_pct, 0)
    INTO v_simulacao, v_aumento
    FROM public.compras_config
   WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    v_simulacao := TRUE;
    v_aumento := COALESCE(p_aumento_temporario_pct, 0);
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

    -- Se não existir, criar pedido base
    IF v_pedido_id IS NULL THEN
      INSERT INTO public.compras_pedidos (
        workspace_id,
        fornecedor_id,
        fornecedor_nome,
        data_pedido,
        data_sugerida_entrega,
        status,
        canal_envio,
        horario_envio_limite,
        aumento_temporario_pct,
        simulacao_modo,
        metadata
      ) VALUES (
        p_workspace_id,
        v_forn.id,
        v_forn.fornecedor_nome,
        p_data_pedido,
        p_data_pedido + INTERVAL '1 day',
        'aguardando_estoque',
        v_forn.canal_envio_padrao,
        v_forn.horario_limite_envio,
        v_aumento,
        v_simulacao,
        jsonb_build_object('formato_lista', v_forn.formato_lista)
      ) RETURNING id INTO v_pedido_id;
    END IF;

    -- Criar ou localizar sessão de conferência física
    SELECT id INTO v_conferencia_id
      FROM public.compras_estoque_conferencias
     WHERE workspace_id = p_workspace_id
       AND fornecedor_nome = v_forn.fornecedor_nome
       AND data_operacional = p_data_pedido;

    IF v_conferencia_id IS NULL THEN
      INSERT INTO public.compras_estoque_conferencias (
        workspace_id,
        pedido_id,
        fornecedor_id,
        fornecedor_nome,
        data_operacional,
        status,
        origem
      ) VALUES (
        p_workspace_id,
        v_pedido_id,
        v_forn.id,
        v_forn.fornecedor_nome,
        p_data_pedido,
        'aguardando',
        'cron_09h'
      ) RETURNING id INTO v_conferencia_id;
    END IF;

    -- E. Iterar sobre os produtos de referência do fornecedor
    FOR v_prod IN
      SELECT *
        FROM public.compras_produtos_referencia
       WHERE workspace_id = p_workspace_id
         AND (fornecedor_id = v_forn.id OR (fornecedor_id IS NULL AND fornecedor_nome = v_forn.fornecedor_nome))
         AND ativo = TRUE
       ORDER BY categoria ASC, produto_nome ASC
    LOOP
      -- F. Buscar estoque informado na conferência
      SELECT * INTO v_conf_item
        FROM public.compras_estoque_conferencias_itens
       WHERE conferencia_id = v_conferencia_id
         AND produto_nome = v_prod.produto_nome;

      -- Verificar se já existe item no pedido
      SELECT * INTO v_existing_item
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
         AND produto_nome = v_prod.produto_nome;

      -- Aplicar Aumento Temporário de Referência (Gate 11)
      v_ref_ajustada := v_prod.quantidade_referencia;
      IF v_aumento > 0 THEN
        v_ref_ajustada := CEIL(v_prod.quantidade_referencia * (1 + (v_aumento / 100.0)));
      END IF;

      -- Lógica do Gate 2: SEM ESTOQUE ZERO FALSO
      IF v_conf_item.id IS NOT NULL AND v_conf_item.quantidade_informada IS NOT NULL THEN
        -- Estoque conferido
        v_status_estoque_item := CASE 
          WHEN v_conf_item.quantidade_informada = 0 THEN 'confirmado_zero'
          ELSE 'confirmado_positivo'
        END;
        v_sugerida := GREATEST(0, v_ref_ajustada - v_conf_item.quantidade_informada);
      ELSE
        -- Estoque NÃO CONFERIDO
        v_status_estoque_item := 'pendente_contagem';
        v_sugerida := NULL;
        v_itens_pendentes_count := v_itens_pendentes_count + 1;
      END IF;

      -- Limite de Segurança (Gate 4)
      v_limite_aplicado := FALSE;
      v_limite_max := COALESCE(v_prod.limite_max_sugerido, v_forn.limite_padrao_por_item);

      IF v_sugerida IS NOT NULL AND (v_forn.canal_envio_padrao = 'online' OR v_limite_max IS NOT NULL) THEN
        IF v_limite_max IS NOT NULL AND v_limite_max > 0 AND v_sugerida > v_limite_max THEN
          v_sugerida := v_limite_max;
          v_limite_aplicado := TRUE;
        END IF;
      END IF;

      v_itens_gerados_count := v_itens_gerados_count + 1;

      -- Inserir ou atualizar item do pedido
      IF v_existing_item.id IS NULL THEN
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
          limite_aplicado,
          status_estoque,
          contagem_origem,
          contagem_confirmada_em,
          conferencia_item_id
        ) VALUES (
          v_pedido_id,
          p_workspace_id,
          v_prod.id,
          v_prod.produto_nome,
          v_prod.categoria,
          v_prod.unidade_medida,
          v_prod.quantidade_referencia,
          v_conf_item.quantidade_informada,
          v_sugerida,
          COALESCE(v_existing_item.quantidade_ajustada, v_sugerida),
          v_limite_aplicado,
          v_status_estoque_item,
          v_conf_item.origem_tipo,
          v_conf_item.informado_em,
          v_conf_item.id
        );
      ELSE
        UPDATE public.compras_pedidos_itens
           SET quantidade_referencia = v_prod.quantidade_referencia,
               estoque_atual = v_conf_item.quantidade_informada,
               quantidade_sugerida = v_sugerida,
               quantidade_ajustada = CASE 
                 WHEN v_existing_item.quantidade_ajustada IS NOT NULL AND v_existing_item.quantidade_ajustada != v_existing_item.quantidade_sugerida 
                 THEN v_existing_item.quantidade_ajustada 
                 ELSE v_sugerida 
               END,
               limite_aplicado = v_limite_aplicado,
               status_estoque = v_status_estoque_item,
               contagem_origem = v_conf_item.origem_tipo,
               contagem_confirmada_em = v_conf_item.informado_em,
               conferencia_item_id = v_conf_item.id
         WHERE id = v_existing_item.id;
      END IF;

      IF v_sugerida IS NOT NULL AND v_sugerida > 0 THEN
        v_total_unidades := v_total_unidades + v_sugerida;
        IF v_forn.formato_lista = 'salgados_soma' THEN
          -- GATE 5/11: 190 | Coxinha = 90 (REF à esquerda, quantidade à direita)
          v_linhas_texto := array_append(v_linhas_texto, v_prod.quantidade_referencia::text || ' | ' || v_prod.produto_nome || ' = ' || v_sugerida::text);
        ELSIF v_forn.formato_lista = 'bebidas_sem_ref' THEN
          v_linhas_texto := array_append(v_linhas_texto, v_prod.produto_nome || ' = ' || v_sugerida::text);
        ELSE
          v_linhas_texto := array_append(v_linhas_texto, '- ' || v_prod.produto_nome || ': ' || v_sugerida::text || ' ' || v_prod.unidade_medida);
        END IF;
      ELSIF v_status_estoque_item = 'pendente_contagem' THEN
        v_linhas_texto := array_append(v_linhas_texto, '⏳ ' || v_prod.produto_nome || ': aguardando contagem física');
      END IF;
    END LOOP;

    -- G. Determinar Status Consolidado do Pedido
    IF v_itens_pendentes_count = 0 AND v_itens_gerados_count > 0 THEN
      v_status_final_pedido := 'pedido_calculado';
    ELSIF v_itens_pendentes_count = v_itens_gerados_count THEN
      v_status_final_pedido := 'aguardando_estoque';
    ELSE
      v_status_final_pedido := 'estoque_incompleto';
    END IF;

    -- Formatar Texto
    IF v_forn.formato_lista = 'salgados_soma' THEN
      v_texto_pedido := '🔸 SALGADOS – QUANTIDADE PARA COMPRAR' || E'\n' || array_to_string(v_linhas_texto, E'\n');
    ELSE
      v_texto_pedido := '📦 PEDIDO — ' || UPPER(v_forn.fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n');
    END IF;

    UPDATE public.compras_pedidos
       SET status = v_status_final_pedido,
           texto_pedido_formatado = v_texto_pedido,
           updated_at = timezone('utc', now())
     WHERE id = v_pedido_id;

    v_pedidos_gerados := v_pedidos_gerados || jsonb_build_array(
      jsonb_build_object(
        'pedido_id', v_pedido_id,
        'fornecedor_nome', v_forn.fornecedor_nome,
        'status', v_status_final_pedido,
        'itens_pendentes', v_itens_pendentes_count,
        'total_itens', v_itens_gerados_count,
        'total_unidades', v_total_unidades,
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

-- ---------------------------------------------------------------------
-- 4. HARDENING DA RPC aprovar_pedido_compras (Gate 4)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aprovar_pedido_compras(UUID, UUID);
DROP FUNCTION IF EXISTS public.aprovar_pedido_compras(UUID, UUID, BOOLEAN, TEXT, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION public.aprovar_pedido_compras(
  p_pedido_id UUID,
  p_workspace_id UUID,
  p_permitir_incompleto BOOLEAN DEFAULT FALSE,
  p_justificativa_incompleto TEXT DEFAULT NULL,
  p_expected_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_exec BOOLEAN := FALSE;
  v_pedido RECORD;
  v_resumo_itens RECORD;
BEGIN
  -- A. Autenticação e Menor Privilégio
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    IF current_user = 'postgres' OR COALESCE(auth.role(), '') = 'service_role' THEN
      v_is_exec := TRUE;
    ELSE
      RAISE EXCEPTION 'Acesso negado: operação requer usuário autenticado ou contexto de serviço seguro'
        USING errcode = '42501';
    END IF;
  ELSE
    SELECT public.is_workspace_executive(p_workspace_id, v_caller_id)
      INTO v_is_exec;
  END IF;

  IF NOT COALESCE(v_is_exec, FALSE) THEN
    RAISE EXCEPTION 'Apenas executivos e administradores podem aprovar pedidos de compras'
      USING errcode = '42501';
  END IF;

  -- B. Localizar Pedido
  SELECT * INTO v_pedido
    FROM public.compras_pedidos
   WHERE id = p_pedido_id
     AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado neste workspace'
      USING errcode = 'P0002';
  END IF;

  -- C. Verificação de Concorrência Otimista (Gate 4)
  IF p_expected_updated_at IS NOT NULL AND v_pedido.updated_at IS NOT NULL THEN
    IF date_trunc('milliseconds', v_pedido.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) THEN
      RAISE EXCEPTION 'Conflito de concorrência: o pedido foi alterado por outro usuário. Atualize a página e revise antes de aprovar.'
        USING errcode = '40001';
    END IF;
  END IF;

  -- D. Verificações de Status Imutáveis
  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido aprovar um pedido cancelado'
      USING errcode = '23514';
  END IF;

  IF v_pedido.status = 'enviado' THEN
    RAISE EXCEPTION 'Pedido já foi enviado anteriormente'
      USING errcode = '23514';
  END IF;

  IF v_pedido.status = 'aprovado' THEN
    RETURN jsonb_build_object(
      'pedido_id', p_pedido_id,
      'status', 'aprovado',
      'mensagem', 'Pedido já se encontrava aprovado',
      'idempotente', TRUE
    );
  END IF;

  -- E. Integridade dos Itens e Bloqueio de Incompletos (Gate 4)
  SELECT 
    count(*) AS total_itens,
    count(*) FILTER (WHERE status_estoque = 'pendente_contagem' OR estoque_atual IS NULL) AS itens_pendentes,
    count(*) FILTER (WHERE quantidade_sugerida < 0 OR quantidade_ajustada < 0) AS itens_negativos,
    count(*) FILTER (WHERE produto_referencia_id IS NULL) AS itens_sem_ref
  INTO v_resumo_itens
  FROM public.compras_pedidos_itens
  WHERE pedido_id = p_pedido_id;

  IF v_resumo_itens.itens_negativos > 0 THEN
    RAISE EXCEPTION 'Pedido contém itens com quantidade negativa, violando as regras financeiras e operacionais'
      USING errcode = '23514';
  END IF;

  IF v_resumo_itens.total_itens = 0 THEN
    RAISE EXCEPTION 'Não é permitido aprovar um pedido sem itens cadastrados'
      USING errcode = '23514';
  END IF;

  IF v_resumo_itens.itens_pendentes > 0 OR v_pedido.status IN ('aguardando_estoque', 'estoque_incompleto') THEN
    IF NOT COALESCE(p_permitir_incompleto, FALSE) THEN
      RAISE EXCEPTION 'Não é permitido aprovar pedido com estoque incompleto (% itens pendentes de contagem). Conclua a conferência física ou aprove com justificativa administrativa expressa.', v_resumo_itens.itens_pendentes
        USING errcode = '23514';
    END IF;

    IF p_justificativa_incompleto IS NULL OR length(trim(p_justificativa_incompleto)) < 5 THEN
      RAISE EXCEPTION 'Aprovação de pedido com estoque incompleto exige justificativa administrativa obrigatória (mínimo de 5 caracteres)'
        USING errcode = '23514';
    END IF;
  END IF;

  -- F. Atualização Segura e Registro de Auditoria
  UPDATE public.compras_pedidos
     SET status = 'aprovado',
         observacoes = CASE 
           WHEN p_permitir_incompleto THEN 
             COALESCE(observacoes, '') || E'\n[APROVAÇÃO PARCIAL] Por: ' || COALESCE(v_caller_id::text, 'service') || ' em ' || timezone('utc', now())::text || '. Justificativa: ' || trim(p_justificativa_incompleto)
           ELSE observacoes 
         END,
         updated_at = timezone('utc', now())
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'status', 'aprovado',
    'aprovado_por', v_caller_id,
    'aprovado_em', timezone('utc', now()),
    'aprovacao_parcial', COALESCE(p_permitir_incompleto, FALSE),
    'itens_pendentes_preservados', v_resumo_itens.itens_pendentes
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC ATÔMICA registrar_item_conferencia_estoque (Gates 5, 6, 7 e 9)
-- ---------------------------------------------------------------------
-- Registra ou atualiza conferência de item atômica no banco,
-- recalcula o pedido correspondente e respeita imutabilidade de pedidos aprovados.
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
  v_linhas_texto TEXT[];
  v_item_row RECORD;
  v_texto_pedido TEXT;
  v_formato_lista TEXT := 'padrao';
BEGIN
  -- A. Autenticação e Autorização
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT public.is_active_workspace_member(p_workspace_id, v_caller_id)
      INTO v_is_authorized;
    IF NOT COALESCE(v_is_authorized, FALSE) THEN
      RAISE EXCEPTION 'Acesso negado: usuário não é membro ativo do workspace'
        USING errcode = '42501';
    END IF;
  ELSE
    IF current_user = 'postgres' OR COALESCE(auth.role(), '') = 'service_role' THEN
      v_is_authorized := TRUE;
    ELSE
      RAISE EXCEPTION 'Acesso negado: contexto não autorizado'
        USING errcode = '42501';
    END IF;
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
      p_origem_tipo
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

  -- D. Inserir ou Atualizar Atomicamente o Item na Conferência (UPSERT via uk_compras_conf_itens_produto)
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
    COALESCE(p_informado_por_usuario_id, v_caller_id),
    p_informado_por_telegram_id,
    p_informado_por_nome,
    timezone('utc', now()),
    p_observacoes
  )
  ON CONFLICT (conferencia_id, produto_nome) DO UPDATE
    SET quantidade_informada = EXCLUDED.quantidade_informada,
        tipo_informacao = EXCLUDED.tipo_informacao,
        origem_tipo = EXCLUDED.origem_tipo,
        informado_por_usuario_id = COALESCE(EXCLUDED.informado_por_usuario_id, public.compras_estoque_conferencias_itens.informado_por_usuario_id),
        informado_por_telegram_id = COALESCE(EXCLUDED.informado_por_telegram_id, public.compras_estoque_conferencias_itens.informado_por_telegram_id),
        informado_por_nome = COALESCE(EXCLUDED.informado_por_nome, public.compras_estoque_conferencias_itens.informado_por_nome),
        informado_em = timezone('utc', now()),
        observacoes = COALESCE(EXCLUDED.observacoes, public.compras_estoque_conferencias_itens.observacoes),
        updated_at = timezone('utc', now())
  RETURNING id INTO v_conf_item_id;

  -- E. Verificar Pedido Associado
  SELECT id, status INTO v_pedido_id, v_pedido_status
    FROM public.compras_pedidos
   WHERE workspace_id = p_workspace_id
     AND fornecedor_nome = p_fornecedor_nome
     AND data_pedido = p_data_operacional;

  -- GATE 7/12: Pedido aprovado ou enviado é IMUTÁVEL
  IF v_pedido_id IS NOT NULL AND v_pedido_status IN ('aprovado', 'enviado', 'recebido') THEN
    v_pedido_protegido := TRUE;
    RETURN jsonb_build_object(
      'conferencia_id', v_conferencia_id,
      'conferencia_item_id', v_conf_item_id,
      'pedido_id', v_pedido_id,
      'pedido_status', v_pedido_status,
      'pedido_protegido', TRUE,
      'mensagem', 'Conferência gravada, mas o pedido já está ' || v_pedido_status || ' e permanece protegido contra alterações.'
    );
  END IF;

  -- F. Se houver pedido em aberto, atualizar item e recalcular
  IF v_pedido_id IS NOT NULL THEN
    IF p_quantidade_informada IS NOT NULL THEN
      v_sugerida := GREATEST(0, COALESCE(v_ref_qtd, 0) - p_quantidade_informada);
    ELSE
      v_sugerida := NULL;
    END IF;

    UPDATE public.compras_pedidos_itens
       SET estoque_atual = p_quantidade_informada,
           quantidade_sugerida = v_sugerida,
           quantidade_ajustada = v_sugerida,
           status_estoque = p_tipo_informacao,
           conferencia_item_id = v_conf_item_id,
           contagem_origem = p_origem_tipo,
           contagem_confirmada_em = timezone('utc', now()),
           updated_at = timezone('utc', now())
     WHERE pedido_id = v_pedido_id
       AND (produto_nome = p_produto_nome OR (v_ref_id IS NOT NULL AND produto_referencia_id = v_ref_id));

    -- Recalcular pendências no pedido
    SELECT 
      count(*) AS total,
      count(*) FILTER (WHERE status_estoque = 'pendente_contagem' OR estoque_atual IS NULL) AS pendentes
    INTO v_total_itens, v_itens_pendentes
    FROM public.compras_pedidos_itens
    WHERE pedido_id = v_pedido_id;

    IF v_itens_pendentes = 0 AND v_total_itens > 0 THEN
      v_novo_status_pedido := 'pedido_calculado';
    ELSIF v_itens_pendentes = v_total_itens THEN
      v_novo_status_pedido := 'aguardando_estoque';
    ELSE
      v_novo_status_pedido := 'estoque_incompleto';
    END IF;

    -- Obter formato da lista do calendário
    SELECT COALESCE(formato_lista, 'padrao') INTO v_formato_lista
      FROM public.compras_fornecedores_calendario
     WHERE workspace_id = p_workspace_id
       AND fornecedor_nome = p_fornecedor_nome
     LIMIT 1;

    -- Reconstruir texto formatado do pedido
    v_linhas_texto := ARRAY[]::TEXT[];
    FOR v_item_row IN 
      SELECT produto_nome, quantidade_referencia, quantidade_sugerida, unidade_medida, status_estoque
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
       ORDER BY produto_nome ASC
    LOOP
      IF v_item_row.quantidade_sugerida IS NOT NULL AND v_item_row.quantidade_sugerida > 0 THEN
        IF v_formato_lista = 'salgados_soma' THEN
          v_linhas_texto := array_append(v_linhas_texto, v_item_row.quantidade_referencia::text || ' | ' || v_item_row.produto_nome || ' = ' || v_item_row.quantidade_sugerida::text);
        ELSIF v_formato_lista = 'bebidas_sem_ref' THEN
          v_linhas_texto := array_append(v_linhas_texto, v_item_row.produto_nome || ' = ' || v_item_row.quantidade_sugerida::text);
        ELSE
          v_linhas_texto := array_append(v_linhas_texto, '- ' || v_item_row.produto_nome || ': ' || v_item_row.quantidade_sugerida::text || ' ' || v_item_row.unidade_medida);
        END IF;
      ELSIF v_item_row.status_estoque = 'pendente_contagem' THEN
        v_linhas_texto := array_append(v_linhas_texto, '⏳ ' || v_item_row.produto_nome || ': aguardando contagem');
      END IF;
    END LOOP;

    IF v_formato_lista = 'salgados_soma' THEN
      v_texto_pedido := '🔸 SALGADOS – QUANTIDADE PARA COMPRAR' || E'\n' || array_to_string(v_linhas_texto, E'\n');
    ELSE
      v_texto_pedido := '📦 PEDIDO — ' || UPPER(p_fornecedor_nome) || E'\n' || array_to_string(v_linhas_texto, E'\n');
    END IF;

    UPDATE public.compras_pedidos
       SET status = v_novo_status_pedido,
           texto_pedido_formatado = v_texto_pedido,
           updated_at = timezone('utc', now())
     WHERE id = v_pedido_id;
  END IF;

  RETURN jsonb_build_object(
    'conferencia_id', v_conferencia_id,
    'conferencia_item_id', v_conf_item_id,
    'pedido_id', v_pedido_id,
    'pedido_status', COALESCE(v_novo_status_pedido, 'sem_pedido_ativo'),
    'itens_pendentes', v_itens_pendentes,
    'total_itens', v_total_itens,
    'quantidade_informada', p_quantidade_informada,
    'sugerida_calculada', v_sugerida,
    'pedido_protegido', FALSE
  );
END;
$$;
