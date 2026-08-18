BEGIN;

DROP TABLE IF EXISTS public.wallet_ai_audit_events;

DROP INDEX IF EXISTS public.idx_transacoes_wallet_ai_dedup;
ALTER TABLE public.transacoes DROP COLUMN IF EXISTS deduplication_key;

DROP INDEX IF EXISTS public.idx_despesas_wallet_ai_dedup;
ALTER TABLE public.despesas DROP COLUMN IF EXISTS deduplication_key;

DROP INDEX IF EXISTS public.idx_receitas_wallet_ai_dedup;
ALTER TABLE public.receitas DROP COLUMN IF EXISTS deduplication_key;

DROP INDEX IF EXISTS public.idx_contas_usuario_workspace_user;
ALTER TABLE public.contas_usuario DROP COLUMN IF EXISTS workspace_id;

COMMIT;
