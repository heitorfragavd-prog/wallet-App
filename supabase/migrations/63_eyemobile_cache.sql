-- Migration 63: Tabela de Cache do Eyemobile PDV
CREATE TABLE IF NOT EXISTS public.eyemobile_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eyemobile_cache_created 
  ON public.eyemobile_cache(created_at);

ALTER TABLE public.eyemobile_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo aos usuarios autenticados em eyemobile_cache" ON public.eyemobile_cache;
CREATE POLICY "Permitir tudo aos usuarios autenticados em eyemobile_cache" ON public.eyemobile_cache
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
