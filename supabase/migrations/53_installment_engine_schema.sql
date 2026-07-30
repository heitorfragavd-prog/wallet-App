-- Migration 53: Suporte ao Motor de Parcelamento em Transações e Dívidas

-- 1. Adicionar colunas de parcelamento em transacoes
ALTER TABLE public.transacoes 
ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT 1 CHECK (parcela_atual >= 1),
ADD COLUMN IF NOT EXISTS total_parcelas INTEGER DEFAULT 1 CHECK (total_parcelas >= 1),
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.transacoes(id) ON DELETE CASCADE;

-- 2. Adicionar colunas complementares de parcelamento em dividas
ALTER TABLE public.dividas 
ADD COLUMN IF NOT EXISTS parcela_atual INTEGER DEFAULT 1 CHECK (parcela_atual >= 1),
ADD COLUMN IF NOT EXISTS total_parcelas INTEGER DEFAULT 1 CHECK (total_parcelas >= 1),
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.dividas(id) ON DELETE CASCADE;

-- 3. Índices para consultas de grupo de parcelas por parent_id
CREATE INDEX IF NOT EXISTS idx_transacoes_parent_id ON public.transacoes(parent_id);
CREATE INDEX IF NOT EXISTS idx_dividas_parent_id ON public.dividas(parent_id);
