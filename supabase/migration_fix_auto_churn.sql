-- ═══════════════════════════════════════════════════════════════════
-- FIX: Auto-churn function now also updates plan_status to 'free'
--
-- BUG: The old churn_expired_trials() only updated subscription_status
-- from 'trial' → 'churned' but left plan_status as 'trial'. This meant
-- the frontend still granted Pro access because useProStatus checks:
--   if (planStatus === "trial") return true;
--
-- This fix updates BOTH fields so expired trial users are correctly
-- downgraded to free on the frontend.
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ═══════════════════════════════════════════════════════════════════

-- 1. Replace the churn function to also set plan_status='free'
CREATE OR REPLACE FUNCTION public.churn_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  churned_count INTEGER;
BEGIN
  -- Update users whose trial has expired:
  -- subscription_status: 'trial' → 'churned'
  -- plan_status: 'trial' → 'free' (CRITICAL — frontend checks this field)
  UPDATE public.users
  SET subscription_status = 'churned',
      plan_status = 'free'
  WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at <= NOW();

  GET DIAGNOSTICS churned_count = ROW_COUNT;

  -- Also catch any users where plan_status is still 'trial' but
  -- subscription_status was already set to 'churned' by the webhook
  -- (fixes the gap between webhook and cron)
  UPDATE public.users
  SET plan_status = 'free'
  WHERE plan_status = 'trial'
    AND subscription_status IN ('churned', 'free')
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at <= NOW();

  RETURN churned_count;
END;
$$;

-- 2. Run it once now to fix any existing users stuck with plan_status='trial'
SELECT public.churn_expired_trials();

-- 3. Verify: check for any users still stuck as 'trial' with expired dates
SELECT id, email, subscription_status, plan_status, trial_ends_at
FROM public.users
WHERE plan_status = 'trial'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at <= NOW();
-- Should return 0 rows after running this migration.
