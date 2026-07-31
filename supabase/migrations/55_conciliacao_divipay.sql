-- Conciliação Divipay: despesas a partir de saques/pagamentos (Pix e boleto)
-- 1) Dívida passa a ter documento do favorecido (CPF/CNPJ ou chave Pix) para match exato
-- 2) pagamentos_dividas ganha vínculo idempotente com o saque Divipay
-- 3) Nova tabela divipay_conciliacoes: inbox da conciliação em 3 camadas

ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS documento_favorecido TEXT;

ALTER TABLE public.pagamentos_dividas
  ADD COLUMN IF NOT EXISTS divipay_external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_dividas_divipay_external_uidx
  ON public.pagamentos_dividas (divipay_external_id)
  WHERE divipay_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.divipay_conciliacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  divipay_external_id TEXT NOT NULL,
  tipo VARCHAR(10),                 -- 'DICT' (Pix) ou 'BILLET' (boleto)
  favorecido_nome TEXT,
  favorecido_documento TEXT,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  taxa NUMERIC NOT NULL DEFAULT 0,
  data_pagamento TIMESTAMPTZ,
  descricao TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'conciliada', 'importada', 'ignorada')),
  divida_sugerida_id UUID REFERENCES public.dividas(id) ON DELETE SET NULL,
  divida_id UUID REFERENCES public.dividas(id) ON DELETE SET NULL,
  despesa_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT divipay_conciliacoes_user_external_uk UNIQUE (user_id, divipay_external_id)
);

CREATE INDEX IF NOT EXISTS idx_divipay_conciliacoes_user_status
  ON public.divipay_conciliacoes (user_id, status);

ALTER TABLE public.divipay_conciliacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own conciliacoes" ON public.divipay_conciliacoes;
CREATE POLICY "Users can view their own conciliacoes"
  ON public.divipay_conciliacoes FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own conciliacoes" ON public.divipay_conciliacoes;
CREATE POLICY "Users can create their own conciliacoes"
  ON public.divipay_conciliacoes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own conciliacoes" ON public.divipay_conciliacoes;
CREATE POLICY "Users can update their own conciliacoes"
  ON public.divipay_conciliacoes FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own conciliacoes" ON public.divipay_conciliacoes;
CREATE POLICY "Users can delete their own conciliacoes"
  ON public.divipay_conciliacoes FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_divipay_conciliacoes_updated_at ON public.divipay_conciliacoes;
CREATE TRIGGER update_divipay_conciliacoes_updated_at
  BEFORE UPDATE ON public.divipay_conciliacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
