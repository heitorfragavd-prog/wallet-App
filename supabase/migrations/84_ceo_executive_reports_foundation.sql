-- ==============================================================================
-- Migration 84: Fundação Canônica dos Relatórios Executivos Diários (Wallet CEO)
-- Etapa 06 - Entrega A (Persistência, Idempotência, RLS Blindada e Allowlist Cron)
-- ==============================================================================

-- 1. Criação da tabela canônica de relatórios executivos
CREATE TABLE IF NOT EXISTS public.ceo_executive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_type TEXT NOT NULL DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  financial_indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  executive_summary TEXT NOT NULL,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('generating', 'completed', 'failed', 'fallback_deterministic')),
  sources_consulted JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_quality_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_model TEXT,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  dispatch_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ceo_exec_reports_unique_version UNIQUE (workspace_id, reference_date, period_type, version)
);

-- 2. Índices de alta performance para consulta do Dashboard Executivo
CREATE INDEX IF NOT EXISTS idx_ceo_exec_reports_workspace_date 
  ON public.ceo_executive_reports (workspace_id, reference_date DESC);

CREATE INDEX IF NOT EXISTS idx_ceo_exec_reports_owner_date 
  ON public.ceo_executive_reports (owner_id, reference_date DESC);

-- 3. Habilitação de Row Level Security (RLS) estrita
ALTER TABLE public.ceo_executive_reports ENABLE ROW LEVEL SECURITY;

-- Remove políticas anteriores se existirem
DROP POLICY IF EXISTS policy_ceo_exec_reports_select_owner_only ON public.ceo_executive_reports;
DROP POLICY IF EXISTS policy_ceo_exec_reports_write_owner ON public.ceo_executive_reports;

-- Política de Leitura: Exclusiva para o Proprietário do Workspace
-- Colaboradores comuns (membros, gerentes, sócios não-donos) recebem zero linhas
CREATE POLICY policy_ceo_exec_reports_select_owner_only
ON public.ceo_executive_reports
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = ceo_executive_reports.workspace_id
      AND w.user_id = auth.uid()
  )
);

-- Política de Escrita: Exclusiva para o Proprietário do Workspace
CREATE POLICY policy_ceo_exec_reports_write_owner
ON public.ceo_executive_reports
FOR ALL
TO authenticated
USING (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = ceo_executive_reports.workspace_id
      AND w.user_id = auth.uid()
  )
)
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = ceo_executive_reports.workspace_id
      AND w.user_id = auth.uid()
  )
);

-- Concessão de permissões controladas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ceo_executive_reports TO authenticated;
GRANT ALL ON public.ceo_executive_reports TO service_role;

