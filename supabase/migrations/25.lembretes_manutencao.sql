-- Criar tabela de lembretes de manutenção
-- Esta tabela gerencia lembretes automáticos para manutenções programadas
CREATE TABLE public.lembretes_manutencao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  manutencao_id UUID NOT NULL,
  tipo_manutencao VARCHAR(50) NOT NULL CHECK (tipo_manutencao IN ('plano', 'customizada')),
  data_prevista DATE NOT NULL,
  dias_antecedencia INTEGER NOT NULL DEFAULT 7,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'cancelado')),
  webhook_enviado_em TIMESTAMP WITH TIME ZONE,
  webhook_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.lembretes_manutencao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para lembretes_manutencao
CREATE POLICY "Users can view their own lembretes_manutencao" 
ON public.lembretes_manutencao 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lembretes_manutencao" 
ON public.lembretes_manutencao 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lembretes_manutencao" 
ON public.lembretes_manutencao 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lembretes_manutencao" 
ON public.lembretes_manutencao 
FOR DELETE 
USING (auth.uid() = user_id);

-- Criar índices para melhorar performance
CREATE INDEX idx_lembretes_manutencao_user_id ON public.lembretes_manutencao(user_id);
CREATE INDEX idx_lembretes_manutencao_veiculo_id ON public.lembretes_manutencao(veiculo_id);
CREATE INDEX idx_lembretes_manutencao_manutencao_id ON public.lembretes_manutencao(manutencao_id);
CREATE INDEX idx_lembretes_manutencao_status ON public.lembretes_manutencao(status);
CREATE INDEX idx_lembretes_manutencao_data_prevista ON public.lembretes_manutencao(data_prevista);
CREATE INDEX idx_lembretes_manutencao_tipo ON public.lembretes_manutencao(tipo_manutencao);

-- Índice composto para otimizar busca de lembretes pendentes
CREATE INDEX idx_lembretes_manutencao_pendentes ON public.lembretes_manutencao(status, data_prevista) 
WHERE status = 'pendente';

-- Trigger para updated_at
CREATE TRIGGER update_lembretes_manutencao_updated_at
  BEFORE UPDATE ON public.lembretes_manutencao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE public.lembretes_manutencao IS 'Lembretes automáticos para manutenções programadas, processados por job diário';
COMMENT ON COLUMN public.lembretes_manutencao.manutencao_id IS 'ID da manutenção (pode ser de planos_manutencao_veiculo ou manutencoes_customizadas)';
COMMENT ON COLUMN public.lembretes_manutencao.tipo_manutencao IS 'Tipo da manutenção: plano (baseada em tipo) ou customizada';
COMMENT ON COLUMN public.lembretes_manutencao.data_prevista IS 'Data prevista para realização da manutenção';
COMMENT ON COLUMN public.lembretes_manutencao.dias_antecedencia IS 'Quantos dias antes da data prevista o lembrete deve ser enviado';
COMMENT ON COLUMN public.lembretes_manutencao.status IS 'Status do lembrete: pendente, enviado ou cancelado';
COMMENT ON COLUMN public.lembretes_manutencao.webhook_enviado_em IS 'Timestamp de quando o webhook foi enviado';
COMMENT ON COLUMN public.lembretes_manutencao.webhook_response IS 'Resposta do webhook para debug';
