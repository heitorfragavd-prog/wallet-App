-- Criar tabela de planos de manutenção por veículo
-- Esta tabela permite que cada veículo tenha seu próprio plano de manutenção personalizado
CREATE TABLE public.planos_manutencao_veiculo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  tipo_manutencao_id UUID NOT NULL REFERENCES public.tipos_manutencao(id) ON DELETE CASCADE,
  intervalo_km INTEGER NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_veiculo_tipo_manutencao UNIQUE(veiculo_id, tipo_manutencao_id)
);

-- Habilitar RLS
ALTER TABLE public.planos_manutencao_veiculo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para planos_manutencao_veiculo
CREATE POLICY "Users can view their own planos_manutencao_veiculo" 
ON public.planos_manutencao_veiculo 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own planos_manutencao_veiculo" 
ON public.planos_manutencao_veiculo 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own planos_manutencao_veiculo" 
ON public.planos_manutencao_veiculo 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own planos_manutencao_veiculo" 
ON public.planos_manutencao_veiculo 
FOR DELETE 
USING (auth.uid() = user_id);

-- Criar índices para melhorar performance
CREATE INDEX idx_planos_manutencao_veiculo_user_id ON public.planos_manutencao_veiculo(user_id);
CREATE INDEX idx_planos_manutencao_veiculo_veiculo_id ON public.planos_manutencao_veiculo(veiculo_id);
CREATE INDEX idx_planos_manutencao_veiculo_tipo_manutencao_id ON public.planos_manutencao_veiculo(tipo_manutencao_id);
CREATE INDEX idx_planos_manutencao_veiculo_ativo ON public.planos_manutencao_veiculo(ativo);

-- Trigger para updated_at
CREATE TRIGGER update_planos_manutencao_veiculo_updated_at
  BEFORE UPDATE ON public.planos_manutencao_veiculo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE public.planos_manutencao_veiculo IS 'Planos de manutenção personalizados por veículo, permitindo que cada veículo tenha seu próprio conjunto de manutenções baseadas em tipos existentes';
COMMENT ON COLUMN public.planos_manutencao_veiculo.intervalo_km IS 'Intervalo personalizado em quilômetros para este veículo específico';
COMMENT ON COLUMN public.planos_manutencao_veiculo.ativo IS 'Indica se este plano de manutenção está ativo para o veículo';
