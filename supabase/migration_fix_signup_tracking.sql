-- ═══════════════════════════════════════════════════════════════
-- CONSOLIDATED FIX: Signup Double-Counting & Bogus Events
-- Run this entire file in Supabase SQL Editor (one go)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Fix ensure_user_row RPC ───
-- Old version used ON CONFLICT DO UPDATE which triggers realtime INSERT events
-- for existing users. New version checks existence first.
CREATE OR REPLACE FUNCTION ensure_user_row(
  p_user_id UUID,
  p_email TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    INSERT INTO public.users (id, email)
    VALUES (p_user_id, p_email)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE public.users SET email = p_email WHERE id = p_user_id AND email IS DISTINCT FROM p_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. Delete bogus signup_completed events ───
-- These were inserted by the old code on every page refresh.
-- Only delete events where the user was created more than 5 minutes before the event
-- (i.e., they're clearly not real signups).
DELETE FROM page_events
WHERE event_name = 'signup_completed'
  AND user_id IN (
    SELECT au.id FROM auth.users au
    WHERE au.email = 'garagefitness4@gmail.com'
  )
  AND created_at > (
    SELECT au.created_at + INTERVAL '5 minutes'
    FROM auth.users au
    WHERE au.email = 'garagefitness4@gmail.com'
    LIMIT 1
  );

-- ─── 3. Fix admin_get_active_users to skip auth-noise events ───
-- The "last_event" should show real activity (page_view, idea_viewed, etc.)
-- not signup_completed / login_completed which pollute the Active Now panel.
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
    -- Pick the most recent REAL activity event (skip auth noise)
    COALESCE(
      (array_agg(pe.event_name ORDER BY pe.created_at DESC)
        FILTER (WHERE pe.event_name NOT IN ('signup_completed', 'login_completed'))
      )[1],
      (array_agg(pe.event_name ORDER BY pe.created_at DESC))[1]
    ) AS last_event,
    (array_agg(pe.page_url ORDER BY pe.created_at DESC)
      FILTER (WHERE pe.event_name NOT IN ('signup_completed', 'login_completed'))
    )[1] AS last_page,
    MAX(pe.created_at) AS last_seen,
    COUNT(*)::BIGINT AS event_count
  FROM page_events pe
  LEFT JOIN users u ON u.id = pe.user_id
  WHERE pe.created_at >= NOW() - (minutes_threshold || ' minutes')::INTERVAL
  GROUP BY pe.user_id, u.email
  ORDER BY last_seen DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 4. Fix admin_get_live_events to exclude auth noise ───
-- Don't show signup_completed / login_completed in the Live Activity feed
-- (these are auth-layer events, not real user activity)
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
  SELECT pe.id, pe.event_name, pe.event_data, pe.page_url, pe.session_id, pe.user_id,
    u.email AS user_email, pe.created_at
  FROM page_events pe
  LEFT JOIN users u ON u.id = pe.user_id
  WHERE pe.created_at >= sd AND pe.created_at <= ed
    AND pe.event_name NOT IN ('signup_completed', 'login_completed')
  ORDER BY pe.created_at DESC
  LIMIT event_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- DONE! After running this:
-- 1. Bogus signup_completed events are deleted
-- 2. ensure_user_row no longer triggers false realtime INSERTs
-- 3. Active Now shows real activity, not "Signed up"
-- 4. Live Activity excludes signup/login noise
-- ═══════════════════════════════════════════════════════════════
