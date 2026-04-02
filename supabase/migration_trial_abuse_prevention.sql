-- ============================================================
-- Trial Abuse Prevention Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add fingerprint + flag columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS flagged_duplicate BOOLEAN DEFAULT false;

-- 2. Create signup_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by fingerprint + time
CREATE INDEX IF NOT EXISTS idx_signup_attempts_fp_time
  ON public.signup_attempts(fingerprint, created_at DESC);

-- RLS: allow anonymous inserts (signup happens before auth)
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist to avoid conflicts
DO $$ BEGIN
  DROP POLICY IF EXISTS sa_insert_anon ON public.signup_attempts;
  DROP POLICY IF EXISTS sa_insert_auth ON public.signup_attempts;
  DROP POLICY IF EXISTS sa_service_select ON public.signup_attempts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY sa_insert_anon ON public.signup_attempts
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY sa_insert_auth ON public.signup_attempts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sa_service_select ON public.signup_attempts
  FOR SELECT TO service_role USING (true);

-- GRANTs
GRANT INSERT ON TABLE public.signup_attempts TO anon;
GRANT INSERT ON TABLE public.signup_attempts TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.signup_attempts TO service_role;

-- 3. RPC: Check if a fingerprint has been used for a trial
CREATE OR REPLACE FUNCTION public.check_fingerprint_abuse(p_fingerprint TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_trial RECORD;
  attempt_count INT;
BEGIN
  -- Rate limit: 3+ signups from same fingerprint in 24h
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

  -- Check if another account with same fingerprint has a trial record
  SELECT id, email, subscription_status, trial_ends_at
  INTO existing_trial
  FROM public.users
  WHERE device_fingerprint = p_fingerprint
    AND trial_ends_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_trial.id IS NOT NULL THEN
    IF existing_trial.subscription_status = 'trial'
       AND existing_trial.trial_ends_at > NOW() THEN
      -- Active trial on another account — flag but allow
      RETURN json_build_object(
        'blocked', false,
        'trial_used', false,
        'active_trial_exists', true,
        'flag_duplicate', true
      );
    ELSE
      -- Trial already used/expired on this device
      RETURN json_build_object(
        'blocked', false,
        'trial_used', true,
        'active_trial_exists', false,
        'flag_duplicate', false
      );
    END IF;
  END IF;

  -- No previous trial on this fingerprint
  RETURN json_build_object(
    'blocked', false,
    'trial_used', false,
    'active_trial_exists', false,
    'flag_duplicate', false
  );
END;
$$;

-- 4. RPC: Save fingerprint to user row
CREATE OR REPLACE FUNCTION public.save_user_fingerprint(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_flagged BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET device_fingerprint = p_fingerprint,
      flagged_duplicate = p_flagged
  WHERE id = p_user_id;
END;
$$;

-- GRANTs for RPCs
GRANT EXECUTE ON FUNCTION public.check_fingerprint_abuse(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_fingerprint_abuse(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_fingerprint(UUID, TEXT, BOOLEAN) TO authenticated;

-- Verify
SELECT 'Migration complete: device_fingerprint, flagged_duplicate columns added, signup_attempts table created, RPCs ready.' AS status;
