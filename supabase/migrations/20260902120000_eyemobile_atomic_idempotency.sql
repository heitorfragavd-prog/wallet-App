-- Migration: 20260902120000_eyemobile_atomic_idempotency.sql
-- Objetivo: Adicionar coluna estruturada eyemobile_sale_id e indice UNIQUE (workspace_id, eyemobile_sale_id)
-- garantindo compatibilidade total com PostgREST onConflict e idempotencia atomica sob concorrencia.

-- 1. Adiciona coluna eyemobile_sale_id
ALTER TABLE public.transacoes
ADD COLUMN IF NOT EXISTS eyemobile_sale_id TEXT;

-- 2. Popula eyemobile_sale_id a partir dos dados legados preservando 100% dos registros
-- Em caso de historico anterior com mesmo sale_id (ex: julho), prioriza o registro com metodo_pagamento preenchido
WITH ranked_sales AS (
  SELECT 
    id,
    substring(observacoes FROM 'Venda:\s*#([0-9]+)') AS parsed_sale_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, substring(observacoes FROM 'Venda:\s*#([0-9]+)')
      ORDER BY 
        CASE WHEN metodo_pagamento IS NOT NULL THEN 1 ELSE 2 END,
        updated_at DESC,
        created_at DESC
    ) as rn
  FROM public.transacoes
  WHERE observacoes ~ 'Venda:\s*#[0-9]+'
)
UPDATE public.transacoes t
SET eyemobile_sale_id = r.parsed_sale_id
FROM ranked_sales r
WHERE t.id = r.id AND r.rn = 1 AND r.parsed_sale_id IS NOT NULL;

-- 3. Cria indice UNIQUE (workspace_id, eyemobile_sale_id)
-- Em PostgreSQL, valores NULL nao colidem entre si (NULL != NULL), permitindo multiplas transacoes manuais
-- e garantindo compatibilidade nativa com PostgREST upsert onConflict: 'workspace_id,eyemobile_sale_id'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transacoes_eyemobile_sale
  ON public.transacoes (workspace_id, eyemobile_sale_id);

-- 4. Indice auxiliar para busca rapida por eyemobile_sale_id
CREATE INDEX IF NOT EXISTS idx_transacoes_eyemobile_sale_id
  ON public.transacoes (eyemobile_sale_id)
  WHERE eyemobile_sale_id IS NOT NULL;
