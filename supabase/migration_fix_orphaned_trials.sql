-- ═══════════════════════════════════════════════════════════════
-- Fix orphaned trial users
-- These users signed up but never entered a card.
-- Their subscription_status was incorrectly set to 'trial' on signup.
-- They never had Pro access (plan_status='none' blocked them), but the
-- stale 'trial' value confuses email functions and admin reporting.
-- ═══════════════════════════════════════════════════════════════

-- 1. Log how many rows will be affected before updating
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.users
  WHERE plan_status = 'none'
    AND subscription_status = 'trial'
    AND (ls_subscription_id IS NULL OR ls_subscription_id = '');
  RAISE NOTICE 'Orphaned trial users to fix: %', orphan_count;
END $$;

-- 2. Clean up: set subscription_status = 'free' for users who never entered a card
UPDATE public.users
SET subscription_status = 'free'
WHERE plan_status = 'none'
  AND subscription_status = 'trial'
  AND (ls_subscription_id IS NULL OR ls_subscription_id = '');

-- 3. Fix the auto_start_trial() trigger:
--    OLD: sets subscription_status = 'trial' on signup (wrong — card not entered yet)
--    NEW: sets subscription_status = 'free' on signup
--         The webhook sets subscription_status = 'trial' ONLY AFTER LS confirms a card
CREATE OR REPLACE FUNCTION public.auto_start_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- For NEW users: plan_status='none' (card required to activate trial)
  -- subscription_status='free' until Lemon Squeezy webhook confirms card entry
  UPDATE public.users
  SET trial_ends_at       = NOW() + INTERVAL '7 days',
      subscription_status = 'free',
      plan_status         = 'none'
  WHERE id = NEW.id
    AND trial_ends_at IS NULL;
  RETURN NEW;
END;
$$;

-- 4. Verify the fix
SELECT
  'subscription_status distribution after fix' AS check_name,
  subscription_status,
  COUNT(*) AS user_count
FROM public.users
WHERE plan_status = 'none'
GROUP BY subscription_status
ORDER BY user_count DESC;
