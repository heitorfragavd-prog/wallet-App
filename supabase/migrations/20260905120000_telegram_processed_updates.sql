-- Migration: 20260905120000_telegram_processed_updates.sql
-- Descrição: Tabela para idempotência distribuída de webhooks do Telegram (anti-replay multi-instância Edge)

CREATE TABLE IF NOT EXISTS public.telegram_processed_updates (
    update_id BIGINT NOT NULL,
    bot_id TEXT NOT NULL DEFAULT 'default',
    chat_id BIGINT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '48 hours'),
    CONSTRAINT pk_telegram_processed_updates PRIMARY KEY (bot_id, update_id)
);

-- Índice para varredura e limpeza eficiente de registros expirados (TTL de 48 horas)
CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_expires_at
    ON public.telegram_processed_updates (expires_at);

-- RLS: Tabela de infraestrutura backend estritamente service_role (Edge Functions)
ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;

-- Garantir isolamento estrito: revogar todo acesso de roles públicas e autenticadas do PostgREST
REVOKE ALL ON TABLE public.telegram_processed_updates FROM anon, authenticated;
GRANT ALL ON TABLE public.telegram_processed_updates TO service_role;

COMMENT ON TABLE public.telegram_processed_updates IS
    'Armazena update_ids processados pelo Telegram webhook para garantir idempotência distribuída multi-instância. Limpeza via delete oportunístico ou rotina de retenção.';
