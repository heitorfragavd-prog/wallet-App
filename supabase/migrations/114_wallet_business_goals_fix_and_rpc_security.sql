-- ==============================================================================
-- Migration 114: Fix de Metas Empresariais (wallet_business_goals) e 
-- Hardening de Segurança em RPCs SECURITY DEFINER (Wallet CEO 3.0)
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUNÇÃO DE APOIO: VERIFICAÇÃO DE ACESSO EXECUTIVO DO PROPRIETÁRIO
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tem_acesso_executivo_proprietario(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      p_workspace_id IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND (
        public.is_workspace_owner(p_workspace_id, auth.uid())
        OR public.is_workspace_executive(p_workspace_id, auth.uid())
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.tem_acesso_executivo_proprietario(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. TABELA DE METAS EMPRESARIAIS DO WORKSPACE (wallet_business_goals)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_business_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  titulo TEXT NOT NULL,
  indicador VARCHAR(50) NOT NULL CHECK (indicador IN (
    'faturamento',
    'pedidos',
    'ticket_medio',
    'despesas',
    'resultado_operacional',
    'margem',
    'produto_categoria',
    'combos'
  )),
  periodo_tipo VARCHAR(20) NOT NULL CHECK (periodo_tipo IN ('semanal', 'mensal')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER CHECK (mes IS NULL OR (mes >= 1 AND mes <= 12)),
  semana_do_ano INTEGER CHECK (semana_do_ano IS NULL OR (semana_do_ano >= 1 AND semana_do_ano <= 53)),
  valor_alvo NUMERIC NOT NULL CHECK (valor_alvo >= 0),
  valor_realizado NUMERIC NOT NULL DEFAULT 0,
  unidade VARCHAR(20) NOT NULL DEFAULT 'BRL' CHECK (unidade IN ('BRL', 'quantidade', 'percentual', 'monetario')),
  categoria_ou_produto TEXT,
  eyemobile_product_id TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'pausada', 'cancelada')),
  descricao TEXT,
  observacoes TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_business_goals_dates_check CHECK (data_fim >= data_inicio)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_wallet_business_goals_ws_period 
  ON public.wallet_business_goals (workspace_id, periodo_tipo, status, data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_wallet_business_goals_indicador
  ON public.wallet_business_goals (workspace_id, indicador);

-- Trigger de governança e imutabilidade
CREATE OR REPLACE FUNCTION public.validar_wallet_business_goals_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role() = 'service_role', false) THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: o workspace_id é obrigatório para metas empresariais.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace pode cadastrar metas empresariais.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Operação negada: não é permitido alterar o workspace_id de uma meta empresarial.';
    END IF;

    IF NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para alterar metas empresariais.';
    END IF;

    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.tem_acesso_executivo_proprietario(OLD.workspace_id) THEN
      RAISE EXCEPTION 'Acesso restrito: somente o proprietário ou administrador ativo do workspace tem permissão para remover metas empresariais.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_wallet_business_goals ON public.wallet_business_goals;
CREATE TRIGGER trg_validar_wallet_business_goals
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallet_business_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_wallet_business_goals_governance();

-- Habilitar RLS
ALTER TABLE public.wallet_business_goals ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "wallet_business_goals_select" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_select"
  ON public.wallet_business_goals
  FOR SELECT
  USING (
    coalesce(auth.role() = 'service_role', false)
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = wallet_business_goals.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wallet_business_goals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.active IS TRUE
        AND wm.role IN ('owner', 'admin', 'proprietario', 'administrador')
    )
    OR (
      wallet_business_goals.indicador NOT IN ('faturamento', 'despesas', 'resultado_operacional', 'margem', 'ticket_medio')
      AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = wallet_business_goals.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.active IS TRUE
      )
    )
  );

DROP POLICY IF EXISTS "wallet_business_goals_insert" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_insert"
  ON public.wallet_business_goals
  FOR INSERT
  WITH CHECK (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );

DROP POLICY IF EXISTS "wallet_business_goals_update" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_update"
  ON public.wallet_business_goals
  FOR UPDATE
  USING (
    public.tem_acesso_executivo_proprietario(workspace_id)
  )
  WITH CHECK (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );

