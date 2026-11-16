-- =============================================================================
-- Migration 103: Blindagem e Autorização Estrita da RPC Financeira
-- Etapa 3E.2 - Gate 2
-- =============================================================================

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
  v_caller_role TEXT;
  v_effective_user_id UUID;
  v_is_service_role BOOLEAN := FALSE;
  r RECORD;
BEGIN
  -- 1. Identificação robusta do papel do chamador no Supabase/PostgREST
  v_caller_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (CASE 
       WHEN current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> ''
       THEN (current_setting('request.jwt.claims', true)::jsonb->>'role')
       ELSE NULL
     END),
    NULL
  );

  -- Se for chamada interna via chave de serviço ou backend PostgreSQL
  IF v_caller_role = 'service_role' OR (auth.role() = 'service_role') OR (auth.uid() IS NULL AND session_user = 'postgres') THEN
    v_is_service_role := TRUE;
    v_effective_user_id := p_user_id;
  END IF;

  -- 2. Gate 2: Validação de Segurança e Autorização Estrita para chamadores não-service_role
  IF NOT v_is_service_role THEN
    -- Rejeita imediatamente usuários anônimos / sem autenticação
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: autenticação necessária para registrar fechamento.'
        USING ERRCODE = '42501';
    END IF;

    -- Não confia no p_user_id fornecido pelo cliente: força o user_id real do JWT
    v_effective_user_id := auth.uid();

    -- Validação inequívoca de pertencimento e autorização sobre o workspace
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
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para registrar fechamento no workspace informado.'
        USING ERRCODE = '42501';
    END IF;

    -- Validação de isolamento do colaborador: não permite vincular colaborador de outro workspace
    IF p_colaborador_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.colaboradores c
         WHERE c.id = p_colaborador_id AND c.workspace_id = p_workspace_id
      ) THEN
        RAISE EXCEPTION 'Acesso negado: colaborador não pertence ao workspace informado.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 3. Preparação do anexo
  IF p_anexo IS NOT NULL THEN
    v_sha256 := p_anexo->>'sha256';
    v_file_id := p_anexo->>'file_id';
    v_novo_anexo_arr := jsonb_build_array(p_anexo);
  END IF;

  -- 4. Lock pessimista na linha existente para evitar lost updates concorrentes
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

    -- Só adiciona anexo se o documento for inédito
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
      v_effective_user_id,
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

-- Permissões estritas da RPC: revoga PUBLIC e anon, concede somente a authenticated e service_role
REVOKE ALL ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) TO authenticated, service_role;
