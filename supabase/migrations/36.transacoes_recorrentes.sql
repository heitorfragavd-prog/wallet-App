-- Create transacoes_recorrentes table
CREATE TABLE public.transacoes_recorrentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_transacao VARCHAR(10) NOT NULL CHECK (tipo_transacao IN ('receita', 'despesa')),
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL CHECK (valor > 0),
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  metodo_pagamento VARCHAR(20) CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia')),
  conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
  recorrencia VARCHAR(10) NOT NULL CHECK (recorrencia IN ('diaria', 'semanal', 'mensal', 'anual')),
  dia_execucao INTEGER CHECK (dia_execucao >= 1 AND dia_execucao <= 31),
  dia_semana INTEGER CHECK (dia_semana >= 0 AND dia_semana <= 6),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_execucao DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.transacoes_recorrentes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for transacoes_recorrentes
CREATE POLICY "Users can view their own transacoes_recorrentes" 
ON public.transacoes_recorrentes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transacoes_recorrentes" 
ON public.transacoes_recorrentes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transacoes_recorrentes" 
ON public.transacoes_recorrentes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transacoes_recorrentes" 
ON public.transacoes_recorrentes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_transacoes_recorrentes_updated_at
BEFORE UPDATE ON public.transacoes_recorrentes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_transacoes_recorrentes_user_id ON public.transacoes_recorrentes(user_id);
CREATE INDEX idx_transacoes_recorrentes_tipo ON public.transacoes_recorrentes(tipo_transacao);
CREATE INDEX idx_transacoes_recorrentes_ativo ON public.transacoes_recorrentes(ativo);
CREATE INDEX idx_transacoes_recorrentes_data_inicio ON public.transacoes_recorrentes(data_inicio);
CREATE INDEX idx_transacoes_recorrentes_data_fim ON public.transacoes_recorrentes(data_fim);
CREATE INDEX idx_transacoes_recorrentes_recorrencia ON public.transacoes_recorrentes(recorrencia);
