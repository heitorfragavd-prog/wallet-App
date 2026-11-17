-- =============================================================================
-- Migration 109: Integridade de Estoque, Idempotência e Menor Privilégio em Compras (Etapa 4C - Rodo Point)
-- =============================================================================

-- 1. Atualizar Check Constraint de Status em compras_pedidos
ALTER TABLE public.compras_pedidos 
  DROP CONSTRAINT IF EXISTS compras_pedidos_status_check;

ALTER TABLE public.compras_pedidos 
  ADD CONSTRAINT compras_pedidos_status_check
  CHECK (status IN (
    'sugerido', 
    'revisado', 
    'aguardando_estoque', 
    'estoque_incompleto', 
    'estoque_confirmado', 
    'pedido_calculado', 
    'aguardando_aprovacao', 
    'aprovado', 
    'enviado', 
    'recebido', 
    'cancelado'
  ));

-- 2. Garantir Idempotência Estrita em compras_pedidos (Workspace, Fornecedor, Data)
CREATE UNIQUE INDEX IF NOT EXISTS uk_compras_pedidos_dia_fornecedor
  ON public.compras_pedidos(workspace_id, fornecedor_nome, data_pedido);

-- 3. Adicionar Configurações de Canal e Limite em compras_fornecedores_calendario
ALTER TABLE public.compras_fornecedores_calendario
  ADD COLUMN IF NOT EXISTS canal_compra TEXT NOT NULL DEFAULT 'direto'
    CHECK (canal_compra IN ('direto', 'online', 'distribuidor', 'representante')),
  ADD COLUMN IF NOT EXISTS limite_max_sugerido NUMERIC(10, 2) DEFAULT NULL;

-- 4. Ajustar compras_produtos_referencia: Limite padrão nulo para compras diretas
ALTER TABLE public.compras_produtos_referencia
  ALTER COLUMN limite_max_sugerido SET DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS categoria_exibicao TEXT DEFAULT NULL;

-- Atualizar produtos existentes de Salgados e Bebidas diretos para remover o limite de 50 imposto na 107
UPDATE public.compras_produtos_referencia
   SET limite_max_sugerido = NULL
 WHERE fornecedor_nome IN ('Salgados', 'Coca-Cola', 'Ambev', 'Ceasa')
   AND limite_max_sugerido = 50;

-- 5. Tabela: compras_estoque_conferencias (Controle da sessão de conferência física/Telegram)
CREATE TABLE IF NOT EXISTS public.compras_estoque_conferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pedido_id UUID REFERENCES public.compras_pedidos(id) ON DELETE SET NULL,
  fornecedor_id UUID REFERENCES public.compras_fornecedores_calendario(id) ON DELETE SET NULL,
  fornecedor_nome TEXT NOT NULL,
  data_operacional DATE NOT NULL DEFAULT CURRENT_DATE,
  solicitado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  status TEXT NOT NULL DEFAULT 'pendente' 
    CHECK (status IN ('pendente', 'em_conferencia', 'parcial', 'concluido', 'cancelado')),
  origem TEXT NOT NULL DEFAULT 'telegram' 
    CHECK (origem IN ('telegram', 'manual', 'painel')),
  telegram_chat_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uk_compras_conferencia_dia UNIQUE (workspace_id, fornecedor_nome, data_operacional)
);

CREATE INDEX IF NOT EXISTS idx_compras_conf_lookup 
  ON public.compras_estoque_conferencias(workspace_id, fornecedor_nome, data_operacional);

