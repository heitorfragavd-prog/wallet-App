-- Tabela de log para erros de leitura de documentos pela IA
CREATE TABLE IF NOT EXISTS public.ia_leitura_erros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    campos_suspeitos TEXT[] DEFAULT '{}',
    raw_analysis JSONB,
    channel_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ia_leitura_erros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem seus proprios erros" ON public.ia_leitura_erros;
CREATE POLICY "Usuarios veem seus proprios erros"
ON public.ia_leitura_erros FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manage ia_leitura_erros" ON public.ia_leitura_erros;
CREATE POLICY "Service role manage ia_leitura_erros"
ON public.ia_leitura_erros FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ia_leitura_erros_user ON public.ia_leitura_erros(user_id, created_at DESC);
