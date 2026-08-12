-- Tabela para cache local e sincronização de custo/estoque de produtos do Eyemobile
CREATE TABLE IF NOT EXISTS public.eyemobile_produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID,
    produto_id TEXT, -- ID do produto no Eyemobile
    nome TEXT NOT NULL,
    codigo_barras TEXT,
    custo NUMERIC(10,2) NOT NULL DEFAULT 0,
    estoque NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.eyemobile_produtos ENABLE ROW LEVEL SECURITY;

-- Política para usuários autenticados gerenciarem seus próprios produtos
DROP POLICY IF EXISTS "Usuários gerenciam seus próprios produtos Eyemobile" ON public.eyemobile_produtos;
CREATE POLICY "Usuários gerenciam seus próprios produtos Eyemobile"
ON public.eyemobile_produtos FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política para a service role gerenciar a tabela
DROP POLICY IF EXISTS "Service role can manage eyemobile_produtos" ON public.eyemobile_produtos;
CREATE POLICY "Service role can manage eyemobile_produtos"
ON public.eyemobile_produtos FOR ALL
USING (true)
WITH CHECK (true);

-- Gatilho updated_at
DROP TRIGGER IF EXISTS trg_eyemobile_produtos_updated_at ON public.eyemobile_produtos;
CREATE TRIGGER trg_eyemobile_produtos_updated_at
    BEFORE UPDATE ON public.eyemobile_produtos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_eyemobile_produtos_user ON public.eyemobile_produtos(user_id);
CREATE INDEX IF NOT EXISTS idx_eyemobile_produtos_codigo_barras ON public.eyemobile_produtos(codigo_barras);
CREATE INDEX IF NOT EXISTS idx_eyemobile_produtos_nome ON public.eyemobile_produtos(nome);
