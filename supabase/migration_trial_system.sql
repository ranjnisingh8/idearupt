-- ============================================================
-- IDEARUPT — 7-Day Free Trial System Migration
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ─── 1. Add trial columns to users table ─────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free';

-- Valid subscription_status values: 'free', 'trial', 'pro', 'churned'
COMMENT ON COLUMN public.users.trial_ends_at IS 'When the 7-day trial expires (NULL = no trial started)';
COMMENT ON COLUMN public.users.subscription_status IS 'free | trial | pro | churned';

-- ─── 2. Auto-start trial on new user signup ──────────────────
-- This trigger fires on every INSERT into auth.users (Supabase auth)
-- and sets trial_ends_at = now() + 7 days in public.users
CREATE OR REPLACE FUNCTION public.auto_start_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the user row that ensure_user_row already created
  -- (or will create shortly after). Use a small delay-safe approach:
  UPDATE public.users
  SET trial_ends_at = NOW() + INTERVAL '7 days',
      subscription_status = 'trial'
  WHERE id = NEW.id
    AND trial_ends_at IS NULL;  -- Don't overwrite if already set
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_auto_start_trial ON public.users;
CREATE TRIGGER trg_auto_start_trial
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_start_trial();

-- ─── 3. Start trial for ALL existing users who don't have one ─
-- This gives existing users a fresh 7-day trial from today
UPDATE public.users
SET trial_ends_at = NOW() + INTERVAL '7 days',
    subscription_status = 'trial'
WHERE trial_ends_at IS NULL
  AND subscription_status = 'free';

-- ─── 4. RPC: Get user trial status (used by frontend) ────────
CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'subscription_status', u.subscription_status,
    'trial_ends_at', u.trial_ends_at,
    'is_trial_active', (
      u.subscription_status = 'trial'
      AND u.trial_ends_at IS NOT NULL
      AND u.trial_ends_at > NOW()
    ),
    'trial_days_left', GREATEST(0, EXTRACT(EPOCH FROM (u.trial_ends_at - NOW())) / 86400)::INT,
    'is_pro', u.subscription_status = 'pro'
  ) INTO result
  FROM public.users u
  WHERE u.id = p_user_id;

  RETURN COALESCE(result, json_build_object(
    'subscription_status', 'free',
    'trial_ends_at', NULL,
    'is_trial_active', false,
    'trial_days_left', 0,
    'is_pro', false
  ));
END;
$$;

-- ─── 5. Email log table for lifecycle emails ──────────────────
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Index for fast lookups: "has this user received this email type?"
CREATE INDEX IF NOT EXISTS idx_email_log_user_type ON public.email_log(user_id, email_type);

-- RLS: users can only see their own email log
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_log_user_select ON public.email_log;
CREATE POLICY email_log_user_select ON public.email_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert (edge functions use service key)
DROP POLICY IF EXISTS email_log_service_insert ON public.email_log;
CREATE POLICY email_log_service_insert ON public.email_log
  FOR INSERT WITH CHECK (true);

-- GRANT for edge functions
GRANT SELECT, INSERT ON TABLE public.email_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.email_log TO service_role;

-- ─── 6. Trial-aware usage limits ──────────────────────────────
-- Update check_daily_usage to be trial-aware:
-- Trial users get higher limits, expired trial users get free limits
CREATE OR REPLACE FUNCTION public.check_daily_usage(
  check_user_id UUID,
  check_feature TEXT,
  daily_limit INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_count INT;
  effective_limit INT;
  user_status TEXT;
  user_trial_ends TIMESTAMPTZ;
BEGIN
  -- Get user subscription info
  SELECT subscription_status, trial_ends_at
  INTO user_status, user_trial_ends
  FROM public.users
  WHERE id = check_user_id;

  -- Determine effective limit
  IF user_status = 'pro' THEN
    -- Pro users: unlimited
    RETURN json_build_object(
      'can_use', true,
      'used_today', 0,
      'daily_limit', 999,
      'remaining', 999
    );
  ELSIF user_status = 'trial' AND user_trial_ends > NOW() THEN
    -- Active trial: use the provided limit (same as free for now,
    -- but gives us flexibility to increase trial limits later)
    effective_limit := daily_limit;
  ELSE
    -- Free or expired trial: use the provided limit
    effective_limit := daily_limit;
  END IF;

  -- Count today's usage
  SELECT COALESCE(SUM(count), 0) INTO today_count
  FROM public.usage_tracking
  WHERE user_id = check_user_id
    AND feature = check_feature
    AND used_at = CURRENT_DATE;

  RETURN json_build_object(
    'can_use', today_count < effective_limit,
    'used_today', today_count,
    'daily_limit', effective_limit,
    'remaining', GREATEST(0, effective_limit - today_count)
  );
END;
$$;

-- ─── 7. Ensure GRANTs are in place ───────────────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_interactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.usage_tracking TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ─── 8. Allow users to read their own trial status ───────────
-- RLS policy for users to read their own subscription_status
DROP POLICY IF EXISTS users_read_own ON public.users;
CREATE POLICY users_read_own ON public.users
  FOR SELECT USING (auth.uid() = id);

-- ─── Done! ───────────────────────────────────────────────────
-- Verify: SELECT get_user_trial_status('your-user-id-here');
