-- Migration: 20260818030000_wallet_ai_action_proposals.sql
-- Descrição: Criação da tabela de propostas e gateway de ações transacionais com confirmação explícita e isolamento por workspace.

CREATE TABLE IF NOT EXISTS public.wallet_ai_action_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    action_version TEXT NOT NULL DEFAULT 'v1',
    summary TEXT NOT NULL,
    payload JSONB NOT NULL,
    previous_state JSONB,
    idempotency_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('prepared', 'confirmed', 'executed', 'cancelled', 'expired')) DEFAULT 'prepared',
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices para consultas e idempotência
CREATE INDEX IF NOT EXISTS idx_wallet_ai_actions_workspace_user 
    ON public.wallet_ai_action_proposals (workspace_id, user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ai_actions_idempotency 
    ON public.wallet_ai_action_proposals (workspace_id, idempotency_hash) 
    WHERE status IN ('prepared', 'confirmed', 'executed');

-- Habilitar RLS
ALTER TABLE public.wallet_ai_action_proposals ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "wallet_ai_action_proposals_select"
    ON public.wallet_ai_action_proposals
    FOR SELECT
    TO authenticated
    USING ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_action_proposals_insert"
    ON public.wallet_ai_action_proposals
    FOR INSERT
    TO authenticated
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_action_proposals_update"
    ON public.wallet_ai_action_proposals
    FOR UPDATE
    TO authenticated
    USING ( (select auth.uid()) = user_id )
    WITH CHECK ( (select auth.uid()) = user_id );

CREATE POLICY "wallet_ai_action_proposals_delete"
    ON public.wallet_ai_action_proposals
    FOR DELETE
    TO authenticated
    USING ( (select auth.uid()) = user_id );
