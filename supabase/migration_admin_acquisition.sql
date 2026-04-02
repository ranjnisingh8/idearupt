-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Admin Acquisition & Referral Analytics RPCs
-- Run this in Supabase SQL Editor (AFTER migration_referral_system.sql)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Signups by UTM Source ────────────────────────────────
-- Returns signup counts grouped by utm_source within a date range
CREATE OR REPLACE FUNCTION admin_get_signups_by_source(
  start_date TIMESTAMPTZ DEFAULT (now() - interval '30 days'),
  end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify admin access
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
  FROM (
    SELECT
      COALESCE(utm_source, 'organic') AS source,
      COUNT(*) AS total_signups,
      COUNT(*) FILTER (WHERE plan_status IN ('trial', 'active')) AS trial_or_active,
      COUNT(*) FILTER (WHERE plan_status = 'active') AS conversions,
      COUNT(*) FILTER (WHERE referred_by IS NOT NULL) AS from_referral,
      ROUND(
        CASE WHEN COUNT(*) > 0
          THEN COUNT(*) FILTER (WHERE plan_status IN ('trial', 'active'))::numeric / COUNT(*)::numeric * 100
          ELSE 0
        END, 1
      ) AS trial_rate
    FROM users
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY COALESCE(utm_source, 'organic')
    ORDER BY total_signups DESC
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Top Referrers ───────────────────────────────────────
-- Returns top referrers by total earnings
CREATE OR REPLACE FUNCTION admin_get_top_referrers(result_limit INTEGER DEFAULT 20)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify admin access
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
  FROM (
    SELECT
      u.id AS user_id,
      u.email,
      u.referral_code,
      COALESCE(u.referral_clicks, 0) AS clicks,
      COUNT(re.id) FILTER (WHERE re.event_type = 'signup') AS signups,
      COUNT(re.id) FILTER (WHERE re.event_type = 'conversion') AS conversions,
      COALESCE(SUM(re.commission_amount) FILTER (WHERE re.event_type = 'conversion'), 0) AS total_earnings,
      COALESCE(SUM(re.commission_amount) FILTER (WHERE re.event_type = 'conversion' AND re.commission_status = 'pending'), 0) AS pending_earnings,
      COALESCE(SUM(re.commission_amount) FILTER (WHERE re.event_type = 'conversion' AND re.commission_status = 'paid'), 0) AS paid_earnings
    FROM users u
    LEFT JOIN referral_events re ON re.referrer_id = u.id
    WHERE u.referral_clicks > 0 OR EXISTS (
      SELECT 1 FROM referral_events WHERE referrer_id = u.id
    )
    GROUP BY u.id, u.email, u.referral_code, u.referral_clicks
    ORDER BY total_earnings DESC, signups DESC
    LIMIT result_limit
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. Referral Overview Stats ──────────────────────────────
-- Returns aggregate referral metrics
CREATE OR REPLACE FUNCTION admin_get_referral_overview()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify admin access
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_build_object(
    'total_clicks', (SELECT COALESCE(SUM(referral_clicks), 0) FROM users),
    'total_referred_signups', (SELECT COUNT(*) FROM referral_events WHERE event_type = 'signup'),
    'total_conversions', (SELECT COUNT(*) FROM referral_events WHERE event_type = 'conversion'),
    'total_commission_pending', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE event_type = 'conversion' AND commission_status = 'pending'
    ),
    'total_commission_paid', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE event_type = 'conversion' AND commission_status = 'paid'
    ),
    'total_commission_all', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE event_type = 'conversion'
    ),
    'total_referral_revenue', (
      SELECT COALESCE(SUM(payment_amount), 0) FROM referral_events
      WHERE event_type = 'conversion'
    ),
    'active_referrers', (
      SELECT COUNT(DISTINCT referrer_id) FROM referral_events
    ),
    'signup_to_conversion_rate', (
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM referral_events WHERE event_type = 'signup') > 0
        THEN ROUND(
          (SELECT COUNT(*) FROM referral_events WHERE event_type = 'conversion')::numeric /
          (SELECT COUNT(*) FROM referral_events WHERE event_type = 'signup')::numeric * 100, 1
        )
        ELSE 0
      END
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. Grant execute permissions ────────────────────────────
GRANT EXECUTE ON FUNCTION admin_get_signups_by_source TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_top_referrers TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_referral_overview TO authenticated;
