CREATE TABLE IF NOT EXISTS telegram_propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  dados JSONB NOT NULL,
  resumo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_propostas_user_id ON telegram_propostas(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_propostas_chat_id ON telegram_propostas(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_propostas_status ON telegram_propostas(status);

CREATE TABLE IF NOT EXISTS telegram_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'livre',
  proposta_id UUID REFERENCES telegram_propostas(id) ON DELETE SET NULL,
  dados_documento JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_conversas_chat_id ON telegram_conversas(chat_id);