DROP POLICY IF EXISTS "wallet_business_goals_delete" ON public.wallet_business_goals;
CREATE POLICY "wallet_business_goals_delete"
  ON public.wallet_business_goals
  FOR DELETE
  USING (
    public.tem_acesso_executivo_proprietario(workspace_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_business_goals TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. HARDENING DE SEGURANÇA EM RPCs DE NOTAS FISCAIS (GATES 6, 7 & 8)
-- -----------------------------------------------------------------------------

-- Atualização da RPC principal eliminando a vulnerabilidade 'current_user = postgres'
-- em funções SECURITY DEFINER e garantindo validação criptográfica da identidade
CREATE OR REPLACE FUNCTION public.rpc_aprovar_nfe_transacional(
  p_workspace_id UUID,
  p_user_id UUID,
  p_chave_acesso TEXT,
  p_numero_nota TEXT,
  p_cnpj_fornecedor TEXT,
  p_razao_social TEXT,
  p_valor_total NUMERIC,
  p_valor_produtos NUMERIC,
  p_data_vencimento DATE,
  p_duplicatas JSONB DEFAULT '[]'::jsonb,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_origem TEXT DEFAULT 'gmail',
  p_ignorar_suspeita BOOLEAN DEFAULT FALSE,
  p_justificativa_excecao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_exec BOOLEAN := FALSE;
  v_is_service_role BOOLEAN := FALSE;
  v_effective_user_id UUID;
  v_clean_cnpj TEXT;
  v_clean_chave TEXT;
  v_clean_num_nota TEXT;
  v_divida_id UUID := NULL;
  v_divida_existente RECORD;
  v_despesa_existente RECORD;
  v_suspeita RECORD;
  v_nf_compra_id UUID := NULL;
  v_dups_count INTEGER := 0;
  v_p1_id UUID := NULL;
  v_ids_criados UUID[] := ARRAY[]::UUID[];
  v_i INTEGER;
  v_dup_item JSONB;
  v_dup_val NUMERIC;
  v_dup_venc DATE;
  v_desc_item TEXT;
BEGIN
  -- 1. IDENTIFICAÇÃO DE PAPEL E SEGURANÇA MULTI-TENANT (GATE 6)
  -- Em funções SECURITY DEFINER, NUNCA usar current_user, pois ele sempre retorna o owner ('postgres').
  -- Apenas verificar auth.role() = 'service_role' ou conexões de superusuário nativo sem JWT.
  IF COALESCE(auth.role(), '') = 'service_role' OR (session_user = 'postgres' AND auth.uid() IS NULL) THEN
    v_is_service_role := TRUE;
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: p_user_id é obrigatório para chamadas de sistema (service_role)'
        USING ERRCODE = '22000';
    END IF;
    v_effective_user_id := p_user_id;
  ELSE
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR COALESCE(auth.role(), '') = 'anon' THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Autenticação necessária para aprovação financeira'
        USING ERRCODE = '42501';
    END IF;

    -- Proteção contra falsificação de user_id: se p_user_id for fornecido, deve ser idêntico ao usuário autenticado
    IF p_user_id IS NOT NULL AND p_user_id <> v_caller_id THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Falsificação de user_id detectada. O usuário informado não coincide com a sessão autenticada.'
        USING ERRCODE = '42501';
    END IF;

    -- Validar se o usuário é membro ativo do workspace informado
    IF NOT public.is_active_workspace_member(p_workspace_id, v_caller_id) THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Usuário não é membro ativo deste workspace'
        USING ERRCODE = '42501';
    END IF;

    v_effective_user_id := v_caller_id;
  END IF;

  -- 2. GATE 3: AUTORIZAÇÃO DE EXCEÇÕES DE DUPLICIDADE
  IF p_ignorar_suspeita THEN
    -- Apenas administradores executivos (owner/admin) podem ignorar suspeitas
    IF NOT v_is_service_role THEN
      v_is_exec := public.is_workspace_executive(p_workspace_id, v_effective_user_id);
      IF NOT v_is_exec THEN
        RAISE EXCEPTION 'WALLET_AI_ACTION_FORBIDDEN: Apenas administradores podem autorizar exceção de duplicidade financeira'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Justificativa obrigatória (mínimo 10 caracteres)
    IF p_justificativa_excecao IS NULL OR length(trim(p_justificativa_excecao)) < 10 THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Justificativa obrigatória (mínimo 10 caracteres) para autorizar exceção de duplicidade'
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 3. GATE 4: VALIDAÇÃO DE VENCIMENTO E VALORES (NÃO INVENTAR VENCIMENTOS)
  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Valor total da NF-e deve ser maior que zero'
      USING ERRCODE = '22000';
  END IF;

  IF p_data_vencimento IS NULL THEN
    RAISE EXCEPTION 'WALLET_AI_ACTION_INVALID: Data de vencimento não comprovada no documento fiscal. Conforme política de segurança financeira (Gate 4), é proibido atribuir vencimentos fictícios. Requer conferência humana da data.'
      USING ERRCODE = '22000';
  END IF;

  v_clean_cnpj := regexp_replace(COALESCE(p_cnpj_fornecedor, ''), '\D', '', 'g');
  v_clean_chave := trim(COALESCE(p_chave_acesso, ''));
  v_clean_num_nota := trim(COALESCE(p_numero_nota, ''));

  -- 4. GATE 2 & GATE 3: DEDUPLICAÇÃO DETERMINÍSTICA FORTE
  -- Match 1: Chave de Acesso (44 dígitos) em dividas
  IF v_clean_chave <> '' THEN
    SELECT id, descricao, valor_total, valor_pago, data_vencimento, status
      INTO v_divida_existente
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND descricao ILIKE '%' || v_clean_chave || '%'
     LIMIT 1;
  END IF;

  -- Match 2: Número da Nota + CNPJ do fornecedor em dividas
  IF v_divida_existente.id IS NULL AND v_clean_num_nota <> '' AND v_clean_cnpj <> '' THEN
    SELECT id, descricao, valor_total, valor_pago, data_vencimento, status
      INTO v_divida_existente
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND regexp_replace(COALESCE(documento_favorecido, ''), '\D', '', 'g') = v_clean_cnpj
       AND (
         descricao ILIKE '%' || v_clean_num_nota || '%'
         OR descricao ILIKE '%NF ' || v_clean_num_nota || '%'
         OR descricao ILIKE '%NF-e ' || v_clean_num_nota || '%'
       )
     LIMIT 1;
  END IF;

  -- Match 3: Vinculação já existente em gmail_mensagens_processadas
  IF v_divida_existente.id IS NULL AND v_clean_chave <> '' THEN
    SELECT d.id, d.descricao, d.valor_total, d.valor_pago, d.data_vencimento, d.status
      INTO v_divida_existente
      FROM public.gmail_mensagens_processadas g
      JOIN public.dividas d ON d.id = g.divida_id
     WHERE g.workspace_id = p_workspace_id
       AND g.divida_id IS NOT NULL
       AND g.detalhes_extracao->>'chave_acesso' = v_clean_chave
     LIMIT 1;
  END IF;

  -- Match 4: Despesa paga existente com mesma chave ou número de nota e CNPJ
  IF v_divida_existente.id IS NULL AND v_clean_chave <> '' THEN
    SELECT id, descricao, valor, data, status
      INTO v_despesa_existente
      FROM public.despesas
     WHERE workspace_id = p_workspace_id
       AND status = 'pago'
       AND (
         observacoes ILIKE '%' || v_clean_chave || '%'
         OR (v_clean_num_nota <> '' AND descricao ILIKE '%' || v_clean_num_nota || '%' AND abs(valor - p_valor_total) < 0.05)
       )
     LIMIT 1;
  END IF;

  -- SE ENCONTROU DÍVIDA CORRESPONDENTE DETERMINÍSTICA:
  IF v_divida_existente.id IS NOT NULL THEN
    -- Preservação de contas quitadas:
    IF v_divida_existente.status IN ('paga', 'quitada') THEN
      -- Atualiza gmail_mensagens_processadas
      IF v_clean_chave <> '' THEN
        UPDATE public.gmail_mensagens_processadas
           SET divida_id = v_divida_existente.id,
               status = 'processado'
         WHERE workspace_id = p_workspace_id
           AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
      END IF;

      -- Persiste nota fiscal e itens para estoque/CMV se não existirem
      v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
        p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
        p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
      );

      RETURN jsonb_build_object(
        'success', true,
        'divida_id', v_divida_existente.id,
        'status', 'already_paid',
        'is_quitada', true,
        'ja_existia', true,
        'message', 'Documento fiscal vinculado com sucesso à dívida quitada existente, preservando o pagamento e histórico.'
      );
    ELSE
      -- Dívida pendente existente: vincula sem duplicar
      IF v_clean_chave <> '' THEN
        UPDATE public.gmail_mensagens_processadas
           SET divida_id = v_divida_existente.id,
               status = 'processado'
         WHERE workspace_id = p_workspace_id
           AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
      END IF;

      v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
        p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
        p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
      );

      RETURN jsonb_build_object(
        'success', true,
        'divida_id', v_divida_existente.id,
        'status', 'already_exists',
        'is_quitada', false,
        'ja_existia', true,
        'message', 'Documento fiscal vinculado à dívida pendente já existente.'
      );
    END IF;
  END IF;

  -- SE ENCONTROU DESPESA PAGA CORRESPONDENTE:
  IF v_despesa_existente.id IS NOT NULL THEN
    v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
        p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
        p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
    );

    RETURN jsonb_build_object(
      'success', true,
      'despesa_id', v_despesa_existente.id,
      'status', 'already_paid',
      'is_quitada', true,
      'ja_existia', true,
      'message', 'Documento fiscal vinculado a pagamento/despesa já liquidado.'
    );
  END IF;

  -- 5. GATE 2: SUSPEITA DE DUPLICIDADE (HEURÍSTICA DE REVISÃO)
  IF NOT p_ignorar_suspeita THEN
    SELECT id, descricao, credor, valor_total, data_vencimento, status
      INTO v_suspeita
      FROM public.dividas
     WHERE workspace_id = p_workspace_id
       AND abs(valor_total - p_valor_total) < 0.05
       AND data_vencimento = p_data_vencimento
       AND (
         (v_clean_cnpj <> '' AND regexp_replace(COALESCE(documento_favorecido, ''), '\D', '', 'g') = v_clean_cnpj)
         OR (p_razao_social <> '' AND credor ILIKE '%' || split_part(p_razao_social, ' ', 1) || '%')
       )
     LIMIT 1;

    IF v_suspeita.id IS NOT NULL THEN
      RAISE EXCEPTION 'WALLET_AI_ACTION_SUSPECTED_DUPLICATE: Já existe uma dívida com valor de R$ % e vencimento em % do fornecedor "%" (Status: %, ID: %). Associação automática bloqueada por segurança. Requer conferência humana.'
        , p_valor_total, p_data_vencimento, v_suspeita.credor, v_suspeita.status, v_suspeita.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. GATE 4 & GATE 1: CRIAÇÃO ATÔMICA DA DÍVIDA COM PARCELAMENTO REAL
  IF p_duplicatas IS NOT NULL AND jsonb_typeof(p_duplicatas) = 'array' AND jsonb_array_length(p_duplicatas) > 1 THEN
    v_dups_count := jsonb_array_length(p_duplicatas);

    -- Parcela 1
    v_dup_item := p_duplicatas->0;
    v_dup_val := (v_dup_item->>'valor')::NUMERIC;
    v_dup_venc := (v_dup_item->>'vencimento')::DATE;
    v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — Parcela 1/' || v_dups_count || ' — ' || p_razao_social;
    IF v_clean_chave <> '' THEN
      v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
    END IF;

    INSERT INTO public.dividas (
      user_id, workspace_id, descricao, credor, documento_favorecido,
      valor_total, valor_pago, valor_restante, data_vencimento,
      status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
      parcela_atual, total_parcelas
    ) VALUES (
      v_effective_user_id, p_workspace_id, v_desc_item, p_razao_social, v_clean_cnpj,
      v_dup_val, 0, v_dup_val, v_dup_venc,
      'pendente', 'boleto', v_dups_count, 0,
      1, v_dups_count
    ) RETURNING id INTO v_p1_id;

    v_ids_criados := array_append(v_ids_criados, v_p1_id);

    -- Parcelas 2..N com parent_id = v_p1_id
    FOR v_i IN 1..(v_dups_count - 1) LOOP
      v_dup_item := p_duplicatas->v_i;
      v_dup_val := (v_dup_item->>'valor')::NUMERIC;
      v_dup_venc := (v_dup_item->>'vencimento')::DATE;
      v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — Parcela ' || (v_i + 1) || '/' || v_dups_count || ' — ' || p_razao_social;
      IF v_clean_chave <> '' THEN
        v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
      END IF;

      INSERT INTO public.dividas (
        user_id, workspace_id, parent_id, descricao, credor, documento_favorecido,
        valor_total, valor_pago, valor_restante, data_vencimento,
        status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
        parcela_atual, total_parcelas
      ) VALUES (
        v_effective_user_id, p_workspace_id, v_p1_id, v_desc_item, p_razao_social, v_clean_cnpj,
        v_dup_val, 0, v_dup_val, v_dup_venc,
        'pendente', 'boleto', v_dups_count, 0,
        v_i + 1, v_dups_count
      ) RETURNING id INTO v_divida_id;

      v_ids_criados := array_append(v_ids_criados, v_divida_id);
    END LOOP;

    v_divida_id := v_p1_id;
  ELSE
    -- Parcela Única
    v_desc_item := 'NF-e nº ' || COALESCE(NULLIF(v_clean_num_nota, ''), 'S/N') || ' — ' || p_razao_social;
    IF v_clean_chave <> '' THEN
      v_desc_item := v_desc_item || ' (Chave: ' || v_clean_chave || ')';
    END IF;

    INSERT INTO public.dividas (
      user_id, workspace_id, descricao, credor, documento_favorecido,
      valor_total, valor_pago, valor_restante, data_vencimento,
      status, metodo_pagamento_esperado, parcelas, parcelas_pagas,
      parcela_atual, total_parcelas
    ) VALUES (
      v_effective_user_id, p_workspace_id, v_desc_item, p_razao_social, v_clean_cnpj,
      p_valor_total, 0, p_valor_total, p_data_vencimento,
      'pendente', 'boleto', 1, 0,
      1, 1
    ) RETURNING id INTO v_divida_id;

    v_ids_criados := array_append(v_ids_criados, v_divida_id);
  END IF;

  -- 7. GATE 1 & GATE 5: PERSISTÊNCIA ATÔMICA DA NOTA E ITENS FISCAIS
  v_nf_compra_id := public.fn_garantir_nfe_compra_e_itens(
    p_workspace_id, v_effective_user_id, v_clean_chave, v_clean_num_nota,
    p_razao_social, v_clean_cnpj, p_valor_total, p_valor_produtos, p_origem, p_itens
  );

  -- 8. VINCULAÇÃO NO GMAIL
  IF v_clean_chave <> '' THEN
    UPDATE public.gmail_mensagens_processadas
       SET divida_id = v_divida_id,
           status = 'processado'
     WHERE workspace_id = p_workspace_id
       AND detalhes_extracao->>'chave_acesso' = v_clean_chave;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'divida_id', v_divida_id,
    'dividas_ids', to_jsonb(v_ids_criados),
    'nf_compra_id', v_nf_compra_id,
    'status', 'criada_pendente',
    'total_parcelas', array_length(v_ids_criados, 1),
    'ja_existia', false
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RESTRIÇÃO ESTRITA DE PRIVILÉGIOS (GATE 7 - MENOR PRIVILÉGIO)
-- -----------------------------------------------------------------------------

-- A função auxiliar fn_garantir_nfe_compra_e_itens é puramente interna!
-- Não deve ser exposta a usuários autenticados nem anônimos via PostgREST.
REVOKE ALL ON FUNCTION public.fn_garantir_nfe_compra_e_itens(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_garantir_nfe_compra_e_itens(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO service_role;

-- A RPC transacional só é acessível para usuários autenticados com sessão ativa e service_role
REVOKE ALL ON FUNCTION public.rpc_aprovar_nfe_transacional(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, DATE, JSONB, JSONB, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_aprovar_nfe_transacional(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, DATE, JSONB, JSONB, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. RECARGA DO SCHEMA CACHE DO POSTGREST
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
