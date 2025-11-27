-- Criar tabela de logs de webhooks de manutenção
-- Esta tabela registra todas as tentativas de envio de webhooks para auditoria e debug
CREATE TABLE public.logs_webhooks_manutencao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks_manutencao(id) ON DELETE CASCADE,
  lembrete_id UUID NOT NULL REFERENCES public.lembretes_manutencao(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response TEXT,
  erro TEXT,
  tentativa INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.logs_webhooks_manutencao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para logs_webhooks_manutencao (apenas admins)
-- Admins podem visualizar todos os logs
CREATE POLICY "Admins can view all logs_webhooks_manutencao" 
ON public.logs_webhooks_manutencao 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Admins podem criar logs (geralmente feito pela edge function)
CREATE POLICY "Admins can create logs_webhooks_manutencao" 
ON public.logs_webhooks_manutencao 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Admins podem deletar logs antigos
CREATE POLICY "Admins can delete logs_webhooks_manutencao" 
ON public.logs_webhooks_manutencao 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Criar índices para melhorar performance
CREATE INDEX idx_logs_webhooks_manutencao_webhook_id ON public.logs_webhooks_manutencao(webhook_id);
CREATE INDEX idx_logs_webhooks_manutencao_lembrete_id ON public.logs_webhooks_manutencao(lembrete_id);
CREATE INDEX idx_logs_webhooks_manutencao_created_at ON public.logs_webhooks_manutencao(created_at DESC);
CREATE INDEX idx_logs_webhooks_manutencao_status_code ON public.logs_webhooks_manutencao(status_code);

-- Índice composto para buscar logs de um webhook específico ordenados por data
CREATE INDEX idx_logs_webhooks_manutencao_webhook_date ON public.logs_webhooks_manutencao(webhook_id, created_at DESC);

-- Comentários para documentação
COMMENT ON TABLE public.logs_webhooks_manutencao IS 'Logs de todas as tentativas de envio de webhooks de manutenção para auditoria e debug';
COMMENT ON COLUMN public.logs_webhooks_manutencao.webhook_id IS 'ID do webhook que foi enviado';
COMMENT ON COLUMN public.logs_webhooks_manutencao.lembrete_id IS 'ID do lembrete que gerou o webhook';
COMMENT ON COLUMN public.logs_webhooks_manutencao.payload IS 'Payload JSON enviado no webhook';
COMMENT ON COLUMN public.logs_webhooks_manutencao.status_code IS 'Código HTTP de resposta';
COMMENT ON COLUMN public.logs_webhooks_manutencao.response IS 'Resposta do servidor de destino';
COMMENT ON COLUMN public.logs_webhooks_manutencao.erro IS 'Mensagem de erro em caso de falha';
COMMENT ON COLUMN public.logs_webhooks_manutencao.tentativa IS 'Número da tentativa (1, 2, 3, etc)';