-- 4. Atualização da allowlist da função despachante cron para incluir 'cron-relatorio-executivo'
CREATE OR REPLACE FUNCTION public.cron_dispatch_edge_function(
  p_job_name text,
  p_function_name text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_anon_key TEXT;
  v_auth_token TEXT;
  v_target_url TEXT;
  v_request_id BIGINT := NULL;
  v_has_pg_net BOOLEAN := false;
BEGIN
  -- 1. Validacao estrita contra ALLOWLIST pre-aprovada (Zero URLs arbitrarias)
  IF p_function_name NOT IN (
    'process-recurring-transactions',
    'processar-lembretes-manutencao',
    'cron-notificacoes',
    'atualizar-cotacoes',
    'cron-alertas-investimentos',
    'sefaz-sync',
    'eyemobile-sync',
    'telegram-reprocess-worker',
    'lembrete-precos',
    'notificar-lembretes',
    'telegram-notificador-cron',
    'cron-relatorio-executivo'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Edge Function "%" nao permitida no despachante cron.', p_function_name;
  END IF;

  -- 2. Resolucao segura de URL (Vault prioritario com fallback para GUC app.settings.supabase_url)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
      SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
  END;

  IF v_supabase_url IS NULL OR length(trim(v_supabase_url)) = 0 THEN
    v_supabase_url := NULLIF(trim(current_setting('app.settings.supabase_url', true)), '');
  END IF;

  IF v_supabase_url IS NULL OR length(trim(v_supabase_url)) = 0 THEN
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'unknown_cron'),
      p_function_name,
      'skipped_missing_guc',
      'Configuracao ausente: supabase_url nao definida no vault nem em app.settings'
    );
    RETURN NULL;
  END IF;

  -- 3. Resolucao da anon_key para transito no gateway Kong (apikey header)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
      SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets
      WHERE name = 'anon_key'
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_anon_key := NULL;
  END;

  IF v_anon_key IS NULL OR length(trim(v_anon_key)) = 0 THEN
    v_anon_key := COALESCE(
      NULLIF(trim(current_setting('app.settings.supabase_anon_key', true)), ''),
      NULLIF(trim(current_setting('app.settings.anon_key', true)), '')
    );
  END IF;

  -- 4. Resolucao do token de autorizacao privilegiada (cron_secret prioritario, fallback para service_role_key)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
      SELECT decrypted_secret INTO v_auth_token
      FROM vault.decrypted_secrets
      WHERE name = 'cron_secret'
      LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_auth_token := NULL;
  END;

  IF v_auth_token IS NULL OR length(trim(v_auth_token)) = 0 THEN
    v_auth_token := NULLIF(trim(current_setting('app.settings.cron_secret', true)), '');
  END IF;

  -- Fallback defensivo para service_role_key se cron_secret nao estiver configurado
  IF v_auth_token IS NULL OR length(trim(v_auth_token)) = 0 THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
        SELECT decrypted_secret INTO v_auth_token
        FROM vault.decrypted_secrets
        WHERE name IN ('service_role_key', 'supabase_service_role_key')
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_auth_token := NULL;
    END;
  END IF;

  IF v_auth_token IS NULL OR length(trim(v_auth_token)) = 0 THEN
    v_auth_token := COALESCE(
      NULLIF(trim(current_setting('app.settings.supabase_service_role_key', true)), ''),
      NULLIF(trim(current_setting('app.settings.service_role_key', true)), '')
    );
  END IF;

  IF v_auth_token IS NULL OR length(trim(v_auth_token)) = 0 THEN
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'unknown_cron'),
      p_function_name,
      'skipped_missing_guc',
      'Configuracao ausente: token de autorizacao (cron_secret/service_role_key) nao definido'
    );
    RETURN NULL;
  END IF;

  -- Se v_anon_key ainda estiver ausente, fallback seguro para v_auth_token
  IF v_anon_key IS NULL OR length(trim(v_anon_key)) = 0 THEN
    v_anon_key := v_auth_token;
  END IF;

  -- 5. Construcao estrita da URL de destino
  v_target_url := rtrim(v_supabase_url, '/') || '/functions/v1/' || p_function_name;

  -- 6. Disparo via pg_net com timeout de 120 segundos
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_pg_net;

  IF v_has_pg_net THEN
    BEGIN
      EXECUTE $exec$
        SELECT net.http_post(
          url := $1,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', $2,
            'Authorization', 'Bearer ' || $3,
            'x-cron-secret', $3
          ),
          body := $4,
          timeout_milliseconds := 120000
        )
      $exec$
      INTO v_request_id
      USING v_target_url, v_anon_key, v_auth_token, COALESCE(p_payload, '{}'::jsonb);

      INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
      VALUES (
        COALESCE(p_job_name, 'cron_job'),
        p_function_name,
        'dispatched',
        'Invocacao assincrona despachada via pg_net. Request ID: ' || COALESCE(v_request_id::TEXT, 'desconhecido')
      );

      RETURN v_request_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
      VALUES (
        COALESCE(p_job_name, 'cron_job'),
        p_function_name,
        'failed',
        'Excecao ao disparar pg_net: ' || SQLERRM
      );
      RETURN NULL;
    END;
  ELSE
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'cron_job'),
      p_function_name,
      'skipped_no_pg_net',
      'Extensao pg_net nao disponivel neste no PostgreSQL'
    );
    RETURN NULL;
  END IF;
END;
$function$;
