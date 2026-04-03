-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Secure OTP Authentication System
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OTP REQUESTS TABLE - Rate limiting tracker
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  ip_address text NOT NULL,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Index for fast lookups (critical for rate limiting)
CREATE INDEX IF NOT EXISTS idx_otp_requests_identifier_created
  ON otp_requests(identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_requests_ip_created
  ON otp_requests(ip_address, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OTP CODES TABLE - Hashed OTPs with attempt tracking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  code_hash text NOT NULL,
  attempts_remaining integer DEFAULT 5,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  verified_at timestamp,
  method text DEFAULT 'email' CHECK (method IN ('email', 'sms', 'authenticator'))
);

-- Index for verification lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_identifier_expires
  ON otp_codes(identifier, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id
  ON otp_codes(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OTP AUDIT LOG - Track all OTP activity for compliance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  action text NOT NULL CHECK (action IN ('requested', 'verified', 'failed', 'expired', 'blocked')),
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_otp_audit_log_identifier_created
  ON otp_audit_log(identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_audit_log_user_id
  ON otp_audit_log(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS POLICIES - Prevent unauthorized access
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_audit_log ENABLE ROW LEVEL SECURITY;

-- Only system functions can insert (via SECURITY DEFINER)
CREATE POLICY "otp_codes_system_insert" ON otp_codes
  FOR INSERT
  WITH CHECK (true); -- Checked by function

-- Only admins can view
CREATE POLICY "otp_codes_admin_view" ON otp_codes
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- Audit log - only admins
CREATE POLICY "otp_audit_log_admin_view" ON otp_audit_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRANT PERMISSIONS - Restrict direct access
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON otp_requests FROM authenticated, anon;
REVOKE ALL ON otp_codes FROM authenticated, anon;
REVOKE ALL ON otp_audit_log FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Secure OTP Authentication: Tables created ✅' AS migration_status;
