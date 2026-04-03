-- ============================================================
-- Migration: Streak + XP + Gamification System
-- Adds DB-persisted streak, XP, levels to users table
-- Creates atomic RPC functions for activity tracking
-- ============================================================

-- 1. Add gamification columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS current_streak INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS longest_streak INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level INT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_challenge_completed_at DATE;

-- 2. record_activity RPC — atomic streak + XP update
CREATE OR REPLACE FUNCTION public.record_activity(
  p_action TEXT,
  p_xp_amount INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_user RECORD;
  v_streak_broken BOOLEAN := FALSE;
  v_new_streak INT;
  v_streak_bonus INT := 0;
  v_total_xp_gained INT;
  v_new_xp INT;
  v_old_level INT;
  v_new_level INT;
  v_level_up BOOLEAN := FALSE;
  v_thresholds INT[] := ARRAY[0, 50, 150, 400, 800, 1500, 3000, 5000, 8000, 12000];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  -- Lock the user row to prevent race conditions
  SELECT current_streak, longest_streak, last_active_date, xp, level
  INTO v_user
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  v_old_level := COALESCE(v_user.level, 0);

  -- === Streak Logic ===
  IF v_user.last_active_date = v_today THEN
    -- Already active today — no streak change, no streak bonus
    v_new_streak := COALESCE(v_user.current_streak, 0);
    v_streak_bonus := 0;
  ELSIF v_user.last_active_date = v_today - 1 THEN
    -- Active yesterday — continue streak
    v_new_streak := COALESCE(v_user.current_streak, 0) + 1;
    v_streak_bonus := 5 * v_new_streak; -- bonus on first activity of day
  ELSIF v_user.last_active_date IS NULL THEN
    -- First ever activity
    v_new_streak := 1;
    v_streak_bonus := 5;
  ELSE
    -- Streak broken
    v_streak_broken := COALESCE(v_user.current_streak, 0) > 0;
    v_new_streak := 1;
    v_streak_bonus := 5;
  END IF;

  -- === XP Logic ===
  v_total_xp_gained := p_xp_amount + v_streak_bonus;
  v_new_xp := COALESCE(v_user.xp, 0) + v_total_xp_gained;

  -- === Level Calculation ===
  v_new_level := 0;
  FOR i IN REVERSE array_upper(v_thresholds, 1)..1 LOOP
    IF v_new_xp >= v_thresholds[i] THEN
      v_new_level := i - 1; -- 0-indexed (level 0 = index 1 = threshold 0)
      EXIT;
    END IF;
  END LOOP;

  v_level_up := v_new_level > v_old_level;

  -- === Update User ===
  UPDATE public.users
  SET
    current_streak = v_new_streak,
    longest_streak = GREATEST(COALESCE(longest_streak, 0), v_new_streak),
    last_active_date = v_today,
    xp = v_new_xp,
    level = v_new_level
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'current_streak', v_new_streak,
    'longest_streak', GREATEST(COALESCE(v_user.longest_streak, 0), v_new_streak),
    'xp', v_new_xp,
    'level', v_new_level,
    'xp_gained', v_total_xp_gained,
    'streak_bonus', v_streak_bonus,
    'streak_broken', v_streak_broken,
    'level_up', v_level_up,
    'old_level', v_old_level
  );
END;
$$;

-- 3. get_gamification_state RPC
CREATE OR REPLACE FUNCTION public.get_gamification_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  SELECT current_streak, longest_streak, last_active_date, xp, level, daily_challenge_completed_at
  INTO v_user
  FROM public.users
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Check if streak is still active (last_active_date is today or yesterday)
  -- If older than yesterday, streak is effectively broken but we don't reset until next activity
  RETURN jsonb_build_object(
    'current_streak', COALESCE(v_user.current_streak, 0),
    'longest_streak', COALESCE(v_user.longest_streak, 0),
    'last_active_date', v_user.last_active_date,
    'xp', COALESCE(v_user.xp, 0),
    'level', COALESCE(v_user.level, 0),
    'daily_challenge_completed_at', v_user.daily_challenge_completed_at,
    'streak_at_risk', (v_user.last_active_date IS NOT NULL AND v_user.last_active_date < CURRENT_DATE AND COALESCE(v_user.current_streak, 0) > 0)
  );
END;
$$;

-- 4. complete_daily_challenge RPC
CREATE OR REPLACE FUNCTION public.complete_daily_challenge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_completed_at DATE;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  SELECT daily_challenge_completed_at INTO v_completed_at
  FROM public.users
  WHERE id = v_user_id;
  -- Guard against double-claim
  IF v_completed_at = v_today THEN
    RETURN jsonb_build_object('already_claimed', true);
  END IF;
  -- Mark as completed
  UPDATE public.users
  SET daily_challenge_completed_at = v_today
  WHERE id = v_user_id;
  -- Grant XP via record_activity
  SELECT public.record_activity('daily_challenge', 50) INTO v_result;
  RETURN jsonb_build_object(
    'claimed', true,
    'activity_result', v_result
  );
END;
$$;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.record_activity(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gamification_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_challenge() TO authenticated;

-- 6. Backfill: Calculate XP from historical user_interactions
DO $$
DECLARE
  r RECORD;
  v_xp INT;
  v_level INT;
  v_thresholds INT[] := ARRAY[0, 50, 150, 400, 800, 1500, 3000, 5000, 8000, 12000];
  v_dates TEXT[];
  v_streak INT;
  v_today_str TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_expected DATE;
BEGIN
  FOR r IN
    SELECT
      u.id AS user_id,
      COALESCE(SUM(CASE WHEN ui.action = 'viewed' THEN 5 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN ui.action = 'saved' THEN 10 ELSE 0 END), 0) +
      COALESCE(SUM(CASE WHEN ui.action = 'shared' THEN 20 ELSE 0 END), 0) AS total_xp,
      ARRAY(
        SELECT DISTINCT to_char(ui2.created_at::date, 'YYYY-MM-DD')
        FROM public.user_interactions ui2
        WHERE ui2.user_id = u.id
        ORDER BY 1 DESC
      ) AS active_dates
    FROM public.users u
    LEFT JOIN public.user_interactions ui ON ui.user_id = u.id
    GROUP BY u.id
  LOOP
    v_xp := r.total_xp;

    -- Calculate level
    v_level := 0;
    FOR i IN REVERSE array_upper(v_thresholds, 1)..1 LOOP
      IF v_xp >= v_thresholds[i] THEN
        v_level := i - 1;
        EXIT;
      END IF;
    END LOOP;

    -- Calculate current streak from active_dates
    v_streak := 0;
    IF array_length(r.active_dates, 1) IS NOT NULL THEN
      FOR i IN 1..array_length(r.active_dates, 1) LOOP
        v_expected := CURRENT_DATE - (i - 1);
        IF r.active_dates[i] = to_char(v_expected, 'YYYY-MM-DD') THEN
          v_streak := v_streak + 1;
        ELSE
          EXIT;
        END IF;
      END LOOP;
    END IF;

    UPDATE public.users
    SET
      xp = v_xp,
      level = v_level,
      current_streak = v_streak,
      longest_streak = v_streak,
      last_active_date = CASE
        WHEN array_length(r.active_dates, 1) > 0 THEN r.active_dates[1]::date
        ELSE NULL
      END
    WHERE id = r.user_id;
  END LOOP;
END;
$$;
