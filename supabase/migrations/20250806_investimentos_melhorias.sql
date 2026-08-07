-- Alteracoes na tabela investimentos
ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS cnpj_instituicao text;
ALTER TABLE public.investimentos ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES public.contas_usuario(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_investimentos_conta ON public.investimentos(conta_id);

-- Alteracoes na tabela configuracoes_investimentos
ALTER TABLE public.configuracoes_investimentos ADD COLUMN IF NOT EXISTS sweep_caixa_minimo numeric DEFAULT 2000;
