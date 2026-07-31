-- Workspace nas despesas geradas automaticamente
-- 1) Trigger sync_pagamento_divida_to_despesa passa a gravar o workspace_id da dívida
-- 2) Backfill: registros órfãos (workspace_id NULL) vão para o workspace default do dono

CREATE OR REPLACE FUNCTION public.sync_pagamento_divida_to_despesa()
RETURNS TRIGGER AS $$
DECLARE
  v_divida RECORD;
  v_descricao TEXT;
  v_valor_taxa NUMERIC;
  v_valor_total_despesa NUMERIC;
  v_obs TEXT;
BEGIN
  SELECT descricao, credor, categoria_id, valor_taxa, workspace_id
  INTO v_divida
  FROM public.dividas
  WHERE id = NEW.divida_id;

  IF FOUND THEN
    v_descricao := 'Pagamento dívida: ' || v_divida.descricao || COALESCE(' (' || v_divida.credor || ')', '');
    v_valor_taxa := COALESCE(v_divida.valor_taxa, 0);
    v_valor_total_despesa := NEW.valor + v_valor_taxa;

    IF v_valor_taxa > 0 THEN
      v_obs := COALESCE(NEW.observacoes, 'Pagamento da dívida "' || v_divida.descricao || '"') ||
               ' (Valor: R$ ' || TRIM(TO_CHAR(NEW.valor, '999999990.00')) || ' + Taxa: R$ ' || TRIM(TO_CHAR(v_valor_taxa, '999999990.00')) || ')';
    ELSE
      v_obs := COALESCE(NEW.observacoes, 'Pagamento parcial da dívida "' || v_divida.descricao || '"');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.despesas
      WHERE user_id = NEW.user_id
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
        v_divida.workspace_id
      );
    ELSE
      UPDATE public.despesas
      SET valor = v_valor_total_despesa,
          observacoes = v_obs,
          metodo_pagamento = NEW.metodo_pagamento,
          conta_id = NEW.conta_id,
          workspace_id = COALESCE(public.despesas.workspace_id, v_divida.workspace_id)
      WHERE user_id = NEW.user_id
        AND data = NEW.data_pagamento
        AND descricao = v_descricao;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: órfãos → workspace default do dono do registro
WITH defaults AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.workspaces
  WHERE is_default = true
  ORDER BY user_id, created_at
)
UPDATE public.despesas d
SET workspace_id = defaults.id
FROM defaults
WHERE d.workspace_id IS NULL AND defaults.user_id = d.user_id;

WITH defaults AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.workspaces
  WHERE is_default = true
  ORDER BY user_id, created_at
)
UPDATE public.receitas r
SET workspace_id = defaults.id
FROM defaults
WHERE r.workspace_id IS NULL AND defaults.user_id = r.user_id;

WITH defaults AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.workspaces
  WHERE is_default = true
  ORDER BY user_id, created_at
)
UPDATE public.dividas dv
SET workspace_id = defaults.id
FROM defaults
WHERE dv.workspace_id IS NULL AND defaults.user_id = dv.user_id;
