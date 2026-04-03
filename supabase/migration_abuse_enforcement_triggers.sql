-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Bot & Abuse Protection - Enforcement Rules & Triggers
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RLS POLICIES: PREVENT BANNED/LIMITED USERS FROM KEY OPERATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Block all collection operations for banned users
CREATE POLICY "block_banned_users_collections" ON collections
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_banned = true)
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_limited = true AND limited_until > now())
  );

-- Block all idea operations for banned users
CREATE POLICY "block_banned_users_ideas" ON ideas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_banned = true)
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_limited = true AND limited_until > now())
  );

-- Block all user interaction for banned users
CREATE POLICY "block_banned_users_interactions" ON user_interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_banned = true)
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_limited = true AND limited_until > now())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRIGGERS: AUTO-BAN WHEN SUSPICIOUS ACTIVITY THRESHOLD REACHED
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_check_suspicious_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_suspicious_count integer;
  v_should_ban_result record;
BEGIN
  -- After suspicious activity is logged, check if we should auto-ban
  SELECT v_should_ban_result FROM auto_ban_suspicious_user(
    NEW.user_id,
    10 -- Default threshold
  ) INTO v_should_ban_result;

  -- If banned, log it
  IF (v_should_ban_result).was_banned THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      action,
      new_data,
      changed_by
    ) VALUES (
      'users',
      NEW.user_id,
      'AUTO_BAN',
      jsonb_build_object(
        'reason', 'Automated ban from suspicious activity',
        'suspicious_activities', (v_should_ban_result).suspicious_count
      ),
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_suspicious_activity_threshold ON suspicious_activity;
CREATE TRIGGER trigger_suspicious_activity_threshold
AFTER INSERT ON suspicious_activity
FOR EACH ROW
EXECUTE FUNCTION trigger_check_suspicious_threshold();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS: AUTO-LOG REMOVED SOFT LIMITS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_log_limit_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- If limit was removed (is_limited changed from true to false)
  IF OLD.is_limited = true AND NEW.is_limited = false THEN
    INSERT INTO abuse_patterns (user_id, pattern_type, pattern_data, severity, action_taken)
    VALUES (
      NEW.id,
      'soft_limit_expired',
      jsonb_build_object(
        'removed_at', now(),
        'limited_until', OLD.limited_until
      ),
      'low',
      'Soft limit automatically expired'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_limit_removal ON users;
CREATE TRIGGER trigger_user_limit_removal
AFTER UPDATE ON users
FOR EACH ROW
WHEN (OLD.is_limited != NEW.is_limited)
EXECUTE FUNCTION trigger_log_limit_removal();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGERS: LOG ALL BANS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_log_user_bans()
RETURNS TRIGGER AS $$
BEGIN
  -- If user was banned
  IF OLD.is_banned = false AND NEW.is_banned = true THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      action,
      new_data,
      changed_by
    ) VALUES (
      'users',
      NEW.id,
      'BAN',
      jsonb_build_object(
        'reason', NEW.ban_reason,
        'banned_at', NEW.banned_at
      ),
      COALESCE(auth.uid(), NEW.id)
    );

    -- Log to abuse patterns as well
    INSERT INTO abuse_patterns (user_id, pattern_type, pattern_data, severity, action_taken)
    VALUES (
      NEW.id,
      'full_ban',
      jsonb_build_object(
        'reason', NEW.ban_reason,
        'banned_at', NEW.banned_at
      ),
      'high',
      'User banned: ' || NEW.ban_reason
    );
  END IF;

  -- If user was unbanned
  IF OLD.is_banned = true AND NEW.is_banned = false THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      action,
      new_data,
      changed_by
    ) VALUES (
      'users',
      NEW.id,
      'UNBAN',
      jsonb_build_object('unban_at', now()),
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_bans ON users;
CREATE TRIGGER trigger_user_bans
AFTER UPDATE ON users
FOR EACH ROW
WHEN (OLD.is_banned != NEW.is_banned)
EXECUTE FUNCTION trigger_log_user_bans();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CLEANUP TRIGGER: REMOVE EXPIRED DEVICE FINGERPRINTS
-- After 90 days, archive old fingerprints (still valuable for pattern matching)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_device_fingerprints()
RETURNS void AS $$
BEGIN
  -- Archive inactive fingerprints to a history table (if you have one)
  -- For now, just mark them for review
  UPDATE device_fingerprints
  SET is_flagged = true
  WHERE last_seen_at < now() - interval '90 days'
    AND is_flagged = false
    AND signup_count = 1; -- Only archive safe fingerprints

  -- Log the cleanup
  INSERT INTO abuse_patterns (user_id, pattern_type, pattern_data, severity, action_taken)
  VALUES (
    NULL,
    'device_cleanup',
    jsonb_build_object(
      'cleaned_at', now(),
      'archived_count', (SELECT COUNT(*) FROM device_fingerprints WHERE last_seen_at < now() - interval '90 days')
    ),
    'low',
    'Old device fingerprints archived'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CRON JOB: Periodic cleanup of suspicious activity
-- Keeps old records for audit trail but archives extremely old ones
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION archive_old_suspicious_activity()
RETURNS void AS $$
BEGIN
  -- Mark as "indexed" if older than 30 days (for archival to cold storage)
  UPDATE suspicious_activity
  SET indexed_at = created_at
  WHERE indexed_at IS NULL
    AND created_at < now() - interval '30 days'
    AND severity = 'low';

  -- You can then export indexed_at records to cold storage and delete
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. EMERGENCY: UNBAN ALL (Admin only, for policy reviews)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION emergency_unban_all(
  p_reason text DEFAULT 'Manual admin action'
)
RETURNS TABLE (
  unbanned_count integer,
  action_logged boolean
) AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only super admins
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND created_at < now() - interval '30 days' -- Old admin accounts only
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Unban all
  UPDATE users
  SET
    is_banned = false,
    is_limited = false,
    ban_reason = NULL,
    banned_at = NULL,
    limited_until = NULL
  WHERE is_banned = true OR is_limited = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log action
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    changed_by
  ) VALUES (
    'users',
    '00000000-0000-0000-0000-000000000000',
    'EMERGENCY_UNBAN_ALL',
    jsonb_build_object(
      'reason', p_reason,
      'unbanned_count', v_count,
      'executed_at', now()
    ),
    auth.uid()
  );

  RETURN QUERY SELECT v_count, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. STATS: Get real-time abuse dashboard metrics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_abuse_dashboard_stats()
RETURNS TABLE (
  total_suspicious_activities bigint,
  high_severity_count bigint,
  users_banned_24h bigint,
  users_limited_24h bigint,
  unique_flagged_devices bigint,
  suspicious_ips text[],
  top_patterns text[]
) AS $$
BEGIN
  -- Only admins
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM suspicious_activity WHERE created_at > now() - interval '24 hours')::bigint,
    (SELECT COUNT(*) FROM suspicious_activity WHERE severity = 'high' AND created_at > now() - interval '24 hours')::bigint,
    (SELECT COUNT(*) FROM users WHERE is_banned = true AND banned_at > now() - interval '24 hours')::bigint,
    (SELECT COUNT(*) FROM users WHERE is_limited = true AND limited_until > now())::bigint,
    (SELECT COUNT(*) FROM device_fingerprints WHERE is_flagged = true)::bigint,
    (SELECT ARRAY_AGG(DISTINCT ip_address) FROM suspicious_activity WHERE created_at > now() - interval '24 hours' AND ip_address IS NOT NULL)::text[],
    (SELECT ARRAY_AGG(DISTINCT action) FROM suspicious_activity WHERE created_at > now() - interval '24 hours' LIMIT 10)::text[];
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Bot & Abuse Protection: Enforcement Rules & Triggers Deployed ✅' AS migration_status;
