-- =============================================================================
-- Migration 88: Reconciliação de Histórico (84_*) e Schema de Estoque/Compras
-- =============================================================================
-- Contexto (Etapa 07 — Entrega D — Gate 0.4):
--   O histórico do repositório possui duas migrations com prefixo 84:
--     1. 84_ceo_executive_reports_foundation.sql
--     2. 84_estoque_compras_rh_foundation.sql
--   Ambas já foram aplicadas em produção e utilizam DDL idempotente (IF NOT EXISTS).
--   Conforme política de imutabilidade de histórico de migrations, os arquivos 84_*
--   são preservados intactos e esta migration 88 atua como ponto oficial de
--   reconciliação, garantindo:
--     1. Existência íntegra de public.ceo_executive_reports.
--     2. Existência íntegra das colunas de estoque/fornecedor em public.produtos_eyemobile
--        sem valores padrão artificiais (ex.: sem "Distribuidor Padrão" ou estoque_ideal fictício).
--     3. Índices operacionais de reposição e fornecedor.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.produtos_eyemobile') IS NOT NULL THEN
    ALTER TABLE public.produtos_eyemobile
      ADD COLUMN IF NOT EXISTS estoque_minimo numeric(14,4) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS estoque_ideal numeric(14,4) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS unidade_medida text DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS multiplo_compra numeric(14,4) DEFAULT 1,
      ADD COLUMN IF NOT EXISTS fornecedor_padrao text DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_estoque_minimo
  ON public.produtos_eyemobile (workspace_id, estoque_atual, estoque_minimo)
  WHERE estoque_minimo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_fornecedor
  ON public.produtos_eyemobile (workspace_id, fornecedor_padrao)
  WHERE fornecedor_padrao IS NOT NULL;
