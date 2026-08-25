-- Migration: RPC merge_nf_multipage_page com pg_advisory_xact_lock e Restrição estrita de Permissions
-- Data: 2026-08-25
-- Nota: Esta migration NÃO é executada automaticamente. Fica versionada para aplicação segura.

CREATE OR REPLACE FUNCTION public.merge_nf_multipage_page(
  p_user_id UUID,
  p_chat_id TEXT,
  p_workspace_id UUID,
  p_chave_acesso TEXT,
  p_numero_nf TEXT,
  p_serie_nf TEXT,
  p_cnpj_fornecedor TEXT,
  p_fornecedor TEXT,
  p_total_paginas INT,
  p_pagina_atual INT,
  p_pagina_dados JSONB,
  p_valores_totais JSONB DEFAULT '{}'::jsonb,
  p_cabecalho JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sessao_id UUID;
  v_dados JSONB;
  v_paginas JSONB;
  v_is_duplicada BOOLEAN := false;
  v_paginas_arr INT[];
  v_faltantes INT[] := ARRAY[]::INT[];
  v_i INT;
  v_chave_limpa TEXT;
  v_cnpj_limpo TEXT;
  v_identidade_str TEXT;
BEGIN
  -- 1. Validação estrita de parâmetros obrigatórios
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id é obrigatório';
  END IF;

  IF p_chat_id IS NULL OR btrim(p_chat_id) = '' THEN
    RAISE EXCEPTION 'p_chat_id é obrigatório';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id é obrigatório';
  END IF;

  IF p_total_paginas < 2 OR p_pagina_atual < 1 OR p_pagina_atual > p_total_paginas THEN
    RAISE EXCEPTION 'Paginação inválida: atual=% total=%', p_pagina_atual, p_total_paginas;
  END IF;

  v_chave_limpa := regexp_replace(COALESCE(p_chave_acesso, ''), '\D', '', 'g');
  v_cnpj_limpo := regexp_replace(COALESCE(p_cnpj_fornecedor, ''), '\D', '', 'g');

  IF length(v_chave_limpa) = 44 THEN
    v_identidade_str := 'CHAVE:' || v_chave_limpa;
  ELSIF v_cnpj_limpo <> '' AND p_numero_nf IS NOT NULL AND p_serie_nf IS NOT NULL THEN
    v_identidade_str := 'COMP:' || v_cnpj_limpo || '|' || btrim(p_numero_nf) || '|' || btrim(p_serie_nf);
  ELSE
    RAISE EXCEPTION 'Identidade fiscal insuficiente para agrupamento de NF multipágina';
  END IF;

  -- 2. Bloqueio Transacional via Advisory Lock (Garante serialização atômica antes do SELECT/INSERT)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || '|' || p_chat_id || '|' || p_workspace_id::text || '|' || v_identidade_str,
      0
    )
  );

  -- 3. Buscar sessão ativa com bloqueio de linha (FOR UPDATE)
  SELECT id, dados INTO v_sessao_id, v_dados
  FROM public.telegram_propostas
  WHERE user_id = p_user_id
    AND chat_id = p_chat_id
    AND tipo = 'nf_multipage_pendente'
    AND status = 'pendente'
    AND expires_at > now()
    AND (dados->>'workspace_id')::uuid = p_workspace_id
    AND (
      (length(v_chave_limpa) = 44 AND (dados->'identidade'->>'chave_acesso') = v_chave_limpa)
      OR (
        v_cnpj_limpo <> '' AND p_numero_nf IS NOT NULL AND p_serie_nf IS NOT NULL
        AND (dados->'identidade'->>'cnpj_fornecedor') = v_cnpj_limpo
        AND (dados->'identidade'->>'numero_nf') = p_numero_nf
        AND (dados->'identidade'->>'serie_nf') = p_serie_nf
      )
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 4. Se sessão existir, mesclar atomicamente
  IF v_sessao_id IS NOT NULL THEN
    v_paginas := COALESCE(v_dados->'paginas', '{}'::jsonb);

    -- Verificar se a página atual já existe
    IF v_paginas ? p_pagina_atual::text THEN
      v_is_duplicada := true;
    ELSE
      -- Atualizar dados.paginas com a nova página via jsonb_set
      v_dados := jsonb_set(
        v_dados,
        ARRAY['paginas', p_pagina_atual::text],
        p_pagina_dados,
        true
      );

      -- Se for página 1 ou se não houver totais anteriores, atualizar cabeçalho e totais canônicos
      IF p_pagina_atual = 1 OR (v_dados->'valores_totais'->>'valor_produtos') IS NULL THEN
        IF p_valores_totais IS NOT NULL AND p_valores_totais <> '{}'::jsonb THEN
          v_dados := jsonb_set(v_dados, '{valores_totais}', p_valores_totais, true);
        END IF;
        IF p_cabecalho IS NOT NULL AND p_cabecalho <> '{}'::jsonb THEN
          v_dados := jsonb_set(v_dados, '{cabecalho}', p_cabecalho, true);
        END IF;
      END IF;

      UPDATE public.telegram_propostas
      SET dados = v_dados
      WHERE id = v_sessao_id;
    END IF;

  -- 5. Se sessão não existir, criar nova atomicamente (protegido pelo advisory lock)
  ELSE
    v_dados := jsonb_build_object(
      'versao', 1,
      'workspace_id', p_workspace_id,
      'identidade', jsonb_build_object(
        'chave_acesso', v_chave_limpa,
        'numero_nf', p_numero_nf,
        'serie_nf', p_serie_nf,
        'cnpj_fornecedor', v_cnpj_limpo
      ),
      'fornecedor', p_fornecedor,
      'total_paginas', p_total_paginas,
      'cabecalho', p_cabecalho,
      'valores_totais', p_valores_totais,
      'paginas', jsonb_build_object(p_pagina_atual::text, p_pagina_dados)
    );

    INSERT INTO public.telegram_propostas (
      user_id,
      chat_id,
      tipo,
      dados,
      resumo,
      status,
      expires_at
    ) VALUES (
      p_user_id,
      p_chat_id,
      'nf_multipage_pendente',
      v_dados,
      'NF ' || COALESCE(p_numero_nf, 'N/A') || ' (' || p_total_paginas || ' páginas)',
      'pendente',
      now() + INTERVAL '30 minutes'
    ) RETURNING id INTO v_sessao_id;
  END IF;

  -- 6. Calcular páginas recebidas e faltantes
  v_paginas := COALESCE(v_dados->'paginas', '{}'::jsonb);
  SELECT ARRAY_AGG(k::INT ORDER BY k::INT) INTO v_paginas_arr
  FROM jsonb_object_keys(v_paginas) AS k;

  IF v_paginas_arr IS NULL THEN
    v_paginas_arr := ARRAY[]::INT[];
  END IF;

  FOR v_i IN 1..p_total_paginas LOOP
    IF NOT (v_i = ANY(v_paginas_arr)) THEN
      v_faltantes := array_append(v_faltantes, v_i);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sessao_id', v_sessao_id,
    'dados', v_dados,
    'is_duplicada', v_is_duplicada,
    'paginas_recebidas', to_jsonb(v_paginas_arr),
    'faltantes', to_jsonb(v_faltantes),
    'completo', (cardinality(v_faltantes) = 0)
  );
END;
$$;

-- Permissões estritas: revogar de PUBLIC, anon e authenticated; conceder apenas a service_role
REVOKE ALL ON FUNCTION public.merge_nf_multipage_page(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_nf_multipage_page(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.merge_nf_multipage_page(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.merge_nf_multipage_page(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) TO service_role;
