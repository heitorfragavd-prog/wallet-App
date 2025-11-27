-- Migration: Fix function search_path vulnerability
-- Issue: Functions without SET search_path are vulnerable to search_path hijacking attacks
-- Solution: Add SET search_path = public to all functions

-- =====================================================
-- 1. Fix update_updated_at_column
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 2. Fix update_payment_links_updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_payment_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 3. Fix update_valor_restante
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_valor_restante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.valor_restante = NEW.valor_total - NEW.valor_pago;
  
  -- Auto-update status based on payment and due date
  IF NEW.valor_restante <= 0 THEN
    NEW.status = 'quitada';
  ELSIF NEW.data_vencimento < CURRENT_DATE AND NEW.valor_restante > 0 THEN
    NEW.status = 'vencida';
  ELSE
    NEW.status = 'pendente';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 4. Fix update_meta_status
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_meta_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Auto-update status based on progress and dates
  IF NEW.valor_atual >= NEW.valor_alvo THEN
    NEW.status = 'concluida';
  ELSIF NEW.data_limite < CURRENT_DATE AND NEW.status = 'ativa' THEN
    NEW.status = 'vencida';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 5. Fix update_item_status
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_item_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Auto-update status based on current vs ideal quantity
  IF NEW.quantidade_atual <= 0 THEN
    NEW.status = 'sem_estoque';
  ELSIF NEW.quantidade_atual >= NEW.quantidade_ideal THEN
    NEW.status = 'estoque_adequado';
  ELSIF NEW.quantidade_atual >= (NEW.quantidade_ideal * 0.3) THEN
    NEW.status = 'estoque_medio';
  ELSE
    NEW.status = 'estoque_baixo';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 6. Fix calcular_proxima_manutencao
