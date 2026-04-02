-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Card-Required 7-Day Trial via Lemon Squeezy
-- Run in Supabase SQL Editor
-- Safe to run multiple times (all idempotent)
-- ONLY affects NEW users — existing users untouched
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. ADD new columns to users table
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'none';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.users.plan_status IS 'none | trial | active | free | cancelled | past_due';
COMMENT ON COLUMN public.users.current_period_end IS 'Lemon Squeezy billing period end date';
COMMENT ON COLUMN public.users.cancel_at_period_end IS 'True if user cancelled but still has access until period end';

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_plan_status ON public.users(plan_status);


-- ═══════════════════════════════════════════════════════════════
-- 2. UPDATE auto_start_trial() trigger
--    OLD behavior: Auto-start 7-day trial for all new users
--    NEW behavior: Set plan_status='none' + subscription_status='free'
--                  Webhook sets subscription_status='trial' AFTER card entry
-- ═══════════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════════
-- 3. RPC: Get user plan status (frontend fetches this on every app load)
--    Auto-expires stale trial rows so the DB stays in sync with reality.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_plan_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result          JSON;
  v_plan_status   TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_ls_sub_id     TEXT;
BEGIN
  -- Security: users can only query their own status
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object(
      'plan_status', 'none',
      'current_period_end', NULL,
      'cancel_at_period_end', false
    );
  END IF;

  -- Read current state so we can check for expired trial
  SELECT plan_status, trial_ends_at, ls_subscription_id
  INTO v_plan_status, v_trial_ends_at, v_ls_sub_id
  FROM public.users
  WHERE id = p_user_id;

  -- Auto-expire: trial past its end date and user never paid -> downgrade to free
  -- This fires on every app load, keeping the DB in sync without a cron job.
  IF v_plan_status = 'trial'
     AND v_trial_ends_at IS NOT NULL
     AND v_trial_ends_at < NOW()
     AND (v_ls_sub_id IS NULL OR v_ls_sub_id = '')
  THEN
    UPDATE public.users
    SET plan_status         = 'free',
        subscription_status = 'free'
    WHERE id = p_user_id;
  END IF;

  -- Return the current (possibly just-updated) row
  SELECT json_build_object(
    'plan_status',          COALESCE(u.plan_status, 'none'),
    'current_period_end',   u.current_period_end,
    'cancel_at_period_end', COALESCE(u.cancel_at_period_end, false),
    'subscription_status',  u.subscription_status,
    'trial_ends_at',        u.trial_ends_at,
    'is_pro',               u.subscription_status IN ('pro', 'paid'),
    'is_early_adopter',     COALESCE(u.is_early_adopter, false),
    'ls_customer_id',       u.ls_customer_id
  ) INTO result
  FROM public.users u
  WHERE u.id = p_user_id;

  RETURN COALESCE(result, json_build_object(
    'plan_status',          'none',
    'current_period_end',   NULL,
    'cancel_at_period_end', false,
    'subscription_status',  'free',
    'trial_ends_at',        NULL,
    'is_pro',               false,
    'is_early_adopter',     false,
    'ls_customer_id',       NULL
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_plan_status(UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
SELECT 'Card-required trial migration complete.' AS status;

-- Verify columns exist:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('plan_status', 'current_period_end', 'cancel_at_period_end')
ORDER BY column_name;
