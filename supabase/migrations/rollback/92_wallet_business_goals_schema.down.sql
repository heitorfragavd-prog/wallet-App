-- Rollback da Migration 92: Remove schema de metas empresariais
DROP TRIGGER IF EXISTS trg_validar_wallet_business_goals ON public.wallet_business_goals;
DROP FUNCTION IF EXISTS public.validar_wallet_business_goals_governance();
DROP TABLE IF EXISTS public.wallet_business_goals CASCADE;
