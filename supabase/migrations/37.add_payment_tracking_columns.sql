-- Add new columns to despesas table
ALTER TABLE public.despesas 
  ADD COLUMN metodo_pagamento VARCHAR(20) CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia')),
  ADD COLUMN conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
  ADD COLUMN observacoes TEXT CHECK (char_length(observacoes) <= 500),
  ADD COLUMN recorrencia_id UUID REFERENCES public.transacoes_recorrentes(id) ON DELETE SET NULL;

-- Add new columns to receitas table
ALTER TABLE public.receitas 
  ADD COLUMN metodo_pagamento VARCHAR(20) CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia')),
  ADD COLUMN conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
  ADD COLUMN observacoes TEXT CHECK (char_length(observacoes) <= 500),
  ADD COLUMN recorrencia_id UUID REFERENCES public.transacoes_recorrentes(id) ON DELETE SET NULL;

-- Add new columns to transacoes table
ALTER TABLE public.transacoes 
  ADD COLUMN metodo_pagamento VARCHAR(20) CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia')),
  ADD COLUMN conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
  ADD COLUMN observacoes TEXT CHECK (char_length(observacoes) <= 500);

-- Create indexes for new columns on despesas
CREATE INDEX idx_despesas_metodo_pagamento ON public.despesas(metodo_pagamento);
CREATE INDEX idx_despesas_conta_id ON public.despesas(conta_id);
CREATE INDEX idx_despesas_recorrencia_id ON public.despesas(recorrencia_id);

-- Create indexes for new columns on receitas
CREATE INDEX idx_receitas_metodo_pagamento ON public.receitas(metodo_pagamento);
CREATE INDEX idx_receitas_conta_id ON public.receitas(conta_id);
CREATE INDEX idx_receitas_recorrencia_id ON public.receitas(recorrencia_id);

-- Create indexes for new columns on transacoes
CREATE INDEX idx_transacoes_metodo_pagamento ON public.transacoes(metodo_pagamento);
CREATE INDEX idx_transacoes_conta_id ON public.transacoes(conta_id);
