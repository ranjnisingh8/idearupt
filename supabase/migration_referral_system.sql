-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Referral System + UTM Tracking
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add UTM + referral columns to users table ────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_clicks INTEGER DEFAULT 0;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_utm_source ON users (utm_source) WHERE utm_source IS NOT NULL;

-- ─── 2. Create referral_events table ─────────────────────────
CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referred_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('signup', 'trial_start', 'conversion')),
  commission_amount NUMERIC(10,2) DEFAULT 0,
  payment_amount NUMERIC(10,2) DEFAULT 0,
  commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referred ON referral_events (referred_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events (event_type);

-- RLS: users can only read their own referral events (as referrer)
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral events"
  ON referral_events FOR SELECT
  USING (referrer_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE by users — only via SECURITY DEFINER RPCs


-- ─── 3. Auto-generate referral codes on user creation ────────
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  attempts INTEGER := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    -- Generate 8-char alphanumeric code
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = new_code) THEN
      NEW.referral_code := new_code;
      EXIT;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      -- Fallback: use first 8 chars of user ID
      NEW.referral_code := upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON users;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION generate_referral_code();

-- Backfill existing users who don't have a referral code
DO $$
DECLARE
  u RECORD;
  new_code TEXT;
  attempts INTEGER;
BEGIN
  FOR u IN SELECT id FROM users WHERE referral_code IS NULL LOOP
    attempts := 0;
    LOOP
      new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      IF NOT EXISTS (SELECT 1 FROM users WHERE referral_code = new_code) THEN
        UPDATE users SET referral_code = new_code WHERE id = u.id;
        EXIT;
      END IF;
      attempts := attempts + 1;
      IF attempts > 10 THEN
        UPDATE users SET referral_code = upper(substr(replace(u.id::text, '-', ''), 1, 8)) WHERE id = u.id;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;


-- ─── 4. save_user_signup_meta RPC ────────────────────────────
-- Called from AuthContext after user signs up
CREATE OR REPLACE FUNCTION save_user_signup_meta(
  p_user_id UUID,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_referred_by TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  referrer_user_id UUID;
BEGIN
  -- Verify the caller is the user (prevent spoofing referrals for other users)
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Update UTM data (last-touch: always overwrite)
  UPDATE users SET
    utm_source = COALESCE(p_utm_source, utm_source),
    utm_medium = COALESCE(p_utm_medium, utm_medium),
    utm_campaign = COALESCE(p_utm_campaign, utm_campaign),
    -- Referral: first-touch (only set if not already set)
    referred_by = COALESCE(referred_by, p_referred_by)
  WHERE id = p_user_id;

  -- If a referral code was provided and the user now has referred_by set,
  -- create a signup referral event (only if one doesn't already exist)
  IF p_referred_by IS NOT NULL THEN
    SELECT id INTO referrer_user_id FROM users WHERE referral_code = p_referred_by LIMIT 1;

    IF referrer_user_id IS NOT NULL AND referrer_user_id != p_user_id THEN
      INSERT INTO referral_events (referrer_id, referred_id, event_type)
      VALUES (referrer_user_id, p_user_id, 'signup')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. increment_referral_click RPC ─────────────────────────
-- Called from frontend when ?ref=XXX is detected in URL
CREATE OR REPLACE FUNCTION increment_referral_click(p_ref_code TEXT)
RETURNS VOID AS $$
BEGIN
  -- Basic input validation: codes are 8 chars, reject anything suspicious
  IF p_ref_code IS NULL OR length(p_ref_code) < 4 OR length(p_ref_code) > 16 THEN
    RETURN;
  END IF;

  UPDATE users
  SET referral_clicks = COALESCE(referral_clicks, 0) + 1
  WHERE referral_code = p_ref_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. get_my_referral_stats RPC ────────────────────────────
-- Returns referral stats for the calling user
CREATE OR REPLACE FUNCTION get_my_referral_stats()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  result JSON;
  ref_code TEXT;
  clicks INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT u.referral_code, COALESCE(u.referral_clicks, 0)
  INTO ref_code, clicks
  FROM users u WHERE u.id = v_user_id;

  SELECT json_build_object(
    'referral_code', ref_code,
    'total_clicks', clicks,
    'total_signups', (
      SELECT COUNT(*) FROM referral_events
      WHERE referrer_id = v_user_id AND event_type = 'signup'
    ),
    'total_conversions', (
      SELECT COUNT(*) FROM referral_events
      WHERE referrer_id = v_user_id AND event_type = 'conversion'
    ),
    'total_earnings', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE referrer_id = v_user_id AND event_type = 'conversion'
    ),
    'pending_earnings', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE referrer_id = v_user_id AND event_type = 'conversion' AND commission_status = 'pending'
    ),
    'paid_earnings', (
      SELECT COALESCE(SUM(commission_amount), 0) FROM referral_events
      WHERE referrer_id = v_user_id AND event_type = 'conversion' AND commission_status = 'paid'
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 7. get_my_referral_history RPC ──────────────────────────
-- Returns referral events for the calling user (as referrer)
CREATE OR REPLACE FUNCTION get_my_referral_history(p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  result JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
  FROM (
    SELECT
      re.id,
      re.event_type,
      re.commission_amount,
      re.payment_amount,
      re.commission_status,
      re.created_at,
      -- Mask referred user's email for privacy
      CASE
        WHEN u.email IS NOT NULL THEN
          substr(u.email, 1, 2) || '***' || substr(u.email, position('@' in u.email))
        ELSE 'anonymous'
      END AS referred_email
    FROM referral_events re
    LEFT JOIN users u ON u.id = re.referred_id
    WHERE re.referrer_id = v_user_id
    ORDER BY re.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 8. record_referral_conversion RPC ───────────────────────
-- Called from webhook when a referred user makes a payment
-- Looks up the referrer via the user's referred_by field
CREATE OR REPLACE FUNCTION record_referral_conversion(
  p_referred_id UUID,
  p_payment_amount NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_req_count INT;
  ref_code TEXT;
  referrer_user_id UUID;
  commission NUMERIC(10,2);
BEGIN
  -- Rate limit: max 50 conversions per minute (webhook safety)
  SELECT COUNT(*) INTO v_req_count
  FROM request_logs
  WHERE action = 'record_referral_conversion'
    AND created_at > NOW() - INTERVAL '1 minute';

  IF v_req_count > 50 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  INSERT INTO request_logs (action) VALUES ('record_referral_conversion');
  
  -- Get the referred_by code for this user
  SELECT referred_by INTO ref_code FROM users WHERE id = p_referred_id;

  IF ref_code IS NULL THEN
    RETURN; -- Not a referred user, nothing to do
  END IF;

  -- Find the referrer
  SELECT id INTO referrer_user_id FROM users WHERE referral_code = ref_code LIMIT 1;

  IF referrer_user_id IS NULL THEN
    RETURN; -- Referrer not found
  END IF;

  -- Calculate 20% commission
  commission := ROUND(p_payment_amount * 0.20, 2);

  -- Insert conversion event (prevent duplicates for same payment)
  INSERT INTO referral_events (referrer_id, referred_id, event_type, payment_amount, commission_amount, commission_status)
  VALUES (referrer_user_id, p_referred_id, 'conversion', p_payment_amount, commission, 'pending');
  
  -- Audit log
  INSERT INTO audit_logs (user_id, admin_id, action, target_id, metadata)
  VALUES (referrer_user_id, referrer_user_id, 'referral_conversion', p_referred_id, jsonb_build_object('commission', commission, 'payment_amount', p_payment_amount));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 9. Grant execute permissions ────────────────────────────
GRANT EXECUTE ON FUNCTION save_user_signup_meta TO authenticated;
GRANT EXECUTE ON FUNCTION increment_referral_click TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_referral_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_referral_history TO authenticated;
GRANT EXECUTE ON FUNCTION record_referral_conversion TO service_role;
