-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Admin Analytics Dashboard — RPC Functions + RLS + Realtime
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── Admin email list (must match src/lib/config.ts ADMIN_EMAILS) ───
-- Used in SECURITY DEFINER functions for defense-in-depth

-- ═══════════════════════════════════════════════════════════════
-- 1. TODAY'S AGGREGATE STATS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_today_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
  today_start TIMESTAMPTZ := date_trunc('day', NOW());
  total_u INTEGER;
  completed_u INTEGER;
BEGIN
  -- Verify admin access
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
    'page_views',         (SELECT COUNT(*) FROM page_events WHERE event_name = 'page_view' AND created_at >= today_start),
    'unique_sessions',    (SELECT COUNT(DISTINCT session_id) FROM page_events WHERE created_at >= today_start),
    'unique_users',       (SELECT COUNT(DISTINCT user_id) FROM page_events WHERE created_at >= today_start AND user_id IS NOT NULL),
    'signups_today',      (SELECT COUNT(*) FROM users WHERE created_at >= today_start),
    'saves_today',        (SELECT COUNT(*) FROM user_interactions WHERE action = 'saved' AND created_at >= today_start),
    'views_today',        (SELECT COUNT(*) FROM user_interactions WHERE action = 'viewed' AND created_at >= today_start),
    'validations_today',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'validation_completed' AND created_at >= today_start),
    'blueprints_today',   (SELECT COUNT(*) FROM page_events WHERE event_name = 'blueprint_viewed' AND created_at >= today_start),
    'competitors_today',  (SELECT COALESCE(SUM(count), 0) FROM usage_tracking WHERE feature = 'competitors' AND used_at = CURRENT_DATE),
    'waitlist_today',     (SELECT COUNT(*) FROM pro_waitlist WHERE created_at >= today_start),
    'total_users',        total_u,
    'total_ideas',        (SELECT COUNT(*) FROM ideas),
    'total_signals',      (SELECT COUNT(*) FROM pain_signals),
    'total_use_cases',    (SELECT COUNT(*) FROM use_cases WHERE status = 'active'),
    'total_waitlist',     (SELECT COUNT(*) FROM pro_waitlist),
    'onboarding_completed', completed_u,
    'onboarding_rate',    CASE WHEN total_u > 0 THEN ROUND((completed_u::numeric / total_u) * 100, 1) ELSE 0 END,
    'avg_idea_score',     (SELECT ROUND(AVG(overall_score)::numeric, 1) FROM ideas WHERE overall_score > 0),
    'trending_ideas',     (SELECT COUNT(*) FROM ideas WHERE is_trending = TRUE)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 2. LIVE EVENTS FEED
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_live_events(
  event_limit INTEGER DEFAULT 50
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
  ORDER BY pe.created_at DESC
  LIMIT event_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 3. TOP IDEAS TODAY (by engagement)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_top_ideas_today(
  result_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  overall_score NUMERIC,
  views_today BIGINT,
  saves_today BIGINT
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
    i.id,
    i.title,
    i.category,
    i.overall_score,
    COUNT(*) FILTER (WHERE ui.action = 'viewed') AS views_today,
    COUNT(*) FILTER (WHERE ui.action = 'saved') AS saves_today
  FROM user_interactions ui
  JOIN ideas i ON i.id = ui.idea_id
  WHERE ui.created_at >= date_trunc('day', NOW())
  GROUP BY i.id, i.title, i.category, i.overall_score
  ORDER BY COUNT(*) DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 4. RECENT SIGNUPS
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_recent_signups(
  result_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ
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
  SELECT u.id, u.email, u.display_name, u.onboarding_completed, u.created_at
  FROM users u
  ORDER BY u.created_at DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 5. FEATURE USAGE BREAKDOWN
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_feature_usage()
RETURNS TABLE (
  feature TEXT,
  total_uses BIGINT,
  unique_users BIGINT
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
    ut.feature,
    SUM(ut.count)::BIGINT AS total_uses,
    COUNT(DISTINCT ut.user_id)::BIGINT AS unique_users
  FROM usage_tracking ut
  WHERE ut.used_at = CURRENT_DATE
  GROUP BY ut.feature
  ORDER BY total_uses DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 6. ENGAGEMENT FUNNEL
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_get_engagement_funnel()
RETURNS JSON AS $$
DECLARE
  result JSON;
  today_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_build_object(
    'landing_visitors',      (SELECT COUNT(DISTINCT session_id) FROM page_events WHERE page_url = '/' AND created_at >= today_start),
    'signups',               (SELECT COUNT(*) FROM users WHERE created_at >= today_start),
    'onboarding_completed',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'quiz_completed' AND created_at >= today_start),
    'first_actions',         (SELECT COUNT(DISTINCT user_id) FROM user_interactions WHERE created_at >= today_start),
    'cta_hero_clicks',       (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_hero_click' AND created_at >= today_start),
    'cta_explore_clicks',    (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_explore_problems' AND created_at >= today_start),
    'cta_validate_clicks',   (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_validate_idea' AND created_at >= today_start),
    'cta_get_started_clicks',(SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_get_started' AND created_at >= today_start),
    'cta_claim_pro_clicks',  (SELECT COUNT(*) FROM page_events WHERE event_name = 'cta_claim_pro' AND created_at >= today_start),
    'waitlist_from_pricing',  (SELECT COUNT(*) FROM pro_waitlist WHERE source = 'pricing_page' AND created_at >= today_start),
    'waitlist_from_limit',    (SELECT COUNT(*) FROM pro_waitlist WHERE source LIKE 'limit_%' AND created_at >= today_start),
    'waitlist_from_banner',   (SELECT COUNT(*) FROM pro_waitlist WHERE source = 'waitlist_banner' AND created_at >= today_start)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- ADMIN RLS POLICIES
-- Allow admin email to read all rows (needed for realtime + direct queries)
-- ═══════════════════════════════════════════════════════════════

-- page_events: Admin can read all events
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all events" ON page_events;
  CREATE POLICY "Admin can read all events" ON page_events
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN ('garagefitness4@gmail.com')
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- user_interactions: Admin can read all interactions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all interactions" ON user_interactions;
  CREATE POLICY "Admin can read all interactions" ON user_interactions
    FOR SELECT USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN ('garagefitness4@gmail.com')
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- users: Admin can read all users
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all users" ON users;
  CREATE POLICY "Admin can read all users" ON users
    FOR SELECT USING (
      auth.uid() = id
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN ('garagefitness4@gmail.com')
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- usage_tracking: Admin can read all usage
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all usage" ON usage_tracking;
  CREATE POLICY "Admin can read all usage" ON usage_tracking
    FOR SELECT USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN ('garagefitness4@gmail.com')
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- builder_dna: Admin can read all DNA
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all DNA" ON builder_dna;
  CREATE POLICY "Admin can read all DNA" ON builder_dna
    FOR SELECT USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN ('garagefitness4@gmail.com')
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- pro_waitlist: Admin can read all waitlist entries
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin can read all waitlist" ON pro_waitlist;
  CREATE POLICY "Admin can read all waitlist" ON pro_waitlist
    FOR SELECT USING (
      TRUE  -- Already public in most setups, but ensure admin access
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- REALTIME PUBLICATION
-- Enable realtime on tables needed for live admin feed
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE page_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_interactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pro_waitlist;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- DONE! Verify with:
-- SELECT admin_get_today_stats();
-- SELECT * FROM admin_get_live_events(10);
-- SELECT * FROM admin_get_top_ideas_today(5);
-- SELECT * FROM admin_get_recent_signups(5);
-- SELECT * FROM admin_get_feature_usage();
-- SELECT admin_get_engagement_funnel();
-- ═══════════════════════════════════════════════════════════════
