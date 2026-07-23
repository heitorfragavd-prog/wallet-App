-- Migration 49: Organizze Features Schema
-- Support for Accounts & Credit Card Billing, Subcategories, Paid/Pending status, and Category Budgets (Teto de Gastos)

-- 1. Contas e Cartões de Crédito
ALTER TABLE public.contas_usuario
  ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS saldo_atual NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS dia_fechamento INT,
  ADD COLUMN IF NOT EXISTS dia_vencimento INT,
  ADD COLUMN IF NOT EXISTS cor TEXT DEFAULT '#3B82F6';

-- 2. Subcategorias (Hierarquia em categorias)
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categorias(id) ON DELETE CASCADE;

-- 3. Status e Subcategoria em Despesas
ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL;

-- Status e Subcategoria em Receitas
ALTER TABLE public.receitas
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'recebido',
  ADD COLUMN IF NOT EXISTS subcategoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL;

-- 4. Teto de Gastos (Orçamentos por Categoria)
CREATE TABLE IF NOT EXISTS public.orcamentos_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  valor_limite NUMERIC(10,2) NOT NULL CHECK (valor_limite > 0),
  mes_referencia VARCHAR(7) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_categoria_mes UNIQUE (user_id, categoria_id, mes_referencia)
);

ALTER TABLE public.orcamentos_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own category budgets" ON public.orcamentos_categorias;
CREATE POLICY "Users can manage their own category budgets"
ON public.orcamentos_categorias
FOR ALL
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());
