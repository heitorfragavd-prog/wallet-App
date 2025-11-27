-- Criar tabela de webhooks de manutenção (Admin)
-- Esta tabela gerencia configurações de webhooks para envio de lembretes de manutenção
CREATE TABLE public.webhooks_manutencao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  dias_antecedencia_padrao INTEGER NOT NULL DEFAULT 7,
  retry_attempts INTEGER NOT NULL DEFAULT 3,
  retry_delay_seconds INTEGER NOT NULL DEFAULT 300,
  auth_header TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.webhooks_manutencao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para webhooks_manutencao (apenas admins)
-- Admins podem visualizar todos os webhooks
CREATE POLICY "Admins can view all webhooks_manutencao" 
ON public.webhooks_manutencao 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Admins podem criar webhooks
CREATE POLICY "Admins can create webhooks_manutencao" 
ON public.webhooks_manutencao 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Admins podem atualizar webhooks
CREATE POLICY "Admins can update webhooks_manutencao" 
ON public.webhooks_manutencao 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Admins podem deletar webhooks
CREATE POLICY "Admins can delete webhooks_manutencao" 
ON public.webhooks_manutencao 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Criar índices para melhorar performance
CREATE INDEX idx_webhooks_manutencao_ativo ON public.webhooks_manutencao(ativo);

-- Trigger para updated_at
CREATE TRIGGER update_webhooks_manutencao_updated_at
  BEFORE UPDATE ON public.webhooks_manutencao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE public.webhooks_manutencao IS 'Configurações de webhooks para envio de lembretes de manutenção (apenas admins)';
COMMENT ON COLUMN public.webhooks_manutencao.nome IS 'Nome descritivo do webhook';
COMMENT ON COLUMN public.webhooks_manutencao.url IS 'URL de destino para envio do webhook';
COMMENT ON COLUMN public.webhooks_manutencao.ativo IS 'Indica se o webhook está ativo';
COMMENT ON COLUMN public.webhooks_manutencao.dias_antecedencia_padrao IS 'Dias de antecedência padrão para envio de lembretes';
COMMENT ON COLUMN public.webhooks_manutencao.retry_attempts IS 'Número de tentativas em caso de falha';
COMMENT ON COLUMN public.webhooks_manutencao.retry_delay_seconds IS 'Delay em segundos entre tentativas';
COMMENT ON COLUMN public.webhooks_manutencao.auth_header IS 'Header de autenticação opcional (ex: Bearer token)';
