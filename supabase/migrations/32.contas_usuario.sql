-- Create contas_usuario table
CREATE TABLE public.contas_usuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('conta_corrente', 'poupanca', 'carteira', 'cartao_credito', 'outro')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.contas_usuario ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for contas_usuario
CREATE POLICY "Users can view their own contas" 
ON public.contas_usuario 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contas" 
ON public.contas_usuario 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contas" 
ON public.contas_usuario 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contas" 
ON public.contas_usuario 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_contas_usuario_user_id ON public.contas_usuario(user_id);
CREATE INDEX idx_contas_usuario_tipo ON public.contas_usuario(tipo);
