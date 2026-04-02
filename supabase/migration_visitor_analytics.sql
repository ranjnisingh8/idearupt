-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Visitor Source Analytics RPCs
-- Parses page_events referrer data into actionable traffic source breakdown
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Visitor Sources (from page_events referrer data) ─────
-- Aggregates page_view events by parsed referrer domain
CREATE OR REPLACE FUNCTION admin_get_visitor_sources(
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
      source,
      total_visits,
      unique_sessions,
      unique_users,
      ROUND(unique_users::numeric / NULLIF(unique_sessions, 0)::numeric * 100, 1) AS auth_rate
    FROM (
      SELECT
        CASE
          WHEN ref_domain = '' OR ref_domain IS NULL THEN 'direct'
          WHEN ref_domain LIKE '%google.%' OR ref_domain LIKE '%googleapis.%' THEN 'google'
          WHEN ref_domain LIKE '%bing.%' THEN 'bing'
          WHEN ref_domain LIKE '%yahoo.%' THEN 'yahoo'
          WHEN ref_domain LIKE '%duckduckgo.%' THEN 'duckduckgo'
          WHEN ref_domain LIKE '%reddit.%' OR ref_domain LIKE '%redd.it%' THEN 'reddit'
          WHEN ref_domain LIKE '%twitter.%' OR ref_domain LIKE '%t.co%' OR ref_domain LIKE '%x.com%' THEN 'twitter / x'
          WHEN ref_domain LIKE '%facebook.%' OR ref_domain LIKE '%fb.%' OR ref_domain LIKE '%fbcdn.%' THEN 'facebook'
          WHEN ref_domain LIKE '%linkedin.%' OR ref_domain LIKE '%lnkd.in%' THEN 'linkedin'
          WHEN ref_domain LIKE '%youtube.%' OR ref_domain LIKE '%youtu.be%' THEN 'youtube'
          WHEN ref_domain LIKE '%producthunt.%' THEN 'producthunt'
          WHEN ref_domain LIKE '%news.ycombinator.%' THEN 'hackernews'
          WHEN ref_domain LIKE '%github.%' THEN 'github'
          WHEN ref_domain LIKE '%instagram.%' THEN 'instagram'
          WHEN ref_domain LIKE '%tiktok.%' THEN 'tiktok'
          WHEN ref_domain LIKE '%pinterest.%' THEN 'pinterest'
          WHEN ref_domain LIKE '%idearupt.%' OR ref_domain LIKE '%localhost%' THEN 'internal'
          ELSE ref_domain
        END AS source,
        COUNT(*) AS total_visits,
        COUNT(DISTINCT session_id) AS unique_sessions,
        COUNT(DISTINCT user_id) AS unique_users
      FROM (
        SELECT
          session_id,
          user_id,
          -- Extract domain from referrer URL
          CASE
            WHEN event_data->>'referrer' IS NULL OR event_data->>'referrer' = '' THEN ''
            ELSE lower(
              regexp_replace(
                regexp_replace(event_data->>'referrer', '^https?://', ''),
                '/.*$', ''
              )
            )
          END AS ref_domain
        FROM page_events
        WHERE event_name = 'page_view'
          AND created_at >= start_date
          AND created_at <= end_date
      ) parsed
      GROUP BY 1
    ) grouped
    WHERE source != 'internal'
    ORDER BY total_visits DESC
    LIMIT 20
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Visitor Traffic Over Time (daily) ────────────────────
-- Returns daily unique visitor counts, split by source type
CREATE OR REPLACE FUNCTION admin_get_visitor_traffic(
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
      day::date AS day,
      total_events,
      unique_sessions,
      unique_users,
      page_views
    FROM (
      SELECT
        DATE(created_at) AS day,
        COUNT(*) AS total_events,
        COUNT(DISTINCT session_id) AS unique_sessions,
        COUNT(DISTINCT user_id) AS unique_users,
        COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views
      FROM page_events
      WHERE created_at >= start_date AND created_at <= end_date
      GROUP BY DATE(created_at)
    ) daily
    ORDER BY day DESC
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. Top Pages by Views ──────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_top_pages(
  start_date TIMESTAMPTZ DEFAULT (now() - interval '7 days'),
  end_date TIMESTAMPTZ DEFAULT now(),
  result_limit INTEGER DEFAULT 20
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
      page_url,
      COUNT(*) AS views,
      COUNT(DISTINCT session_id) AS unique_sessions,
      COUNT(DISTINCT user_id) AS unique_users
    FROM page_events
    WHERE event_name = 'page_view'
      AND created_at >= start_date
      AND created_at <= end_date
      AND page_url IS NOT NULL
    GROUP BY page_url
    ORDER BY views DESC
    LIMIT result_limit
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. Grant execute permissions ────────────────────────────
GRANT EXECUTE ON FUNCTION admin_get_visitor_sources TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_visitor_traffic TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_top_pages TO authenticated;
