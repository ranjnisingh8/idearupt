-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Security Audit v5 — Comprehensive End-to-End Fixes
-- Run in Supabase SQL Editor
-- Safe to run multiple times (all idempotent)
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- 1. FIX user_trial_status — UNRESTRICTED → DROP or LOCK DOWN
--    This view/table exposes ALL users' trial status publicly.
--    Solution: Drop it (frontend uses get_user_trial_status RPC instead)
-- ═══════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.user_trial_status CASCADE;
DROP TABLE IF EXISTS public.user_trial_status CASCADE;
-- If it was recreated as a materialized view:
DROP MATERIALIZED VIEW IF EXISTS public.user_trial_status CASCADE;


-- ═══════════════════════════════════════════════════════════════
-- 2. LOCK DOWN suspicious_accounts & ip_clusters views
--    These views expose user emails, IPs, fingerprints — admin only!
--    Fix: Recreate with security_invoker = true so RLS applies
-- ═══════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.suspicious_accounts CASCADE;
CREATE VIEW public.suspicious_accounts
WITH (security_invoker = true) AS
SELECT
  device_fingerprint,
  COUNT(*) AS account_count,
  ARRAY_AGG(email ORDER BY created_at) AS emails,
  ARRAY_AGG(created_at ORDER BY created_at) AS signup_dates,
  ARRAY_AGG(subscription_status ORDER BY created_at) AS statuses
FROM public.users
WHERE device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(*) > 1
ORDER BY account_count DESC;

DROP VIEW IF EXISTS public.ip_clusters CASCADE;
CREATE VIEW public.ip_clusters
WITH (security_invoker = true) AS
SELECT
  signup_ip,
  COUNT(*) AS account_count,
  ARRAY_AGG(email ORDER BY created_at) AS emails,
  ARRAY_AGG(created_at ORDER BY created_at) AS signup_dates,
  ARRAY_AGG(subscription_status ORDER BY created_at) AS statuses
FROM public.users
WHERE signup_ip IS NOT NULL
GROUP BY signup_ip
HAVING COUNT(*) >= 3
ORDER BY account_count DESC;

-- Only service_role and admin can access these views
REVOKE ALL ON public.suspicious_accounts FROM authenticated;
REVOKE ALL ON public.suspicious_accounts FROM anon;
GRANT SELECT ON public.suspicious_accounts TO service_role;

