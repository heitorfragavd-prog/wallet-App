-- =============================================================================
-- Migration 101: Correção de Integridade, Segurança e Concorrência da RPC de Anexos
-- Etapa 3E.1 - Gates 5, 6 e 7
-- =============================================================================

-- 1. Garantir unicidade determinística compatível com ON CONFLICT (workspace_id, chave_operacional)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamentos_caixa_ws_chave_operacional_total
  ON public.fechamentos_caixa (workspace_id, chave_operacional)
  WHERE chave_operacional IS NOT NULL;

-- 2. Atualização segura da RPC registrar_anexo_fechamento_atomico
CREATE OR REPLACE FUNCTION public.registrar_anexo_fechamento_atomico(
  p_workspace_id UUID,
  p_user_id UUID,
  p_chat_id BIGINT,
  p_grupo_id UUID,
  p_origem_grupo_id UUID,
  p_origem_canal TEXT,
  p_colaborador_id UUID,
  p_escala_id UUID,
  p_turno TEXT,
  p_chave_operacional TEXT,
  p_data_fechamento TEXT,
  p_identidade_pendente BOOLEAN,
  p_anexo JSONB,
  p_telegram_message_id BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_anexos JSONB := '[]'::jsonb;
  v_telegram_msgs JSONB := '[]'::jsonb;
  v_result JSONB;
  v_sha256 TEXT;
  v_file_id TEXT;
  v_ja_existe BOOLEAN := FALSE;
  v_novo_anexo_arr JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  -- Gate 7: Validação de Segurança e Autorização Estrita
  -- Se a chamada for realizada por usuário autenticado direto (não service_role interna),
  -- valida se ele pertence ao workspace ou é executivo/administrador autorizado.
  IF current_user <> 'service_role' AND auth.uid() IS NOT NULL THEN
    IF NOT (
      p_user_id = auth.uid() OR
      public.is_workspace_executive(p_workspace_id, auth.uid()) OR
      EXISTS (
        SELECT 1 FROM public.workspaces w
         WHERE w.id = p_workspace_id AND w.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para registrar fechamento neste workspace.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_anexo IS NOT NULL THEN
    v_sha256 := p_anexo->>'sha256';
    v_file_id := p_anexo->>'file_id';
    v_novo_anexo_arr := jsonb_build_array(p_anexo);
  END IF;

  -- 1. Tenta obter lock pessimista na linha existente para evitar lost updates concorrentes (Gate 5)
  SELECT id, anexos, telegram_message_ids
    INTO v_fechamento_id, v_anexos, v_telegram_msgs
    FROM public.fechamentos_caixa
   WHERE workspace_id = p_workspace_id
     AND chave_operacional = p_chave_operacional
     FOR UPDATE;

  IF FOUND THEN
    -- Linha já existe: verifica idempotência e evita duplicatas exatas de arquivo
    IF v_anexos IS NOT NULL AND jsonb_typeof(v_anexos) = 'array' THEN
      FOR r IN SELECT * FROM jsonb_array_elements(v_anexos) LOOP
        IF (v_sha256 IS NOT NULL AND r.value->>'sha256' = v_sha256) OR
           (v_file_id IS NOT NULL AND r.value->>'file_id' = v_file_id) THEN
          v_ja_existe := TRUE;
          EXIT;
        END IF;
      END LOOP;
    ELSE
      v_anexos := '[]'::jsonb;
    END IF;

    -- Só faz append se o documento for inédito
    IF NOT v_ja_existe AND p_anexo IS NOT NULL THEN
      v_anexos := v_anexos || v_novo_anexo_arr;
    END IF;

    -- Concatenação segura de telegram_message_id
    IF v_telegram_msgs IS NULL OR jsonb_typeof(v_telegram_msgs) <> 'array' THEN
      v_telegram_msgs := '[]'::jsonb;
    END IF;

    IF p_telegram_message_id IS NOT NULL AND NOT (v_telegram_msgs @> jsonb_build_array(p_telegram_message_id)) THEN
      v_telegram_msgs := v_telegram_msgs || jsonb_build_array(p_telegram_message_id);
    END IF;

    UPDATE public.fechamentos_caixa
       SET anexos = v_anexos,
           telegram_message_ids = v_telegram_msgs,
           updated_at = NOW()
     WHERE id = v_fechamento_id
    RETURNING jsonb_build_object(
      'id', id,
      'is_new', FALSE,
      'anexos', anexos,
      'telegram_message_ids', telegram_message_ids,
      'status', status,
      'identidade_pendente', identidade_pendente
    ) INTO v_result;

  ELSE
    -- Linha ainda não existe: inserção atômica protegida com ON CONFLICT (Gate 5 & 6)
    v_anexos := v_novo_anexo_arr;
    v_telegram_msgs := CASE WHEN p_telegram_message_id IS NOT NULL THEN jsonb_build_array(p_telegram_message_id) ELSE '[]'::jsonb END;

    INSERT INTO public.fechamentos_caixa (
      workspace_id,
      user_id,
      chat_id,
      grupo_id,
      origem_grupo_id,
      origem_canal,
      colaborador_id,
      escala_id,
      turno,
      chave_operacional,
      data_fechamento,
      identidade_pendente,
      anexos,
      telegram_message_ids,
      status,
      status_espelhamento
    ) VALUES (
      p_workspace_id,
      p_user_id,
      p_chat_id,
      p_grupo_id,
      p_origem_grupo_id,
      p_origem_canal,
      p_colaborador_id,
      p_escala_id,
      p_turno,
      p_chave_operacional,
      p_data_fechamento,
      COALESCE(p_identidade_pendente, false),
      v_anexos,
      v_telegram_msgs,
      'pendente_conferencia',
      'pendente'
    )
    ON CONFLICT (workspace_id, chave_operacional) WHERE chave_operacional IS NOT NULL
    DO UPDATE SET
      anexos = CASE
        WHEN p_anexo IS NULL THEN public.fechamentos_caixa.anexos
        WHEN public.fechamentos_caixa.anexos @> jsonb_build_array(p_anexo) THEN public.fechamentos_caixa.anexos
        ELSE COALESCE(public.fechamentos_caixa.anexos, '[]'::jsonb) || jsonb_build_array(p_anexo)
      END,
      telegram_message_ids = CASE
        WHEN p_telegram_message_id IS NULL THEN public.fechamentos_caixa.telegram_message_ids
        WHEN public.fechamentos_caixa.telegram_message_ids @> jsonb_build_array(p_telegram_message_id) THEN public.fechamentos_caixa.telegram_message_ids
        ELSE COALESCE(public.fechamentos_caixa.telegram_message_ids, '[]'::jsonb) || jsonb_build_array(p_telegram_message_id)
      END,
      updated_at = NOW()
    RETURNING jsonb_build_object(
      'id', id,
      'is_new', TRUE,
      'anexos', anexos,
      'telegram_message_ids', telegram_message_ids,
      'status', status,
      'identidade_pendente', identidade_pendente
    ) INTO v_result;

  END IF;

  RETURN v_result;
END;
$$;

-- Permissões estritas da RPC (Gate 7)
REVOKE ALL ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) TO authenticated, service_role;
