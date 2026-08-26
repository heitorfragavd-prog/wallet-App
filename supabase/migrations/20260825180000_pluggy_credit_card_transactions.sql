-- ─── ETAPA 3.10: SUPORTE A TRANSAÇÕES DETALHADAS DE CARTÃO PLUGGY ───
-- Novos campos para transações de cartão de crédito Open Finance.
-- Permite vincular transações a faturas (billId), rastrear status
-- (PENDING/POSTED) e informações de parcelamento.

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS status_transacao TEXT;

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS pluggy_bill_id TEXT;

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS parcela_numero INTEGER;

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS parcela_total INTEGER;

-- Índice para busca rápida de transações por billId
CREATE INDEX IF NOT EXISTS idx_transacoes_pluggy_bill_id
  ON public.transacoes(pluggy_bill_id)
  WHERE pluggy_bill_id IS NOT NULL;

-- Recriar unique index para permitir upsert (idempotente, DROP IF EXISTS seguro)
DROP INDEX IF EXISTS uq_transacoes_pluggy_transaction;
CREATE UNIQUE INDEX uq_transacoes_pluggy_transaction
  ON public.transacoes(workspace_id, pluggy_transaction_id)
  WHERE pluggy_transaction_id IS NOT NULL;