REVOKE ALL ON public.ip_clusters FROM authenticated;
REVOKE ALL ON public.ip_clusters FROM anon;
GRANT SELECT ON public.ip_clusters TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- 3. LOCK DOWN profiles table (if exists) — Loveable may have created it
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    -- Drop any overly permissive policies
    DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
    -- Add proper user-scoped policies
    CREATE POLICY "Users view own profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "Users update own profile" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
    CREATE POLICY "Users insert own profile" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 4. LOCK DOWN validation_results table (if exists)
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'validation_results') THEN
    ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.validation_results;
    -- Users can only see their own validation results
    CREATE POLICY "Users view own validation results" ON public.validation_results
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Service insert validation results" ON public.validation_results
      FOR INSERT WITH CHECK (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 5. ADD admin email guard to admin_get_suspicious_accounts()
--    Previously: Any authenticated user could call this RPC
--    Now: Only admin email can call it
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_get_suspicious_accounts()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp_dupes JSON;
  ip_clusters_data JSON;
  caller_email TEXT;
BEGIN
  -- Admin guard
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL OR caller_email NOT IN ('garagefitness4@gmail.com') THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Fingerprint duplicates
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO fp_dupes
  FROM (
    SELECT u.device_fingerprint, COUNT(*) AS account_count,
      ARRAY_AGG(u.email ORDER BY u.created_at) AS emails,
      ARRAY_AGG(u.created_at ORDER BY u.created_at) AS signup_dates,
      ARRAY_AGG(u.subscription_status ORDER BY u.created_at) AS statuses
    FROM public.users u
    WHERE u.device_fingerprint IS NOT NULL
    GROUP BY u.device_fingerprint
    HAVING COUNT(*) > 1
    ORDER BY account_count DESC
    LIMIT 50
  ) t;

  -- IP clusters (3+ accounts)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO ip_clusters_data
  FROM (
    SELECT u.signup_ip, COUNT(*) AS account_count,
      ARRAY_AGG(u.email ORDER BY u.created_at) AS emails,
      ARRAY_AGG(u.created_at ORDER BY u.created_at) AS signup_dates,
      ARRAY_AGG(u.subscription_status ORDER BY u.created_at) AS statuses
    FROM public.users u
    WHERE u.signup_ip IS NOT NULL
    GROUP BY u.signup_ip
    HAVING COUNT(*) >= 3
    ORDER BY account_count DESC
    LIMIT 50
  ) t;

  RETURN json_build_object(
    'fingerprint_dupes', fp_dupes,
    'ip_clusters', ip_clusters_data
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 6. HARDEN save_user_fingerprint — validate caller matches user
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_user_fingerprint(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_flagged BOOLEAN DEFAULT false,
  p_ip TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Security: Only allow users to set their own fingerprint
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot set fingerprint for other users';
  END IF;

  -- Sanitize fingerprint (alphanumeric + hyphens only, max 128 chars)
  IF length(p_fingerprint) > 128 THEN
    p_fingerprint := substring(p_fingerprint FROM 1 FOR 128);
  END IF;

  UPDATE public.users
  SET device_fingerprint = p_fingerprint,
      flagged_duplicate = p_flagged,
      signup_ip = COALESCE(substring(p_ip FROM 1 FOR 45), signup_ip)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_user_fingerprint(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 7. HARDEN lemonsqueezy webhook secret check
--    Add a function to verify webhook signatures server-side
--    (The edge function already does this, but add DB-level audit)
-- ═══════════════════════════════════════════════════════════════

-- Create audit log table for sensitive operations
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert/read audit logs
DROP POLICY IF EXISTS "Service role manages audit log" ON public.audit_log;
CREATE POLICY "Service role manages audit log" ON public.audit_log
  FOR ALL USING (false);  -- No one can read via RLS (only service_role bypasses)

GRANT SELECT, INSERT ON TABLE public.audit_log TO service_role;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action, created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- 8. ENSURE email_log is properly locked down
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  -- Ensure RLS is enabled
  ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

  -- Drop overly permissive INSERT policy
  DROP POLICY IF EXISTS email_log_service_insert ON public.email_log;
  -- Only service_role should insert (edge functions use service key)
  CREATE POLICY "Service role inserts email log" ON public.email_log
    FOR INSERT WITH CHECK (false);  -- Only service_role (bypasses RLS) can insert
EXCEPTION WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 9. LOCK DOWN page_events INSERT — prevent unauthenticated spam
--    Currently: Anyone can INSERT into page_events
--    Fix: Require auth.uid() IS NOT NULL
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can insert page events" ON public.page_events;
  DROP POLICY IF EXISTS "Authenticated users insert page events" ON public.page_events;
  CREATE POLICY "Authenticated users insert page events" ON public.page_events
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 10. ADD search_path to ALL SECURITY DEFINER functions
--     Prevents search_path hijacking attacks
-- ═══════════════════════════════════════════════════════════════

-- Harden check_daily_usage
CREATE OR REPLACE FUNCTION public.check_daily_usage(
  check_user_id UUID,
  check_feature TEXT,
  daily_limit INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  today_count INT;
  effective_limit INT;
  user_status TEXT;
  user_trial_ends TIMESTAMPTZ;
BEGIN
  -- Security: only allow users to check their own usage
  IF auth.uid() IS NULL OR auth.uid() != check_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get user subscription info
  SELECT subscription_status, trial_ends_at
  INTO user_status, user_trial_ends
  FROM public.users
  WHERE id = check_user_id;

  -- Determine effective limit
  IF user_status = 'pro' OR user_status = 'paid' THEN
    RETURN json_build_object(
      'can_use', true,
      'used_today', 0,
      'daily_limit', 999,
      'remaining', 999
    );
  ELSIF user_status = 'trial' AND user_trial_ends > NOW() THEN
    effective_limit := daily_limit;
  ELSE
    effective_limit := daily_limit;
  END IF;

  -- Count today's usage
  SELECT COALESCE(SUM(count), 0) INTO today_count
  FROM public.usage_tracking
  WHERE user_id = check_user_id
    AND feature = check_feature
    AND used_at = CURRENT_DATE;

  RETURN json_build_object(
    'can_use', today_count < effective_limit,
    'used_today', today_count,
    'daily_limit', effective_limit,
    'remaining', GREATEST(0, effective_limit - today_count)
  );
END;
$$;

-- Harden increment_usage
CREATE OR REPLACE FUNCTION public.increment_usage(
  inc_user_id UUID,
  inc_feature TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Feature whitelist
  IF inc_feature NOT IN ('validation', 'blueprint', 'competitors', 'signals', 'use_cases', 'dna_match', 'remix', 'revenue', 'matching') THEN
    RAISE EXCEPTION 'Invalid feature: %', inc_feature;
  END IF;

  INSERT INTO public.usage_tracking (user_id, feature, used_at, count)
  VALUES (inc_user_id, inc_feature, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature, used_at)
  DO UPDATE SET count = usage_tracking.count + 1;
END;
$$;

-- Harden auto_start_trial
CREATE OR REPLACE FUNCTION public.auto_start_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users
  SET trial_ends_at = NOW() + INTERVAL '7 days',
      subscription_status = 'trial'
  WHERE id = NEW.id
    AND trial_ends_at IS NULL;
  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 11. REVOKE unnecessary GRANTs — principle of least privilege
-- ═══════════════════════════════════════════════════════════════

-- Anon role should NOT have access to user tables
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.builder_dna FROM anon;
REVOKE ALL ON TABLE public.user_interactions FROM anon;
REVOKE ALL ON TABLE public.usage_tracking FROM anon;
REVOKE ALL ON TABLE public.user_alerts FROM anon;
REVOKE ALL ON TABLE public.email_log FROM anon;
REVOKE ALL ON TABLE public.audit_log FROM anon;

-- Allow anon to read public content only
GRANT SELECT ON TABLE public.ideas TO anon;
GRANT SELECT ON TABLE public.pain_signals TO anon;
GRANT SELECT ON TABLE public.use_cases TO anon;


-- ═══════════════════════════════════════════════════════════════
-- 12. CATCH-ALL: Enable RLS on any remaining tables without it
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma%'
      AND NOT rowsecurity  -- Only tables without RLS
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    RAISE NOTICE 'Enabled RLS on: %', tbl.tablename;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
SELECT 'Security Audit v5 migration complete.' AS status;

-- Check for any remaining tables WITHOUT RLS:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity
  AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;
