-- Criar tabela de manutenções customizadas
-- Esta tabela permite que usuários criem manutenções personalizadas não baseadas em tipos existentes
CREATE TABLE public.manutencoes_customizadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  sistema VARCHAR(100),
  intervalo_km INTEGER,
  data_prevista DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.manutencoes_customizadas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para manutencoes_customizadas
CREATE POLICY "Users can view their own manutencoes_customizadas" 
ON public.manutencoes_customizadas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own manutencoes_customizadas" 
ON public.manutencoes_customizadas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own manutencoes_customizadas" 
ON public.manutencoes_customizadas 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own manutencoes_customizadas" 
ON public.manutencoes_customizadas 
FOR DELETE 
USING (auth.uid() = user_id);

-- Criar índices para melhorar performance
CREATE INDEX idx_manutencoes_customizadas_user_id ON public.manutencoes_customizadas(user_id);
CREATE INDEX idx_manutencoes_customizadas_veiculo_id ON public.manutencoes_customizadas(veiculo_id);
CREATE INDEX idx_manutencoes_customizadas_ativo ON public.manutencoes_customizadas(ativo);
CREATE INDEX idx_manutencoes_customizadas_data_prevista ON public.manutencoes_customizadas(data_prevista);

-- Trigger para updated_at
CREATE TRIGGER update_manutencoes_customizadas_updated_at
  BEFORE UPDATE ON public.manutencoes_customizadas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE public.manutencoes_customizadas IS 'Manutenções personalizadas criadas pelo usuário, não baseadas em tipos pré-definidos';
COMMENT ON COLUMN public.manutencoes_customizadas.nome IS 'Nome da manutenção customizada';
COMMENT ON COLUMN public.manutencoes_customizadas.sistema IS 'Sistema do veículo (Motor, Freios, Suspensão, etc)';
COMMENT ON COLUMN public.manutencoes_customizadas.intervalo_km IS 'Intervalo em quilômetros para esta manutenção (opcional)';
COMMENT ON COLUMN public.manutencoes_customizadas.data_prevista IS 'Data prevista para realização da manutenção (opcional)';
COMMENT ON COLUMN public.manutencoes_customizadas.ativo IS 'Indica se esta manutenção customizada está ativa';
