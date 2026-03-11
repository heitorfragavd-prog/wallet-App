-- Migration 10: Chat IA tables
-- Documenta as tabelas criadas via Supabase Dashboard para o módulo de IA

-- ─── chat_conversas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo             text         NOT NULL DEFAULT 'Nova Conversa',
  openai_thread_id   text,
  ultima_mensagem_em timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversas_user_id
  ON public.chat_conversas (user_id, ultima_mensagem_em DESC);

-- RLS
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own conversations" ON public.chat_conversas;
CREATE POLICY "Users can manage own conversations"
  ON public.chat_conversas
  FOR ALL
  USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON public.chat_conversas TO anon, authenticated;

-- ─── chat_mensagens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id   uuid        NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  conteudo      text        NOT NULL DEFAULT '',
  imagem_base64 text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa_id
  ON public.chat_mensagens (conversa_id, created_at ASC);

-- RLS
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own messages" ON public.chat_mensagens;
CREATE POLICY "Users can manage own messages"
  ON public.chat_mensagens
  FOR ALL
  USING (auth.uid() = user_id);

-- Grants
GRANT ALL ON public.chat_mensagens TO anon, authenticated;
