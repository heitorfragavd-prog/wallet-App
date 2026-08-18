BEGIN;

-- Contas precisam de escopo explícito para consultas financeiras por workspace.
ALTER TABLE public.contas_usuario
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE RESTRICT;

UPDATE public.contas_usuario AS conta
SET workspace_id = (
  SELECT workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.user_id = conta.user_id
  ORDER BY workspace.is_default DESC, workspace.created_at ASC
  LIMIT 1
)
WHERE conta.workspace_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contas_usuario WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'wallet_ai_phase1: contas_usuario sem workspace válido';
  END IF;
END $$;

ALTER TABLE public.contas_usuario
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_usuario_workspace_user
  ON public.contas_usuario(workspace_id, user_id);

-- Chave canônica usada para impedir dupla contagem entre fontes espelhadas.
ALTER TABLE public.receitas
  ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
UPDATE public.receitas
SET deduplication_key = 'receita:' || id::TEXT
WHERE deduplication_key IS NULL;
ALTER TABLE public.receitas
  ALTER COLUMN deduplication_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_receitas_wallet_ai_dedup
  ON public.receitas(workspace_id, deduplication_key)
  WHERE workspace_id IS NOT NULL;

ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
UPDATE public.despesas
SET deduplication_key = 'despesa:' || id::TEXT
WHERE deduplication_key IS NULL;
ALTER TABLE public.despesas
  ALTER COLUMN deduplication_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_wallet_ai_dedup
  ON public.despesas(workspace_id, deduplication_key)
  WHERE workspace_id IS NOT NULL;

ALTER TABLE public.transacoes
  ADD COLUMN IF NOT EXISTS deduplication_key TEXT;
UPDATE public.transacoes
SET deduplication_key = 'transacao:' || id::TEXT
WHERE deduplication_key IS NULL;
ALTER TABLE public.transacoes
  ALTER COLUMN deduplication_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transacoes_wallet_ai_dedup
  ON public.transacoes(workspace_id, deduplication_key)
  WHERE workspace_id IS NOT NULL;

-- Metadados mínimos de auditoria, sem conteúdo sensível da requisição.
CREATE TABLE public.wallet_ai_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  tool_name TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('success', 'error')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_ai_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_ai_audit_events FROM PUBLIC;
REVOKE ALL ON public.wallet_ai_audit_events FROM anon;
REVOKE ALL ON public.wallet_ai_audit_events FROM authenticated;

CREATE INDEX idx_wallet_ai_audit_workspace_created
  ON public.wallet_ai_audit_events(workspace_id, created_at DESC);
CREATE INDEX idx_wallet_ai_audit_user_created
  ON public.wallet_ai_audit_events(user_id, created_at DESC);

COMMIT;
