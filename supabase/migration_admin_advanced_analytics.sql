-- ============================================================
-- Advanced Admin Analytics RPCs
-- Run in Supabase SQL Editor
-- ============================================================

-- ─── 1. Engagement Leaderboard ────────────────────────────

CREATE OR REPLACE FUNCTION admin_get_engagement_leaderboard(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL,
  result_limit INTEGER DEFAULT 100
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, NOW() - INTERVAL '30 days');
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_agg(row_data ORDER BY eng_score DESC)
  INTO result
  FROM (
    SELECT json_build_object(
      'user_id', u.id,
      'email', u.email,
      'display_name', u.display_name,
      'created_at', u.created_at,
      'subscription_status', u.subscription_status,
      'trial_ends_at', u.trial_ends_at,
      'current_streak', COALESCE(u.current_streak, 0),
      'xp', COALESCE(u.xp, 0),
      'level', COALESCE(u.level, 0),
      'total_views', COALESCE(v.cnt, 0),
      'total_saves', COALESCE(s.cnt, 0),
      'total_shares', COALESCE(sh.cnt, 0),
      'sessions_count', COALESCE(sess.cnt, 0),
      'last_active', la.last_seen,
      'validations_used', COALESCE(val.cnt, 0),
      'engagement_score', (
        COALESCE(v.cnt,0)*1 + COALESCE(s.cnt,0)*5
        + COALESCE(sh.cnt,0)*10 + COALESCE(val.cnt,0)*15
      )
    ) AS row_data,
    (
      COALESCE(v.cnt,0)*1 + COALESCE(s.cnt,0)*5
      + COALESCE(sh.cnt,0)*10 + COALESCE(val.cnt,0)*15
    ) AS eng_score
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM user_interactions
      WHERE action='viewed' AND created_at >= sd AND created_at <= ed
      GROUP BY user_id
    ) v ON v.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM user_interactions
      WHERE action='saved' AND created_at >= sd AND created_at <= ed
      GROUP BY user_id
    ) s ON s.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM user_interactions
      WHERE action='shared' AND created_at >= sd AND created_at <= ed
      GROUP BY user_id
    ) sh ON sh.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT session_id) AS cnt FROM page_events
      WHERE created_at >= sd AND created_at <= ed AND user_id IS NOT NULL
      GROUP BY user_id
    ) sess ON sess.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MAX(created_at) AS last_seen FROM page_events
      WHERE user_id IS NOT NULL GROUP BY user_id
    ) la ON la.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM page_events
      WHERE event_name='validation_completed' AND created_at >= sd AND created_at <= ed AND user_id IS NOT NULL
      GROUP BY user_id
    ) val ON val.user_id = u.id
    ORDER BY eng_score DESC
    LIMIT result_limit
  ) sub;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. DAU / WAU Chart ──────────────────────────────────

CREATE OR REPLACE FUNCTION admin_get_dau_chart(
  num_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  WITH daily AS (
    SELECT
      DATE(created_at) AS day,
      COUNT(DISTINCT user_id) AS dau
    FROM page_events
    WHERE user_id IS NOT NULL
      AND created_at >= NOW() - (num_days || ' days')::interval
    GROUP BY DATE(created_at)
  ),
  with_wau AS (
    SELECT
      d.day,
      d.dau,
      (
        SELECT COUNT(DISTINCT pe.user_id)
        FROM page_events pe
        WHERE pe.user_id IS NOT NULL
          AND pe.created_at >= (d.day - INTERVAL '6 days')
          AND pe.created_at < (d.day + INTERVAL '1 day')
      ) AS wau
    FROM daily d
  )
  SELECT json_agg(
    json_build_object('day', w.day, 'dau', w.dau, 'wau', w.wau)
    ORDER BY w.day ASC
  )
  INTO result
  FROM with_wau w;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. Activity Heatmap ─────────────────────────────────

CREATE OR REPLACE FUNCTION admin_get_activity_heatmap(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, NOW() - INTERVAL '30 days');
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_agg(
    json_build_object(
      'day_of_week', dow,
      'hour_of_day', hod,
      'event_count', cnt
    )
  )
  INTO result
  FROM (
    SELECT
      EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int AS dow,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hod,
      COUNT(*)::int AS cnt
    FROM page_events
    WHERE created_at >= sd AND created_at <= ed
    GROUP BY dow, hod
    ORDER BY dow, hod
  ) sub;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. Retention Cohort Matrix ──────────────────────────

CREATE OR REPLACE FUNCTION admin_get_retention_cohorts(
  num_weeks INTEGER DEFAULT 8
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  WITH cohorts AS (
    SELECT
      id AS user_id,
      date_trunc('week', created_at)::date AS cohort_week
    FROM users
    WHERE created_at >= NOW() - (num_weeks || ' weeks')::interval
  ),
  activity AS (
    SELECT DISTINCT
      user_id,
      date_trunc('week', created_at)::date AS active_week
    FROM page_events
    WHERE user_id IS NOT NULL
      AND created_at >= NOW() - (num_weeks || ' weeks')::interval
  ),
  cohort_sizes AS (
    SELECT cohort_week, COUNT(*) AS cohort_size
    FROM cohorts
    GROUP BY cohort_week
  ),
  retention_data AS (
    SELECT
      c.cohort_week,
      (EXTRACT(DAYS FROM (a.active_week - c.cohort_week))::int / 7) AS week_number,
      COUNT(DISTINCT c.user_id) AS active_users
    FROM cohorts c
    INNER JOIN activity a ON a.user_id = c.user_id
    WHERE a.active_week >= c.cohort_week
    GROUP BY c.cohort_week, week_number
  )
  SELECT json_agg(
    json_build_object(
      'cohort_week', cs.cohort_week,
      'cohort_size', cs.cohort_size,
      'retention', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'week_number', rd.week_number,
            'active_users', rd.active_users,
            'retention_pct', ROUND((rd.active_users::numeric / cs.cohort_size) * 100, 1)
          )
          ORDER BY rd.week_number
        ), '[]'::json)
        FROM retention_data rd
        WHERE rd.cohort_week = cs.cohort_week
          AND rd.week_number >= 0
          AND rd.week_number <= num_weeks
      )
    )
    ORDER BY cs.cohort_week DESC
  )
  INTO result
  FROM cohort_sizes cs;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. Conversion Signals ───────────────────────────────

