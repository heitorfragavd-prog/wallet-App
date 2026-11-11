-- Migration 87: Ampliação dos status de execução e entrega de relatórios executivos

ALTER TABLE public.ceo_executive_reports
  DROP CONSTRAINT IF EXISTS ceo_executive_reports_status_check;

ALTER TABLE public.ceo_executive_reports
  ADD CONSTRAINT ceo_executive_reports_status_check
  CHECK (status IN ('generating', 'completed', 'failed', 'fallback_deterministic', 'pending_dispatch'));

CREATE INDEX IF NOT EXISTS idx_ceo_executive_reports_dispatch
  ON public.ceo_executive_reports ((dispatch_status->>'telegram'), status);
