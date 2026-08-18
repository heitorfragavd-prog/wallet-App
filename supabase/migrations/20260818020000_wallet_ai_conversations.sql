-- Migration: 20260818020000_wallet_ai_conversations.sql
-- Descrição: Criação das tabelas de conversas e mensagens para o Wallet Finance Agent V2 com isolamento por workspace e RLS estrito.

CREATE TABLE IF NOT EXISTS public.wallet_ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    title TEXT NOT NULL DEFAULT 'Nova Conversa',
    summary TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.wallet_ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.wallet_ai_conversations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT,
    tool_calls JSONB,
    tool_results JSONB,
    sources JSONB,
    tokens_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices de performance e isolamento
CREATE INDEX IF NOT EXISTS idx_wallet_ai_conversations_workspace_user 
    ON public.wallet_ai_conversations (workspace_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_messages_conv_created 
    ON public.wallet_ai_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_wallet_ai_messages_workspace_user 
    ON public.wallet_ai_messages (workspace_id, user_id);

-- Habilitar RLS
ALTER TABLE public.wallet_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ai_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para conversas
CREATE POLICY "wallet_ai_conversations_select"
    ON public.wallet_ai_conversations
    FOR SELECT
    TO authenticated
    USING ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_conversations_insert"
    ON public.wallet_ai_conversations
    FOR INSERT
    TO authenticated
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_conversations_update"
    ON public.wallet_ai_conversations
    FOR UPDATE
    TO authenticated
    USING ( (select auth.uid()) = user_id )
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_conversations_delete"
    ON public.wallet_ai_conversations
    FOR DELETE
    TO authenticated
    USING ( (select auth.uid()) = user_id );

-- Políticas de RLS para mensagens
CREATE POLICY "wallet_ai_messages_select"
    ON public.wallet_ai_messages
    FOR SELECT
    TO authenticated
    USING ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_messages_insert"
    ON public.wallet_ai_messages
    FOR INSERT
    TO authenticated
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_messages_update"
    ON public.wallet_ai_messages
    FOR UPDATE
    TO authenticated
    USING ( (select auth.uid()) = user_id )
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_messages_delete"
    ON public.wallet_ai_messages
    FOR DELETE
    TO authenticated
    USING ( (select auth.uid()) = user_id );
