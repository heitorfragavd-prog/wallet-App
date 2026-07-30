-- Migration 52: Schema para Multi-Carteira / Workspaces (PF vs PJ)

-- 1. Criar tabela de workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('PF', 'PJ')) DEFAULT 'PF',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- RLS Policies para workspaces
CREATE POLICY "Users can view their own workspaces" 
ON public.workspaces FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workspaces" 
ON public.workspaces FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workspaces" 
ON public.workspaces FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workspaces" 
ON public.workspaces FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger para updated_at em workspaces
CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Adicionar coluna workspace_id nas tabelas principais
ALTER TABLE public.transacoes 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.receitas 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.despesas 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.dividas 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.itens_mercado 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- 3. Função para garantir que novos usuários possuam workspaces padrão (PF e PJ)
CREATE OR REPLACE FUNCTION public.ensure_user_default_workspaces()
RETURNS TRIGGER AS $$
BEGIN
  -- Criar workspace Pessoal (PF)
  INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
  VALUES (NEW.id, 'Minha Conta Pessoal', 'PF', true)
  ON CONFLICT DO NOTHING;

  -- Criar workspace Comercial (PJ - Rodo Point)
  INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
  VALUES (NEW.id, 'Conta Rodo Point', 'PJ', false)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Migração retroativa de dados existentes
DO $$
DECLARE
  r RECORD;
  pf_ws_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM (
    SELECT user_id FROM public.transacoes
    UNION SELECT user_id FROM public.receitas
    UNION SELECT user_id FROM public.despesas
    UNION SELECT user_id FROM public.dividas
    UNION SELECT user_id FROM public.veiculos
    UNION SELECT user_id FROM public.itens_mercado
    UNION SELECT id AS user_id FROM auth.users
  ) u LOOP
    -- Verificar ou criar workspace PF padrão para o usuário
    SELECT id INTO pf_ws_id FROM public.workspaces WHERE user_id = r.user_id AND tipo = 'PF' LIMIT 1;
    
    IF pf_ws_id IS NULL THEN
      INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
      VALUES (r.user_id, 'Minha Conta Pessoal', 'PF', true)
      RETURNING id INTO pf_ws_id;
    END IF;

    -- Criar também workspace PJ Rodo Point se não existir
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = r.user_id AND tipo = 'PJ') THEN
      INSERT INTO public.workspaces (user_id, nome, tipo, is_default)
      VALUES (r.user_id, 'Conta Rodo Point', 'PJ', false);
    END IF;

    -- Atualizar tabelas com o workspace_id padrão
    UPDATE public.transacoes SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.receitas SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.despesas SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.dividas SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.veiculos SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
    UPDATE public.itens_mercado SET workspace_id = pf_ws_id WHERE user_id = r.user_id AND workspace_id IS NULL;
  END LOOP;
END $$;

-- 5. Criar índices para otimização de performance
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON public.workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_tipo ON public.workspaces(tipo);
CREATE INDEX IF NOT EXISTS idx_transacoes_workspace_id ON public.transacoes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_receitas_workspace_id ON public.receitas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_despesas_workspace_id ON public.despesas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dividas_workspace_id ON public.dividas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_workspace_id ON public.veiculos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_itens_mercado_workspace_id ON public.itens_mercado(workspace_id);
