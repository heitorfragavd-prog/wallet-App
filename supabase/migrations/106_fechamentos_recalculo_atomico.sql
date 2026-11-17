-- =============================================================================
-- Migration 106: Consolidação Financeira Atômica Recalculada no PostgreSQL
-- Etapa 3E.3 - Gate A2 & A3: Recálculo Determinístico de Anexos Sob Lock FOR UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.consolidar_fechamento_caixa_atomico(
  p_fechamento_id UUID,
  p_workspace_id UUID,
  p_novos_anexos JSONB,
  p_telegram_message_ids JSONB,
  p_total JSONB,
  p_envelope_total JSONB,
  p_eyemobile_total JSONB,
  p_divergencias JSONB,
  p_tipo_conferencia TEXT,
  p_sobra NUMERIC,
  p_status TEXT,
  p_identidade_pendente BOOLEAN,
  p_anexo_path TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento RECORD;
  v_anexos_finais JSONB := '[]'::jsonb;
  v_msgs_finais JSONB := '[]'::jsonb;
  v_item JSONB;
  v_msg_id JSONB;
  v_sha256 TEXT;
  v_file_id TEXT;
  v_ja_existe BOOLEAN;
  v_caller_role TEXT;
  v_is_service_role BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_user_colaborador_id UUID := NULL;
  
  -- Variáveis do recálculo determinístico
  v_tem_relatorio BOOLEAN := FALSE;
  v_relatorio_item JSONB := NULL;
  v_envelope_item JSONB := NULL;
  v_dinheiro NUMERIC := 0;
  v_debito NUMERIC := 0;
  v_credito NUMERIC := 0;
  v_pix NUMERIC := 0;
  v_voucher NUMERIC := 0;
  v_outros NUMERIC := 0;
  v_sobra NUMERIC := 0;
  v_tem_valores_estruturados BOOLEAN := FALSE;
  v_total_calculado JSONB;
  v_result JSONB;
BEGIN
  -- 1. Identificação do chamador e autorização estrita
  v_caller_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (CASE 
       WHEN current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> ''
       THEN (current_setting('request.jwt.claims', true)::jsonb->>'role')
       ELSE NULL
     END),
    NULL
  );

  IF v_caller_role = 'service_role' OR (auth.role() = 'service_role') OR (auth.uid() IS NULL AND session_user = 'postgres') THEN
    v_is_service_role := TRUE;
  END IF;

  -- 2. Lock pessimista exclusivo na linha alvo para impedir qualquer lost update concorrente
  SELECT *
    INTO v_fechamento
    FROM public.fechamentos_caixa
   WHERE id = p_fechamento_id
     AND workspace_id = p_workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento de caixa não encontrado no workspace informado.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Imutabilidade Contábil: fechamento aprovado não aceita consolidação ou alteração concorrente
  IF v_fechamento.status = 'aprovado' THEN
    RAISE EXCEPTION 'Acesso negado: fechamento de caixa já foi aprovado e não pode ser alterado.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Validação estrita de autorização para não-service_role (Menor Privilégio - Gate A1)
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: autenticação necessária.' USING ERRCODE = '42501';
    END IF;

    -- Verificar se é Admin ou Executivo
    v_is_admin := public.is_workspace_executive(p_workspace_id, auth.uid()) OR
                  EXISTS (
                    SELECT 1 FROM public.workspaces w
                     WHERE w.id = p_workspace_id AND w.user_id = auth.uid()
                  );

    IF NOT v_is_admin THEN
      -- Se for membro comum, deve ter colaborador ativo correspondente ao fechamento
      SELECT c.id INTO v_user_colaborador_id
        FROM public.colaboradores c
       WHERE c.workspace_id = p_workspace_id
         AND c.user_id = auth.uid()
         AND c.ativo = TRUE
       LIMIT 1;

      IF v_user_colaborador_id IS NULL OR v_fechamento.colaborador_id IS DISTINCT FROM v_user_colaborador_id THEN
        RAISE EXCEPTION 'Acesso negado: colaboradores comuns só podem consolidar seus próprios fechamentos de caixa.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 5. Mesclagem não-destrutiva de anexos: preserva os persistidos e anexa novos sem duplicata
  v_anexos_finais := COALESCE(v_fechamento.anexos, '[]'::jsonb);
  IF jsonb_typeof(v_anexos_finais) <> 'array' THEN
    v_anexos_finais := '[]'::jsonb;
  END IF;

  IF p_novos_anexos IS NOT NULL AND jsonb_typeof(p_novos_anexos) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_novos_anexos) LOOP
      IF v_item IS NOT NULL AND v_item <> 'null'::jsonb THEN
        v_sha256 := v_item->>'sha256';
        v_file_id := v_item->>'file_id';
        v_ja_existe := FALSE;

        IF jsonb_array_length(v_anexos_finais) > 0 THEN
          SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_anexos_finais) x
             WHERE (v_sha256 IS NOT NULL AND x->>'sha256' = v_sha256)
                OR (v_file_id IS NOT NULL AND x->>'file_id' = v_file_id)
          ) INTO v_ja_existe;
        END IF;

        IF NOT v_ja_existe THEN
          v_anexos_finais := v_anexos_finais || jsonb_build_array(v_item);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 6. Mesclagem não-destrutiva de telegram_message_ids
  v_msgs_finais := COALESCE(v_fechamento.telegram_message_ids, '[]'::jsonb);
  IF jsonb_typeof(v_msgs_finais) <> 'array' THEN
    v_msgs_finais := '[]'::jsonb;
  END IF;

  IF p_telegram_message_ids IS NOT NULL AND jsonb_typeof(p_telegram_message_ids) = 'array' THEN
    FOR v_msg_id IN SELECT * FROM jsonb_array_elements(p_telegram_message_ids) LOOP
      IF v_msg_id IS NOT NULL AND NOT (v_msgs_finais @> jsonb_build_array(v_msg_id)) THEN
        v_msgs_finais := v_msgs_finais || jsonb_build_array(v_msg_id);
      END IF;
    END LOOP;
  END IF;

  -- 7. RECÁLCULO ATÔMICO DETERMINÍSTICO (Gate A2):
  -- Recalcula os totais a partir do conjunto definitivo de anexos persistidos sob lock FOR UPDATE.
  IF jsonb_array_length(v_anexos_finais) > 0 THEN
    -- Identificar se há relatório consolidado ou envelope
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_anexos_finais) LOOP
      IF v_item IS NOT NULL AND v_item <> 'null'::jsonb AND COALESCE((v_item->>'is_duplicata')::boolean, FALSE) = FALSE THEN
        IF v_item->>'tipo_documento' = 'relatorio_consolidado' AND (v_item->'valor_extraido') IS NOT NULL AND v_item->'valor_extraido' <> 'null'::jsonb THEN
          v_tem_relatorio := TRUE;
          v_relatorio_item := v_item;
        ELSIF v_item->>'tipo_documento' = 'envelope' AND (v_item->'valor_extraido') IS NOT NULL AND v_item->'valor_extraido' <> 'null'::jsonb THEN
          v_envelope_item := v_item;
        END IF;
      END IF;
    END LOOP;

    IF v_tem_relatorio THEN
      v_tem_valores_estruturados := TRUE;
      v_dinheiro := COALESCE((v_relatorio_item->'valor_extraido'->>'dinheiro')::numeric, 0);
      v_debito := COALESCE((v_relatorio_item->'valor_extraido'->>'debito')::numeric, 0);
      v_credito := COALESCE((v_relatorio_item->'valor_extraido'->>'credito')::numeric, 0);
      v_pix := COALESCE((v_relatorio_item->'valor_extraido'->>'pix')::numeric, 0);
      v_voucher := COALESCE((v_relatorio_item->'valor_extraido'->>'voucher')::numeric, 0);
      v_outros := COALESCE((v_relatorio_item->'valor_extraido'->>'outros')::numeric, 0);
      v_sobra := COALESCE((v_relatorio_item->'valor_extraido'->>'sobra')::numeric, 0);

      IF v_envelope_item IS NOT NULL THEN
        IF COALESCE((v_envelope_item->'valor_extraido'->>'sobra')::numeric, 0) > 0 THEN
          v_sobra := (v_envelope_item->'valor_extraido'->>'sobra')::numeric;
        END IF;
        IF v_dinheiro = 0 AND COALESCE((v_envelope_item->'valor_extraido'->>'dinheiro')::numeric, 0) > 0 THEN
          v_dinheiro := (v_envelope_item->'valor_extraido'->>'dinheiro')::numeric;
        END IF;
      END IF;

      -- Se relatório não pontuou voucher, soma eventuais comprovantes de voucher avulsos
      IF v_voucher = 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_anexos_finais) LOOP
          IF v_item IS NOT NULL AND v_item <> 'null'::jsonb 
             AND COALESCE((v_item->>'is_duplicata')::boolean, FALSE) = FALSE 
             AND v_item->>'tipo_documento' = 'comprovante_voucher'
             AND (v_item->'valor_extraido') IS NOT NULL THEN
            v_voucher := v_voucher + COALESCE((v_item->'valor_extraido'->>'voucher')::numeric, 0);
          END IF;
        END LOOP;
      END IF;
    ELSE
      -- Sem relatório consolidado: somar todos os comprovantes individuais válidos
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_anexos_finais) LOOP
        IF v_item IS NOT NULL AND v_item <> 'null'::jsonb 
           AND COALESCE((v_item->>'is_duplicata')::boolean, FALSE) = FALSE 
           AND (v_item->'valor_extraido') IS NOT NULL AND v_item->'valor_extraido' <> 'null'::jsonb THEN
          v_tem_valores_estruturados := TRUE;
          v_dinheiro := v_dinheiro + COALESCE((v_item->'valor_extraido'->>'dinheiro')::numeric, 0);
          v_debito := v_debito + COALESCE((v_item->'valor_extraido'->>'debito')::numeric, 0);
          v_credito := v_credito + COALESCE((v_item->'valor_extraido'->>'credito')::numeric, 0);
          v_pix := v_pix + COALESCE((v_item->'valor_extraido'->>'pix')::numeric, 0);
          v_voucher := v_voucher + COALESCE((v_item->'valor_extraido'->>'voucher')::numeric, 0);
          v_outros := v_outros + COALESCE((v_item->'valor_extraido'->>'outros')::numeric, 0);
          IF v_sobra = 0 AND COALESCE((v_item->'valor_extraido'->>'sobra')::numeric, 0) > 0 THEN
            v_sobra := (v_item->'valor_extraido'->>'sobra')::numeric;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_tem_valores_estruturados THEN
    v_total_calculado := jsonb_build_object(
      'dinheiro', round(v_dinheiro, 2),
      'debito', round(v_debito, 2),
      'credito', round(v_credito, 2),
      'pix', round(v_pix, 2),
      'voucher', round(v_voucher, 2),
      'outros', round(v_outros, 2),
      'sobra', round(v_sobra, 2)
    );
  ELSE
    v_total_calculado := COALESCE(p_total, v_fechamento.total);
  END IF;

  -- 8. Atualização atômica consolidada com commit transacional
  UPDATE public.fechamentos_caixa
     SET anexos = v_anexos_finais,
         telegram_message_ids = v_msgs_finais,
         total = v_total_calculado,
         envelope_total = v_total_calculado,
         eyemobile_total = COALESCE(p_eyemobile_total, eyemobile_total),
         divergencias = COALESCE(p_divergencias, divergencias),
         tipo_conferencia = COALESCE(p_tipo_conferencia, tipo_conferencia),
         sobra = CASE WHEN v_sobra > 0 THEN round(v_sobra, 2) WHEN p_sobra > 0 THEN p_sobra ELSE sobra END,
         status = COALESCE(p_status, status),
         identidade_pendente = COALESCE(p_identidade_pendente, identidade_pendente),
         anexo_path = COALESCE(p_anexo_path, anexo_path),
         updated_at = NOW()
   WHERE id = p_fechamento_id
  RETURNING jsonb_build_object(
    'id', id,
    'workspace_id', workspace_id,
    'anexos', anexos,
    'telegram_message_ids', telegram_message_ids,
    'total', total,
    'envelope_total', envelope_total,
    'eyemobile_total', eyemobile_total,
    'divergencias', divergencias,
    'tipo_conferencia', tipo_conferencia,
    'sobra', sobra,
    'status', status,
    'identidade_pendente', identidade_pendente
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Permissões estritas da RPC
REVOKE ALL ON FUNCTION public.consolidar_fechamento_caixa_atomico(UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consolidar_fechamento_caixa_atomico(UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, TEXT, NUMERIC, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;
