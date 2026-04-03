-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Secure Critical Functions - Auth & Soft-Ban Enforcement
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USAGE TRACKING - WITH SOFT-BAN & AUTH CHECK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_user_usage_secure(
  p_usage_type text,
  p_amount integer DEFAULT 1,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_message text,
  new_count integer
) AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_is_limited boolean;
  v_is_banned boolean;
  v_new_count integer;
  v_suspicious_check record;
BEGIN
  -- CRITICAL: Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated to track usage';
  END IF;

  -- Get user status
  SELECT role, is_limited, is_banned INTO v_user_role, v_is_limited, v_is_banned
  FROM users
  WHERE id = v_user_id;

  -- CRITICAL: Check if banned
  IF v_is_banned THEN
    RETURN QUERY SELECT false, 'Account has been suspended', NULL;
    RETURN;
  END IF;

  -- Check if soft-limited (wait period not expired)
  IF v_is_limited THEN
    RETURN QUERY SELECT
      false,
      'Access temporarily restricted. Try again later.',
      NULL;
    RETURN;
  END IF;

  -- Detect suspicious activity
  SELECT * INTO v_suspicious_check
  FROM detect_suspicious_activity(
    v_user_id,
    'usage:' || p_usage_type,
    COALESCE(p_ip_address, 'unknown'),
    COALESCE(p_user_agent, 'unknown')
  );

  -- If suspicious and should block
  IF (v_suspicious_check).should_block THEN
    -- Soft-limit the user
    PERFORM soft_limit_user(v_user_id, 24);

    RETURN QUERY SELECT
      false,
      'Suspicious activity detected. Access limited for 24 hours.',
      NULL;
    RETURN;
  END IF;

  -- Proceed with usage increment
  INSERT INTO usage_tracking (user_id, usage_type, amount, ip_address, user_agent)
  VALUES (v_user_id, p_usage_type, p_amount, p_ip_address, p_user_agent)
  ON CONFLICT (user_id, usage_type, date)
  DO UPDATE SET
    amount = usage_tracking.amount + p_amount,
    ip_address = EXCLUDED.ip_address,
    user_agent = EXCLUDED.user_agent
  RETURNING amount INTO v_new_count;

  RETURN QUERY SELECT true, NULL, v_new_count;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REFERRAL TRACKING - WITH AUTH & SOFT-BAN CHECK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION track_referral_secure(
  p_referred_user_id uuid,
  p_ip_address text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_message text
) AS $$
DECLARE
  v_referrer_id uuid;
  v_is_limited boolean;
  v_is_banned boolean;
  v_suspicious_check record;
BEGIN
  -- CRITICAL: Verify authentication
  v_referrer_id := auth.uid();
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated to create referral';
  END IF;

  -- Get referrer status
  SELECT is_limited, is_banned INTO v_is_limited, v_is_banned
  FROM users
  WHERE id = v_referrer_id;

  -- CRITICAL: Check if banned
  IF v_is_banned THEN
    RETURN QUERY SELECT false, 'Account has been suspended';
    RETURN;
  END IF;

  -- CRITICAL: Check if soft-limited
  IF v_is_limited THEN
    RETURN QUERY SELECT false, 'Access temporarily restricted';
    RETURN;
  END IF;

  -- Detect suspicious activity (referral spam)
  SELECT * INTO v_suspicious_check
  FROM detect_suspicious_activity(
    v_referrer_id,
    'referral_creation',
    COALESCE(p_ip_address, 'unknown'),
    'referral-system'
  );

  IF (v_suspicious_check).should_block THEN
    PERFORM soft_limit_user(v_referrer_id, 48);
    RETURN QUERY SELECT false, 'Referral activity flagged as suspicious. Access limited.';
    RETURN;
  END IF;

  -- Check for referral spam (too many referrals in short time)
  IF (SELECT COUNT(*) FROM referrals
      WHERE referrer_id = v_referrer_id
        AND created_at > now() - interval '1 hour') > 20 THEN
    PERFORM soft_limit_user(v_referrer_id, 48);
    RETURN QUERY SELECT false, 'Referral limit exceeded. Suspicious activity detected.';
    RETURN;
  END IF;

  -- Proceed with referral
  INSERT INTO referrals (referrer_id, referred_user_id)
  VALUES (v_referrer_id, p_referred_user_id);

  RETURN QUERY SELECT true, NULL;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIAL ACTIVATION - WITH AUTH, DEVICE, & SOFT-BAN CHECK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION activate_trial_secure(
  p_trial_type text,
  p_ip_address text,
  p_user_agent text
)
RETURNS TABLE (
  success boolean,
  error_message text,
  trial_id uuid
) AS $$
DECLARE
  v_user_id uuid;
  v_is_limited boolean;
  v_is_banned boolean;
  v_device_check record;
  v_suspicious_check record;
  v_trial_id uuid;
