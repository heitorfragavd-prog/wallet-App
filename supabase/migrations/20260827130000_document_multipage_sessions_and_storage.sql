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

-- 2. Colunas de Storage na tabela chat_mensagens (Preservando imagem_base64 legado)
ALTER TABLE IF EXISTS public.chat_mensagens 
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- 3. Bucket Privado chat-attachments no Supabase Storage
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
-- Estrutura de pasta obrigatória: <user_id>/<workspace_id>/<conversation_id>/<file>
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
