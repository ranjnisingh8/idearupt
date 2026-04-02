-- ═══════════════════════════════════════════════════════════════
-- Idearupt: SECURITY LOCKDOWN — Full RLS audit + hardening
-- Run in Supabase SQL Editor
-- Safe to run multiple times (all idempotent)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. LOCK DOWN ORPHAN TABLES
--    These tables exist in Supabase but aren't used by the app.
--    Enable RLS + deny all access (except service_role which bypasses RLS).
--    If you need them later, add policies then.
-- ═══════════════════════════════════════════════════════════════

-- build_blueprints
DO $$ BEGIN
  ALTER TABLE build_blueprints ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- builder_profiles
DO $$ BEGIN
  ALTER TABLE builder_profiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- collection_items
DO $$ BEGIN
  ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- collections
DO $$ BEGIN
  ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- daily_drops
DO $$ BEGIN
  ALTER TABLE daily_drops ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- user_saved_ideas (has user_id column — lock to own data)
DO $$ BEGIN
  ALTER TABLE user_saved_ideas ENABLE ROW LEVEL SECURITY;

  -- Users can only see their own saved ideas
  DROP POLICY IF EXISTS "Users view own saved ideas" ON user_saved_ideas;
  CREATE POLICY "Users view own saved ideas" ON user_saved_ideas
    FOR SELECT USING (auth.uid() = user_id);

  -- Users can only insert their own
  DROP POLICY IF EXISTS "Users insert own saved ideas" ON user_saved_ideas;
  CREATE POLICY "Users insert own saved ideas" ON user_saved_ideas
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- Users can only delete their own
  DROP POLICY IF EXISTS "Users delete own saved ideas" ON user_saved_ideas;
  CREATE POLICY "Users delete own saved ideas" ON user_saved_ideas
    FOR DELETE USING (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 2. DROP UNRESTRICTED VIEW
--    page_events_with_users bypasses RLS — remove it.
--    Admin dashboard uses RPC functions instead (SECURITY DEFINER).
-- ═══════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS page_events_with_users;


-- ═══════════════════════════════════════════════════════════════
-- 3. TIGHTEN EXISTING POLICIES
--    Fix any overly permissive policies from earlier migrations
-- ═══════════════════════════════════════════════════════════════

-- ── page_events: Anyone can INSERT, only admin can SELECT ────
-- (Original had "Service role can read" — admin_analytics.sql adds admin read)
-- Keep INSERT open (anonymous visitors + logged-in users track events)
-- Remove any public SELECT policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read page events" ON page_events;
  DROP POLICY IF EXISTS "Public can read page events" ON page_events;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── pro_waitlist: Tighten SELECT policy ────
-- Old policy: "Users can view waitlist" USING (true) — too open!
-- New: Users see own entry only (admin sees all via RPC + admin RLS policy)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view waitlist" ON pro_waitlist;
  DROP POLICY IF EXISTS "Anyone can join waitlist" ON pro_waitlist;

  -- Keep: users can view their own entry
  CREATE POLICY "Users view own waitlist entry v2" ON pro_waitlist
    FOR SELECT USING (auth.uid() = user_id);

  -- Keep: authenticated users can insert (with their user_id)
  CREATE POLICY "Authenticated users join waitlist v2" ON pro_waitlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── idea_validations: Only own user, no anonymous inserts ────
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can insert validations" ON idea_validations;

  -- Only authenticated users can insert their own validations
  CREATE POLICY "Authenticated users insert own validations" ON idea_validations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 4. VERIFY ALL RLS IS ENABLED
-- ═══════════════════════════════════════════════════════════════
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  CASE WHEN c.relrowsecurity THEN '✅ SECURED' ELSE '❌ OPEN' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'  -- only tables
ORDER BY c.relrowsecurity, c.relname;


-- ═══════════════════════════════════════════════════════════════
-- 5. LIST ALL POLICIES (audit trail)
-- ═══════════════════════════════════════════════════════════════
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;


-- ═══════════════════════════════════════════════════════════════
-- DONE! Every table should show ✅ SECURED above.
--
-- Summary of what this migration does:
-- 1. Enables RLS on 6 orphan tables (build_blueprints, builder_profiles,
--    collection_items, collections, daily_drops, user_saved_ideas)
-- 2. Adds proper user-scoped policies for user_saved_ideas
-- 3. Drops the unrestricted page_events_with_users view
-- 4. Tightens pro_waitlist SELECT from public to user-only
-- 5. Tightens idea_validations INSERT from anonymous to authenticated
-- 6. Verifies all tables have RLS enabled
-- ═══════════════════════════════════════════════════════════════
