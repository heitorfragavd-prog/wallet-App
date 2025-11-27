-- Migration: Create/Fix get_user_profile_by_phone function
-- Requirements: 2.1, 2.3
-- Description: RPC function to get complete user profile by phone number

-- ============================================================================
-- Drop existing function if exists
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_user_profile_by_phone(TEXT);

-- ============================================================================
-- Create get_user_profile_by_phone function
-- Returns complete user data including profile, subscription, plan, limits, usage
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_profile_by_phone(phone_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  -- Return NULL if no user found (Requirement 2.2)
  IF user_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build complete response JSON (Requirement 2.1)
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

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_user_profile_by_phone(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile_by_phone(TEXT) TO service_role;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON FUNCTION public.get_user_profile_by_phone(TEXT) IS 
'Returns complete user profile data by phone number.
Includes: user, subscription, plan, limits, usage, limits_reached, financial_summary.
Returns NULL if phone number not found.
Requirements: 2.1, 2.2, 2.3';
