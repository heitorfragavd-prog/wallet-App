-- =============================================================================
-- Rollback Migration 94: Reverter Tabelas de Disponibilidade e Escalas Config
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.escalas_config CASCADE;
DROP TABLE IF EXISTS public.folguistas_disponibilidade CASCADE;

ALTER TABLE public.colaboradores
  DROP COLUMN IF EXISTS turnos_preferidos,
  DROP COLUMN IF EXISTS dias_disponiveis,
  DROP COLUMN IF EXISTS avaliacao_nota,
  DROP COLUMN IF EXISTS restricoes_alimentares,
  DROP COLUMN IF EXISTS observacoes_escala;

COMMIT;
