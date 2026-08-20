-- ============================================================================
-- MIGRATION: SEFAZ DF-e & Certificado Digital A1 Integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_certificados_sefaz (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    cnpj VARCHAR(18) NOT NULL,
    razao_social VARCHAR(255),
    uf VARCHAR(2) NOT NULL DEFAULT 'MG',
    ambiente VARCHAR(20) NOT NULL DEFAULT 'producao' CHECK (ambiente IN ('producao', 'homologacao')),
    certificado_storage_path TEXT,
    certificado_senha_criptografada TEXT,
    validade_fim TIMESTAMPTZ,
    ultimo_nsu VARCHAR(30) DEFAULT '0',
    max_nsu VARCHAR(30) DEFAULT '0',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pendente', 'expirado', 'erro')),
    erro_mensagem TEXT,
    sincronizacao_automatica BOOLEAN DEFAULT TRUE,
    ultima_sincronizacao TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sefaz_documentos_recebidos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    nsu VARCHAR(30) NOT NULL,
    chave_acesso VARCHAR(44) NOT NULL,
    tipo_documento VARCHAR(30) NOT NULL DEFAULT 'nfe_completa' CHECK (tipo_documento IN ('nfe_resumo', 'nfe_completa', 'evento', 'cancelamento')),
    emitente_cnpj VARCHAR(18),
    emitente_nome VARCHAR(255),
    destinatario_cnpj VARCHAR(18),
    data_emissao TIMESTAMPTZ,
    valor_total NUMERIC(15, 2) DEFAULT 0.00,
    xml_conteudo TEXT,
    status_processamento VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status_processamento IN ('pendente', 'importado', 'ignorado', 'erro')),
    nf_compra_id UUID REFERENCES public.notas_fiscais_compra(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, chave_acesso)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sefaz_certificados_user ON public.workspace_certificados_sefaz(user_id);
CREATE INDEX IF NOT EXISTS idx_sefaz_docs_user_chave ON public.sefaz_documentos_recebidos(user_id, chave_acesso);
CREATE INDEX IF NOT EXISTS idx_sefaz_docs_status ON public.sefaz_documentos_recebidos(status_processamento);

-- RLS
ALTER TABLE public.workspace_certificados_sefaz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sefaz_documentos_recebidos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'workspace_certificados_sefaz' AND policyname = 'workspace_certificados_sefaz_user_policy'
    ) THEN
        CREATE POLICY workspace_certificados_sefaz_user_policy ON public.workspace_certificados_sefaz
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sefaz_documentos_recebidos' AND policyname = 'sefaz_documentos_recebidos_user_policy'
    ) THEN
        CREATE POLICY sefaz_documentos_recebidos_user_policy ON public.sefaz_documentos_recebidos
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
