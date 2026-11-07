-- Migration: 75_hotfix_auditoria_sync_pagamento_e_salarios.sql
-- Descrição:
-- 1. Atualiza trigger sync_pagamento_divida_to_despesa para evitar duplicação de despesas já conciliadas pelo Divipay
-- 2. Atualiza procedure gerar_obrigacoes_mensais para calcular vencimento no 5º dia útil do mês subsequente

-- 1. Função sync_pagamento_divida_to_despesa com guarda anti-duplicação
CREATE OR REPLACE FUNCTION public.sync_pagamento_divida_to_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_divida record;
  v_workspace_id uuid;
  v_divipay_conciliada boolean := false;
BEGIN
  SELECT * INTO v_divida FROM public.dividas WHERE id = NEW.divida_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_workspace_id := COALESCE(NEW.workspace_id, v_divida.workspace_id);

  -- Se o pagamento estiver vinculado a uma conciliação Divipay existente, não duplica a despesa
  IF NEW.divipay_external_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.divipay_conciliacoes 
      WHERE workspace_id = v_workspace_id 
        AND divipay_external_id = NEW.divipay_external_id
        AND despesa_id IS NOT NULL
    ) INTO v_divipay_conciliada;

    IF v_divipay_conciliada THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.despesas (
    workspace_id,
    descricao,
    valor,
    data,
    metodo_pagamento,
    categoria_id,
    status,
    observacoes
  ) VALUES (
    v_workspace_id,
    'Pagamento: ' || v_divida.descricao,
    NEW.valor,
    COALESCE(NEW.data_pagamento, CURRENT_DATE),
    COALESCE(NEW.metodo_pagamento, 'outro'),
    v_divida.categoria_id,
    'pago',
    'Gerado automaticamente via baixa contábil de dívida (' || v_divida.id || ')'
  );

  RETURN NEW;
END;
$function$;

-- 2. Procedure gerar_obrigacoes_mensais ajustada para 5º dia útil do mês subsequente
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
