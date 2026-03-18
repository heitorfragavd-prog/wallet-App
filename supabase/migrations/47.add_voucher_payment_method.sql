-- Add 'voucher' to metodo_pagamento CHECK constraint on despesas, receitas, transacoes
-- The frontend already supports 'voucher' but the DB constraint was missing it.

-- despesas
ALTER TABLE public.despesas DROP CONSTRAINT IF EXISTS despesas_metodo_pagamento_check;
ALTER TABLE public.despesas ADD CONSTRAINT despesas_metodo_pagamento_check
  CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia', 'voucher'));

-- receitas
ALTER TABLE public.receitas DROP CONSTRAINT IF EXISTS receitas_metodo_pagamento_check;
ALTER TABLE public.receitas ADD CONSTRAINT receitas_metodo_pagamento_check
  CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia', 'voucher'));

-- transacoes
ALTER TABLE public.transacoes DROP CONSTRAINT IF EXISTS transacoes_metodo_pagamento_check;
ALTER TABLE public.transacoes ADD CONSTRAINT transacoes_metodo_pagamento_check
  CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia', 'voucher'));
