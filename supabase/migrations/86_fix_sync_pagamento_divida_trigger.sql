-- Migration 86: Fix sync_pagamento_divida_to_despesa trigger and ensure workspace_id column on pagamentos_dividas

ALTER TABLE public.pagamentos_dividas 
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

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
    v_obs := COALESCE(NEW.observacoes, 'Pagamento da dívida "' || v_divida.descricao || '"');
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
      NULL,
      'pago',
      v_obs,
      'divipay-' || NEW.divipay_external_id
    )
    RETURNING id INTO v_nova_despesa_id;

    -- Amarra imediatamente a conciliação para que nenhum passo posterior crie outra despesa
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
