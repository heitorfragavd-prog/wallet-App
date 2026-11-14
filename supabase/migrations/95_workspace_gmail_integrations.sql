-- Migration 95: workspace_gmail_integrations e gmail_mensagens_processadas
-- Descrição: Tabelas de suporte à integração oficial e 100% somente-leitura com o Gmail da Rodo Point (Etapa 11)
-- Blindagem RLS estrita: Acesso exclusivo aos administradores e proprietários ativos do Workspace.

CREATE TABLE IF NOT EXISTS public.workspace_gmail_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_conectado TEXT NOT NULL,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pendente_autorizacao' 
        CHECK (status IN ('pendente_autorizacao', 'conectado', 'desconectado', 'erro_autenticacao')),
    ultimo_sync_em TIMESTAMPTZ,
    ultima_mensagem_sync_id TEXT,
    ultimo_history_id TEXT,
    configuracoes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_gmail_email UNIQUE (workspace_id, email_conectado)
);

CREATE TABLE IF NOT EXISTS public.gmail_mensagens_processadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES public.workspace_gmail_integrations(id) ON DELETE SET NULL,
    message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    remetente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    assunto TEXT,
    data_email TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'processado' 
        CHECK (status IN ('processado', 'ignorado', 'falha', 'revisar')),
    tipo_documento_detectado TEXT 
        CHECK (tipo_documento_detectado IN ('boleto', 'nfe', 'comprovante', 'cobranca', 'outro', 'sem_anexo')),
    qtd_anexos INTEGER NOT NULL DEFAULT 0,
    proposal_id UUID REFERENCES public.wallet_ai_action_proposals(id) ON DELETE SET NULL,
    fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
    divida_id UUID REFERENCES public.dividas(id) ON DELETE SET NULL,
    detalhes_extracao JSONB NOT NULL DEFAULT '{}'::jsonb,
    erro_processamento TEXT,
    idempotency_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_gmail_workspace_message UNIQUE (workspace_id, message_id)
);

-- Índices de Performance e Deduplicação
CREATE INDEX IF NOT EXISTS idx_workspace_gmail_integ_ws ON public.workspace_gmail_integrations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_gmail_msg_proc_ws_hash ON public.gmail_mensagens_processadas(workspace_id, idempotency_hash);
CREATE INDEX IF NOT EXISTS idx_gmail_msg_proc_status ON public.gmail_mensagens_processadas(workspace_id, status, data_email DESC);

-- Habilitar Row Level Security
ALTER TABLE public.workspace_gmail_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_mensagens_processadas ENABLE ROW LEVEL SECURITY;

-- ─── POLÍTICAS DE RLS: workspace_gmail_integrations ───────────────────────────
-- Apenas Owner e Admins ativos do Workspace podem ler ou gerenciar integrações

CREATE POLICY "gmail_integrations_select_admin"
    ON public.workspace_gmail_integrations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_gmail_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "gmail_integrations_insert_admin"
    ON public.workspace_gmail_integrations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_gmail_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "gmail_integrations_update_admin"
    ON public.workspace_gmail_integrations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_gmail_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_gmail_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "gmail_integrations_delete_admin"
    ON public.workspace_gmail_integrations
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = workspace_gmail_integrations.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

-- ─── POLÍTICAS DE RLS: gmail_mensagens_processadas ────────────────────────────
-- Membros ativos podem visualizar documentos processados; mutações restritas a administradores ou service role

CREATE POLICY "gmail_mensagens_select_members"
    ON public.gmail_mensagens_processadas
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = gmail_mensagens_processadas.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "gmail_mensagens_insert_admin"
    ON public.gmail_mensagens_processadas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = gmail_mensagens_processadas.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );

CREATE POLICY "gmail_mensagens_update_admin"
    ON public.gmail_mensagens_processadas
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = gmail_mensagens_processadas.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = gmail_mensagens_processadas.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('owner', 'admin')
              AND wm.active IS TRUE
        )
    );
