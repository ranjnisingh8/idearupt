-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Secure OTP Operations - Rate Limiting & Hashing
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HASH OTP CODE - Never store plain text
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hash_otp_code(p_code text)
RETURNS text AS $$
BEGIN
  -- Hash with salt for additional security
  RETURN encode(
    digest(
      p_code || 'otp-salt-' || current_setting('app.otp_salt', true),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK OTP RATE LIMIT - Prevent brute force
-- Returns: allowed (boolean), remaining (integer), reset_time (timestamp)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_otp_rate_limit(
  p_identifier text,
  p_ip_address text,
  p_max_per_10min integer DEFAULT 5
)
RETURNS TABLE (
  allowed boolean,
  remaining_attempts integer,
  reset_time timestamp,
  reason text
) AS $$
DECLARE
  v_req_count integer;
  v_allowed boolean := true;
  v_remaining integer;
  v_reset_time timestamp;
  v_reason text := '';
BEGIN
  -- Count requests in last 10 minutes from this identifier
  SELECT COUNT(*) INTO v_req_count
  FROM otp_requests
  WHERE identifier = p_identifier
    AND created_at > now() - interval '10 minutes';

  v_reset_time := now() + interval '10 minutes';
  v_remaining := p_max_per_10min - v_req_count;

  -- Check if limit exceeded
  IF v_req_count >= p_max_per_10min THEN
    v_allowed := false;
    v_reason := 'Rate limit exceeded: ' || v_req_count || ' requests in last 10 minutes';
    v_remaining := 0;
  END IF;

  -- Also check IP-based rate limit (prevent IPs from targeting multiple users)
  SELECT COUNT(*) INTO v_req_count
  FROM otp_requests
  WHERE ip_address = p_ip_address
    AND created_at > now() - interval '1 hour';

  IF v_req_count > 50 AND v_allowed THEN -- 50 requests per hour from same IP
    v_allowed := false;
    v_reason := 'IP-based rate limit exceeded: ' || v_req_count || ' requests from this IP in last hour';
    v_reset_time := now() + interval '1 hour';
  END IF;

  RETURN QUERY SELECT v_allowed, v_remaining, v_reset_time, v_reason;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REQUEST OTP - Rate-limited OTP request handler
-- Always returns same response (prevents enumeration)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_otp_secure(
  p_identifier text,
  p_ip_address text,
  p_user_agent text DEFAULT NULL,
  p_method text DEFAULT 'email'
)
RETURNS TABLE (
  success boolean,
  message text,
  request_id uuid
) AS $$
DECLARE
  v_rate_limit_check record;
  v_user_id uuid;
  v_otp_code text;
  v_code_hash text;
  v_request_id uuid;
  v_message text := 'If account exists, OTP will be sent. Check spam folder if not received.';
  v_expires_at timestamp;
BEGIN
  -- Validate method
  IF p_method NOT IN ('email', 'sms', 'authenticator') THEN
    p_method := 'email';
  END IF;

  v_request_id := gen_random_uuid();

  -- Generate OTP code (6 digits)
  v_otp_code := LPAD((RANDOM() * 1000000)::integer::text, 6, '0');
  v_code_hash := hash_otp_code(v_otp_code);

  -- Expiry: 5 minutes
  v_expires_at := now() + interval '5 minutes';

  -- Check rate limit
  SELECT * INTO v_rate_limit_check
  FROM check_otp_rate_limit(p_identifier, p_ip_address);

  -- Log the request regardless of outcome (for audit trail)
  INSERT INTO otp_requests (identifier, ip_address, user_agent, created_at)
  VALUES (p_identifier, p_ip_address, p_user_agent, now());

  -- If rate limit exceeded, still return same message (enumerate prevention)
  IF NOT (v_rate_limit_check).allowed THEN
    INSERT INTO otp_audit_log (identifier, action, reason, ip_address, user_agent)
    VALUES (
      p_identifier,
      'blocked',
      (v_rate_limit_check).reason,
      p_ip_address,
      p_user_agent
    );

    -- Return same message (don't leak that account doesn't exist)
    RETURN QUERY SELECT true::boolean, v_message, v_request_id;
    RETURN;
  END IF;

  -- Find user by identifier (email/phone)
  SELECT id INTO v_user_id
  FROM users
  WHERE email = p_identifier OR phone = p_identifier
  LIMIT 1;

  -- Always return same message: "If account exists, OTP sent"
  -- Whether we actually sent it or not (prevents enumeration)

  -- If user found, create OTP
  IF v_user_id IS NOT NULL THEN
    INSERT INTO otp_codes (
      user_id,
      identifier,
      code_hash,
      expires_at,
      method,
      attempts_remaining
    ) VALUES (
      v_user_id,
      p_identifier,
      v_code_hash,
      v_expires_at,
      p_method,
      5
    );

    -- Log successful request
    INSERT INTO otp_audit_log (
      user_id,
      identifier,
      action,
      ip_address,
      user_agent
    ) VALUES (
      v_user_id,
      p_identifier,
      'requested',
      p_ip_address,
      p_user_agent
    );

    -- TODO: Send OTP to user via email/SMS
    -- SELECT send_otp_email(v_user_id, v_otp_code);
  ELSE
    -- Log failed attempt (user not found, but don't leak this)
    INSERT INTO otp_audit_log (
      identifier,
      action,
      reason,
      ip_address,
      user_agent
    ) VALUES (
      p_identifier,
      'requested',
      'identifier_not_found',
      p_ip_address,
      p_user_agent
    );
  END IF;

  -- Always return same response
  RETURN QUERY SELECT true::boolean, v_message, v_request_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFY OTP - Check code and mark as verified
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_otp_secure(
  p_identifier text,
  p_code text,
  p_ip_address text,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  error_message text,
  user_id uuid,
  session_token text
) AS $$
DECLARE
  v_otp_record record;
  v_code_hash text;
  v_user_id uuid;
  v_session_token text;
  v_attempts_remaining integer;
BEGIN
  -- Hash the provided code
  v_code_hash := hash_otp_code(p_code);

  -- Find valid OTP (not expired, not verified, matches code)
  SELECT *
  INTO v_otp_record
  FROM otp_codes
  WHERE identifier = p_identifier
    AND expires_at > now()
    AND verified_at IS NULL
    AND attempts_remaining > 0
  ORDER BY created_at DESC
  LIMIT 1;

  -- OTP not found or expired
  IF v_otp_record IS NULL THEN
    INSERT INTO otp_audit_log (
      identifier,
      action,
      reason,
      ip_address,
      user_agent
    ) VALUES (
      p_identifier,
      'failed',
      'otp_not_found_or_expired',
      p_ip_address,
      p_user_agent
    );

    RETURN QUERY SELECT false, 'Invalid or expired OTP', NULL::uuid, NULL;
    RETURN;
  END IF;

  v_user_id := v_otp_record.user_id;
  v_attempts_remaining := v_otp_record.attempts_remaining - 1;

  -- Code doesn't match
  IF v_code_hash != v_otp_record.code_hash THEN
    -- Decrement attempts
    UPDATE otp_codes
    SET attempts_remaining = v_attempts_remaining
    WHERE id = v_otp_record.id;

    INSERT INTO otp_audit_log (
      user_id,
      identifier,
      action,
      reason,
      ip_address,
      user_agent
    ) VALUES (
      v_user_id,
      p_identifier,
      'failed',
      'incorrect_code_remaining_' || v_attempts_remaining,
      p_ip_address,
      p_user_agent
    );

    -- If no attempts left, return error
    IF v_attempts_remaining <= 0 THEN
      RETURN QUERY SELECT false, 'OTP expired due to too many incorrect attempts', NULL::uuid, NULL;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Incorrect OTP. Attempts remaining: ' || v_attempts_remaining, NULL::uuid, NULL;
    RETURN;
  END IF;

  -- Code matches! Mark as verified
  UPDATE otp_codes
  SET verified_at = now()
  WHERE id = v_otp_record.id;

  -- Generate session token (you would use your auth system here)
  v_session_token := encode(gen_random_bytes(32), 'hex');

  -- Log successful verification
  INSERT INTO otp_audit_log (
    user_id,
    identifier,
    action,
    ip_address,
    user_agent
  ) VALUES (
    v_user_id,
    p_identifier,
    'verified',
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT true, NULL, v_user_id, v_session_token;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CLEANUP EXPIRED OTPs - Remove after 1 hour (keep audit trail)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS TABLE (
  deleted_count integer,
  purged_requests_count integer
) AS $$
DECLARE
  v_deleted integer;
  v_purged integer;
BEGIN
  -- Delete expired OTP codes (older than 1 hour)
  DELETE FROM otp_codes
  WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Purge old OTP requests (older than 24 hours for pattern analysis)
  DELETE FROM otp_requests
  WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_purged;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INVALIDATE OTP - Manually expire an OTP
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION invalidate_otp(
  p_identifier text,
  p_reason text DEFAULT 'manual_invalidation'
)
RETURNS boolean AS $$
BEGIN
  UPDATE otp_codes
  SET expires_at = now()
  WHERE identifier = p_identifier
    AND expires_at > now()
    AND verified_at IS NULL;

  INSERT INTO otp_audit_log (identifier, action, reason)
  VALUES (p_identifier, 'expired', p_reason);

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Secure OTP Operations: Functions deployed ✅' AS migration_status;
