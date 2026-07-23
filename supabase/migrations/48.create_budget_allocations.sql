-- Migration 48: Create orcamento_configuracoes table for budget allocation control
CREATE TABLE IF NOT EXISTS public.orcamento_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  temas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_orcamento_user UNIQUE (user_id)
);

ALTER TABLE public.orcamento_configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own budget allocation" ON public.orcamento_configuracoes;
CREATE POLICY "Users can manage their own budget allocation"
ON public.orcamento_configuracoes
FOR ALL
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());
