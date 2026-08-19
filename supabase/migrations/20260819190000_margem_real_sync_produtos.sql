-- Adicionar colunas de margem real e ativo na tabela produtos_eyemobile
ALTER TABLE public.produtos_eyemobile ADD COLUMN IF NOT EXISTS margem_real_percentual DECIMAL(5,2) DEFAULT 30.00;
ALTER TABLE public.produtos_eyemobile ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_ativo ON public.produtos_eyemobile(user_id, workspace_id, ativo);