CREATE OR REPLACE FUNCTION admin_get_conversion_signals(
  start_date TIMESTAMPTZ DEFAULT NULL,
  end_date TIMESTAMPTZ DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  sd TIMESTAMPTZ := COALESCE(start_date, NOW() - INTERVAL '30 days');
  ed TIMESTAMPTZ := COALESCE(end_date, NOW());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT json_agg(row_data ORDER BY conv_score DESC)
  INTO result
  FROM (
    SELECT json_build_object(
      'user_id', u.id,
      'email', u.email,
      'display_name', u.display_name,
      'subscription_status', u.subscription_status,
      'trial_ends_at', u.trial_ends_at,
      'created_at', u.created_at,
      'current_streak', COALESCE(u.current_streak, 0),
      'saves_count', COALESCE(sv.cnt, 0),
      'validations_count', COALESCE(val.cnt, 0),
      'blueprints_count', COALESCE(bp.cnt, 0),
      'ideas_viewed', COALESCE(vw.cnt, 0),
      'active_days', COALESCE(ad.day_count, 0),
      'features_used', COALESCE(ft.list, '[]'::json),
      'conversion_score', (
        COALESCE(sv.cnt,0)*8 + COALESCE(val.cnt,0)*12
        + COALESCE(bp.cnt,0)*15 + COALESCE(ad.day_count,0)*5
        + LEAST(COALESCE(vw.cnt,0),20)*2 + COALESCE(u.current_streak,0)*3
      ),
      'is_hot_lead', CASE WHEN (
        COALESCE(sv.cnt,0)*8 + COALESCE(val.cnt,0)*12
        + COALESCE(bp.cnt,0)*15 + COALESCE(ad.day_count,0)*5
        + LEAST(COALESCE(vw.cnt,0),20)*2 + COALESCE(u.current_streak,0)*3
      ) >= 50 THEN true ELSE false END
    ) AS row_data,
    (
      COALESCE(sv.cnt,0)*8 + COALESCE(val.cnt,0)*12
      + COALESCE(bp.cnt,0)*15 + COALESCE(ad.day_count,0)*5
      + LEAST(COALESCE(vw.cnt,0),20)*2 + COALESCE(u.current_streak,0)*3
    ) AS conv_score
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM user_interactions
      WHERE action='saved' AND created_at >= sd AND created_at <= ed
      GROUP BY user_id
    ) sv ON sv.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM page_events
      WHERE event_name='validation_completed' AND created_at >= sd AND created_at <= ed AND user_id IS NOT NULL
      GROUP BY user_id
    ) val ON val.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM page_events
      WHERE event_name='blueprint_viewed' AND created_at >= sd AND created_at <= ed AND user_id IS NOT NULL
      GROUP BY user_id
    ) bp ON bp.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS cnt FROM user_interactions
      WHERE action='viewed' AND created_at >= sd AND created_at <= ed
      GROUP BY user_id
    ) vw ON vw.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(DISTINCT DATE(created_at)) AS day_count FROM page_events
      WHERE created_at >= sd AND created_at <= ed AND user_id IS NOT NULL
      GROUP BY user_id
    ) ad ON ad.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT json_agg(DISTINCT feature) AS list
      FROM usage_tracking
      WHERE user_id = u.id AND used_at >= sd::date AND used_at <= ed::date
    ) ft ON true
    WHERE u.subscription_status IS DISTINCT FROM 'pro'
      AND u.subscription_status IS DISTINCT FROM 'paid'
    ORDER BY conv_score DESC
    LIMIT result_limit
  ) sub;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Grant execute permissions ───────────────────────────

GRANT EXECUTE ON FUNCTION admin_get_engagement_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_dau_chart(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_activity_heatmap(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_retention_cohorts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_conversion_signals(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

SELECT 'Advanced analytics migration complete.' AS status;
