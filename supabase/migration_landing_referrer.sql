-- ═══════════════════════════════════════════════════════════════
-- Idearupt: Add landing referrer tracking to user signups
-- Captures the original external referrer URL when a user first
-- lands on the site (before signup/auth clears it)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add signup_referrer column to users table ────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_referrer TEXT;

-- Index for admin analytics queries
CREATE INDEX IF NOT EXISTS idx_users_signup_referrer ON users (signup_referrer) WHERE signup_referrer IS NOT NULL;


-- ─── 2. Update save_user_signup_meta to accept landing referrer ──
CREATE OR REPLACE FUNCTION save_user_signup_meta(
  p_user_id UUID,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_referred_by TEXT DEFAULT NULL,
  p_landing_referrer TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  referrer_user_id UUID;
BEGIN
  -- Verify the caller is the user (prevent spoofing referrals for other users)
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Update UTM data + landing referrer
  UPDATE users SET
    utm_source = COALESCE(p_utm_source, utm_source),
    utm_medium = COALESCE(p_utm_medium, utm_medium),
    utm_campaign = COALESCE(p_utm_campaign, utm_campaign),
    signup_referrer = COALESCE(p_landing_referrer, signup_referrer)
  WHERE id = p_user_id;

  -- Handle referral code if provided
  IF p_referred_by IS NOT NULL AND p_referred_by != '' THEN
    -- Find the referrer by their referral code
    SELECT id INTO referrer_user_id
    FROM users
    WHERE referral_code = p_referred_by
    LIMIT 1;

    IF referrer_user_id IS NOT NULL AND referrer_user_id != p_user_id THEN
      -- Set referred_by on the user
      UPDATE users SET referred_by = p_referred_by WHERE id = p_user_id AND referred_by IS NULL;

      -- Record referral signup event (prevent duplicates)
      IF NOT EXISTS (
        SELECT 1 FROM referral_events
        WHERE referred_id = p_user_id AND event_type = 'signup'
      ) THEN
        INSERT INTO referral_events (referrer_id, referred_id, event_type)
        VALUES (referrer_user_id, p_user_id, 'signup');
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION save_user_signup_meta TO authenticated;


-- ─── 3. Update admin_get_signups_by_source to also group by referrer ──
-- Add a new RPC that groups signups by parsed referrer domain
CREATE OR REPLACE FUNCTION admin_get_signups_by_referrer(
  start_date TIMESTAMPTZ DEFAULT (now() - interval '30 days'),
  end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify admin access
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND auth.users.email IN ('garagefitness4@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO result
  FROM (
    SELECT
      source,
      total_signups,
      trial_or_active,
      conversions,
      ROUND(
        CASE WHEN total_signups > 0
          THEN trial_or_active::numeric / total_signups::numeric * 100
          ELSE 0
        END, 1
      ) AS trial_rate
    FROM (
      SELECT
        CASE
          WHEN ref_domain = '' OR ref_domain IS NULL THEN 'direct'
          WHEN ref_domain LIKE '%google.%' OR ref_domain LIKE '%googleapis.%' THEN 'google'
          WHEN ref_domain LIKE '%bing.%' THEN 'bing'
          WHEN ref_domain LIKE '%yahoo.%' THEN 'yahoo'
          WHEN ref_domain LIKE '%duckduckgo.%' THEN 'duckduckgo'
          WHEN ref_domain LIKE '%reddit.%' OR ref_domain LIKE '%redd.it%' THEN 'reddit'
          WHEN ref_domain LIKE '%twitter.%' OR ref_domain LIKE '%t.co%' OR ref_domain LIKE '%x.com%' THEN 'twitter / x'
          WHEN ref_domain LIKE '%facebook.%' OR ref_domain LIKE '%fb.%' THEN 'facebook'
          WHEN ref_domain LIKE '%linkedin.%' OR ref_domain LIKE '%lnkd.in%' THEN 'linkedin'
          WHEN ref_domain LIKE '%youtube.%' OR ref_domain LIKE '%youtu.be%' THEN 'youtube'
          WHEN ref_domain LIKE '%producthunt.%' THEN 'producthunt'
          WHEN ref_domain LIKE '%news.ycombinator.%' THEN 'hackernews'
          WHEN ref_domain LIKE '%github.%' THEN 'github'
          WHEN ref_domain LIKE '%instagram.%' THEN 'instagram'
          WHEN ref_domain LIKE '%tiktok.%' THEN 'tiktok'
          ELSE ref_domain
        END AS source,
        COUNT(*) AS total_signups,
        COUNT(*) FILTER (WHERE plan_status IN ('trial', 'active')) AS trial_or_active,
        COUNT(*) FILTER (WHERE plan_status = 'active') AS conversions
      FROM (
        SELECT
          plan_status,
          CASE
            WHEN signup_referrer IS NULL OR signup_referrer = '' THEN ''
            ELSE lower(
              regexp_replace(
                regexp_replace(signup_referrer, '^https?://', ''),
                '/.*$', ''
              )
            )
          END AS ref_domain
        FROM users
        WHERE created_at >= start_date AND created_at <= end_date
      ) parsed
      GROUP BY 1
    ) grouped
    ORDER BY total_signups DESC
    LIMIT 20
  ) t;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_get_signups_by_referrer TO authenticated;
