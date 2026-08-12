-- Tabela para mapeamento de canais de comunicação (WhatsApp, Telegram, ChatGPT)
CREATE TABLE IF NOT EXISTS public.channel_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram', 'chatgpt')),
    channel_id TEXT NOT NULL, -- Número do whats, Chat ID do telegram ou Session do GPT
    channel_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    access_level TEXT NOT NULL DEFAULT 'user' CHECK (access_level IN ('admin', 'socio', 'funcionario', 'user')),
    nome_exibicao TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(channel_type, channel_id)
);

-- Habilitar RLS
ALTER TABLE public.channel_mappings ENABLE ROW LEVEL SECURITY;

-- Política de RLS para usuários autenticados gerenciarem seus próprios mapeamentos
DROP POLICY IF EXISTS "Usuários gerenciam seus próprios mapeamentos de canal" ON public.channel_mappings;
CREATE POLICY "Usuários gerenciam seus próprios mapeamentos de canal"
ON public.channel_mappings FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política de RLS para service role gerenciar a tabela
DROP POLICY IF EXISTS "Service role can manage channel_mappings" ON public.channel_mappings;
CREATE POLICY "Service role can manage channel_mappings"
ON public.channel_mappings FOR ALL
USING (true)
WITH CHECK (true);

-- Gatilho updated_at
DROP TRIGGER IF EXISTS trg_channel_mappings_updated_at ON public.channel_mappings;
CREATE TRIGGER trg_channel_mappings_updated_at
    BEFORE UPDATE ON public.channel_mappings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_channel_mappings_channel ON public.channel_mappings(channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_mappings_user ON public.channel_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_mappings_workspace ON public.channel_mappings(workspace_id);
