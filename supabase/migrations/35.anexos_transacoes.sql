-- Create anexos_transacoes table
CREATE TABLE public.anexos_transacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transacao_tipo VARCHAR(10) NOT NULL CHECK (transacao_tipo IN ('receita', 'despesa', 'divida')),
  transacao_id UUID NOT NULL,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tipo_arquivo VARCHAR(50) NOT NULL,
  tamanho INTEGER NOT NULL CHECK (tamanho > 0 AND tamanho <= 5242880), -- max 5MB
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.anexos_transacoes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for anexos_transacoes
CREATE POLICY "Users can view their own anexos" 
ON public.anexos_transacoes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own anexos" 
ON public.anexos_transacoes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own anexos" 
ON public.anexos_transacoes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_anexos_transacoes_user_id ON public.anexos_transacoes(user_id);
CREATE INDEX idx_anexos_transacoes_transacao ON public.anexos_transacoes(transacao_tipo, transacao_id);
CREATE INDEX idx_anexos_transacoes_tipo_arquivo ON public.anexos_transacoes(tipo_arquivo);
