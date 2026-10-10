-- Migration: SEC-003.1 Critical Security Remediation
-- Description:
--   1. Harden public.user_profile_complete view:
--      - Enable security_invoker = true so underlying RLS policies are enforced.
--      - Revoke SELECT privileges from PUBLIC, anon, and authenticated.
--      - Grant SELECT only to service_role.
--   2. Harden public.get_user_profile_by_phone RPC:
--      - Set search_path = public, pg_temp.
--      - Defend against unauthorized access: if caller has authenticated role, only allow querying caller's own profile.
--      - Revoke EXECUTE from PUBLIC, anon, and authenticated.
--      - Grant EXECUTE only to service_role.

-- ============================================================================
-- 1. Hardening View public.user_profile_complete
-- ============================================================================

-- Ensure the view enforces underlying table RLS for the invoking user
ALTER VIEW public.user_profile_complete SET (security_invoker = true);

-- Revoke public / authenticated direct access to the aggregated profile view
REVOKE ALL ON public.user_profile_complete FROM PUBLIC;
REVOKE ALL ON public.user_profile_complete FROM anon;
REVOKE ALL ON public.user_profile_complete FROM authenticated;

-- Allow only service_role (backend/edge functions) to access if needed
GRANT SELECT ON public.user_profile_complete TO service_role;

-- ============================================================================
-- 2. Hardening RPC public.get_user_profile_by_phone
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_profile_by_phone(phone_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result JSONB;
  normalized_phone TEXT;
  user_data RECORD;
BEGIN
  -- Normalize phone number (remove non-digits, handle country code)
  normalized_phone := regexp_replace(phone_number, '[^0-9]', '', 'g');
  
  -- Try to find user with exact match or partial match
  SELECT * INTO user_data
  FROM public.user_profile_complete upc
  WHERE 
    regexp_replace(upc.telefone, '[^0-9]', '', 'g') = normalized_phone
    OR regexp_replace(upc.telefone, '[^0-9]', '', 'g') LIKE '%' || normalized_phone
    OR normalized_phone LIKE '%' || regexp_replace(upc.telefone, '[^0-9]', '', 'g')
  LIMIT 1;
  
  -- Return NULL if no user found
  IF user_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Defense in depth:
  -- If invoked by an authenticated user, only permit querying their own profile.
  -- Prevents IDOR and enumeration of user financial records by phone number.
  IF coalesce(auth.role(), '') = 'authenticated' AND (user_data.user_id IS DISTINCT FROM auth.uid()) THEN
    RETURN NULL;
  END IF;
  
  -- Build complete response JSON
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
$function$;

-- Revoke execute from public / authenticated
REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_profile_by_phone(TEXT) FROM authenticated;

-- Allow execute only by service_role
GRANT EXECUTE ON FUNCTION public.get_user_profile_by_phone(TEXT) TO service_role;

-- Update comment
COMMENT ON FUNCTION public.get_user_profile_by_phone(TEXT) IS 
'SEC-003.1: Returns complete user profile data by phone number.
Restricted to service_role callers and strictly prevents unauthorized cross-user profile lookups.';
