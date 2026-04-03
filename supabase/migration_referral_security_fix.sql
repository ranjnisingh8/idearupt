-- ═══════════════════════════════════════════════════════════════
-- HOTFIX: Add auth check to save_user_signup_meta
-- Prevents users from spoofing referral signups for other users
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Also harden increment_referral_click with input length check
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


-- Fix save_user_signup_meta with auth check
CREATE OR REPLACE FUNCTION save_user_signup_meta(
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_referred_by TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  referrer_user_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE users SET
    utm_source = COALESCE(p_utm_source, utm_source),
    utm_medium = COALESCE(p_utm_medium, utm_medium),
    utm_campaign = COALESCE(p_utm_campaign, utm_campaign),
    referred_by = COALESCE(referred_by, p_referred_by)
  WHERE id = v_user_id;
  IF p_referred_by IS NOT NULL THEN
    SELECT id INTO referrer_user_id FROM users WHERE referral_code = p_referred_by LIMIT 1;
    IF referrer_user_id IS NOT NULL AND referrer_user_id != v_user_id THEN
      INSERT INTO referral_events (referrer_id, referred_id, event_type)
      VALUES (referrer_user_id, v_user_id, 'signup')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
