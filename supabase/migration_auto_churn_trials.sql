-- ─── AUTO-CHURN EXPIRED TRIALS ──────────────────────────────────
-- Runs daily via pg_cron. Updates subscription_status from 'trial' → 'churned'
-- when trial_ends_at has passed. This keeps the DB accurate for email targeting
-- and analytics queries.
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ─────────────────────────────────────────────────────────────────

-- 1. Create the churn function
CREATE OR REPLACE FUNCTION public.churn_expired_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  churned_count INTEGER;
BEGIN
  UPDATE public.users
  SET subscription_status = 'churned'
  WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at <= NOW();

  GET DIAGNOSTICS churned_count = ROW_COUNT;
  RETURN churned_count;
END;
$$;

-- 2. Schedule daily at 00:05 UTC (before the 09:00 lifecycle email cron)
SELECT cron.schedule(
  'churn-expired-trials',
  '5 0 * * *',
  $$SELECT public.churn_expired_trials();$$
);

-- 3. Run it once now to fix any existing stale trials
SELECT public.churn_expired_trials();

-- ─── VERIFY ──────────────────────────────────────────────────────
-- Check for any users still stuck as 'trial' with expired dates:
-- SELECT id, email, subscription_status, trial_ends_at
-- FROM public.users
-- WHERE subscription_status = 'trial'
--   AND trial_ends_at <= NOW();
-- Should return 0 rows after running this migration.
