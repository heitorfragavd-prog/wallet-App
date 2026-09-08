-- Migration Local: Sessões Multipágina de Documentos e Storage de Anexos
-- Data: 2026-08-27
-- Regra: Apenas versionada localmente. NÃO aplicar remotamente sem autorização expressa.

-- 1. Tabela de Sessões de Documentos (Multipágina e Roteamento de Documentos)
CREATE TABLE IF NOT EXISTS public.documento_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID,
  documento_tipo TEXT NOT NULL DEFAULT 'DANFE',
  chave_acesso TEXT,
  numero_nf TEXT,
  fornecedor TEXT,
  total_paginas INT NOT NULL DEFAULT 1,
  paginas_recebidas INT[] NOT NULL DEFAULT ARRAY[]::INT[],
  dados_sessao JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'consolidada', 'expirada', 'cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_documento_sessoes_lookup 
  ON public.documento_sessoes(workspace_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_documento_sessoes_conversa 
  ON public.documento_sessoes(conversation_id);

CREATE INDEX IF NOT EXISTS idx_documento_sessoes_updated 
  ON public.documento_sessoes(updated_at);

-- Habilitar RLS
ALTER TABLE public.documento_sessoes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "documento_sessoes_user_access" ON public.documento_sessoes;
CREATE POLICY "documento_sessoes_user_access" ON public.documento_sessoes
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()
    )
  );

