-- Migration: Create user_profile_complete view
-- Requirements: 2.3
-- Description: Create comprehensive view with all user data for RPC function

-- ============================================================================
-- Drop existing view if exists
-- ============================================================================
DROP VIEW IF EXISTS public.user_profile_complete;

-- ============================================================================
-- Create user_profile_complete view with all required columns
-- ============================================================================
CREATE OR REPLACE VIEW public.user_profile_complete AS
SELECT
  -- Profile data (with aliases for compatibility)
  p.id,
  p.id AS profile_id,
  p.user_id,
  p.name,
  p.email,
  p.telefone,
  p.organization_name,
  p.role,
  p.avatar_url,
  p.endereco,
  p.created_at,
  p.created_at AS profile_created_at,
  p.updated_at,
  
  -- Subscription data
  s.id AS subscription_id,
  s.status AS subscription_status,
  s.expires_at AS subscription_expires_at,
  s.created_at AS subscription_created_at,
  CASE 
    WHEN s.expires_at IS NULL THEN FALSE
    WHEN s.expires_at < NOW() THEN TRUE
    ELSE FALSE
  END AS subscription_expired,
  CASE 
    WHEN s.expires_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (s.expires_at - NOW()))::INTEGER
  END AS days_until_expiration,
  
  -- Plan data
  pl.id AS plan_id,
  pl.name AS plan_name,
  pl.price AS plan_price,
  pl.features AS plan_features,
  
  -- Plan limits (using COALESCE for default values)
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'transactions_this_month'),
    50
  ) AS limit_transactions,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'custom_categories'),
    5
  ) AS limit_categories,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'ai_analysis_this_month'),
    3
  ) AS limit_ai_analysis,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'file_uploads_this_month'),
    5
  ) AS limit_file_uploads,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'vehicles'),
    1
  ) AS limit_vehicles,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'goals'),
    3
  ) AS limit_goals,
  COALESCE(
    (SELECT limit_value FROM public.plan_limits WHERE plan_id = pl.id AND feature_key = 'market_items'),
    20
  ) AS limit_market_items,
  
  -- Usage counts (current month)
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.transacoes t 
    WHERE t.user_id = p.user_id 
    AND t.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS usage_transactions,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.categorias c 
    WHERE c.user_id = p.user_id
  ) AS usage_categories,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.ia_analysis_results ia 
    WHERE ia.user_id = p.user_id 
    AND ia.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS usage_ai_analysis,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.ia_uploads iu 
    WHERE iu.user_id = p.user_id 
    AND iu.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS usage_file_uploads,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.veiculos v 
    WHERE v.user_id = p.user_id
  ) AS usage_vehicles,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.metas m 
    WHERE m.user_id = p.user_id
  ) AS usage_goals,
  (
    SELECT COUNT(*)::INTEGER 
    FROM public.itens_mercado im 
    WHERE im.user_id = p.user_id
  ) AS usage_market_items,
  
  -- Financial summary
  (
    SELECT COALESCE(SUM(r.valor), 0)::NUMERIC 
    FROM public.receitas r 
    WHERE r.user_id = p.user_id 
    AND r.data >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS total_receitas_mes,
  (
    SELECT COALESCE(SUM(d.valor), 0)::NUMERIC 
    FROM public.despesas d 
    WHERE d.user_id = p.user_id 
    AND d.data >= DATE_TRUNC('month', CURRENT_DATE)
  ) AS total_despesas_mes,
  (
    SELECT COALESCE(SUM(div.valor_restante), 0)::NUMERIC 
    FROM public.dividas div 
    WHERE div.user_id = p.user_id 
    AND div.status != 'paga'
  ) AS total_dividas_pendentes

FROM public.profiles p
LEFT JOIN public.subscriptions s ON s.user_id = p.id AND s.status = 'active'
LEFT JOIN public.plans pl ON pl.id = s.plan_id;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT SELECT ON public.user_profile_complete TO authenticated;
GRANT SELECT ON public.user_profile_complete TO service_role;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON VIEW public.user_profile_complete IS 
'Comprehensive view combining profile, subscription, plan, limits, usage, and financial data.
Used by get_user_profile_by_phone RPC function.
Requirements: 2.3';
