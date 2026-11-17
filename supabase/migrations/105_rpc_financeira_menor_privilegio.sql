-- =============================================================================
-- Migration 105: Autorização de Menor Privilégio na RPC Financeira
-- Etapa 3E.3 - Gate A1
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
  v_fechamento RECORD;
  v_anexos JSONB := '[]'::jsonb;
  v_telegram_msgs JSONB := '[]'::jsonb;
  v_result JSONB;
  v_sha256 TEXT;
  v_file_id TEXT;
  v_ja_existe BOOLEAN := FALSE;
  v_novo_anexo_arr JSONB := '[]'::jsonb;
  v_caller_role TEXT;
  v_effective_user_id UUID;
  v_effective_colaborador_id UUID;
  v_is_service_role BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_user_colaborador_id UUID := NULL;
  r RECORD;
BEGIN
  -- 1. Identificação do papel do chamador no PostgREST/Supabase
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
    v_effective_user_id := p_user_id;
    v_effective_colaborador_id := p_colaborador_id;
  END IF;

  -- 2. Gate A1: Princípio do Menor Privilégio para chamadores autenticados
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: autenticação necessária para registrar fechamento.'
        USING ERRCODE = '42501';
    END IF;

    -- Força user_id real do JWT (neutraliza tentativa de falsificação de p_user_id)
    v_effective_user_id := auth.uid();

    -- Verifica se o usuário é Administrador ou Executivo do Workspace
    v_is_admin := public.is_workspace_executive(p_workspace_id, auth.uid()) OR
                  EXISTS (
                    SELECT 1 FROM public.workspaces w
                     WHERE w.id = p_workspace_id AND w.user_id = auth.uid()
                  );

    IF v_is_admin THEN
      v_effective_colaborador_id := p_colaborador_id;
    ELSE
      -- Membro não-administrador: exige vínculo específico e direto com a tabela colaboradores
      SELECT id INTO v_user_colaborador_id
        FROM public.colaboradores c
       WHERE c.workspace_id = p_workspace_id
         AND c.user_id = auth.uid()
         AND c.status = 'ativo'
       LIMIT 1;

      IF v_user_colaborador_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: membro comum sem perfil de colaborador ativo não tem permissão para registrar fechamento financeiro.'
          USING ERRCODE = '42501';
      END IF;

      -- Não permite registrar documento em nome de outro colaborador
      IF p_colaborador_id IS NOT NULL AND p_colaborador_id <> v_user_colaborador_id THEN
        RAISE EXCEPTION 'Acesso negado: colaboradores comuns só possuem permissão para registrar documentos próprios.'
          USING ERRCODE = '42501';
      END IF;

      v_effective_colaborador_id := v_user_colaborador_id;
    END IF;
  END IF;

  -- 3. Preparação do anexo
  IF p_anexo IS NOT NULL THEN
    v_sha256 := p_anexo->>'sha256';
    v_file_id := p_anexo->>'file_id';
    v_novo_anexo_arr := jsonb_build_array(p_anexo);
  END IF;

  -- 4. Lock pessimista exclusivo na linha alvo para evitar concorrência e validar integridade
  SELECT *
    INTO v_fechamento
    FROM public.fechamentos_caixa
   WHERE workspace_id = p_workspace_id
     AND chave_operacional = p_chave_operacional
     FOR UPDATE;

  IF FOUND THEN
    -- Regra de Proteção: Fechamento já aprovado não pode receber novos anexos nem ser alterado
    IF v_fechamento.status = 'aprovado' THEN
      RAISE EXCEPTION 'Acesso negado: fechamento já aprovado administrativamente não pode sofrer alterações.'
        USING ERRCODE = '42501';
    END IF;

    -- Regra de Menor Privilégio: Colaborador não-admin não pode alterar fechamento alheio
    IF NOT v_is_service_role AND NOT v_is_admin THEN
      IF v_fechamento.colaborador_id IS NOT NULL AND v_fechamento.colaborador_id <> v_effective_colaborador_id THEN
        RAISE EXCEPTION 'Acesso negado: você não tem permissão para alterar o fechamento de outro colaborador.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_anexos := COALESCE(v_fechamento.anexos, '[]'::jsonb);
    IF jsonb_typeof(v_anexos) = 'array' THEN
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

    IF NOT v_ja_existe AND p_anexo IS NOT NULL THEN
      v_anexos := v_anexos || v_novo_anexo_arr;
    END IF;

    v_telegram_msgs := COALESCE(v_fechamento.telegram_message_ids, '[]'::jsonb);
    IF jsonb_typeof(v_telegram_msgs) <> 'array' THEN
      v_telegram_msgs := '[]'::jsonb;
    END IF;

    IF p_telegram_message_id IS NOT NULL AND NOT (v_telegram_msgs @> jsonb_build_array(p_telegram_message_id)) THEN
      v_telegram_msgs := v_telegram_msgs || jsonb_build_array(p_telegram_message_id);
    END IF;

    UPDATE public.fechamentos_caixa
       SET anexos = v_anexos,
           telegram_message_ids = v_telegram_msgs,
           updated_at = NOW()
     WHERE id = v_fechamento.id
    RETURNING jsonb_build_object(
      'id', id,
      'is_new', FALSE,
      'anexos', anexos,
      'telegram_message_ids', telegram_message_ids,
      'status', status,
      'identidade_pendente', identidade_pendente
    ) INTO v_result;

  ELSE
    -- Linha ainda não existe: inserção atômica com validação de status inicial
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
      v_effective_colaborador_id,
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

-- Permissões estritas: revogado de PUBLIC e anon
REVOKE ALL ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_anexo_fechamento_atomico(UUID, UUID, BIGINT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BIGINT) TO authenticated, service_role;
