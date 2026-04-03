-- ════════════════════════════════════════════════════════════════════════════
-- ENHANCED SECURITY HARDENING
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REQUEST LOGS TABLE FOR RATE LIMITING
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_user_action_time
  ON request_logs(user_id, action, created_at);

ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;

-- Service role can write logs
CREATE POLICY "Service role logs requests" ON request_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Users cannot read/modify logs
CREATE POLICY "Deny non-service-role requests" ON request_logs
  FOR ALL USING (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AUDIT LOGS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  admin_id UUID,
  action TEXT NOT NULL,
  target_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action_time
  ON audit_logs(user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_time
  ON audit_logs(admin_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role can write audit logs
CREATE POLICY "Service role writes audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Users cannot read audit logs
CREATE POLICY "Deny audit log access" ON audit_logs
  FOR ALL USING (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PREVENT ROLE ESCALATION ON USERS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users update own profile" ON users;
CREATE POLICY "Users update own profile non-role" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 
    (SELECT role FROM users WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ADMIN-ONLY ROLE MANAGEMENT FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_user_role(
  p_target_user UUID,
  p_new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  -- Auth check
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Validation: only allow 'user' or 'admin'
  IF p_new_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  -- Update role
  UPDATE users SET role = p_new_role WHERE id = p_target_user;

  -- Audit log
  INSERT INTO audit_logs (admin_id, user_id, action, target_id, metadata)
  VALUES (
    v_admin_id,
    v_admin_id,
    'set_user_role',
    p_target_user,
    jsonb_build_object('new_role', p_new_role, 'target_user', p_target_user)
  );

  -- Rate log
  INSERT INTO request_logs (user_id, action)
  VALUES (v_admin_id, 'set_user_role');
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_role(UUID, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SECURE FUNCTION FOR INCREMENTING USAGE WITH RATE LIMITING
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_usage_with_ratelimit(
  p_feature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Rate limit: max 100 requests per minute per user
  SELECT COUNT(*) INTO v_req_count
  FROM request_logs
  WHERE user_id = v_user_id
    AND action = 'increment_usage'
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_req_count > 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many requests';
  END IF;

  -- Increment usage
  INSERT INTO usage_tracking (user_id, feature, used_at, count)
  VALUES (v_user_id, p_feature, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature, used_at)
  DO UPDATE SET count = usage_tracking.count + 1;

  -- Log request
  INSERT INTO request_logs (user_id, action)
  VALUES (v_user_id, 'increment_usage');

  -- Audit log for significant events
  IF p_feature IN ('validation', 'blueprint', 'revenue', 'dna_match') THEN
    INSERT INTO audit_logs (user_id, admin_id, action, metadata)
    VALUES (v_user_id, v_user_id, 'feature_used', jsonb_build_object('feature', p_feature));
  END IF;

  RETURN jsonb_build_object('success', true, 'feature', p_feature);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_usage_with_ratelimit(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HARDENED TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix update_idea_counts_on_insert: Validate user_id
CREATE OR REPLACE FUNCTION update_idea_counts_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user_id required';
  END IF;

  IF NEW.action = 'viewed' THEN
    UPDATE ideas SET view_count = COALESCE(view_count, 0) + 1 WHERE id = NEW.idea_id;
  ELSIF NEW.action = 'saved' THEN
    UPDATE ideas SET save_count = COALESCE(save_count, 0) + 1 WHERE id = NEW.idea_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix update_idea_counts_on_delete: Validate user_id
CREATE OR REPLACE FUNCTION update_idea_counts_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user_id required';
  END IF;

  IF OLD.action = 'saved' THEN
    UPDATE ideas SET save_count = GREATEST(COALESCE(save_count, 0) - 1, 0) WHERE id = OLD.idea_id;
  END IF;

  RETURN OLD;
END;
$$;

-- Fix set_event_user_id: Validate user context
CREATE OR REPLACE FUNCTION set_event_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only set from auth context, never from client
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id = auth.uid();
  ELSIF NEW.user_id IS NOT NULL AND NEW.user_id != auth.uid() AND auth.uid() IS NOT NULL THEN
    -- Prevent spoofing if both are provided
    RAISE EXCEPTION 'Unauthorized: cannot spoof user_id';
  END IF;

  RETURN NEW;
END;
$$;

-- Fix create_default_collection: Already uses NEW.id, but add validation
CREATE OR REPLACE FUNCTION create_default_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user_id required';
  END IF;

  INSERT INTO public.collections (user_id, name, emoji, is_default, sort_order)
  VALUES (NEW.id, 'Saved', '💾', TRUE, 0)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FIX UNSAFE PUBLIC POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- PAIN SIGNALS: Allow public read (landing page), but restrict insert
ALTER TABLE pain_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pain signals viewable by everyone" ON pain_signals;
CREATE POLICY "Pain signals viewable by everyone" ON pain_signals
  FOR SELECT USING (true);

-- Only service_role can insert pain signals (via scraper)
DROP POLICY IF EXISTS "Pain signals insertable" ON pain_signals;
DROP POLICY IF EXISTS "Pain signals insertable by anyone" ON pain_signals;
-- No policy needed — service_role bypasses RLS by default


-- IDEA VALIDATIONS: Allow anonymous inserts (fire-and-forget), users see own
ALTER TABLE idea_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own validations" ON idea_validations;
DROP POLICY IF EXISTS "Anyone can insert validations" ON idea_validations;

CREATE POLICY "Users view own validations" ON idea_validations
  FOR SELECT USING (auth.uid() IS NULL OR auth.uid() = user_id);

CREATE POLICY "Logged-in users insert validations" ON idea_validations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Anonymous insert validations" ON idea_validations
  FOR INSERT WITH CHECK (user_id IS NULL);


-- PRO WAITLIST: Allow public signup, users see own entry
ALTER TABLE pro_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert waitlist" ON pro_waitlist;
DROP POLICY IF EXISTS "Anyone can join waitlist" ON pro_waitlist;
DROP POLICY IF EXISTS "Users can view waitlist" ON pro_waitlist;
DROP POLICY IF EXISTS "Users can view own waitlist" ON pro_waitlist;

CREATE POLICY "Public waitlist signup" ON pro_waitlist
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users view own waitlist entry" ON pro_waitlist
  FOR SELECT USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Anonymous waitlist anonymous" ON pro_waitlist
  FOR SELECT USING (auth.uid() IS NULL AND user_id IS NULL);


-- IDEAS TABLE: Public read, no direct public write
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON ideas;
DROP POLICY IF EXISTS "Ideas viewable by everyone" ON ideas;
CREATE POLICY "Ideas viewable by everyone" ON ideas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Ideas insertable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable by anyone" ON ideas;
DROP POLICY IF EXISTS "Ideas insertable" ON ideas;
DROP POLICY IF EXISTS "Ideas updatable" ON ideas;
-- No INSERT/UPDATE policies — only service_role can write


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SIGNUP RATELIMIT FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_signup_ratelimit()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_req_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Allow only 5 failed signup attempts per minute per user
  SELECT COUNT(*) INTO v_req_count
  FROM request_logs
  WHERE user_id = v_user_id
    AND action = 'signup_attempt'
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_req_count > 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many signup attempts';
  END IF;

  -- Log this attempt
  INSERT INTO request_logs (user_id, action)
  VALUES (v_user_id, 'signup_attempt');
END;
$$;

GRANT EXECUTE ON FUNCTION check_signup_ratelimit() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'Enhanced security hardening complete.' AS status;

-- List all tables with RLS enabled
SELECT tablename, CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