-- =====================================================
CREATE OR REPLACE FUNCTION public.calcular_proxima_manutencao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Se a manutenção foi realizada, calcular a próxima apenas com base em quilometragem
  IF NEW.data_realizada IS NOT NULL AND NEW.quilometragem_realizada IS NOT NULL THEN
    -- Buscar intervalo de quilometragem do tipo de manutenção
    SELECT 
      CASE 
        WHEN tm.intervalo_km IS NOT NULL 
        THEN NEW.quilometragem_realizada + tm.intervalo_km
        ELSE NULL 
      END
    INTO NEW.quilometragem_proxima
    FROM public.tipos_manutencao tm
    WHERE tm.id = NEW.tipo_manutencao_id;
    
    NEW.status = 'realizada';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 7. Fix cleanup_expired_tokens (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.invite_tokens
  WHERE expires_at < now() AND used_at IS NULL;
END;
$function$;

-- =====================================================
-- 8. Fix create_default_categories (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_default_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Insert default income categories (receitas)
  INSERT INTO public.categorias (user_id, nome, tipo, cor, icone) VALUES
    (p_user_id, 'Salário', 'receita', '#10B981', 'DollarSign'),
    (p_user_id, 'Freelance', 'receita', '#3B82F6', 'Briefcase'),
    (p_user_id, 'Investimentos', 'receita', '#8B5CF6', 'TrendingUp'),
    (p_user_id, 'Vendas', 'receita', '#F59E0B', 'ShoppingBag'),
    (p_user_id, 'Aluguel Recebido', 'receita', '#059669', 'Home')
  ON CONFLICT (user_id, nome, tipo) DO NOTHING;

  -- Insert default expense categories (despesas)
  INSERT INTO public.categorias (user_id, nome, tipo, cor, icone) VALUES
    (p_user_id, 'Alimentação', 'despesa', '#EF4444', 'Utensils'),
    (p_user_id, 'Transporte', 'despesa', '#F97316', 'Car'),
    (p_user_id, 'Moradia', 'despesa', '#6366F1', 'Home'),
    (p_user_id, 'Saúde', 'despesa', '#EC4899', 'Heart'),
    (p_user_id, 'Educação', 'despesa', '#14B8A6', 'BookOpen'),
    (p_user_id, 'Lazer', 'despesa', '#8B5CF6', 'Gamepad2'),
    (p_user_id, 'Roupas', 'despesa', '#F59E0B', 'Shirt'),
    (p_user_id, 'Tecnologia', 'despesa', '#6B7280', 'Smartphone'),
    (p_user_id, 'Serviços', 'despesa', '#84CC16', 'Settings')
  ON CONFLICT (user_id, nome, tipo) DO NOTHING;
END;
$function$;

-- =====================================================
-- 9. Fix handle_new_user (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, name, organization_name, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '')
  );
  
  -- Create default categories
  PERFORM public.create_default_categories(NEW.id);
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- 10. Fix log_admin_action (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_admin_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id uuid;
  current_user_role text;
BEGIN
  -- Obter ID e role do usuário atual
  SELECT id, role INTO current_user_id, current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Só registrar se for um admin
  IF current_user_role = 'admin' THEN
    INSERT INTO public.admin_logs (
      admin_id,
      action,
      entity_type,
      entity_id,
      details
    ) VALUES (
      current_user_id,
      TG_OP || '_' || TG_TABLE_NAME,
      TG_TABLE_NAME,
      CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.id
        ELSE NEW.id
      END,
      CASE 
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- =====================================================
-- 11. Fix delete_user_account (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_user_account(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
DECLARE
  success BOOLEAN;
BEGIN
  -- Deletar o usuário do auth.users (isso vai disparar o ON DELETE CASCADE)
  DELETE FROM auth.users WHERE id = user_id;
  
  -- Verificar se o usuário foi deletado
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id) THEN
    success := true;
  ELSE
    success := false;
  END IF;
  
  RETURN success;
END;
$function$;

-- =====================================================
-- 12. Fix get_user_profile_by_phone (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_profile_by_phone(phone_number text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'user', json_build_object(
      'id', upc.profile_id,
      'user_id', upc.user_id,
      'name', upc.name,
      'email', upc.email,
      'telefone', upc.telefone,
      'endereco', upc.endereco,
      'organization_name', upc.organization_name,
      'avatar_url', upc.avatar_url,
      'role', upc.role,
      'created_at', upc.profile_created_at
    ),
    'subscription', json_build_object(
      'id', upc.subscription_id,
      'status', upc.subscription_status,
      'expires_at', upc.subscription_expires_at,
      'created_at', upc.subscription_created_at,
      'is_expired', upc.subscription_expired,
      'days_until_expiration', upc.days_until_expiration
    ),
    'plan', json_build_object(
      'id', upc.plan_id,
      'name', upc.plan_name,
      'price', upc.plan_price,
      'features', upc.plan_features,
      'checkout_link', upc.plan_checkout_link
    ),
    'limits', json_build_object(
      'transactions_per_month', upc.limit_transactions,
      'custom_categories', upc.limit_categories,
      'ai_analysis_per_month', upc.limit_ai_analysis,
      'file_uploads_per_month', upc.limit_file_uploads,
      'vehicles', upc.limit_vehicles,
      'goals', upc.limit_goals,
      'market_items', upc.limit_market_items
    ),
    'usage', json_build_object(
      'transactions_this_month', upc.usage_transactions_mes,
      'receitas_this_month', upc.usage_receitas_mes,
      'despesas_this_month', upc.usage_despesas_mes,
      'categories', upc.usage_categories,
      'vehicles', upc.usage_vehicles,
      'goals', upc.usage_goals,
      'market_items', upc.usage_market_items,
      'file_uploads_this_month', upc.usage_file_uploads_mes,
      'ai_analysis_this_month', upc.usage_ai_analysis_mes
    ),
    'limits_reached', json_build_object(
      'transactions', CASE 
        WHEN upc.limit_transactions IS NULL THEN false 
        ELSE upc.usage_transactions_mes >= upc.limit_transactions 
      END,
      'categories', CASE 
        WHEN upc.limit_categories IS NULL THEN false 
        ELSE upc.usage_categories >= upc.limit_categories 
      END,
      'vehicles', CASE 
        WHEN upc.limit_vehicles IS NULL THEN false 
        ELSE upc.usage_vehicles >= upc.limit_vehicles 
      END,
      'goals', CASE 
        WHEN upc.limit_goals IS NULL THEN false 
        ELSE upc.usage_goals >= upc.limit_goals 
      END,
      'market_items', CASE 
        WHEN upc.limit_market_items IS NULL THEN false 
        ELSE upc.usage_market_items >= upc.limit_market_items 
      END,
      'ai_analysis', CASE 
        WHEN upc.limit_ai_analysis IS NULL THEN false 
        WHEN upc.limit_ai_analysis = 0 THEN true
        ELSE upc.usage_ai_analysis_mes >= upc.limit_ai_analysis 
      END,
      'file_uploads', CASE 
        WHEN upc.limit_file_uploads IS NULL THEN false 
        WHEN upc.limit_file_uploads = 0 THEN true
        ELSE upc.usage_file_uploads_mes >= upc.limit_file_uploads 
      END
    ),
    'financial_summary', json_build_object(
      'total_receitas', upc.total_receitas,
      'total_despesas', upc.total_despesas,
      'total_dividas', upc.total_dividas,
      'receitas_mes_valor', upc.receitas_mes_valor,
      'despesas_mes_valor', upc.despesas_mes_valor,
      'saldo_mes', upc.receitas_mes_valor - upc.despesas_mes_valor
    )
  ) INTO result
  FROM public.user_profile_complete upc
  WHERE upc.telefone = phone_number;
  
  RETURN result;
END;
$function$;

-- =====================================================
-- 13. Fix verificar_manutencoes_nao_migradas (SECURITY DEFINER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.verificar_manutencoes_nao_migradas()
RETURNS TABLE(veiculo_id uuid, tipo_manutencao_id uuid, total_manutencoes bigint, marca text, modelo text, tipo_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.veiculo_id,
    m.tipo_manutencao_id,
    COUNT(*) as total_manutencoes,
    v.marca,
    v.modelo,
    tm.nome as tipo_nome
  FROM public.manutencoes m
  INNER JOIN public.veiculos v ON m.veiculo_id = v.id
  INNER JOIN public.tipos_manutencao tm ON m.tipo_manutencao_id = tm.id
  WHERE m.status = 'realizada'
  AND m.migrado_para_novo_sistema = false
  GROUP BY m.veiculo_id, m.tipo_manutencao_id, v.marca, v.modelo, tm.nome;
END;
$function$;

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 40: All 13 functions updated with SET search_path for security';
END $$;
