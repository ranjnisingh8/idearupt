-- ============================================
-- HARDEN: Usage tracking functions with auth.uid() checks
-- Prevents users from querying/modifying other users' usage
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Hardened get_daily_usage: only return caller's own data
CREATE OR REPLACE FUNCTION get_daily_usage(check_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Ensure caller can only access their own usage
  IF check_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: cannot query another user''s usage';
  END IF;

  SELECT json_object_agg(feature, count)
  INTO result
  FROM usage_tracking
  WHERE user_id = check_user_id
  AND used_at = CURRENT_DATE;

  RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Hardened increment_usage: only increment caller's own usage
CREATE OR REPLACE FUNCTION increment_usage(
  inc_user_id UUID,
  inc_feature TEXT
)
RETURNS VOID AS $$
DECLARE
  allowed_features TEXT[] := ARRAY[
    'validation', 'blueprint', 'competitors', 'signals',
    'use_cases', 'dna_match', 'remix', 'revenue'
  ];
BEGIN
  -- Ensure caller can only increment their own usage
  IF inc_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: cannot modify another user''s usage';
  END IF;

  -- Validate feature name against allowed list
  IF NOT (inc_feature = ANY(allowed_features)) THEN
    RAISE EXCEPTION 'Invalid feature: %', inc_feature;
  END IF;

  INSERT INTO usage_tracking (user_id, feature, used_at, count)
  VALUES (inc_user_id, inc_feature, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature, used_at)
  DO UPDATE SET count = usage_tracking.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Hardened check_daily_usage: only check caller's own usage
CREATE OR REPLACE FUNCTION check_daily_usage(
  check_user_id UUID,
  check_feature TEXT,
  daily_limit INTEGER
)
RETURNS JSON AS $$
DECLARE
  current_count INTEGER;
  can_use BOOLEAN;
BEGIN
  -- Ensure caller can only check their own usage
  IF check_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: cannot check another user''s usage';
  END IF;

  SELECT COALESCE(SUM(count), 0) INTO current_count
  FROM usage_tracking
  WHERE user_id = check_user_id
  AND feature = check_feature
  AND used_at = CURRENT_DATE;

  can_use := current_count < daily_limit;

  RETURN json_build_object(
    'can_use', can_use,
    'used_today', current_count,
    'daily_limit', daily_limit,
    'remaining', GREATEST(0, daily_limit - current_count)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
