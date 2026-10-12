-- Migration: SEC-003.1 Critical Security Remediation
-- Description:
--   Execução condicional e defensiva de segurança (PostgreSQL 15-17):
--   1. Se a view public.user_profile_complete existir:
--      - Ativa security_invoker = true
--      - Revoga privilégios de PUBLIC, anon e authenticated
--      - Concede SELECT exclusivamente para service_role
--   2. Se a RPC public.get_user_profile_by_phone existir:
--      - Define search_path seguro (public, pg_temp)
--      - Aplica guard clause contra IDOR/enumeração de perfis
--      - Revoga EXECUTE de PUBLIC, anon e authenticated
--      - Concede EXECUTE exclusivamente para service_role
--   3. Se os objetos NÃO existirem:
--      - Emite aviso informativo (RAISE NOTICE) e NÃO os cria,
--        evitando introdução de superfície de ataque ou código órfão.

-- ============================================================================
-- 1. Proteção Condicional da View public.user_profile_complete
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public' AND c.relname = 'user_profile_complete'
  ) THEN
    -- Ativa security_invoker para que as políticas RLS das tabelas base sejam respeitadas
    ALTER VIEW public.user_profile_complete SET (security_invoker = true);
    
    -- Revoga acessos diretos de usuários comuns e anônimos
    REVOKE ALL ON public.user_profile_complete FROM PUBLIC;
    REVOKE ALL ON public.user_profile_complete FROM anon;
    REVOKE ALL ON public.user_profile_complete FROM authenticated;
    
    -- Permite consulta apenas para service_role (tarefas administrativas internas)
    GRANT SELECT ON public.user_profile_complete TO service_role;
    
    RAISE NOTICE 'SEC-003.1: View public.user_profile_complete encontrada e blindada com sucesso.';
  ELSE
    RAISE NOTICE 'SEC-003.1: View public.user_profile_complete inexistente. Nenhuma ação necessária e objeto não criado.';
  END IF;
END $$;

-- ============================================================================
-- 2. Proteção Condicional da RPC public.get_user_profile_by_phone
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc p 
    JOIN pg_namespace n ON n.oid = p.pronamespace 
    WHERE n.nspname = 'public' AND p.proname = 'get_user_profile_by_phone'
  ) THEN
    -- Recria a função com search_path estrito, SECURITY DEFINER e guard clause contra IDOR
    CREATE OR REPLACE FUNCTION public.get_user_profile_by_phone(phone_number TEXT)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $func$
    DECLARE
      result JSONB;
      normalized_phone TEXT;
      user_data RECORD;
    BEGIN
      normalized_phone := regexp_replace(phone_number, '[^0-9]', '', 'g');
      
      SELECT * INTO user_data
      FROM public.user_profile_complete upc
      WHERE 
        regexp_replace(upc.telefone, '[^0-9]', '', 'g') = normalized_phone
        OR regexp_replace(upc.telefone, '[^0-9]', '', 'g') LIKE '%' || normalized_phone
        OR normalized_phone LIKE '%' || regexp_replace(upc.telefone, '[^0-9]', '', 'g')
      LIMIT 1;
      
      IF user_data IS NULL THEN
        RETURN NULL;
      END IF;
      
      -- Barreira contra IDOR e enumeração de dados de terceiros:
      -- Se chamada por usuário autenticado, só permite retornar o próprio perfil.
      IF coalesce(auth.role(), '') = 'authenticated' AND (user_data.user_id IS DISTINCT FROM auth.uid()) THEN
        RETURN NULL;
      END IF;
      
      result := jsonb_build_object(
        'user', jsonb_build_object(
          'id', user_data.id,
          'user_id', user_data.user_id,
          'name', user_data.name,
          'email', user_data.email,
          'telefone', user_data.telefone,
          'organization_name', user_data.organization_name,
          'role', user_data.role,
          'avatar_url', user_data.avatar_url,
          'created_at', user_data.created_at
        ),
        'subscription', jsonb_build_object(
          'id', user_data.subscription_id,
          'status', user_data.subscription_status,
          'expires_at', user_data.subscription_expires_at,
          'created_at', user_data.subscription_created_at,
          'expired', user_data.subscription_expired,
          'days_until_expiration', user_data.days_until_expiration
        ),
        'plan', jsonb_build_object(
          'id', user_data.plan_id,
          'name', COALESCE(user_data.plan_name, 'Gratuito'),
          'price', COALESCE(user_data.plan_price, 0),
          'features', user_data.plan_features
        ),
        'limits', jsonb_build_object(
          'transactions', user_data.limit_transactions,
          'categories', user_data.limit_categories,
          'ai_analysis', user_data.limit_ai_analysis,
          'file_uploads', user_data.limit_file_uploads,
          'vehicles', user_data.limit_vehicles,
          'goals', user_data.limit_goals,
          'market_items', user_data.limit_market_items
        ),
        'usage', jsonb_build_object(
          'transactions', user_data.usage_transactions,
          'categories', user_data.usage_categories,
          'ai_analysis', user_data.usage_ai_analysis,
          'file_uploads', user_data.usage_file_uploads,
          'vehicles', user_data.usage_vehicles,
          'goals', user_data.usage_goals,
          'market_items', user_data.usage_market_items
        ),
        'limits_reached', jsonb_build_object(
          'transactions', user_data.usage_transactions >= COALESCE(user_data.limit_transactions, 999999),
          'categories', user_data.usage_categories >= COALESCE(user_data.limit_categories, 999999),
          'ai_analysis', user_data.usage_ai_analysis >= COALESCE(user_data.limit_ai_analysis, 999999),
          'file_uploads', user_data.usage_file_uploads >= COALESCE(user_data.limit_file_uploads, 999999),
          'vehicles', user_data.usage_vehicles >= COALESCE(user_data.limit_vehicles, 999999),
          'goals', user_data.usage_goals >= COALESCE(user_data.limit_goals, 999999),
          'market_items', user_data.usage_market_items >= COALESCE(user_data.limit_market_items, 999999)
        ),
        'financial_summary', jsonb_build_object(
          'receitas_mes', user_data.total_receitas_mes,
          'despesas_mes', user_data.total_despesas_mes,
          'dividas_pendentes', user_data.total_dividas_pendentes,
          'saldo_mes', user_data.total_receitas_mes - user_data.total_despesas_mes
        )
      );
      
      RETURN result;
    END;
    $func$;
    
    -- Restringe execução exclusivamente para service_role
    REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM anon;
    REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.get_user_profile_by_phone(TEXT) TO service_role;
    
    RAISE NOTICE 'SEC-003.1: RPC public.get_user_profile_by_phone encontrada e blindada com sucesso.';
  ELSE
    RAISE NOTICE 'SEC-003.1: RPC public.get_user_profile_by_phone inexistente. Nenhuma ação necessária e objeto não criado.';
  END IF;
END $$;
