-- BACKUP DE SEGURANCA - DEFINICAO PRE-PATCH DO DISPATCHER
-- DATA: 2026-10-23
-- PROJETO: hdeguzxkdvebdrrutbnx

CREATE OR REPLACE FUNCTION public.cron_dispatch_edge_function(p_job_name text, p_function_name text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
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
    'telegram-notificador-cron'
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

  -- 3. Resolucao segura e resiliente da service role key (multiplas fontes, missing_ok = true)
  v_service_role_key := COALESCE(
    NULLIF(trim(current_setting('app.settings.supabase_service_role_key', true)), ''),
    NULLIF(trim(current_setting('app.settings.service_role_key', true)), '')
  );

  -- Fallback defensivo para Supabase Vault se as GUCs nao estiverem definidas
  IF (v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0) THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
        SELECT decrypted_secret INTO v_service_role_key
        FROM vault.decrypted_secrets
        WHERE name IN ('service_role_key', 'supabase_service_role_key')
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_service_role_key := NULL;
    END;
  END IF;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    INSERT INTO public.cron_execution_logs (job_name, function_name, status, message)
    VALUES (
      COALESCE(p_job_name, 'unknown_cron'),
      p_function_name,
      'skipped_missing_guc',
      'Configuracao ausente: service role key nao definida em app.settings nem no vault'
    );
    RETURN NULL;
  END IF;

  -- 4. Construcao estrita da URL de destino
  v_target_url := rtrim(v_supabase_url, '/') || '/functions/v1/' || p_function_name;

  -- 5. Disparo via pg_net (se disponivel)
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_pg_net;

  IF v_has_pg_net THEN
    BEGIN
      -- Chamada dinamica via SQL nativo para evitar erro de compilacao em instancias sem pg_net
      EXECUTE $exec$
        SELECT net.http_post(
          url := $1,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || $2
          ),
          body := $3
        )
      $exec$
      INTO v_request_id
      USING v_target_url, v_service_role_key, COALESCE(p_payload, '{}'::jsonb);

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
