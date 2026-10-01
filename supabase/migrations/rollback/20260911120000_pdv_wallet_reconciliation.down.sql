-- Rollback da Migration: 20260911120000_pdv_wallet_reconciliation.sql

DROP FUNCTION IF EXISTS public.reconcile_pdv_transaction(TEXT, UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, JSONB);
DROP TABLE IF EXISTS public.pdv_conciliacoes CASCADE;