-- 2. RPC Atômica para Merge de Folhas Multipágina (pg_advisory_xact_lock + FOR UPDATE)
CREATE OR REPLACE FUNCTION public.merge_documento_sessao_page(
  p_user_id UUID,
  p_workspace_id UUID,
  p_conversation_id UUID,
  p_chave_acesso TEXT,
  p_numero_nf TEXT,
  p_fornecedor TEXT,
  p_total_paginas INT,
  p_pagina_atual INT,
  p_itens_pagina JSONB,
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
  v_paginas_arr INT[];
  v_is_duplicada BOOLEAN := false;
  v_faltantes INT[] := ARRAY[]::INT[];
  v_i INT;
  v_chave_limpa TEXT;
  v_identidade_str TEXT;
  v_lock_key TEXT;
  v_status TEXT;
  v_itens_acumulados JSONB;
  v_resultado JSONB;
BEGIN
  -- 1. Validação estrita de parâmetros obrigatórios
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id é obrigatório';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'p_workspace_id é obrigatório';
  END IF;

  IF p_total_paginas < 2 OR p_pagina_atual < 1 OR p_pagina_atual > p_total_paginas THEN
    RAISE EXCEPTION 'Paginação inválida: atual=% total=%', p_pagina_atual, p_total_paginas;
  END IF;

  v_chave_limpa := regexp_replace(COALESCE(p_chave_acesso, ''), '\D', '', 'g');
  IF length(v_chave_limpa) = 44 THEN
    v_identidade_str := 'CHAVE:' || v_chave_limpa;
  ELSIF p_numero_nf IS NOT NULL AND btrim(p_numero_nf) <> '' THEN
    v_identidade_str := 'NF:' || btrim(p_numero_nf) || '|' || COALESCE(btrim(p_fornecedor), '');
  ELSE
    v_identidade_str := 'TEMP:' || COALESCE(p_conversation_id::text, 'GEN');
  END IF;

  -- 2. Concorrência Segura: Advisory Lock transacional por workspace + user + identidade fiscal
  v_lock_key := 'DOC_SESSION:' || p_workspace_id::text || ':' || p_user_id::text || ':' || v_identidade_str;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  -- 3. Localizar sessão pendente existente (com lock FOR UPDATE)
  SELECT id, dados_sessao, paginas_recebidas
  INTO v_sessao_id, v_dados, v_paginas_arr
  FROM public.documento_sessoes
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND status = 'pendente'
    AND updated_at > now() - interval '24 hours'
    AND (
      (v_chave_limpa <> '' AND chave_acesso = v_chave_limpa)
      OR (p_numero_nf IS NOT NULL AND numero_nf = p_numero_nf)
      OR (p_conversation_id IS NOT NULL AND conversation_id = p_conversation_id)
    )
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 4. Se a sessão já existe e não expirou, mesclar atomicamente
  IF v_sessao_id IS NOT NULL THEN
    -- Detectar página duplicada
    IF p_pagina_atual = ANY(v_paginas_arr) THEN
      v_is_duplicada := true;
    ELSE
      v_paginas_arr := array_append(v_paginas_arr, p_pagina_atual);
      -- Ordenar array de páginas recebidas
      SELECT array_agg(elem ORDER BY elem) INTO v_paginas_arr FROM unnest(v_paginas_arr) AS elem;
    END IF;

    -- Mesclar itens (concatenar novo array de itens aos acumulados)
    v_itens_acumulados := COALESCE(v_dados->'itensAcumulados', '[]'::jsonb);
    IF NOT v_is_duplicada THEN
      v_itens_acumulados := v_itens_acumulados || COALESCE(p_itens_pagina, '[]'::jsonb);
    END IF;

    -- Calcular páginas faltantes
    FOR v_i IN 1..p_total_paginas LOOP
      IF NOT (v_i = ANY(v_paginas_arr)) THEN
        v_faltantes := array_append(v_faltantes, v_i);
      END IF;
    END LOOP;

    -- Definir status (consolidada quando todas as páginas chegarem)
    IF array_length(v_faltantes, 1) IS NULL THEN
      v_status := 'consolidada';
    ELSE
      v_status := 'pendente';
    END IF;

    -- Montar dados atualizados da sessão
    v_dados := jsonb_build_object(
      'fornecedor', COALESCE(p_fornecedor, v_dados->>'fornecedor'),
      'numeroNf', COALESCE(p_numero_nf, v_dados->>'numeroNf'),
      'chaveAcesso', COALESCE(v_chave_limpa, v_dados->>'chaveAcesso'),
      'valorProdutosDeclarado', COALESCE((p_valores_totais->>'valor_produtos')::numeric, (v_dados->>'valorProdutosDeclarado')::numeric, 0),
      'valorTotalNfDeclarado', COALESCE((p_valores_totais->>'valor_total_nf')::numeric, (v_dados->>'valorTotalNfDeclarado')::numeric, 0),
      'totalPaginas', p_total_paginas,
      'paginasRecebidas', to_jsonb(v_paginas_arr),
      'workspaceId', p_workspace_id,
      'itensAcumulados', v_itens_acumulados,
      'cabecalho', CASE WHEN p_cabecalho <> '{}'::jsonb THEN p_cabecalho ELSE COALESCE(v_dados->'cabecalho', '{}'::jsonb) END,
      'valores_totais', CASE WHEN p_valores_totais <> '{}'::jsonb THEN p_valores_totais ELSE COALESCE(v_dados->'valores_totais', '{}'::jsonb) END
    );

    UPDATE public.documento_sessoes
    SET paginas_recebidas = v_paginas_arr,
        total_paginas = p_total_paginas,
        dados_sessao = v_dados,
        status = v_status,
        updated_at = now()
    WHERE id = v_sessao_id;

  -- 5. Caso contrário, criar nova sessão atômica
  ELSE
    v_paginas_arr := ARRAY[p_pagina_atual];
    v_itens_acumulados := COALESCE(p_itens_pagina, '[]'::jsonb);

    FOR v_i IN 1..p_total_paginas LOOP
      IF v_i <> p_pagina_atual THEN
        v_faltantes := array_append(v_faltantes, v_i);
      END IF;
    END LOOP;

    v_status := 'pendente';

    v_dados := jsonb_build_object(
      'fornecedor', p_fornecedor,
      'numeroNf', p_numero_nf,
      'chaveAcesso', v_chave_limpa,
      'valorProdutosDeclarado', COALESCE((p_valores_totais->>'valor_produtos')::numeric, 0),
      'valorTotalNfDeclarado', COALESCE((p_valores_totais->>'valor_total_nf')::numeric, 0),
      'totalPaginas', p_total_paginas,
      'paginasRecebidas', to_jsonb(v_paginas_arr),
      'workspaceId', p_workspace_id,
      'itensAcumulados', v_itens_acumulados,
      'cabecalho', p_cabecalho,
      'valores_totais', p_valores_totais
    );

    INSERT INTO public.documento_sessoes (
      user_id,
      workspace_id,
      conversation_id,
      documento_tipo,
      chave_acesso,
      numero_nf,
      fornecedor,
      total_paginas,
      paginas_recebidas,
      dados_sessao,
      status
    ) VALUES (
      p_user_id,
      p_workspace_id,
      p_conversation_id,
      'DANFE',
      v_chave_limpa,
      p_numero_nf,
      p_fornecedor,
      p_total_paginas,
      v_paginas_arr,
      v_dados,
      v_status
    )
    RETURNING id INTO v_sessao_id;
  END IF;

  -- 6. Retorno estruturado atômico
  v_resultado := jsonb_build_object(
    'sessao_id', v_sessao_id,
    'status', v_status,
    'total_paginas', p_total_paginas,
    'pagina_atual', p_pagina_atual,
    'paginas_recebidas', to_jsonb(v_paginas_arr),
    'paginas_faltantes', to_jsonb(v_faltantes),
    'is_duplicada', v_is_duplicada,
    'dados_sessao', v_dados
  );

  RETURN v_resultado;
END;
$$;

-- Restrição estrita de permissões da RPC
REVOKE ALL ON FUNCTION public.merge_documento_sessao_page(UUID, UUID, UUID, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_documento_sessao_page(UUID, UUID, UUID, TEXT, TEXT, TEXT, INT, INT, JSONB, JSONB, JSONB) TO service_role;

-- 3. Colunas de Storage na tabela chat_mensagens (Preservando imagem_base64 legado)
ALTER TABLE IF EXISTS public.chat_mensagens 
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- 4. Bucket Privado chat-attachments no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  15728640, -- 15MB limite
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 15728640;

-- Políticas de Storage para o bucket chat-attachments
DROP POLICY IF EXISTS "chat_attachments_upload" ON storage.objects;
CREATE POLICY "chat_attachments_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
CREATE POLICY "chat_attachments_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
CREATE POLICY "chat_attachments_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
