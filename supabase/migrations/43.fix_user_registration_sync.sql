-- Migration: Fix User Registration Sync
-- Requirements: 4.1, 4.2
-- Description: Sync email from auth.users to profiles and create missing subscriptions

-- ============================================================================
-- PART 1: Sync email from auth.users to profiles (Requirement 4.1)
-- ============================================================================

-- Update all profiles where email IS NULL to get email from auth.users
-- Uses JOIN on user_id to match records
UPDATE public.profiles p
SET email = u.email,
    updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- Log the number of profiles updated (for debugging purposes)
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Email sync: % profiles updated with email from auth.users', updated_count;
END $$;

-- ============================================================================
-- PART 2: Create missing subscriptions with free plan (Requirement 4.2)
-- ============================================================================

-- Find all profiles without a subscription and create one with Essencial (free) plan
INSERT INTO public.subscriptions (user_id, plan_id, status, expires_at, created_at)
SELECT 
  p.id AS user_id,
  pl.id AS plan_id,
  'active' AS status,
  NULL AS expires_at,  -- Free plan never expires
  now() AS created_at
FROM public.profiles p
CROSS JOIN (
  SELECT id FROM public.plans WHERE name = 'Essencial' LIMIT 1
) pl
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id
);

-- Log the number of subscriptions created
DO $$
DECLARE
  created_count INTEGER;
BEGIN
  GET DIAGNOSTICS created_count = ROW_COUNT;
  RAISE NOTICE 'Subscription creation: % subscriptions created with Essencial plan', created_count;
END $$;
