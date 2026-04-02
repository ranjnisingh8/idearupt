-- ═══════════════════════════════════════════════════
-- Idearupt: Usage Tracking + Pro Waitlist Migration
-- Run this via Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Usage tracking table for daily limits
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  used_at DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,

  CONSTRAINT unique_user_feature_date UNIQUE (user_id, feature, used_at)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, used_at);

-- Enable RLS
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own usage' AND tablename = 'usage_tracking') THEN
    CREATE POLICY "Users can view own usage" ON usage_tracking FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own usage' AND tablename = 'usage_tracking') THEN
    CREATE POLICY "Users can insert own usage" ON usage_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own usage' AND tablename = 'usage_tracking') THEN
    CREATE POLICY "Users can update own usage" ON usage_tracking FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Pro waitlist table (may already exist from schema.sql — safe IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS pro_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'pricing_page',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON pro_waitlist(email);

ALTER TABLE pro_waitlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can join waitlist' AND tablename = 'pro_waitlist') THEN
    CREATE POLICY "Anyone can join waitlist" ON pro_waitlist FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view waitlist' AND tablename = 'pro_waitlist') THEN
    CREATE POLICY "Users can view waitlist" ON pro_waitlist FOR SELECT USING (true);
  END IF;
END $$;

-- 3. Function to check daily usage
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
  inc_user_id UUID,
  inc_feature TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, feature, used_at, count)
  VALUES (inc_user_id, inc_feature, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature, used_at)
  DO UPDATE SET count = usage_tracking.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to get all daily usage for a user (batch fetch)
CREATE OR REPLACE FUNCTION get_daily_usage(check_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_object_agg(feature, count)
  INTO result
  FROM usage_tracking
  WHERE user_id = check_user_id
  AND used_at = CURRENT_DATE;

  RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done!
-- Verify: SELECT * FROM usage_tracking LIMIT 5;
-- Test: SELECT check_daily_usage('some-user-uuid', 'validation', 3);
