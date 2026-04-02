-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Admin Analytics V3 — Drop-off Funnel + Error + Confusion
-- Run this in Supabase SQL Editor (adds 3 new functions)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. DROP-OFF FUNNEL
-- Shows user progression: landing → signup → onboarding → idea_viewed → idea_saved → validation → blueprint
-- Returns each step with unique user count and drop-off %
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_drop_off_funnel(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
  landing_users INTEGER;
  signup_users INTEGER;
  onboarding_users INTEGER;
  idea_viewed_users INTEGER;
  idea_saved_users INTEGER;
  validation_users INTEGER;
  blueprint_users INTEGER;
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Step 1: Landing page visitors (unique users who had any page_view on /)
  SELECT COUNT(DISTINCT user_id) INTO landing_users
  FROM page_events
  WHERE event_name = 'page_view'
    AND page_url = '/'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  -- If no user-attributed landing visits, use session count as fallback
  IF landing_users = 0 THEN
    SELECT COUNT(DISTINCT session_id) INTO landing_users
    FROM page_events
    WHERE event_name = 'page_view'
      AND page_url = '/'
      AND created_at >= sd AND created_at <= ed;
  END IF;

  -- Step 2: Signups
  SELECT COUNT(DISTINCT user_id) INTO signup_users
  FROM page_events
  WHERE event_name = 'signup_completed'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  -- Fallback: count from users table
  IF signup_users = 0 THEN
    SELECT COUNT(*) INTO signup_users
    FROM users
    WHERE created_at >= sd AND created_at <= ed;
  END IF;

  -- Step 3: Onboarding completed
  SELECT COUNT(DISTINCT user_id) INTO onboarding_users
  FROM page_events
  WHERE event_name = 'quiz_completed'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  -- Fallback: users with onboarding_completed = true created in range
  IF onboarding_users = 0 THEN
    SELECT COUNT(*) INTO onboarding_users
    FROM users
    WHERE onboarding_completed = TRUE
      AND created_at >= sd AND created_at <= ed;
  END IF;

  -- Step 4: First idea viewed
  SELECT COUNT(DISTINCT user_id) INTO idea_viewed_users
  FROM page_events
  WHERE event_name = 'idea_viewed'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  -- Step 5: First idea saved
  SELECT COUNT(DISTINCT user_id) INTO idea_saved_users
  FROM user_interactions
  WHERE action = 'saved'
    AND created_at >= sd AND created_at <= ed;

  -- Step 6: First validation
  SELECT COUNT(DISTINCT user_id) INTO validation_users
  FROM page_events
  WHERE event_name = 'validation_completed'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  -- Step 7: First blueprint viewed
  SELECT COUNT(DISTINCT user_id) INTO blueprint_users
  FROM page_events
  WHERE event_name = 'blueprint_viewed'
    AND created_at >= sd AND created_at <= ed
    AND user_id IS NOT NULL;

  SELECT json_build_object(
    'steps', json_build_array(
      json_build_object('name', 'Landing Visitors', 'count', landing_users, 'drop_off_pct', 0),
      json_build_object('name', 'Signed Up', 'count', signup_users,
        'drop_off_pct', CASE WHEN landing_users > 0 THEN ROUND(((landing_users - signup_users)::numeric / landing_users) * 100, 1) ELSE 0 END),
      json_build_object('name', 'Onboarding Done', 'count', onboarding_users,
        'drop_off_pct', CASE WHEN signup_users > 0 THEN ROUND(((signup_users - onboarding_users)::numeric / signup_users) * 100, 1) ELSE 0 END),
      json_build_object('name', 'Viewed Idea', 'count', idea_viewed_users,
        'drop_off_pct', CASE WHEN onboarding_users > 0 THEN ROUND(((onboarding_users - idea_viewed_users)::numeric / onboarding_users) * 100, 1) ELSE 0 END),
      json_build_object('name', 'Saved Idea', 'count', idea_saved_users,
        'drop_off_pct', CASE WHEN idea_viewed_users > 0 THEN ROUND(((idea_viewed_users - idea_saved_users)::numeric / idea_viewed_users) * 100, 1) ELSE 0 END),
      json_build_object('name', 'Validated Idea', 'count', validation_users,
        'drop_off_pct', CASE WHEN idea_saved_users > 0 THEN ROUND(((idea_saved_users - validation_users)::numeric / idea_saved_users) * 100, 1) ELSE 0 END),
      json_build_object('name', 'Viewed Blueprint', 'count', blueprint_users,
        'drop_off_pct', CASE WHEN validation_users > 0 THEN ROUND(((validation_users - blueprint_users)::numeric / validation_users) * 100, 1) ELSE 0 END)
    ),
    'total_conversion_pct', CASE WHEN landing_users > 0 THEN ROUND((blueprint_users::numeric / landing_users) * 100, 2) ELSE 0 END
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- 2. ERROR SUMMARY
-- Groups JS and API errors by message, returns count + affected users + pages
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_error_summary(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  error_type TEXT,
  error_message TEXT,
  occurrence_count BIGINT,
  affected_users BIGINT,
  affected_pages TEXT[],
  last_seen TIMESTAMPTZ
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    pe.event_name AS error_type,
    COALESCE(pe.event_data->>'message', 'Unknown error')::TEXT AS error_message,
    COUNT(*)::BIGINT AS occurrence_count,
    COUNT(DISTINCT pe.user_id)::BIGINT AS affected_users,
    ARRAY_AGG(DISTINCT pe.page_url)::TEXT[] AS affected_pages,
    MAX(pe.created_at) AS last_seen
  FROM page_events pe
  WHERE pe.event_name IN ('error_js', 'error_api')
    AND pe.created_at >= sd
    AND pe.created_at <= ed
  GROUP BY pe.event_name, pe.event_data->>'message'
  ORDER BY COUNT(*) DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- 3. CONFUSION SIGNALS (Rage Clicks + Dead Clicks)
-- Groups by page + element, returns hotspots
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_confusion_signals(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  signal_type TEXT,
  page TEXT,
  element TEXT,
  occurrence_count BIGINT,
  affected_users BIGINT,
  last_seen TIMESTAMPTZ
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    pe.event_name AS signal_type,
    pe.page_url AS page,
    COALESCE(pe.event_data->>'element', 'unknown')::TEXT AS element,
    COUNT(*)::BIGINT AS occurrence_count,
    COUNT(DISTINCT pe.user_id)::BIGINT AS affected_users,
    MAX(pe.created_at) AS last_seen
  FROM page_events pe
  WHERE pe.event_name IN ('rage_click', 'dead_click')
    AND pe.created_at >= sd
    AND pe.created_at <= ed
  GROUP BY pe.event_name, pe.page_url, pe.event_data->>'element'
  ORDER BY COUNT(*) DESC
  LIMIT 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
