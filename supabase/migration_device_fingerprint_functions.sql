-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Device Fingerprint & Trial Abuse Prevention
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REGISTER DEVICE FINGERPRINT
-- Called on signup to track device signature
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION register_device_fingerprint(
  p_user_id uuid,
  p_ip_address text,
  p_user_agent text
)
RETURNS TABLE (
  fingerprint_id uuid,
  is_new_device boolean,
  previous_signup_count integer,
  suspicious boolean
) AS $$
DECLARE
  v_fingerprint_hash text;
  v_fingerprint_id uuid;
  v_existing_count integer;
  v_is_new boolean;
  v_is_suspicious boolean := false;
BEGIN
  -- Generate fingerprint hash
  v_fingerprint_hash := generate_request_fingerprint(p_ip_address, p_user_agent);

  -- Check if this fingerprint has signed up before
  SELECT id, signup_count INTO v_fingerprint_id, v_existing_count
  FROM device_fingerprints
  WHERE fingerprint_hash = v_fingerprint_hash
  LIMIT 1;

  v_is_new := v_fingerprint_id IS NULL;

  -- If fingerprint exists, increment signup count
  IF NOT v_is_new THEN
    UPDATE device_fingerprints
    SET
      signup_count = signup_count + 1,
      last_seen_at = now(),
      user_id = p_user_id
    WHERE id = v_fingerprint_id;

    -- Flag if this fingerprint has created multiple signups
    IF v_existing_count >= 3 THEN
      UPDATE device_fingerprints
      SET is_flagged = true
      WHERE id = v_fingerprint_id;

      v_is_suspicious := true;
    END IF;
  ELSE
    -- Create new fingerprint record
    INSERT INTO device_fingerprints (
      user_id,
      fingerprint_hash,
      ip_address,
      user_agent,
      created_at,
      first_seen_at,
      last_seen_at,
      signup_count
    ) VALUES (
      p_user_id,
      v_fingerprint_hash,
      p_ip_address,
      p_user_agent,
      now(),
      now(),
      now(),
      1
    )
    RETURNING device_fingerprints.id INTO v_fingerprint_id;

    v_existing_count := 0;
  END IF;

  -- Log if suspicious
  IF v_existing_count > 0 AND NOT v_is_new THEN
    INSERT INTO suspicious_activity (
      user_id,
      action,
      ip_address,
      user_agent,
      request_fingerprint,
      severity,
      details
    ) VALUES (
      p_user_id,
      'signup_from_reused_fingerprint',
      p_ip_address,
      p_user_agent,
      v_fingerprint_hash,
      CASE WHEN v_existing_count >= 3 THEN 'high' ELSE 'medium' END,
      jsonb_build_object(
        'fingerprint_hash', v_fingerprint_hash,
        'previous_signup_count', v_existing_count,
        'is_flagged', v_is_suspicious
      )
    );
  END IF;

  RETURN QUERY SELECT
    v_fingerprint_id,
    v_is_new,
    COALESCE(v_existing_count, 0),
    v_is_suspicious;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK IF FINGERPRINT CAN CREATE TRIAL
-- Blocks trial creation if device already has multiple trials
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION can_create_trial(
  p_user_id uuid,
  p_ip_address text,
  p_user_agent text,
  p_max_trials_per_device integer DEFAULT 1
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  trials_created_on_device integer
) AS $$
DECLARE
  v_fingerprint_hash text;
  v_trials_count integer;
  v_is_allowed boolean := true;
  v_reason text := '';
BEGIN
  -- Generate fingerprint
  v_fingerprint_hash := generate_request_fingerprint(p_ip_address, p_user_agent);

  -- Count trials created from this device
  SELECT COUNT(*) INTO v_trials_count
  FROM trials t
  JOIN users u ON t.user_id = u.id
  JOIN device_fingerprints df ON df.user_id = u.id
  WHERE df.fingerprint_hash = v_fingerprint_hash
    AND t.created_at > now() - interval '90 days'; -- 90 day window

  -- Check if limit exceeded
  IF v_trials_count >= p_max_trials_per_device THEN
    v_is_allowed := false;
    v_reason := 'Device has already created ' || v_trials_count || ' trial(s)';
  END IF;

  -- Check if fingerprint is flagged as suspicious
  IF v_is_allowed THEN
    SELECT is_flagged INTO v_is_allowed
    FROM device_fingerprints
    WHERE fingerprint_hash = v_fingerprint_hash;

    IF v_is_allowed = false THEN
      v_reason := 'Device fingerprint flagged for suspicious activity';
    END IF;
  END IF;

  RETURN QUERY SELECT v_is_allowed, v_reason, v_trials_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE DEVICE LAST ACTIVITY
-- Called on each request to track device usage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_device_activity(
  p_user_id uuid,
  p_ip_address text,
  p_user_agent text
)
RETURNS boolean AS $$
DECLARE
  v_fingerprint_hash text;
BEGIN
  v_fingerprint_hash := generate_request_fingerprint(p_ip_address, p_user_agent);

  UPDATE device_fingerprints
  SET last_seen_at = now()
  WHERE fingerprint_hash = v_fingerprint_hash
    AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GET DEVICE INSIGHTS (Admin only)
-- Shows suspicious devices and patterns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_suspicious_devices()
RETURNS TABLE (
  fingerprint_id uuid,
  signup_count integer,
  unique_users integer,
  most_recent_ip text,
  most_recent_user_agent text,
  is_flagged boolean,
  last_activity timestamp
) AS $$
BEGIN
  -- Only admins can call this
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    df.id,
    df.signup_count,
    COUNT(DISTINCT df.user_id)::integer,
    df.ip_address,
    df.user_agent,
    df.is_flagged,
    df.last_seen_at
  FROM device_fingerprints df
  WHERE df.is_flagged = true
    OR df.signup_count > 3
  GROUP BY df.id, df.signup_count, df.ip_address, df.user_agent, df.is_flagged, df.last_seen_at
  ORDER BY df.signup_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. BLOCK DEVICE (Admin action)
-- Prevents future signups from a device
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION block_device(
  p_fingerprint_id uuid,
  p_reason text
)
RETURNS boolean AS $$
BEGIN
  -- Only admins
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE device_fingerprints
  SET is_flagged = true
  WHERE id = p_fingerprint_id;

  -- Log the action
  INSERT INTO abuse_patterns (user_id, pattern_type, pattern_data, severity, action_taken)
  VALUES (
    NULL,
    'device_blocked',
    jsonb_build_object(
      'fingerprint_id', p_fingerprint_id,
      'reason', p_reason,
      'blocked_by', auth.uid(),
      'blocked_at', now()
    ),
    'high',
    'Device blocked: ' || p_reason
  );

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Device Fingerprint & Trial Abuse Prevention: Functions deployed ✅' AS migration_status;
