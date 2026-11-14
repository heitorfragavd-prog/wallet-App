-- Migration 96: workspace_calendar_integrations e calendar_eventos_sincronizados
-- Descrição: Tabelas de suporte à integração oficial com Google Calendar da Rodo Point (Etapa 12)
-- Blindagem RLS estrita: Acesso aos administradores e membros ativos do Workspace.

CREATE TABLE IF NOT EXISTS public.workspace_calendar_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_conectado TEXT NOT NULL,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    calendar_nome TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pendente_autorizacao' 
        CHECK (status IN ('pendente_autorizacao', 'conectado', 'desconectado', 'erro_autenticacao')),
    ultimo_sync_em TIMESTAMPTZ,
    ultimo_sync_token TEXT,
    configuracoes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_calendar_user UNIQUE (workspace_id, user_id, email_conectado)
);

CREATE TABLE IF NOT EXISTS public.calendar_eventos_sincronizados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.workspace_calendar_integrations(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    local TEXT,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    dia_inteiro BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'confirmed' 
        CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    compromisso_id UUID REFERENCES public.compromissos(id) ON DELETE SET NULL,
    idempotency_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_calendar_workspace_event UNIQUE (workspace_id, google_event_id)
);

-- Índices de Performance e Deduplicação
CREATE INDEX IF NOT EXISTS idx_workspace_cal_integ_ws ON public.workspace_calendar_integrations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_cal_event_ws_inicio ON public.calendar_eventos_sincronizados(workspace_id, inicio, fim);
CREATE INDEX IF NOT EXISTS idx_cal_event_idemp_hash ON public.calendar_eventos_sincronizados(workspace_id, idempotency_hash);

-- Habilitar Row Level Security
ALTER TABLE public.workspace_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_eventos_sincronizados ENABLE ROW LEVEL SECURITY;

-- ─── POLÍTICAS DE RLS: workspace_calendar_integrations ────────────────────────
-- Apenas Owner, Admins ou o próprio usuário que conectou podem gerenciar a integração

CREATE POLICY "calendar_integrations_select_admin_or_self"
    ON public.workspace_calendar_integrations
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_calendar_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "calendar_integrations_insert_admin_or_self"
    ON public.workspace_calendar_integrations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_calendar_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "calendar_integrations_update_admin_or_self"
    ON public.workspace_calendar_integrations
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_calendar_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "calendar_integrations_delete_admin_or_self"
    ON public.workspace_calendar_integrations
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_calendar_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

-- ─── POLÍTICAS DE RLS: calendar_eventos_sincronizados ─────────────────────────
-- Membros ativos do workspace podem ler eventos sincronizados da agenda

CREATE POLICY "calendar_eventos_select_members"
    ON public.calendar_eventos_sincronizados
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = calendar_eventos_sincronizados.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "calendar_eventos_insert_service_or_admin"
    ON public.calendar_eventos_sincronizados
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = calendar_eventos_sincronizados.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "calendar_eventos_update_service_or_admin"
    ON public.calendar_eventos_sincronizados
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = calendar_eventos_sincronizados.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );
