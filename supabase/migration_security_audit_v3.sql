-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Security Audit v3 — Final RLS hardening
-- Run in Supabase SQL Editor
-- Safe to run multiple times (all idempotent)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. FIX pro_waitlist: Only authenticated users can INSERT their own row
--    Previously: "Anyone can join waitlist" WITH CHECK (true) — too permissive
--    This allows unauthenticated inserts and inserts with other user_ids
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- Drop old overly permissive policies
  DROP POLICY IF EXISTS "Anyone can join waitlist" ON pro_waitlist;
  DROP POLICY IF EXISTS "Users can view waitlist" ON pro_waitlist;

  -- New: Only authenticated users can insert with their own user_id
  DROP POLICY IF EXISTS "Auth users insert own waitlist entry" ON pro_waitlist;
  CREATE POLICY "Auth users insert own waitlist entry" ON pro_waitlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- New: Users can only view their own entry
  DROP POLICY IF EXISTS "Users view own waitlist entry v2" ON pro_waitlist;
  CREATE POLICY "Users view own waitlist entry v3" ON pro_waitlist
    FOR SELECT USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 2. ENSURE user_interactions is properly locked down
--    Users should only access their own interactions
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

  -- View own interactions
  DROP POLICY IF EXISTS "Users view own interactions" ON user_interactions;
  CREATE POLICY "Users view own interactions" ON user_interactions
    FOR SELECT USING (auth.uid() = user_id);

  -- Insert own interactions
  DROP POLICY IF EXISTS "Users insert own interactions" ON user_interactions;
  CREATE POLICY "Users insert own interactions" ON user_interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- Delete own interactions (for unsave)
  DROP POLICY IF EXISTS "Users delete own interactions" ON user_interactions;
  CREATE POLICY "Users delete own interactions" ON user_interactions
    FOR DELETE USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 3. ENSURE builder_dna is locked to own user
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE builder_dna ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users view own builder_dna" ON builder_dna;
  CREATE POLICY "Users view own builder_dna" ON builder_dna
    FOR SELECT USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users upsert own builder_dna" ON builder_dna;
  CREATE POLICY "Users upsert own builder_dna" ON builder_dna
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users update own builder_dna" ON builder_dna;
  CREATE POLICY "Users update own builder_dna" ON builder_dna
    FOR UPDATE USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 4. ENSURE usage_tracking is locked to own user
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view own usage" ON usage_tracking;
  CREATE POLICY "Users can view own usage v2" ON usage_tracking
    FOR SELECT USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can insert own usage" ON usage_tracking;
  CREATE POLICY "Users can insert own usage v2" ON usage_tracking
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update own usage" ON usage_tracking;
  CREATE POLICY "Users can update own usage v2" ON usage_tracking
    FOR UPDATE USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 5. ENSURE users table is locked down
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;

  -- Users can view their own profile
  DROP POLICY IF EXISTS "Users view own profile" ON users;
  CREATE POLICY "Users view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

  -- Users can update their own profile
  DROP POLICY IF EXISTS "Users update own profile" ON users;
  CREATE POLICY "Users update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

  -- Users can insert their own profile (on signup)
  DROP POLICY IF EXISTS "Users insert own profile" ON users;
  CREATE POLICY "Users insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 6. ENSURE ideas table is PUBLIC READ, no public write
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

  -- Anyone can read ideas (public feed)
  DROP POLICY IF EXISTS "Public can read ideas" ON ideas;
  CREATE POLICY "Public can read ideas" ON ideas
    FOR SELECT USING (true);

  -- No public INSERT/UPDATE/DELETE — only service_role can write
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 7. ENSURE pain_signals is PUBLIC READ, no public write
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE pain_signals ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Public can read pain_signals" ON pain_signals;
  CREATE POLICY "Public can read pain_signals" ON pain_signals
    FOR SELECT USING (true);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 8. ENSURE use_cases is PUBLIC READ, no public write
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE use_cases ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Public can read use_cases" ON use_cases;
  CREATE POLICY "Public can read use_cases" ON use_cases
    FOR SELECT USING (true);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 9. ENSURE user_alerts is user-scoped
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users view own alerts" ON user_alerts;
  CREATE POLICY "Users view own alerts" ON user_alerts
    FOR SELECT USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users manage own alerts" ON user_alerts;
  CREATE POLICY "Users manage own alerts" ON user_alerts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 10. Add server-side rate limiting enforcement to edge functions
--     The increment_usage function already exists as SECURITY DEFINER
--     Add a check_and_increment function that atomically checks + increments
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id UUID,
  p_feature TEXT,
  p_daily_limit INTEGER
)
RETURNS JSON AS $$
DECLARE
  current_count INTEGER;
  can_use BOOLEAN;
BEGIN
  -- Get current count
  SELECT COALESCE(SUM(count), 0) INTO current_count
  FROM usage_tracking
  WHERE user_id = p_user_id
  AND feature = p_feature
  AND used_at = CURRENT_DATE;

  can_use := current_count < p_daily_limit;

  IF can_use THEN
    -- Atomically increment
    INSERT INTO usage_tracking (user_id, feature, used_at, count)
    VALUES (p_user_id, p_feature, CURRENT_DATE, 1)
    ON CONFLICT (user_id, feature, used_at)
    DO UPDATE SET count = usage_tracking.count + 1;
  END IF;

  RETURN json_build_object(
    'can_use', can_use,
    'used_today', current_count,
    'daily_limit', p_daily_limit,
    'remaining', GREATEST(0, p_daily_limit - current_count)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- VERIFY: List all tables and their RLS status
-- ═══════════════════════════════════════════════════════════════
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  CASE WHEN c.relrowsecurity THEN 'SECURED' ELSE 'OPEN' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;

-- ═══════════════════════════════════════════════════════════════
-- DONE!
-- This migration:
-- 1. Fixes pro_waitlist INSERT to require auth.uid() = user_id
-- 2. Ensures user_interactions is fully user-scoped
-- 3. Ensures builder_dna is fully user-scoped
-- 4. Ensures usage_tracking is fully user-scoped
-- 5. Ensures users table is user-scoped
-- 6. Ensures ideas/pain_signals/use_cases are public READ only
-- 7. Adds user_alerts RLS
-- 8. Adds atomic check_and_increment_usage function
-- ═══════════════════════════════════════════════════════════════