-- 6. Tabela: compras_estoque_conferencias_itens (Histórico atômico e auditável de contagens)
CREATE TABLE IF NOT EXISTS public.compras_estoque_conferencias_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conferencia_id UUID NOT NULL REFERENCES public.compras_estoque_conferencias(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  produto_referencia_id UUID REFERENCES public.compras_produtos_referencia(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  quantidade_informada NUMERIC(12, 3),
  unidade_medida TEXT NOT NULL DEFAULT 'unidade',
  tipo_informacao TEXT NOT NULL DEFAULT 'pendente' 
    CHECK (tipo_informacao IN ('confirmado_zero', 'confirmado_positivo', 'pendente', 'inconsistente')),
  confianca NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
  origem_tipo TEXT NOT NULL DEFAULT 'manual' 
    CHECK (origem_tipo IN ('telegram_texto', 'telegram_foto', 'telegram_audio', 'manual', 'eyemobile')),
  arquivo_url TEXT,
  transcricao TEXT,
  informado_por_usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  informado_por_telegram_id BIGINT,
  informado_por_nome TEXT,
  informado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_compras_conf_itens_lookup 
  ON public.compras_estoque_conferencias_itens(conferencia_id, produto_nome);

-- 7. Atualizar compras_pedidos_itens: suporte a estoque pendente (sem estoque zero falso)
ALTER TABLE public.compras_pedidos_itens
  ALTER COLUMN quantidade_sugerida DROP NOT NULL,
  ALTER COLUMN quantidade_ajustada DROP NOT NULL,
  ALTER COLUMN estoque_atual DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status_estoque TEXT NOT NULL DEFAULT 'pendente_contagem'
    CHECK (status_estoque IN ('pendente_contagem', 'confirmado_zero', 'confirmado_positivo', 'inconsistente')),
  ADD COLUMN IF NOT EXISTS contagem_origem TEXT 
    CHECK (contagem_origem IN ('telegram_texto', 'telegram_foto', 'telegram_audio', 'manual', 'eyemobile')),
  ADD COLUMN IF NOT EXISTS contagem_confirmada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferencia_item_id UUID REFERENCES public.compras_estoque_conferencias_itens(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_compras_pedidos_itens_prod
  ON public.compras_pedidos_itens(pedido_id, produto_nome);

-- 8. Refatoração da RPC: gerar_sugestoes_compras_dia (Idempotência, Menor Privilégio e Sem Zero Falso)
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
  -- A. Validação de Autenticação e Menor Privilégio
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
  ELSE
    -- Chamadas internas do sistema (ex: agendamento cron no servidor)
    v_is_exec := TRUE;
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

    -- Se não existir pedido, cria em estado 'aguardando_estoque'
    IF v_pedido_id IS NULL THEN
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
        'aguardando_estoque',
        v_aumento,
        v_simulacao
      )
      RETURNING id INTO v_pedido_id;
    ELSE
      -- Atualiza aumento temporário se fornecido
      UPDATE public.compras_pedidos
         SET aumento_temporario_pct = v_aumento,
             simulacao = v_simulacao,
             updated_at = timezone('utc', now())
       WHERE id = v_pedido_id;
    END IF;

    -- E. Criar ou Obter Sessão de Conferência de Estoque Idempotente
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
      'pendente',
      'telegram'
    )
    ON CONFLICT (workspace_id, fornecedor_nome, data_operacional) 
    DO UPDATE SET pedido_id = EXCLUDED.pedido_id, updated_at = timezone('utc', now())
    RETURNING id INTO v_conferencia_id;

    -- F. Processar cada produto de referência do fornecedor
    FOR v_prod IN
      SELECT *
        FROM public.compras_produtos_referencia
       WHERE workspace_id = p_workspace_id
         AND fornecedor_nome = v_forn.fornecedor_nome
         AND ativo = TRUE
       ORDER BY produto_nome ASC
    LOOP
      -- Obter conferência mais recente do item, se houver
      SELECT * INTO v_conf_item
        FROM public.compras_estoque_conferencias_itens
       WHERE conferencia_id = v_conferencia_id
         AND produto_nome = v_prod.produto_nome
       ORDER BY informado_em DESC
       LIMIT 1;

      -- Verificar se o item já existe no pedido (preservar edições manuais)
      SELECT * INTO v_existing_item
        FROM public.compras_pedidos_itens
       WHERE pedido_id = v_pedido_id
         AND produto_nome = v_prod.produto_nome;

      -- Cálculo base com aumento temporário
      v_ref_ajustada := v_prod.quantidade_referencia * (1 + v_aumento / 100.0);
      v_limite_aplicado := FALSE;

      -- GATE 2: DISTINGUIR ESTOQUE DESCONHECIDO DE ZERO
      IF v_conf_item.id IS NOT NULL AND v_conf_item.tipo_informacao = 'confirmado_zero' THEN
        v_status_estoque_item := 'confirmado_zero';
        v_sugerida := GREATEST(0, CEIL(v_ref_ajustada - 0));
      ELSIF v_conf_item.id IS NOT NULL AND v_conf_item.tipo_informacao = 'confirmado_positivo' THEN
        v_status_estoque_item := 'confirmado_positivo';
        v_sugerida := GREATEST(0, CEIL(v_ref_ajustada - COALESCE(v_conf_item.quantidade_informada, 0)));
      ELSE
        -- NÃO HÁ CONTAGEM CONFIRMADA: NUNCA INVENTAR ZERO
        v_status_estoque_item := 'pendente_contagem';
        v_sugerida := NULL;
        v_itens_pendentes_count := v_itens_pendentes_count + 1;
      END IF;

      -- GATE 4: LIMITE APLICADO APENAS A CANAL ONLINE OU PRODUTO COM LIMITE CONFIGURADO
      v_limite_max := COALESCE(v_prod.limite_max_sugerido, v_forn.limite_max_sugerido);
      IF v_sugerida IS NOT NULL AND (v_forn.canal_compra = 'online' OR v_limite_max IS NOT NULL) THEN
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
               -- Preserva edição manual do administrador se já havia quantidade_ajustada
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
          -- GATE 5: 190 | Coxinha = 90 (REF à esquerda, quantidade à direita)
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

-- 9. RPC de Aprovação Administrativa de Pedido de Compras (Menor Privilégio Estrito)
CREATE OR REPLACE FUNCTION public.aprovar_pedido_compras(
  p_pedido_id UUID,
  p_workspace_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_is_exec BOOLEAN := FALSE;
  v_pedido RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: operação requer usuário autenticado'
      USING errcode = '42501';
  END IF;

  SELECT public.is_workspace_executive(p_workspace_id, v_caller_id)
    INTO v_is_exec;

  IF NOT COALESCE(v_is_exec, FALSE) THEN
    RAISE EXCEPTION 'Apenas executivos e administradores podem aprovar pedidos de compras'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_pedido
    FROM public.compras_pedidos
   WHERE id = p_pedido_id
     AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado neste workspace'
      USING errcode = 'P0002';
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é permitido aprovar um pedido cancelado'
      USING errcode = '23514';
  END IF;

  IF v_pedido.status = 'enviado' THEN
    RAISE EXCEPTION 'Pedido já foi enviado anteriormente'
      USING errcode = '23514';
  END IF;

  UPDATE public.compras_pedidos
     SET status = 'aprovado',
         updated_at = timezone('utc', now())
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'status', 'aprovado',
    'aprovado_por', v_caller_id,
    'aprovado_em', timezone('utc', now())
  );
END;
$$;

-- 10. Políticas RLS com Menor Privilégio Estrito (Gate 15)
ALTER TABLE public.compras_fornecedores_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_produtos_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_pedidos_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_estoque_conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_estoque_conferencias_itens ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas antes de aplicar as novas com menor privilégio
DROP POLICY IF EXISTS rls_compras_calendario_select ON public.compras_fornecedores_calendario;
DROP POLICY IF EXISTS rls_compras_calendario_admin ON public.compras_fornecedores_calendario;
DROP POLICY IF EXISTS rls_compras_prod_ref_select ON public.compras_produtos_referencia;
DROP POLICY IF EXISTS rls_compras_prod_ref_admin ON public.compras_produtos_referencia;
DROP POLICY IF EXISTS rls_compras_config_select ON public.compras_config;
DROP POLICY IF EXISTS rls_compras_config_admin ON public.compras_config;
DROP POLICY IF EXISTS rls_compras_pedidos_select ON public.compras_pedidos;
DROP POLICY IF EXISTS rls_compras_pedidos_insert ON public.compras_pedidos;
DROP POLICY IF EXISTS rls_compras_pedidos_update ON public.compras_pedidos;
DROP POLICY IF EXISTS rls_compras_itens_select ON public.compras_pedidos_itens;
DROP POLICY IF EXISTS rls_compras_itens_insert ON public.compras_pedidos_itens;
DROP POLICY IF EXISTS rls_compras_itens_update ON public.compras_pedidos_itens;

-- compras_fornecedores_calendario: Qualquer membro lê; apenas executivos alteram
CREATE POLICY rls_compras_calendario_select ON public.compras_fornecedores_calendario
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_calendario_admin ON public.compras_fornecedores_calendario
  FOR ALL TO authenticated
  USING (public.is_workspace_executive(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_executive(workspace_id, auth.uid()));

-- compras_produtos_referencia: Qualquer membro lê; apenas executivos alteram
CREATE POLICY rls_compras_prod_ref_select ON public.compras_produtos_referencia
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_prod_ref_admin ON public.compras_produtos_referencia
  FOR ALL TO authenticated
  USING (public.is_workspace_executive(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_executive(workspace_id, auth.uid()));

-- compras_config: Qualquer membro lê; apenas executivos alteram
CREATE POLICY rls_compras_config_select ON public.compras_config
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_config_admin ON public.compras_config
  FOR ALL TO authenticated
  USING (public.is_workspace_executive(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_executive(workspace_id, auth.uid()));

-- compras_pedidos: Membros leem; Executivos aprovam/alteram
CREATE POLICY rls_compras_pedidos_select ON public.compras_pedidos
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_pedidos_admin ON public.compras_pedidos
  FOR UPDATE TO authenticated
  USING (public.is_workspace_executive(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_executive(workspace_id, auth.uid()));

-- compras_pedidos_itens: Membros leem; Executivos alteram quantidades
CREATE POLICY rls_compras_itens_select ON public.compras_pedidos_itens
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_itens_admin ON public.compras_pedidos_itens
  FOR ALL TO authenticated
  USING (public.is_workspace_executive(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_executive(workspace_id, auth.uid()));

-- compras_estoque_conferencias: Membros leem e inserem sessões
CREATE POLICY rls_compras_conf_select ON public.compras_estoque_conferencias
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_conf_insert ON public.compras_estoque_conferencias
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_conf_update ON public.compras_estoque_conferencias
  FOR UPDATE TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()));

-- compras_estoque_conferencias_itens: Colaboradores registram e editam contagem própria
CREATE POLICY rls_compras_conf_itens_select ON public.compras_estoque_conferencias_itens
  FOR SELECT TO authenticated
  USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_conf_itens_insert ON public.compras_estoque_conferencias_itens
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE POLICY rls_compras_conf_itens_update ON public.compras_estoque_conferencias_itens
  FOR UPDATE TO authenticated
  USING (
    public.is_workspace_executive(workspace_id, auth.uid()) OR
    (public.is_active_workspace_member(workspace_id, auth.uid()) AND informado_por_usuario_id = auth.uid())
  )
  WITH CHECK (
    public.is_workspace_executive(workspace_id, auth.uid()) OR
    (public.is_active_workspace_member(workspace_id, auth.uid()) AND informado_por_usuario_id = auth.uid())
  );
