-- =============================================================================
-- Rollback Migration 116: Remoção da Tabela de Referências de Custos de Orçamentos
-- =============================================================================

DROP TABLE IF EXISTS public.referencias_custo_orcamento CASCADE;
