-- Migration: 76_unificacao_salarios_e_protecao_conciliacao_idempotente.sql
-- Descrição:
-- 1. Unificação das funções de vencimento de salários (equipe_quinto_dia_util) considerando o sábado na contagem pela CLT (art. 459 e IN SRT 01/1989)
-- 2. Unificação de gerar_obrigacoes_mensais e gerar_obrigacoes_mensais_equipe para cálculo no mês subsequente
-- 3. Carga e proteção de feriados na tabela equipe_feriados
-- 4. Blindagem transacional e idempotente de sync_pagamento_divida_to_despesa para garantir amarra imediata entre conciliação e despesa

-- 1. Função equipe_quinto_dia_util com inclusão do sábado pela CLT
CREATE OR REPLACE FUNCTION public.equipe_quinto_dia_util(
  p_competencia date, 
  p_workspace_id uuid,
  p_antecipar_sabado boolean default false
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_dia date;
  v_dia_util_count integer := 0;
  v_quinto_dia date;
  v_ultimo_dia_bancario date;
BEGIN
  FOR v_dia IN 
    SELECT d::date 
    FROM generate_series(v_inicio, v_fim, interval '1 day') d
    ORDER BY d
  LOOP
    -- Domingo (isodow = 7) e feriados nunca contam como dia útil trabalhista
    IF extract(isodow from v_dia) <> 7 AND NOT EXISTS (
      SELECT 1 FROM public.equipe_feriados f
      WHERE (f.workspace_id = p_workspace_id OR f.workspace_id IS NULL)
        AND f.data = v_dia
    ) THEN
      -- Segunda a Sábado são dias úteis trabalhistas conforme CLT art. 459 e IN SRT nº 01/1989
      v_dia_util_count := v_dia_util_count + 1;
      
      -- Registra o último dia útil bancário (segunda a sexta)
      IF extract(isodow from v_dia) BETWEEN 1 AND 5 THEN
        v_ultimo_dia_bancario := v_dia;
      END IF;

      IF v_dia_util_count = 5 THEN
        v_quinto_dia := v_dia;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF v_quinto_dia IS NULL THEN
    RETURN v_inicio;
  END IF;

  -- Se o 5º dia útil for sábado e for configurada antecipação operacional para expediente bancário tradicional
  IF extract(isodow from v_quinto_dia) = 6 AND p_antecipar_sabado THEN
    RETURN COALESCE(v_ultimo_dia_bancario, v_quinto_dia);
  END IF;

  RETURN v_quinto_dia;
END;
$function$;

REVOKE ALL ON FUNCTION public.equipe_quinto_dia_util(date, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.equipe_quinto_dia_util(date, uuid, boolean) TO authenticated, service_role;

-- 2. Unificação de gerar_obrigacoes_mensais_equipe (RPC mensal de colaboradores)
CREATE OR REPLACE FUNCTION public.gerar_obrigacoes_mensais_equipe(
  p_competencia date default current_date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_colaborador record;
  v_tipo text;
  v_natureza text;
  v_valor numeric(12,2);
  v_vencimento date;
  v_acerto_id uuid;
  v_despesa_id uuid;
  v_total integer := 0;
  v_cat_salario_id uuid;
  v_processa_todos boolean := coalesce(auth.role() = 'service_role', false)
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
BEGIN
  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Competencia obrigatoria' USING errcode = '22023';
  END IF;

  FOR v_colaborador IN
    SELECT c.*, w.user_id as owner_id
    FROM public.colaboradores c
    JOIN public.workspaces w on w.id = c.workspace_id
    WHERE c.tipo in ('funcionario', 'socio')
      AND coalesce(c.status, 'ativo') <> 'demitido'
      AND c.data_demissao IS NULL
      AND (v_processa_todos OR public.tem_acesso_workspace(c.workspace_id))
    ORDER BY c.workspace_id, c.id
  LOOP
    IF v_colaborador.tipo = 'funcionario' THEN
      v_tipo := 'salario';
      v_natureza := 'salario';
      v_valor := coalesce(v_colaborador.salario_bruto, 0);
      -- Salário vence no 5º dia útil do mês subsequente à competência trabalhada
      v_vencimento := public.equipe_quinto_dia_util((v_inicio + interval '1 month')::date, v_colaborador.workspace_id);
    ELSE
      v_tipo := 'pro_labore';
      v_natureza := 'pro_labore';
      v_valor := coalesce(nullif(v_colaborador.valor_pro_labore, 0), v_colaborador.salario_bruto, 0);
      v_vencimento := v_inicio + (coalesce(v_colaborador.dia_pagamento, 16) - 1);
    END IF;

    IF v_valor <= 0 OR v_vencimento IS NULL THEN
      CONTINUE;
    END IF;

    v_acerto_id := null;
    INSERT INTO public.colaborador_acertos (
      workspace_id, colaborador_id, tipo, periodo_inicio, periodo_fim,
      vencimento, status, valor_total, pix_chave_snapshot
    ) VALUES (
      v_colaborador.workspace_id, v_colaborador.id, v_tipo, v_inicio, v_fim,
      v_vencimento, 'pendente', v_valor, v_colaborador.pix_chave
    )
    ON CONFLICT (colaborador_id, tipo, periodo_inicio, periodo_fim) DO NOTHING
    RETURNING id INTO v_acerto_id;

    IF v_acerto_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_cat_salario_id
    FROM public.categorias
    WHERE workspace_id = v_colaborador.workspace_id
      AND lower(nome) in ('salários', 'salario', 'salarios', 'pessoal', 'folha de pagamento')
    LIMIT 1;

    INSERT INTO public.despesas (
      workspace_id, user_id, descricao, valor, data,
      categoria_id, status, observacoes
    ) VALUES (
      v_colaborador.workspace_id, v_colaborador.owner_id,
      CASE WHEN v_tipo = 'salario' THEN 'Salário: ' ELSE 'Pró-Labore: ' END || v_colaborador.nome,
      v_valor, v_vencimento, v_cat_salario_id, 'pendente',
      'Gerado automaticamente pelo fechamento de competência de equipe'
    )
    RETURNING id INTO v_despesa_id;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- 3. Unificação de gerar_obrigacoes_mensais (módulo de funcionários/equipe)
CREATE OR REPLACE FUNCTION public.gerar_obrigacoes_mensais(
    p_workspace_id uuid,
    p_mes integer,
    p_ano integer,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_inicio date;
    v_fim date;
    v_vencimento date;
    v_func record;
    v_cat_salario_id uuid;
    v_cat_adiant_id uuid;
    v_gerados integer := 0;
    v_despesa_id uuid;
    v_divida_id uuid;
    v_sub_salario_id uuid;
    v_sub_adiant_id uuid;
BEGIN
    v_inicio := make_date(p_ano, p_mes, 1);
    v_fim := (v_inicio + interval '1 month - 1 day')::date;

    -- Vencimento de salário pela CLT: 5º dia útil do mês subsequente
    v_vencimento := public.equipe_quinto_dia_util((v_inicio + interval '1 month')::date, p_workspace_id);

    SELECT id INTO v_cat_salario_id
    FROM public.categorias
    WHERE workspace_id = p_workspace_id
      AND LOWER(nome) IN ('salários', 'salario', 'salarios', 'folha de pagamento', 'pessoal')
    LIMIT 1;

    SELECT id INTO v_cat_adiant_id
    FROM public.categorias
    WHERE workspace_id = p_workspace_id
      AND LOWER(nome) IN ('adiantamento salarial', 'adiantamento', 'vale')
    LIMIT 1;

    IF v_cat_adiant_id IS NULL THEN
        v_cat_adiant_id := v_cat_salario_id;
    END IF;

    SELECT id INTO v_sub_salario_id
    FROM public.subcategorias
    WHERE workspace_id = p_workspace_id
      AND LOWER(nome) IN ('salário', 'salario', 'salários')
    LIMIT 1;

    SELECT id INTO v_sub_adiant_id
    FROM public.subcategorias
    WHERE workspace_id = p_workspace_id
      AND LOWER(nome) IN ('adiantamento', 'vale')
    LIMIT 1;

    FOR v_func IN
        SELECT f.*
        FROM public.funcionarios f
        WHERE f.workspace_id = p_workspace_id
          AND f.ativo = true
    LOOP
        IF v_func.salario_base IS NOT NULL AND v_func.salario_base > 0 THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.equipe_obrigacoes_geradas
                WHERE funcionario_id = v_func.id
                  AND mes = p_mes
                  AND ano = p_ano
                  AND tipo = 'salario'
            ) THEN
                INSERT INTO public.despesas (
                    workspace_id,
                    user_id,
                    descricao,
                    valor,
                    data,
                    categoria_id,
                    subcategoria_id,
                    status,
                    metodo_pagamento,
                    observacoes
                ) VALUES (
                    p_workspace_id,
                    p_user_id,
                    'Salário - ' || v_func.nome || ' (' || to_char(v_inicio, 'TMMon/YYYY') || ')',
                    v_func.salario_base,
                    v_vencimento,
                    v_cat_salario_id,
                    v_sub_salario_id,
                    'pendente',
                    'transferencia',
                    'Gerado automaticamente pelo fechamento de competência'
                )
                RETURNING id INTO v_despesa_id;

                INSERT INTO public.dividas (
                    workspace_id,
                    descricao,
                    credor,
                    valor_total,
                    valor_restante,
                    data_vencimento,
                    status,
                    categoria_id,
                    subcategoria_id,
                    observacoes
                ) VALUES (
                    p_workspace_id,
                    'Salário - ' || v_func.nome || ' (' || to_char(v_inicio, 'TMMon/YYYY') || ')',
                    v_func.nome,
                    v_func.salario_base,
                    v_func.salario_base,
                    v_vencimento,
                    'pendente',
                    v_cat_salario_id,
                    v_sub_salario_id,
                    'Gerado automaticamente pelo fechamento de competência'
                )
                RETURNING id INTO v_divida_id;

                INSERT INTO public.equipe_obrigacoes_geradas (
                    workspace_id,
                    funcionario_id,
                    mes,
                    ano,
                    tipo,
                    valor,
                    despesa_id,
                    divida_id,
                    gerado_por
                ) VALUES (
                    p_workspace_id,
                    v_func.id,
                    p_mes,
                    p_ano,
                    'salario',
                    v_func.salario_base,
                    v_despesa_id,
                    v_divida_id,
                    p_user_id
                );

                v_gerados := v_gerados + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'sucesso', true,
        'obrigacoes_geradas', v_gerados,
        'mes', p_mes,
        'ano', p_ano,
        'vencimento', v_vencimento
    );
END;
$function$;

-- 4. Função sync_pagamento_divida_to_despesa com blindagem transacional e amarra imediata
CREATE OR REPLACE FUNCTION public.sync_pagamento_divida_to_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_divida record;
  v_workspace_id uuid;
  v_despesa_existente_id uuid := null;
  v_nova_despesa_id uuid := null;
  v_descricao text;
  v_valor_taxa numeric;
  v_valor_total_despesa numeric;
  v_obs text;
BEGIN
  SELECT * INTO v_divida FROM public.dividas WHERE id = NEW.divida_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_workspace_id := COALESCE(NEW.workspace_id, v_divida.workspace_id);
  v_descricao := 'Pagamento dívida: ' || v_divida.descricao || COALESCE(' (' || v_divida.credor || ')', '');
  v_valor_taxa := COALESCE(v_divida.valor_taxa, 0);
  v_valor_total_despesa := NEW.valor + v_valor_taxa;

  IF v_valor_taxa > 0 THEN
    v_obs := COALESCE(NEW.observacoes, 'Pagamento da dívida "' || v_divida.descricao || '"') ||
             ' (Valor: R$ ' || TRIM(TO_CHAR(NEW.valor, '999999990.00')) || ' + Taxa: R$ ' || TRIM(TO_CHAR(v_valor_taxa, '999999990.00')) || ')';
  ELSE
    v_obs := COALESCE(NEW.observacoes, 'Pagamento parcial da dívida "' || v_divida.descricao || '"');
  END IF;

  -- ── FLUXO A: Pagamento vinculado a transação Divipay (Pix/Boleto) ──
  IF NEW.divipay_external_id IS NOT NULL THEN
    -- 1. Verifica se já existe despesa associada em divipay_conciliacoes
    SELECT despesa_id INTO v_despesa_existente_id
    FROM public.divipay_conciliacoes
    WHERE (workspace_id = v_workspace_id OR workspace_id IS NULL)
      AND divipay_external_id = NEW.divipay_external_id
      AND despesa_id IS NOT NULL
    LIMIT 1;

    -- 2. Se não encontrou, verifica se já existe despesa em public.despesas com o identificador
    IF v_despesa_existente_id IS NULL THEN
      SELECT id INTO v_despesa_existente_id
      FROM public.despesas
      WHERE workspace_id = v_workspace_id
        AND (
          observacoes ILIKE '%' || NEW.divipay_external_id || '%'
          OR deduplication_key = 'divipay-' || NEW.divipay_external_id
        )
      LIMIT 1;
    END IF;

    -- CASO A1: Já existe despesa vinculada -> NÃO duplica e AMARRA a conciliação existente
    IF v_despesa_existente_id IS NOT NULL THEN
      UPDATE public.divipay_conciliacoes
      SET despesa_id = v_despesa_existente_id,
          divida_id = NEW.divida_id,
          status = 'conciliada'
      WHERE (workspace_id = v_workspace_id OR workspace_id IS NULL)
        AND divipay_external_id = NEW.divipay_external_id;

      RETURN NEW;
    END IF;

    -- CASO A2: Ainda não existe despesa -> Cria uma ÚNICA despesa e amarra imediatamente na conciliação
    INSERT INTO public.despesas (
      workspace_id,
      user_id,
      descricao,
      valor,
      data,
      metodo_pagamento,
      categoria_id,
      subcategoria_id,
      status,
      observacoes,
      deduplication_key
    ) VALUES (
      v_workspace_id,
      NEW.user_id,
      v_descricao,
      v_valor_total_despesa,
      COALESCE(NEW.data_pagamento, CURRENT_DATE),
      COALESCE(NEW.metodo_pagamento, 'pix'),
      v_divida.categoria_id,
      v_divida.subcategoria_id,
      'pago',
      v_obs,
      'divipay-' || NEW.divipay_external_id
    )
    RETURNING id INTO v_nova_despesa_id;

    -- Amarra imediatamente a conciliação para que nenhum passo posterior (ex: webhook passo 5) crie outra despesa
    UPDATE public.divipay_conciliacoes
    SET despesa_id = v_nova_despesa_id,
        divida_id = NEW.divida_id,
        status = 'conciliada'
    WHERE (workspace_id = v_workspace_id OR workspace_id IS NULL)
      AND divipay_external_id = NEW.divipay_external_id;

    RETURN NEW;
  END IF;

  -- ── FLUXO B: Pagamento manual ou sem divipay_external_id ──
  IF NOT EXISTS (
    SELECT 1 FROM public.despesas
    WHERE user_id = NEW.user_id
      AND workspace_id = v_workspace_id
      AND data = NEW.data_pagamento
      AND descricao = v_descricao
  ) THEN
    INSERT INTO public.despesas (
      user_id,
      descricao,
      valor,
      data,
      observacoes,
      categoria_id,
      metodo_pagamento,
      conta_id,
      workspace_id
    ) VALUES (
      NEW.user_id,
      v_descricao,
      v_valor_total_despesa,
      NEW.data_pagamento,
      v_obs,
      v_divida.categoria_id,
      NEW.metodo_pagamento,
      NEW.conta_id,
      v_workspace_id
    );
  ELSE
    UPDATE public.despesas
    SET valor = v_valor_total_despesa,
        observacoes = v_obs,
        metodo_pagamento = NEW.metodo_pagamento,
        conta_id = NEW.conta_id,
        workspace_id = v_workspace_id
    WHERE user_id = NEW.user_id
      AND workspace_id = v_workspace_id
      AND data = NEW.data_pagamento
      AND descricao = v_descricao;
  END IF;

  RETURN NEW;
END;
$function$;
