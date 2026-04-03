-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Bot & Abuse Protection - Core Tables
-- ════════════════════════════════════════════════════════════════════════════

-- 1. SUSPICIOUS ACTIVITY TABLE
-- Tracks potentially malicious user behavior patterns

CREATE TABLE IF NOT EXISTS suspicious_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  request_fingerprint text,
  severity text DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  details jsonb DEFAULT '{}',
  reviewed boolean DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  indexed_at timestamp
);

-- Indexes for fast queries
CREATE INDEX idx_suspicious_activity_user_id ON suspicious_activity(user_id);
CREATE INDEX idx_suspicious_activity_created_at ON suspicious_activity(created_at DESC);
CREATE INDEX idx_suspicious_activity_ip ON suspicious_activity(ip_address);
CREATE INDEX idx_suspicious_activity_severity ON suspicious_activity(severity);

-- Enable RLS
ALTER TABLE suspicious_activity ENABLE ROW LEVEL SECURITY;

-- Only admins can view
CREATE POLICY "suspicious_activity_admin_view" ON suspicious_activity
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- System insert (via SECURITY DEFINER functions)
CREATE POLICY "suspicious_activity_insert" ON suspicious_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Checked by function

-- ─────────────────────────────────────────────────────────────────────────────

-- 2. DEVICE FINGERPRINTS TABLE
-- Server-side tracking of device signatures to prevent trial abuse

CREATE TABLE IF NOT EXISTS device_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  signup_count integer DEFAULT 1,
  is_flagged boolean DEFAULT false
);

CREATE INDEX idx_device_fingerprints_hash ON device_fingerprints(fingerprint_hash);
CREATE INDEX idx_device_fingerprints_user_id ON device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_ip ON device_fingerprints(ip_address);

-- Enable RLS
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;

-- Users can view their own
CREATE POLICY "device_fingerprints_user_view" ON device_fingerprints
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all
CREATE POLICY "device_fingerprints_admin_view" ON device_fingerprints
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- System insert (via SECURITY DEFINER functions)
CREATE POLICY "device_fingerprints_insert" ON device_fingerprints
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Checked by function

-- ─────────────────────────────────────────────────────────────────────────────

-- 3. SOFT-BAN/RATE-LIMIT STATUS
-- Add tracking columns to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_limited boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS limited_until timestamp;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_is_limited ON users(is_limited);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);

-- ─────────────────────────────────────────────────────────────────────────────

-- 4. ABUSE PATTERNS TABLE
-- Track patterns that indicate abuse (multiple failed attempts, etc)

CREATE TABLE IF NOT EXISTS abuse_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  pattern_type text NOT NULL,
  pattern_data jsonb,
  detected_at timestamp NOT NULL DEFAULT now(),
  severity text DEFAULT 'low',
  action_taken text,
  UNIQUE(user_id, pattern_type)
);

CREATE INDEX idx_abuse_patterns_user_id ON abuse_patterns(user_id);
CREATE INDEX idx_abuse_patterns_type ON abuse_patterns(pattern_type);

-- Enable RLS
ALTER TABLE abuse_patterns ENABLE ROW LEVEL SECURITY;

-- Only admins
CREATE POLICY "abuse_patterns_admin_only" ON abuse_patterns
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- ─────────────────────────────────────────────────────────────────────────────

-- 5. GRANT PERMISSIONS (Restrictive by default)

REVOKE ALL ON suspicious_activity FROM authenticated, anon;
REVOKE ALL ON device_fingerprints FROM authenticated, anon;
REVOKE ALL ON abuse_patterns FROM authenticated, anon;

-- Functions will have elevated permissions

-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'Bot & Abuse Protection: Core tables created ✅' AS migration_status;
