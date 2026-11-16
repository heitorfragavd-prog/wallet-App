-- =============================================================================
-- Migration 104: Consolidação Atômica e Eliminação Definitiva de Lost Updates
-- Etapa 3E.2 - Gate 3
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
  v_result JSONB;
BEGIN
  -- 1. Identificação do chamador
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

  -- 2. Validação estrita de autorização para não-service_role
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: autenticação necessária.' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.is_workspace_executive(p_workspace_id, auth.uid()) OR
      EXISTS (
        SELECT 1 FROM public.workspaces w
         WHERE w.id = p_workspace_id AND w.user_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM public.workspace_members wm
         WHERE wm.workspace_id = p_workspace_id AND wm.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para consolidar fechamento neste workspace.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Lock pessimista exclusivo na linha alvo para impedir qualquer lost update concorrente
  SELECT *
    INTO v_fechamento
    FROM public.fechamentos_caixa
   WHERE id = p_fechamento_id
     AND workspace_id = p_workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento de caixa não encontrado no workspace informado.' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Mesclagem não-destrutiva de anexos: preserva os persistidos e anexa novos sem duplicata
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

  -- 5. Mesclagem não-destrutiva de telegram_message_ids
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

  -- 6. Atualização atômica consolidada com commit transacional
  UPDATE public.fechamentos_caixa
     SET anexos = v_anexos_finais,
         telegram_message_ids = v_msgs_finais,
         total = COALESCE(p_total, total),
         envelope_total = COALESCE(p_envelope_total, envelope_total),
         eyemobile_total = COALESCE(p_eyemobile_total, eyemobile_total),
         divergencias = COALESCE(p_divergencias, divergencias),
         tipo_conferencia = COALESCE(p_tipo_conferencia, tipo_conferencia),
         sobra = CASE WHEN p_sobra > 0 THEN p_sobra ELSE sobra END,
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
