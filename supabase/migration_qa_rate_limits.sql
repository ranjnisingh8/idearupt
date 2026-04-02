-- ═══════════════════════════════════════════════════
-- Idearupt: Per-Request Rate Limiting (QA Audit Fix)
-- Prevents rapid-fire abuse of AI edge functions
-- Run this via Supabase SQL Editor or psql
-- ═══════════════════════════════════════════════════

-- 1. Request throttle table for per-minute rate limiting
CREATE TABLE IF NOT EXISTS request_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT unique_user_function UNIQUE (user_id, function_name)
);

CREATE INDEX IF NOT EXISTS idx_throttle_user_fn ON request_throttle(user_id, function_name);

-- Enable RLS
ALTER TABLE request_throttle ENABLE ROW LEVEL SECURITY;

-- RLS: service role only (no direct user access needed)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages throttle' AND tablename = 'request_throttle') THEN
    CREATE POLICY "Service role manages throttle" ON request_throttle FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. RPC: check_request_throttle
-- UPSERT logic: if window expired, reset; otherwise increment
-- Returns {allowed, recent_count, max_requests}
CREATE OR REPLACE FUNCTION check_request_throttle(
  p_user_id UUID,
  p_function_name TEXT,
  p_window_seconds INTEGER DEFAULT 60,
  p_max_requests INTEGER DEFAULT 5
)
RETURNS JSON AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
  v_allowed BOOLEAN;
BEGIN
  -- Try to get existing record
  SELECT window_start, request_count INTO v_window_start, v_count
  FROM request_throttle
  WHERE user_id = p_user_id AND function_name = p_function_name;

  IF NOT FOUND THEN
    -- First request ever: insert new row
    INSERT INTO request_throttle (user_id, function_name, window_start, request_count)
    VALUES (p_user_id, p_function_name, NOW(), 1);
    RETURN json_build_object('allowed', true, 'recent_count', 1, 'max_requests', p_max_requests);
  END IF;

  IF v_window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL THEN
    -- Window expired: reset
    UPDATE request_throttle
    SET window_start = NOW(), request_count = 1
    WHERE user_id = p_user_id AND function_name = p_function_name;
    RETURN json_build_object('allowed', true, 'recent_count', 1, 'max_requests', p_max_requests);
  END IF;

  -- Within window: increment
  v_count := v_count + 1;
  v_allowed := v_count <= p_max_requests;

  UPDATE request_throttle
  SET request_count = v_count
  WHERE user_id = p_user_id AND function_name = p_function_name;

  RETURN json_build_object('allowed', v_allowed, 'recent_count', v_count, 'max_requests', p_max_requests);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done!
-- Test: SELECT check_request_throttle('some-user-uuid', 'validate-idea', 60, 5);
