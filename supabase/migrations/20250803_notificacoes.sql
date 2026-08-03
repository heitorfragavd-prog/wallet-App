-- ═══════════════════════════════════════════════════════════════
-- Notificações Push + Telegram (03/ago/2026)
-- Alertas de dívidas e compromissos no celular sem app nativo
-- ═══════════════════════════════════════════════════════════════

-- 1. Subscriptions de Web Push do navegador ─────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint_unique ON push_subscriptions(endpoint);

-- 2. Log de notificações enviadas (push e telegram) ─────────────
CREATE TABLE IF NOT EXISTS notificacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('push', 'telegram')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  enviado boolean DEFAULT false,
  erro text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notificacoes_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON notificacoes_log
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_user ON notificacoes_log(user_id);

-- 3. Vínculo usuário ↔ Telegram ─────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios_telegram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE usuarios_telegram ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own telegram" ON usuarios_telegram
  FOR ALL USING (auth.uid() = user_id);

-- 4. Tokens de vínculo Telegram (gerados pelo /start do bot) ────
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token text PRIMARY KEY,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  usado boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
-- Sem policy de leitura pública: vínculo acontece só via Edge Function
-- (service role), que valida o token e grava em usuarios_telegram.