BEGIN
  -- CRITICAL: Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated to activate trial';
  END IF;

  -- Get user status
  SELECT is_limited, is_banned INTO v_is_limited, v_is_banned
  FROM users
  WHERE id = v_user_id;

  -- CRITICAL: Check if banned
  IF v_is_banned THEN
    RETURN QUERY SELECT false, 'Account has been suspended', NULL;
    RETURN;
  END IF;

  -- CRITICAL: Check if soft-limited
  IF v_is_limited THEN
    RETURN QUERY SELECT false, 'Access temporarily restricted', NULL;
    RETURN;
  END IF;

  -- Check device fingerprint (server-side trial abuse prevention)
  SELECT * INTO v_device_check
  FROM can_create_trial(v_user_id, p_ip_address, p_user_agent);

  IF NOT (v_device_check).allowed THEN
    PERFORM soft_limit_user(v_user_id, 72); -- 3-day limit for trial abuse
    RETURN QUERY SELECT false, (v_device_check).reason, NULL;
    RETURN;
  END IF;

  -- Detect suspicious activity
  SELECT * INTO v_suspicious_check
  FROM detect_suspicious_activity(
    v_user_id,
    'trial_activation',
    p_ip_address,
    p_user_agent
  );

  IF (v_suspicious_check).should_block THEN
    PERFORM soft_limit_user(v_user_id, 72);
    RETURN QUERY SELECT false, 'Suspicious activity detected. Trial activation blocked.', NULL;
    RETURN;
  END IF;

  -- Create trial
  INSERT INTO trials (user_id, trial_type, started_at)
  VALUES (v_user_id, p_trial_type, now())
  RETURNING id INTO v_trial_id;

  -- Register device for tracking
  PERFORM register_device_fingerprint(v_user_id, p_ip_address, p_user_agent);

  RETURN QUERY SELECT true, NULL, v_trial_id;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ONBOARDING - WITH AUTH & SOFT-BAN CHECK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_onboarding_secure(
  p_data jsonb,
  p_ip_address text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_message text
) AS $$
DECLARE
  v_user_id uuid;
  v_is_limited boolean;
  v_is_banned boolean;
  v_suspicious_check record;
BEGIN
  -- CRITICAL: Verify authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Must be authenticated to complete onboarding';
  END IF;

  -- Get user status
  SELECT is_limited, is_banned INTO v_is_limited, v_is_banned
  FROM users
  WHERE id = v_user_id;

  -- CRITICAL: Check if banned
  IF v_is_banned THEN
    RETURN QUERY SELECT false, 'Account has been suspended';
    RETURN;
  END IF;

  -- CRITICAL: Check if soft-limited
  IF v_is_limited THEN
    RETURN QUERY SELECT false, 'Access temporarily restricted';
    RETURN;
  END IF;

  -- Detect suspicious activity
  SELECT * INTO v_suspicious_check
  FROM detect_suspicious_activity(
    v_user_id,
    'onboarding_completion',
    COALESCE(p_ip_address, 'unknown'),
    'onboarding-system'
  );

  IF (v_suspicious_check).should_block THEN
    PERFORM soft_limit_user(v_user_id, 24);
    RETURN QUERY SELECT false, 'Suspicious activity detected. Please try again later.';
    RETURN;
  END IF;

  -- Update onboarding status
  UPDATE users
  SET
    onboarding_data = p_data,
    onboarding_completed_at = now(),
    is_onboarded = true
  WHERE id = v_user_id;

  RETURN QUERY SELECT true, NULL;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HELPER: CHECK SOFT-LIMIT EXPIRY
-- Auto-removes soft limit if duration has passed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_and_remove_expired_limits()
RETURNS TABLE (
  removed_count integer
) AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE users
  SET is_limited = false, limited_until = NULL
  WHERE is_limited = true
    AND limited_until IS NOT NULL
    AND limited_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Secure Critical Functions: Auth & Soft-Ban Enforcement Deployed ✅' AS migration_status;
