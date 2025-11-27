-- Create tags table
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor VARCHAR(7) DEFAULT '#6366F1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, nome)
);

-- Create despesa_tags junction table
CREATE TABLE public.despesa_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  despesa_id UUID NOT NULL REFERENCES public.despesas(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(despesa_id, tag_id)
);

-- Create receita_tags junction table
CREATE TABLE public.receita_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receita_id UUID NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(receita_id, tag_id)
);

-- Enable Row Level Security
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesa_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receita_tags ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tags
CREATE POLICY "Users can view their own tags" 
ON public.tags 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tags" 
ON public.tags 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags" 
ON public.tags 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags" 
ON public.tags 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for despesa_tags
CREATE POLICY "Users can view their own despesa_tags" 
ON public.despesa_tags 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesa_tags.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own despesa_tags" 
ON public.despesa_tags 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesa_tags.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own despesa_tags" 
ON public.despesa_tags 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesa_tags.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

-- Create RLS policies for receita_tags
CREATE POLICY "Users can view their own receita_tags" 
ON public.receita_tags 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.receitas 
    WHERE receitas.id = receita_tags.receita_id 
    AND receitas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own receita_tags" 
ON public.receita_tags 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receitas 
    WHERE receitas.id = receita_tags.receita_id 
    AND receitas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own receita_tags" 
ON public.receita_tags 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.receitas 
    WHERE receitas.id = receita_tags.receita_id 
    AND receitas.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_tags_user_id ON public.tags(user_id);
CREATE INDEX idx_tags_nome ON public.tags(nome);
CREATE INDEX idx_despesa_tags_despesa_id ON public.despesa_tags(despesa_id);
CREATE INDEX idx_despesa_tags_tag_id ON public.despesa_tags(tag_id);
CREATE INDEX idx_receita_tags_receita_id ON public.receita_tags(receita_id);
CREATE INDEX idx_receita_tags_tag_id ON public.receita_tags(tag_id);
