-- Migration: Update handle_new_user trigger
-- Requirements: 1.1, 1.2
-- Description: Modify trigger to include email field and create subscription with free plan

-- ============================================================================
-- Update handle_new_user function to:
-- 1. Include email from auth.users in profile creation (Requirement 1.1)
-- 2. Create subscription with Essencial (free) plan (Requirement 1.2)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  free_plan_id UUID;
  new_profile_id UUID;
BEGIN
  -- Get the free plan ID (Essencial)
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'Essencial' LIMIT 1;
  
  -- Create profile with email from auth.users (Requirement 1.1)
  INSERT INTO public.profiles (user_id, name, organization_name, telefone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'organization_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    NEW.email
  )
  RETURNING id INTO new_profile_id;
  
  -- Create subscription with free plan (Requirement 1.2)
  IF free_plan_id IS NOT NULL AND new_profile_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status, expires_at)
    VALUES (
      new_profile_id,
      free_plan_id,
      'active',
      NULL  -- Free plan never expires
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation (Requirement 1.4)
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Add comment to document the function
COMMENT ON FUNCTION public.handle_new_user() IS 
'Trigger function that creates a profile and subscription when a new user registers.
Creates profile with email from auth.users and assigns the free Essencial plan.
Requirements: 1.1, 1.2, 1.4';
