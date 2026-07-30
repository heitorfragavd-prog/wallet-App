-- Migration 54: Tabela de Notificações In-App

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT false,
  link_redirecionamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Users can view their own notificacoes" 
ON public.notificacoes FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notificacoes" 
ON public.notificacoes FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notificacoes" 
ON public.notificacoes FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notificacoes" 
ON public.notificacoes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Trigger de updated_at
CREATE TRIGGER update_notificacoes_updated_at
BEFORE UPDATE ON public.notificacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índice para busca rápida de notificações não lidas por usuário
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida ON public.notificacoes(user_id, lida);
