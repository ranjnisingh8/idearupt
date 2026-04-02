-- ============================================
-- SECURITY HARDENING V2 — Lock down write access
-- Run in Supabase SQL Editor
-- ============================================

-- ── 1. IDEAS TABLE: Only service_role can INSERT/UPDATE ──────
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Ideas insertable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas insertable" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable" ON ideas;

-- Keep public read
DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;
CREATE POLICY "Ideas viewable by everyone" ON ideas
  FOR SELECT USING (true);

-- Only service_role (scraper/cron) can insert/update
-- No policy needed — absence of INSERT/UPDATE policy = blocked for non-service_role
-- service_role bypasses RLS by default


-- ── 2. PAIN_SIGNALS TABLE: Lock down inserts ────────────────
DROP POLICY IF EXISTS "Pain signals insertable" ON pain_signals;
DROP POLICY IF EXISTS "Pain signals insertable by anyone" ON pain_signals;

-- Keep public read for everyone (landing page needs this for signal previews)
DROP POLICY IF EXISTS "Pain signals viewable by everyone" ON pain_signals;
DROP POLICY IF EXISTS "Pain signals viewable by authenticated" ON pain_signals;
CREATE POLICY "Pain signals viewable by everyone" ON pain_signals
  FOR SELECT USING (true);


-- ── 3. IDEA_VALIDATIONS: Users see only their own ───────────
DROP POLICY IF EXISTS "Users can view own validations" ON idea_validations;
DROP POLICY IF EXISTS "Anyone can insert validations" ON idea_validations;

CREATE POLICY "Users view own validations" ON idea_validations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own validations" ON idea_validations
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ── 4. PRO_WAITLIST: Authenticated users only ───────────────
DROP POLICY IF EXISTS "Anyone can insert waitlist" ON pro_waitlist;
DROP POLICY IF EXISTS "Waitlist insertable" ON pro_waitlist;

-- Allow authenticated users to insert (one per user)
CREATE POLICY "Authenticated users join waitlist" ON pro_waitlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can see their own entry
DROP POLICY IF EXISTS "Users view own waitlist" ON pro_waitlist;
CREATE POLICY "Users view own waitlist entry" ON pro_waitlist
  FOR SELECT USING (auth.uid() = user_id);

-- Allow count query for public display (uses service_role via edge fn if needed)


-- ── 5. USE_CASES: Public read, only service_role writes ─────
DROP POLICY IF EXISTS "Use cases insertable" ON use_cases;
DROP POLICY IF EXISTS "Use cases updatable" ON use_cases;

-- Keep public read for everyone (landing page needs this for use case previews)
DROP POLICY IF EXISTS "Use cases viewable" ON use_cases;
DROP POLICY IF EXISTS "Use cases viewable by authenticated" ON use_cases;
CREATE POLICY "Use cases viewable by everyone" ON use_cases
  FOR SELECT USING (true);


-- ── 6. Verify all policies ──────────────────────────────────
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
