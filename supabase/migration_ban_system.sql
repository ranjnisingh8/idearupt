-- ============================================================
-- Ban System Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add ban columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Partial index for fast ban lookups
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON public.users(is_banned) WHERE is_banned = true;

-- ============================================================
-- 2. Admin RPC to ban a cluster of accounts
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_ban_cluster(
  p_emails TEXT[],
  p_reason TEXT DEFAULT 'multi-account abuse'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  affected INT;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.users
  SET is_banned = true,
      banned_at = NOW(),
      ban_reason = p_reason,
      subscription_status = 'banned_was_' || COALESCE(subscription_status, 'free')
  WHERE email = ANY(p_emails)
    AND (is_banned IS NULL OR is_banned = false);

  GET DIAGNOSTICS affected = ROW_COUNT;

  INSERT INTO audit_logs (admin_id, action, metadata)
  VALUES (v_admin_id, 'admin_ban_cluster', jsonb_build_object('emails', p_emails, 'reason', p_reason, 'affected_count', affected));

  RETURN json_build_object(
    'success', true,
    'banned_count', affected,
    'emails', p_emails
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ban_cluster(TEXT[], TEXT) TO authenticated;

-- ============================================================
-- 3. Admin RPC to unban a user (safety valve for false positives)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_unban_user(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_target_user UUID;
  old_status TEXT;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get current status
  SELECT id, subscription_status INTO v_target_user, old_status FROM public.users WHERE email = p_email;

  -- Restore original subscription_status from the banned_was_ prefix
  UPDATE public.users
  SET is_banned = false,
      banned_at = NULL,
      ban_reason = NULL,
      subscription_status = CASE
        WHEN old_status LIKE 'banned_was_%' THEN substring(old_status FROM 12)
        ELSE COALESCE(old_status, 'free')
      END
  WHERE email = p_email;

  INSERT INTO audit_logs (admin_id, user_id, action, target_id, metadata)
  VALUES (v_admin_id, v_admin_id, 'admin_unban_user', v_target_user, jsonb_build_object('email', p_email));

  RETURN json_build_object('success', true, 'email', p_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unban_user(TEXT) TO authenticated;

-- ============================================================
-- 4. Update admin_get_suspicious_accounts to include ban status
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_suspicious_accounts()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp_dupes JSON;
  ip_clusters_data JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fingerprint duplicates (limit 50)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO fp_dupes
  FROM (
    SELECT u.device_fingerprint, COUNT(*) AS account_count,
      ARRAY_AGG(u.email ORDER BY u.created_at) AS emails,
      ARRAY_AGG(u.created_at ORDER BY u.created_at) AS signup_dates,
      ARRAY_AGG(u.subscription_status ORDER BY u.created_at) AS statuses,
      ARRAY_AGG(COALESCE(u.is_banned, false) ORDER BY u.created_at) AS banned
    FROM public.users u
    WHERE u.device_fingerprint IS NOT NULL
    GROUP BY u.device_fingerprint
    HAVING COUNT(*) > 1
    ORDER BY account_count DESC
    LIMIT 50
  ) t;

  -- IP clusters (3+ accounts, limit 50)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO ip_clusters_data
  FROM (
    SELECT u.signup_ip, COUNT(*) AS account_count,
      ARRAY_AGG(u.email ORDER BY u.created_at) AS emails,
      ARRAY_AGG(u.created_at ORDER BY u.created_at) AS signup_dates,
      ARRAY_AGG(u.subscription_status ORDER BY u.created_at) AS statuses,
      ARRAY_AGG(COALESCE(u.is_banned, false) ORDER BY u.created_at) AS banned
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

-- ============================================================
-- 5. Harden check_fingerprint_abuse to block banned devices
--    and devices with 2+ existing accounts
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_fingerprint_abuse(p_fingerprint TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_trial RECORD;
  attempt_count INT;
  banned_count INT;
  account_count INT;
BEGIN
  -- Check 1: Is this device linked to a BANNED account?
  SELECT COUNT(*) INTO banned_count
  FROM public.users
  WHERE device_fingerprint = p_fingerprint
    AND is_banned = true;

  IF banned_count > 0 THEN
    RETURN json_build_object(
      'blocked', true,
      'reason', 'banned_device',
      'trial_used', false,
      'active_trial_exists', false,
      'flag_duplicate', false
    );
  END IF;

  -- Check 2: Rate limit - 3+ signups from same fingerprint in 24h
  SELECT COUNT(*) INTO attempt_count
  FROM public.signup_attempts
  WHERE fingerprint = p_fingerprint
    AND created_at > NOW() - INTERVAL '24 hours';

  IF attempt_count >= 3 THEN
    RETURN json_build_object(
      'blocked', true,
      'reason', 'rate_limit',
      'trial_used', false,
      'active_trial_exists', false,
      'flag_duplicate', false
    );
  END IF;

  -- Check 3: Too many existing (non-banned) accounts on this device
  SELECT COUNT(*) INTO account_count
  FROM public.users
  WHERE device_fingerprint = p_fingerprint
    AND (is_banned IS NULL OR is_banned = false);

  IF account_count >= 2 THEN
    RETURN json_build_object(
      'blocked', true,
      'reason', 'too_many_accounts',
      'trial_used', true,
      'active_trial_exists', false,
      'flag_duplicate', true
    );
  END IF;

  -- Check 4: Trial already used on this device (existing logic)
  SELECT id, email, subscription_status, trial_ends_at
  INTO existing_trial
  FROM public.users
  WHERE device_fingerprint = p_fingerprint
    AND trial_ends_at IS NOT NULL
    AND (is_banned IS NULL OR is_banned = false)
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_trial.id IS NOT NULL THEN
    IF existing_trial.subscription_status = 'trial'
       AND existing_trial.trial_ends_at > NOW() THEN
      RETURN json_build_object(
        'blocked', false,
        'trial_used', false,
        'active_trial_exists', true,
        'flag_duplicate', true
      );
    ELSE
      RETURN json_build_object(
        'blocked', false,
        'trial_used', true,
        'active_trial_exists', false,
        'flag_duplicate', false
      );
    END IF;
  END IF;

  -- No issues found
  RETURN json_build_object(
    'blocked', false,
    'trial_used', false,
    'active_trial_exists', false,
    'flag_duplicate', false
  );
END;
$$;

-- Verify migration
SELECT 'Ban system migration complete: is_banned, banned_at, ban_reason columns added; admin_ban_cluster, admin_unban_user RPCs created; admin_get_suspicious_accounts updated with ban status; check_fingerprint_abuse hardened.' AS status;
