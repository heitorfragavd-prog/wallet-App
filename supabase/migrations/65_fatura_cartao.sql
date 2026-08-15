-- Migration 65: Fatura de Cartao de Credito Importacoes
CREATE TABLE IF NOT EXISTS public.fatura_cartao_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id),
  conta_id UUID NOT NULL REFERENCES public.contas_usuario(id),
  mes_referencia TEXT NOT NULL,
  vencimento DATE,
  total_fatura NUMERIC(12,2),
  hash_transacoes TEXT NOT NULL,
  transacoes_criadas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fatura_import_unique 
  ON public.fatura_cartao_importacoes(user_id, conta_id, mes_referencia, hash_transacoes);

ALTER TABLE public.fatura_cartao_importacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fatura_cartao_importacoes' AND policyname = 'fatura_import_select_own'
  ) THEN
    CREATE POLICY "fatura_import_select_own" ON public.fatura_cartao_importacoes
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fatura_cartao_importacoes' AND policyname = 'fatura_import_insert_own'
  ) THEN
    CREATE POLICY "fatura_import_insert_own" ON public.fatura_cartao_importacoes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'cartao_id') THEN
    ALTER TABLE public.transacoes ADD COLUMN cartao_id UUID REFERENCES public.contas_usuario(id);
  END IF;
END $$;
