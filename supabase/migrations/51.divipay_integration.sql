-- Integração Divipay: configurações por usuário, transações e logs de webhook

-- 1. Tabela de configuração das credenciais Divipay por usuário
CREATE TABLE IF NOT EXISTS public.divipay_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  client_secret TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Tabela de transações Divipay (cash-in Pix e cash-out/saques)
CREATE TABLE IF NOT EXISTS public.divipay_transacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id TEXT UNIQUE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  fee DECIMAL(12,2),
  type TEXT NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELED')),
  description TEXT,
  pix_copy_paste TEXT,
  pix_qr_code TEXT,
  recipient_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Tabela de logs de webhook para auditoria e debug
CREATE TABLE IF NOT EXISTS public.divipay_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT,
  external_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Habilitar RLS
ALTER TABLE public.divipay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divipay_transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divipay_webhook_logs ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
CREATE POLICY "Usuários gerenciam sua própria config Divipay"
ON public.divipay_config
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários gerenciam suas próprias transações Divipay"
ON public.divipay_transacoes
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role bypassa RLS nativamente (insert/update nos logs via edge function);
-- usuários autenticados apenas leem seus próprios logs.
CREATE POLICY "Usuários leem seus próprios logs de webhook Divipay"
ON public.divipay_webhook_logs
FOR SELECT
USING (auth.uid() = user_id);

-- 6. Triggers de updated_at (reutiliza função existente do projeto)
CREATE TRIGGER update_divipay_config_updated_at
BEFORE UPDATE ON public.divipay_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_divipay_transacoes_updated_at
BEFORE UPDATE ON public.divipay_transacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_divipay_transacoes_user_status ON public.divipay_transacoes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_divipay_transacoes_external_id ON public.divipay_transacoes(external_id);
CREATE INDEX IF NOT EXISTS idx_divipay_webhook_logs_external_id ON public.divipay_webhook_logs(external_id);
CREATE INDEX IF NOT EXISTS idx_divipay_webhook_logs_created_at ON public.divipay_webhook_logs(created_at);
