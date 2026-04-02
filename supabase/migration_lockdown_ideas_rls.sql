-- ============================================
-- LOCKDOWN: Remove public write access from ideas table
-- Only service_role (scraper/cron) can INSERT/UPDATE
-- Run in Supabase SQL Editor
-- ============================================

-- Drop all permissive INSERT/UPDATE policies
DROP POLICY IF EXISTS "Ideas insertable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas insertable" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable" ON ideas;

-- Ensure public read remains
DROP POLICY IF EXISTS "Ideas viewable by everyone" ON ideas;
DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;
CREATE POLICY "Ideas viewable by everyone" ON ideas
  FOR SELECT USING (true);

-- No INSERT/UPDATE policies = only service_role can write (bypasses RLS)
-- This is correct: ideas are created by the scraper edge function using service_role key

-- Revoke direct INSERT/UPDATE grants from authenticated and anon
REVOKE INSERT, UPDATE ON TABLE public.ideas FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.ideas FROM anon;

-- Verify
SELECT policyname, cmd, permissive, roles
FROM pg_policies
WHERE tablename = 'ideas'
ORDER BY cmd;
