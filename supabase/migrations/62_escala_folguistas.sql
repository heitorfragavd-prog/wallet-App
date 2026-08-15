-- Migration 62: Tabela de Escalas e Diarias de Folguistas
CREATE TABLE IF NOT EXISTS public.colaborador_escalas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno TEXT DEFAULT 'integral',
  valor_diaria NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  bateu_meta BOOLEAN DEFAULT FALSE,
  valor_meta NUMERIC(10,2) DEFAULT 20.00,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.colaborador_escalas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo aos usuarios autenticados em escalas" ON public.colaborador_escalas;
CREATE POLICY "Permitir tudo aos usuarios autenticados em escalas" ON public.colaborador_escalas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
