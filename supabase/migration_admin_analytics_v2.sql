-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Admin Analytics V2 — Date Range Support + New Functions
-- Run this in Supabase SQL Editor (replaces v1 functions)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. AGGREGATE STATS (with date range)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_today_stats(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
  total_u INTEGER;
  completed_u INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COUNT(*) INTO total_u FROM users;
  SELECT COUNT(*) INTO completed_u FROM users WHERE onboarding_completed = TRUE;

  SELECT json_build_object(
    'page_views',         (SELECT COUNT(*) FROM page_events WHERE event_name = 'page_view' AND created_at >= sd AND created_at <= ed),
    'unique_sessions',    (SELECT COUNT(DISTINCT session_id) FROM page_events WHERE created_at >= sd AND created_at <= ed),
    'unique_users',       (SELECT COUNT(DISTINCT user_id) FROM page_events WHERE created_at >= sd AND created_at <= ed AND user_id IS NOT NULL),
    'signups_today',      (SELECT COUNT(*) FROM users WHERE created_at >= sd AND created_at <= ed),
    'saves_today',        (SELECT COUNT(*) FROM user_interactions WHERE action = 'saved' AND created_at >= sd AND created_at <= ed),
    'views_today',        (SELECT COUNT(*) FROM user_interactions WHERE action = 'viewed' AND created_at >= sd AND created_at <= ed),
    'validations_today',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'validation_completed' AND created_at >= sd AND created_at <= ed),
    'blueprints_today',   (SELECT COUNT(*) FROM page_events WHERE event_name = 'blueprint_viewed' AND created_at >= sd AND created_at <= ed),
    'competitors_today',  (SELECT COALESCE(SUM(count), 0) FROM usage_tracking WHERE feature = 'competitors' AND used_at >= sd::date AND used_at <= ed::date),
    'waitlist_today',     (SELECT COUNT(*) FROM pro_waitlist WHERE created_at >= sd AND created_at <= ed),
    'total_users',        total_u,
    'total_ideas',        (SELECT COUNT(*) FROM ideas),
    'total_signals',      (SELECT COUNT(*) FROM pain_signals),
    'total_use_cases',    (SELECT COUNT(*) FROM use_cases WHERE status = 'active'),
    'total_waitlist',     (SELECT COUNT(*) FROM pro_waitlist),
    'onboarding_completed', completed_u,
    'onboarding_rate',    CASE WHEN total_u > 0 THEN ROUND((completed_u::numeric / total_u) * 100, 1) ELSE 0 END,
    'avg_idea_score',     (SELECT ROUND(AVG(overall_score)::numeric, 1) FROM ideas WHERE overall_score > 0),
    'trending_ideas',     (SELECT COUNT(*) FROM ideas WHERE is_trending = TRUE),

    -- Pipeline health stats
    'ideas_scraped_today',     (SELECT COUNT(*) FROM ideas WHERE created_at >= sd AND created_at <= ed),
    'signals_scraped_today',   (SELECT COUNT(*) FROM pain_signals WHERE discovered_at >= sd AND discovered_at <= ed),
    'use_cases_generated_today', (SELECT COUNT(*) FROM use_cases WHERE created_at >= sd AND created_at <= ed),
    'ideas_by_source_today',   (
      SELECT COALESCE(json_object_agg(source_type, cnt), '{}'::json)
      FROM (
        SELECT source_type, COUNT(*) AS cnt
        FROM ideas
        WHERE created_at >= sd AND created_at <= ed AND source_type IS NOT NULL
        GROUP BY source_type
      ) src
    ),
    'avg_score_today',   (SELECT ROUND(AVG(overall_score)::numeric, 1) FROM ideas WHERE created_at >= sd AND created_at <= ed AND overall_score > 0),
    'tiers_today', (
      SELECT COALESCE(json_object_agg(tier, cnt), '{}'::json)
      FROM (
        SELECT tier, COUNT(*) AS cnt
        FROM ideas
        WHERE created_at >= sd AND created_at <= ed AND tier IS NOT NULL
        GROUP BY tier
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 2. LIVE EVENTS FEED (with date range)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_live_events(
  event_limit INTEGER DEFAULT 50,
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_name TEXT,
  event_data JSONB,
  page_url TEXT,
  session_id TEXT,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    pe.id,
    pe.event_name,
    pe.event_data,
    pe.page_url,
    pe.session_id,
    pe.user_id,
    u.email AS user_email,
    pe.created_at
  FROM page_events pe
  LEFT JOIN users u ON u.id = pe.user_id
  WHERE pe.created_at >= sd AND pe.created_at <= ed
  ORDER BY pe.created_at DESC
  LIMIT event_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 3. TOP IDEAS (with date range)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_top_ideas_today(
  result_limit INTEGER DEFAULT 10,
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  overall_score NUMERIC,
  views_today BIGINT,
  saves_today BIGINT
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.title,
    i.category,
    i.overall_score,
    COUNT(*) FILTER (WHERE ui.action = 'viewed') AS views_today,
    COUNT(*) FILTER (WHERE ui.action = 'saved') AS saves_today
  FROM user_interactions ui
  JOIN ideas i ON i.id = ui.idea_id
  WHERE ui.created_at >= sd AND ui.created_at <= ed
  GROUP BY i.id, i.title, i.category, i.overall_score
  ORDER BY COUNT(*) DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 4. RECENT SIGNUPS (with date range — BUG FIX: was missing date filter)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_recent_signups(
  result_limit INTEGER DEFAULT 20,
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, u.display_name, u.onboarding_completed, u.created_at
  FROM users u
  WHERE u.created_at >= sd AND u.created_at <= ed
  ORDER BY u.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 5. FEATURE USAGE (with date range)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_feature_usage(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  feature TEXT,
  total_uses BIGINT,
  unique_users BIGINT
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    ut.feature,
    SUM(ut.count)::BIGINT AS total_uses,
    COUNT(DISTINCT ut.user_id)::BIGINT AS unique_users
  FROM usage_tracking ut
  WHERE ut.used_at >= sd::date AND ut.used_at <= ed::date
  GROUP BY ut.feature
  ORDER BY total_uses DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 6. ENGAGEMENT FUNNEL (with date range)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_engagement_funnel(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_build_object(
    'landing_visitors',      (SELECT COUNT(DISTINCT session_id) FROM page_events WHERE page_url = '/' AND created_at >= sd AND created_at <= ed),
    'signups',               (SELECT COUNT(*) FROM users WHERE created_at >= sd AND created_at <= ed),
    'onboarding_completed',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'quiz_completed' AND created_at >= sd AND created_at <= ed),
    'first_actions',         (SELECT COUNT(DISTINCT user_id) FROM user_interactions WHERE created_at >= sd AND created_at <= ed),
    'cta_hero_clicks',       (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_hero_click' AND created_at >= sd AND created_at <= ed),
    'cta_explore_clicks',    (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_explore_problems' AND created_at >= sd AND created_at <= ed),
    'cta_validate_clicks',   (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_validate_idea' AND created_at >= sd AND created_at <= ed),
    'cta_get_started_clicks',(SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_get_started' AND created_at >= sd AND created_at <= ed),
    'cta_claim_pro_clicks',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_claim_pro' AND created_at >= sd AND created_at <= ed),
    'waitlist_from_pricing',  (SELECT COUNT(*) FROM pro_waitlist WHERE source = 'pricing_page' AND created_at >= sd AND created_at <= ed),
    'waitlist_from_limit',    (SELECT COUNT(*) FROM pro_waitlist WHERE source LIKE 'limit_%' AND created_at >= sd AND created_at <= ed),
    'waitlist_from_banner',   (SELECT COUNT(*) FROM pro_waitlist WHERE source = 'waitlist_banner' AND created_at >= sd AND created_at <= ed)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 7. NEW: HOURLY BREAKDOWN (for activity chart)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_hourly_breakdown(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  hour_bucket TIMESTAMPTZ,
  event_count BIGINT,
  unique_users BIGINT,
  unique_sessions BIGINT
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()));
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('hour', pe.created_at) AS hour_bucket,
    COUNT(*)::BIGINT AS event_count,
    COUNT(DISTINCT pe.user_id)::BIGINT AS unique_users,
    COUNT(DISTINCT pe.session_id)::BIGINT AS unique_sessions
  FROM page_events pe
  WHERE pe.created_at >= sd AND pe.created_at <= ed
  GROUP BY date_trunc('hour', pe.created_at)
  ORDER BY hour_bucket ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 8. NEW: ACTIVE USERS (currently online)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_active_users(
  minutes_threshold INTEGER DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  last_event TEXT,
  last_page TEXT,
  last_seen TIMESTAMPTZ,
  event_count BIGINT
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT
    pe.user_id,
    u.email AS user_email,
    (array_agg(pe.event_name ORDER BY pe.created_at DESC))[1] AS last_event,
    (array_agg(pe.page_url ORDER BY pe.created_at DESC))[1] AS last_page,
    MAX(pe.created_at) AS last_seen,
    COUNT(*)::BIGINT AS event_count
  FROM page_events pe
  LEFT JOIN users u ON u.id = pe.user_id
  WHERE pe.created_at >= NOW() - (minutes_threshold || ' minutes')::INTERVAL
  GROUP BY pe.user_id, u.email
  ORDER BY last_seen DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 9. NEW: USER JOURNEY (event timeline for a specific user)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_user_journey(
  target_user_id UUID,
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_name TEXT,
  event_data JSONB,
  page_url TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  sd TIMESTAMPTZ := COALESCE(start_date, date_trunc('day', NOW()) - INTERVAL '7 days');
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT pe.id, pe.event_name, pe.event_data, pe.page_url, pe.session_id, pe.created_at
  FROM page_events pe
  WHERE pe.user_id = target_user_id
    AND pe.created_at >= sd AND pe.created_at <= ed
  ORDER BY pe.created_at DESC
  LIMIT 200;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- DONE! Run the v1 migration first if you haven't already (for RLS policies + realtime).
-- Then run this file to upgrade all functions with date range support.
--
-- Verify:
-- SELECT admin_get_today_stats();  -- defaults to today
-- SELECT admin_get_today_stats('2025-01-01'::timestamptz, '2025-01-31'::timestamptz);
-- SELECT * FROM admin_get_hourly_breakdown();
-- SELECT * FROM admin_get_active_users(5);
-- SELECT * FROM admin_get_user_journey('some-user-uuid');
-- ═══════════════════════════════════════════════════════════════
