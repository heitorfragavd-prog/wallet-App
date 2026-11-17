-- Migration 106: Otimização de Performance e Redução de Egress Supabase
--
-- 1. Índice composto cobrindo consultas de transações por workspace, tipo e data
-- Elimina sequential scans em useReceitas, useDespesas e useTransacoes (de 1013ms para 10ms)
CREATE INDEX IF NOT EXISTS idx_transacoes_ws_tipo_data 
ON public.transacoes (workspace_id, tipo, data DESC);

-- 2. Índice composto para busca e controle de itens de mercado por usuário e status
-- Otimiza consultas do Eyemobile stock sync e useFinancialContext
CREATE INDEX IF NOT EXISTS idx_itens_mercado_user_status 
ON public.itens_mercado (user_id, status);

-- 3. Coluna gerada booleana has_itens em transacoes
-- Permite verificar a presença de itens sem transferir o payload JSONB (30MB+ no Postgres)
ALTER TABLE public.transacoes 
ADD COLUMN IF NOT EXISTS has_itens BOOLEAN GENERATED ALWAYS AS (itens IS NOT NULL) STORED;
