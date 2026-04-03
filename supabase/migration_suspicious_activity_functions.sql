-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Suspicious Activity Detection Functions
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GENERATE REQUEST FINGERPRINT
-- Creates a hash of IP + User Agent + other identifiers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_request_fingerprint(
  p_ip_address text,
  p_user_agent text
)
RETURNS text AS $$
BEGIN
  -- Hash combination of IP and user agent
  RETURN encode(
    digest(
      COALESCE(p_ip_address, 'unknown') || '|' ||
      COALESCE(p_user_agent, 'unknown'),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DETECT SUSPICIOUS ACTIVITY
-- Monitors for abnormal patterns: rapid requests, unusual IPs, etc
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION detect_suspicious_activity(
  p_user_id uuid,
  p_action text,
  p_ip_address text,
  p_user_agent text
)
RETURNS TABLE (
  is_suspicious boolean,
  severity text,
  reason text,
  should_block boolean
) AS $$
DECLARE
  v_request_count_last_hour integer;
  v_request_count_last_minute integer;
  v_unique_ips_last_hour integer;
  v_user_activity_gap interval;
  v_last_activity_time timestamp;
  v_is_suspicious boolean := false;
  v_severity text := 'low';
  v_reason text := '';
  v_should_block boolean := false;
  v_fingerprint text;
BEGIN
  -- Cannot check if not authenticated
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID required for suspicious activity check';
  END IF;

  -- Generate fingerprint
  v_fingerprint := generate_request_fingerprint(p_ip_address, p_user_agent);

  -- COUNT: Requests in last hour
  SELECT COUNT(*) INTO v_request_count_last_hour
  FROM request_logs
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  -- COUNT: Requests in last minute
  SELECT COUNT(*) INTO v_request_count_last_minute
  FROM request_logs
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute';

  -- COUNT: Unique IPs in last hour
  SELECT COUNT(DISTINCT ip_address) INTO v_unique_ips_last_hour
  FROM request_logs
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  -- Get last activity time
  SELECT created_at INTO v_last_activity_time
  FROM request_logs
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_user_activity_gap := now() - COALESCE(v_last_activity_time, now());

  -- ─────────────────────────────────────────────────────────────────────────
  -- PATTERN 1: Extremely rapid requests (likely bot)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_request_count_last_minute > 10 THEN
    v_is_suspicious := true;
    v_severity := 'high';
    v_reason := 'Extremely rapid requests: ' || v_request_count_last_minute || ' in last minute';
    v_should_block := true;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PATTERN 2: Too many requests in short time (abuse)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_request_count_last_hour > 500 AND NOT v_is_suspicious THEN
    v_is_suspicious := true;
    v_severity := 'high';
    v_reason := 'Excessive requests: ' || v_request_count_last_hour || ' in last hour';
    v_should_block := true;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PATTERN 3: Multiple IPs in short time (account takeover indicator)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_unique_ips_last_hour > 5 AND NOT v_is_suspicious THEN
    v_is_suspicious := true;
    v_severity := 'high';
    v_reason := 'Multiple IPs detected: ' || v_unique_ips_last_hour || ' different IPs in last hour';
    v_should_block := true;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PATTERN 4: Sudden IP change after inactivity (suspicious return)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_user_activity_gap > interval '7 days'
    AND v_last_activity_time IS NOT NULL
    AND (
      SELECT COUNT(DISTINCT ip_address) FROM request_logs
      WHERE user_id = p_user_id
        AND created_at > now() - interval '1 hour'
    ) > 0
    AND NOT v_is_suspicious THEN
    v_is_suspicious := true;
    v_severity := 'medium';
    v_reason := 'Resumed activity after ' || EXTRACT(DAYS FROM v_user_activity_gap)::text || ' days of inactivity from different IP';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- PATTERN 5: Repeated request patterns (automation)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_request_count_last_minute > 5 AND v_request_count_last_hour > 100 AND NOT v_is_suspicious THEN
    v_is_suspicious := true;
    v_severity := 'medium';
    v_reason := 'Consistent rapid request pattern detected';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Log suspicious activity if detected
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_is_suspicious THEN
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
      p_action,
      p_ip_address,
      p_user_agent,
      v_fingerprint,
      v_severity,
      jsonb_build_object(
        'reason', v_reason,
        'requests_last_hour', v_request_count_last_hour,
        'requests_last_minute', v_request_count_last_minute,
        'unique_ips', v_unique_ips_last_hour
      )
    );
  END IF;

  -- Return results
  RETURN QUERY SELECT v_is_suspicious, v_severity, v_reason, v_should_block;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AUTO-BAN USER IF THRESHOLD EXCEEDED
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_ban_suspicious_user(
  p_user_id uuid,
  p_threshold integer DEFAULT 10
)
RETURNS TABLE (
  was_banned boolean,
  reason text,
  suspicious_count integer
) AS $$
DECLARE
  v_suspicious_count integer;
  v_high_severity_count integer;
  v_was_banned boolean := false;
  v_reason text := '';
BEGIN
  -- Count recent suspicious activities
  SELECT COUNT(*) INTO v_suspicious_count
  FROM suspicious_activity
  WHERE user_id = p_user_id
    AND created_at > now() - interval '24 hours';

  -- Count high-severity incidents
  SELECT COUNT(*) INTO v_high_severity_count
  FROM suspicious_activity
  WHERE user_id = p_user_id
    AND severity = 'high'
    AND created_at > now() - interval '24 hours';

  -- Auto-ban if threshold exceeded
  IF v_suspicious_count >= p_threshold OR v_high_severity_count >= 3 THEN
    UPDATE users
    SET
      is_banned = true,
      ban_reason = 'Automated ban: Suspicious activity detected',
      banned_at = now()
    WHERE id = p_user_id
      AND is_banned = false;

    v_was_banned := FOUND;
    v_reason := 'Ban triggered: ' || v_suspicious_count || ' suspicious activities (high severity: ' || v_high_severity_count || ')';
  END IF;

  RETURN QUERY SELECT v_was_banned, v_reason, v_suspicious_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SOFT-LIMIT USER (Rate limiting without full ban)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION soft_limit_user(
  p_user_id uuid,
  p_duration_hours integer DEFAULT 24
)
RETURNS TABLE (
  was_limited boolean,
  limited_until timestamp
) AS $$
DECLARE
  v_limited_until timestamp;
BEGIN
  v_limited_until := now() + (p_duration_hours || ' hours')::interval;

  UPDATE users
  SET
    is_limited = true,
    limited_until = v_limited_until
  WHERE id = p_user_id;

  -- Log the action
  INSERT INTO abuse_patterns (user_id, pattern_type, pattern_data, severity, action_taken)
  VALUES (
    p_user_id,
    'soft_limit',
    jsonb_build_object('duration_hours', p_duration_hours, 'applied_at', now()),
    'medium',
    'User soft-limited'
  );

  RETURN QUERY SELECT true, v_limited_until;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REMOVE SOFT LIMIT (After wait period)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_soft_limit(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE users
  SET
    is_limited = false,
    limited_until = NULL
  WHERE id = p_user_id
    AND limited_until IS NOT NULL
    AND limited_until < now();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Suspicious Activity Detection: Functions deployed ✅' AS migration_status;
