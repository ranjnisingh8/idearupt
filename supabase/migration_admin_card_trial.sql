-- ============================================================
-- Admin Card-Required Trial Analytics RPC
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Returns all users with plan_status info for admin dashboard
CREATE OR REPLACE FUNCTION admin_get_card_trial_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  plan_status TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  subscription_status TEXT,
  ls_subscription_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only check
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT
      u.id,
      u.email,
      u.created_at,
      COALESCE(u.plan_status, 'none')::TEXT AS plan_status,
      u.trial_ends_at,
      u.current_period_end,
      COALESCE(u.cancel_at_period_end, false) AS cancel_at_period_end,
      u.subscription_status,
      u.ls_subscription_id
    FROM users u
    ORDER BY u.created_at DESC;
END;
$$;

-- Stats summary for card-required trial users
CREATE OR REPLACE FUNCTION admin_get_card_trial_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Admin-only check
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    'total', COUNT(*),
    'on_trial', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'trial'),
    'active', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'active'),
    'cancelled', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'cancelled'),
    'past_due', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'past_due'),
    'free', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'free'),
    'no_plan', COUNT(*) FILTER (WHERE COALESCE(plan_status, 'none') = 'none'),
    'card_users', COUNT(*) FILTER (WHERE plan_status IS NOT NULL AND plan_status NOT IN ('none', 'free')),
    'paid', COUNT(*) FILTER (
      WHERE COALESCE(plan_status, 'none') = 'active'
         OR (COALESCE(plan_status, 'none') = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end > NOW())
    ),
    'conversion_rate', CASE
      WHEN COUNT(*) FILTER (WHERE plan_status IS NOT NULL AND plan_status NOT IN ('none', 'free')) > 0
      THEN ROUND(
        (COUNT(*) FILTER (
          WHERE COALESCE(plan_status, 'none') = 'active'
             OR (COALESCE(plan_status, 'none') = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end > NOW())
        ))::NUMERIC /
        GREATEST(COUNT(*) FILTER (WHERE plan_status IS NOT NULL AND plan_status NOT IN ('none', 'free')), 1) * 100
      )
      ELSE 0
    END
  ) INTO result
  FROM users;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users (admin check is inside the function)
GRANT EXECUTE ON FUNCTION admin_get_card_trial_users() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_card_trial_stats() TO authenticated;
