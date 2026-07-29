-- 1. Tabela de Configurações da Integração
CREATE TABLE IF NOT EXISTS public.eyemobile_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging')),
    store_id TEXT,
    default_conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
    default_categoria_receita_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    default_categoria_taxa_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    auto_sync_sales BOOLEAN NOT NULL DEFAULT true,
    auto_sync_stock BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT eyemobile_config_user_unique UNIQUE (user_id)
);

-- 2. Tabela de Logs de Sincronização
CREATE TABLE IF NOT EXISTS public.eyemobile_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('SALES', 'STOCK', 'WEBHOOK', 'TEST')),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR', 'WARNING')),
    items_processed INTEGER NOT NULL DEFAULT 0,
    payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alterações na tabela itens_mercado para suportar integração
ALTER TABLE public.itens_mercado ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual';
ALTER TABLE public.itens_mercado ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 3. Habilitar RLS nas novas tabelas
ALTER TABLE public.eyemobile_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eyemobile_sync_logs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança (RLS)
DROP POLICY IF EXISTS "Usuários gerenciam suas próprias configs do Eyemobile" ON public.eyemobile_config;
CREATE POLICY "Usuários gerenciam suas próprias configs do Eyemobile"
ON public.eyemobile_config FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários leem seus próprios logs do Eyemobile" ON public.eyemobile_sync_logs;
CREATE POLICY "Usuários leem seus próprios logs do Eyemobile"
ON public.eyemobile_sync_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Permissão para a service role inserir logs (usado pelas Edge Functions)
DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.eyemobile_sync_logs;
CREATE POLICY "Service role can insert sync logs"
ON public.eyemobile_sync_logs FOR INSERT
WITH CHECK (true);

-- 5. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_eyemobile_config_user ON public.eyemobile_config(user_id);
CREATE INDEX IF NOT EXISTS idx_eyemobile_sync_logs_user ON public.eyemobile_sync_logs(user_id, created_at DESC);
