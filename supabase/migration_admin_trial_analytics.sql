-- ─── ADMIN TRIAL ANALYTICS RPCs ─────────────────────────────────
-- Bypasses RLS so admin can see ALL users' trial data + email log.
-- RUN THIS IN SUPABASE SQL EDITOR
-- ─────────────────────────────────────────────────────────────────

-- 1. Admin: get all users with trial/subscription data
CREATE OR REPLACE FUNCTION admin_get_trial_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT,
  upgraded_at TIMESTAMPTZ,
  plan_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.trial_ends_at,
    u.subscription_status,
    u.upgraded_at,
    COALESCE(u.plan_status, 'none')::TEXT AS plan_status
  FROM public.users u
  ORDER BY u.trial_ends_at ASC NULLS LAST;
END;
$$;

-- 2. Admin: get email log with user emails
CREATE OR REPLACE FUNCTION admin_get_email_log(result_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  email_type TEXT,
  sent_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    el.id,
    el.user_id,
    u.email AS user_email,
    el.email_type,
    el.sent_at
  FROM public.email_log el
  LEFT JOIN public.users u ON u.id = el.user_id
  ORDER BY el.sent_at DESC
  LIMIT result_limit;
END;
$$;

-- 3. Admin: get trial summary stats (computed server-side for accuracy)
CREATE OR REPLACE FUNCTION admin_get_trial_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM public.users),
    'active_trial', (
      -- Only count users with a real card-required trial (plan_status='trial')
      SELECT COUNT(*) FROM public.users
      WHERE COALESCE(plan_status, 'none') = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
    ),
    'expiring_3d', (
      SELECT COUNT(*) FROM public.users
      WHERE COALESCE(plan_status, 'none') = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '30 days'
    ),
    'churned', (
      -- Expired/churned: legacy churned + plan_status='free' + legacy trial expired without card
      SELECT COUNT(*) FROM public.users
      WHERE subscription_status = 'churned'
        OR COALESCE(plan_status, 'none') = 'free'
        OR (subscription_status = 'trial' AND COALESCE(plan_status, 'none') = 'none' AND trial_ends_at IS NOT NULL AND trial_ends_at <= NOW())
    ),
    'pro', (
      -- Paid users: active OR cancelled but still within billing period
      SELECT COUNT(*) FROM public.users
      WHERE COALESCE(plan_status, 'none') = 'active'
         OR (COALESCE(plan_status, 'none') = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end > NOW())
    ),
    'conversion_rate', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (
          WHERE COALESCE(plan_status, 'none') = 'active'
             OR (COALESCE(plan_status, 'none') = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end > NOW())
        )::NUMERIC / COUNT(*)::NUMERIC) * 100, 1)
      END
      FROM public.users
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── VERIFY ─────────────────────────────────────────────────────
-- SELECT admin_get_trial_stats();
-- SELECT * FROM admin_get_trial_users();
-- SELECT * FROM admin_get_email_log(10);
