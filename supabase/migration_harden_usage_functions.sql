-- ============================================
-- HARDEN: Usage tracking functions with auth.uid() checks
-- Prevents users from querying/modifying other users' usage
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Hardened get_daily_usage: only return caller's own data
CREATE OR REPLACE FUNCTION get_daily_usage()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  result JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT json_object_agg(feature, count)
  INTO result
  FROM usage_tracking
  WHERE user_id = v_user_id
  AND used_at = CURRENT_DATE;
  RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Hardened increment_usage: only increment caller's own usage
CREATE OR REPLACE FUNCTION increment_usage(
  inc_feature TEXT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_allowed_features TEXT[] := ARRAY[
    'validation', 'blueprint', 'competitors', 'signals',
    'use_cases', 'dna_match', 'remix', 'revenue'
  ];
  v_req_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT (inc_feature = ANY(v_allowed_features)) THEN
    RAISE EXCEPTION 'Invalid feature: %', inc_feature;
  END IF;
  -- Rate limit: max 100 increments per minute
  SELECT COUNT(*) INTO v_req_count
  FROM request_logs
  WHERE user_id = v_user_id
    AND action = 'increment_usage'
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_req_count > 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
  
  INSERT INTO usage_tracking (user_id, feature, used_at, count)
  VALUES (v_user_id, inc_feature, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature, used_at)
  DO UPDATE SET count = usage_tracking.count + 1;
  
  INSERT INTO request_logs (user_id, action) VALUES (v_user_id, 'increment_usage');
  
  -- Audit high-value actions
  IF inc_feature IN ('revenue', 'blueprint', 'validation') THEN
    INSERT INTO audit_logs (user_id, admin_id, action, metadata)
    VALUES (v_user_id, v_user_id, 'increment_usage_' || inc_feature, jsonb_build_object('feature', inc_feature));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Hardened check_daily_usage: only check caller's own usage
CREATE OR REPLACE FUNCTION check_daily_usage(
  check_feature TEXT,
  daily_limit INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  current_count INTEGER;
  can_use BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT COALESCE(SUM(count), 0) INTO current_count
  FROM usage_tracking
  WHERE user_id = v_user_id
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
