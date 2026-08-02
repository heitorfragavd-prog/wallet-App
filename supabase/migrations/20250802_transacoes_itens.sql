-- Cache local dos itens de cada venda Eyemobile (transaction_items).
-- Sem isso o dashboard rápido (fallback local) não consegue montar o
-- Top 10 de produtos: os itens só existem na API, não nas transações.
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS itens jsonb;
NOTIFY pgrst, 'reload schema';
