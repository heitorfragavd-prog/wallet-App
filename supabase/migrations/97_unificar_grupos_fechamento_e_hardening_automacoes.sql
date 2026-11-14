-- =============================================================================
-- Migration 97: Unificação dos Grupos de Fechamento, Hardening de Idempotência
-- e Ciclo de Vida do Status de Envio das Automações Semanais (Missão 3C.1)
-- =============================================================================

BEGIN;

-- ─── 1. Expansão de escalas_automacoes_log com ciclo de vida e telemetria ──────

ALTER TABLE public.escalas_automacoes_log
  ADD COLUMN IF NOT EXISTS status_envio text NOT NULL DEFAULT 'preparada',
  ADD COLUMN IF NOT EXISTS telegram_message_id text,
  ADD COLUMN IF NOT EXISTS api_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS erro_detalhes text;

ALTER TABLE public.escalas_automacoes_log
  DROP CONSTRAINT IF EXISTS chk_escalas_automacoes_log_status_envio;

ALTER TABLE public.escalas_automacoes_log
  ADD CONSTRAINT chk_escalas_automacoes_log_status_envio
  CHECK (status_envio IN ('preparada', 'aguardando_envio', 'enviando', 'enviada', 'falha', 'cancelada', 'simulada'));

CREATE INDEX IF NOT EXISTS idx_escalas_automacoes_log_envio
  ON public.escalas_automacoes_log (workspace_id, status_envio, created_at DESC);

-- ─── 2. Consolidação Segura dos Grupos de Fechamento (Gate 2) ──────────────────
-- Identificador Canônico Real: 9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58 (chat_id: -1004384150943)
-- Identificador Legado a Arquivar: c2549804-45dc-43a6-940c-8138f66cb2e3 (chat_id: -5289531178)

-- 2A. Vincula todos os fechamentos de caixa existentes ao grupo canônico
UPDATE public.fechamentos_caixa
SET grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58'
WHERE chat_id = -1004384150943
  AND (grupo_id IS NULL OR grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3');

-- 2B. Se houver anexos ou propostas no grupo legado, migra para o canônico
UPDATE public.wallet_ai_message_attachments
SET grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58'
WHERE grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3';

UPDATE public.wallet_ai_action_proposals
SET grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58'
WHERE grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3';

-- 2C. Migra participantes legados que não estejam no grupo canônico
UPDATE public.grupo_participantes
SET grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58'
WHERE grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3'
  AND user_id NOT IN (
    SELECT user_id FROM public.grupo_participantes WHERE grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58'
  );

-- Remove registros duplicados remanescentes de participantes no grupo legado
DELETE FROM public.grupo_participantes
WHERE grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3';

-- 2D. Promove o grupo canônico para o nome oficial '🧾 Fechamento Rodo Point'
UPDATE public.telegram_grupos_config
SET
  nome_grupo = '🧾 Fechamento Rodo Point',
  ativo = true,
  descricao = 'Conferência diária de fechamento de caixa, recepção de fotos/valores e conciliação automática com o Eyemobile.',
  updated_at = now()
WHERE id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58';

-- 2E. Arquiva com segurança o registro legado (não destrutivo, sem exclusão física)
UPDATE public.telegram_grupos_config
SET
  ativo = false,
  nome_grupo = 'Fechamento Rodo Point (Legado Arquivado)',
  descricao = 'Registro legado arquivado e consolidado no grupo oficial 9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58',
  updated_at = now()
WHERE id = 'c2549804-45dc-43a6-940c-8138f66cb2e3';

-- 2F. Atualiza e arquiva conversas correspondentes na Central de Conversas
UPDATE public.wallet_ai_conversations
SET
  title = '🧾 Fechamento Rodo Point',
  is_archived = false,
  updated_at = now()
WHERE grupo_id = '9aa1fde0-f1ab-4534-a6e6-8c979dd1cc58';

UPDATE public.wallet_ai_conversations
SET
  title = 'Fechamento Rodo Point (Legado Arquivado)',
  is_archived = true,
  updated_at = now()
WHERE grupo_id = 'c2549804-45dc-43a6-940c-8138f66cb2e3';

-- ─── 3. Proteção contra Provisionamento Duplicado (Gate 2.5) ───────────────────
-- Impede categoricamente a existência de múltiplos grupos operacionais ativos do mesmo tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_grupos_config_ws_tipo_ativo
  ON public.telegram_grupos_config (workspace_id, tipo_grupo)
  WHERE ativo = true;

-- ─── 4. Atualização da Allowlist do Despachante Cron (Gate 5) ──────────────────

CREATE OR REPLACE FUNCTION public.cron_dispatch_edge_function(p_job_name text, p_function_name text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_anon_key TEXT;
  v_auth_token TEXT;
  v_target_url TEXT;
  v_request_id BIGINT := NULL;
  v_has_pg_net BOOLEAN := false;
BEGIN
  -- 1. Validacao estrita contra ALLOWLIST pre-aprovada
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
    'cron-relatorio-executivo',
    'cron-folguistas-escalas'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Edge Function "%" nao permitida no despachante cron.', p_function_name;
  END IF;

  -- 2. Resolucao de URL via Vault ou settings
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

  -- 3. Resolucao da anon_key
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

  -- 4. Resolucao do token de autorizacao (cron_secret / service_role_key)
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
      'Configuracao ausente: token de autorizacao nao definido'
    );
    RETURN NULL;
  END IF;

  IF v_anon_key IS NULL OR length(trim(v_anon_key)) = 0 THEN
    v_anon_key := v_auth_token;
  END IF;

  -- 5. Construcao da URL de destino
  v_target_url := rtrim(v_supabase_url, '/') || '/functions/v1/' || p_function_name;

  -- 6. Disparo assincrono via pg_net
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

-- ─── 5. Agendamentos no Servidor via pg_cron (Gate 5) ───────────────────────────
-- 12:00 UTC = 09:00 Brasilia (America/Sao_Paulo)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('folguistas-consulta-segunda', 'folguistas-confirmacao-sexta');
    
    PERFORM cron.schedule(
      'folguistas-consulta-segunda',
      '0 12 * * 1',
      $cron$SELECT public.cron_dispatch_edge_function('folguistas-consulta-segunda', 'cron-folguistas-escalas', '{"action": "consulta_segunda"}'::jsonb);$cron$
    );

    PERFORM cron.schedule(
      'folguistas-confirmacao-sexta',
      '0 12 * * 5',
      $cron$SELECT public.cron_dispatch_edge_function('folguistas-confirmacao-sexta', 'cron-folguistas-escalas', '{"action": "confirmacao_sexta"}'::jsonb);$cron$
    );
  END IF;
END $$;

COMMIT;
