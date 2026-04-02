-- ============================================================
-- IP Tracking + Suspicious Accounts Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add signup_ip column to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_ip TEXT;

-- 2. Update save_user_fingerprint RPC to also save IP
CREATE OR REPLACE FUNCTION public.save_user_fingerprint(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_flagged BOOLEAN DEFAULT false,
  p_ip TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET device_fingerprint = p_fingerprint,
      flagged_duplicate = p_flagged,
      signup_ip = COALESCE(p_ip, signup_ip)
  WHERE id = p_user_id;
END;
$$;

-- Re-grant (signature changed with new p_ip param)
GRANT EXECUTE ON FUNCTION public.save_user_fingerprint(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;

-- 3. Suspicious accounts view (fingerprint dupes)
CREATE OR REPLACE VIEW public.suspicious_accounts AS
SELECT
  device_fingerprint,
  COUNT(*) AS account_count,
  ARRAY_AGG(email ORDER BY created_at) AS emails,
  ARRAY_AGG(created_at ORDER BY created_at) AS signup_dates,
  ARRAY_AGG(subscription_status ORDER BY created_at) AS statuses
FROM public.users
WHERE device_fingerprint IS NOT NULL
GROUP BY device_fingerprint
HAVING COUNT(*) > 1
ORDER BY account_count DESC;

-- 4. IP clustering view (3+ accounts from same IP)
CREATE OR REPLACE VIEW public.ip_clusters AS
SELECT
  signup_ip,
  COUNT(*) AS account_count,
  ARRAY_AGG(email ORDER BY created_at) AS emails,
  ARRAY_AGG(created_at ORDER BY created_at) AS signup_dates,
  ARRAY_AGG(subscription_status ORDER BY created_at) AS statuses
FROM public.users
WHERE signup_ip IS NOT NULL
GROUP BY signup_ip
HAVING COUNT(*) >= 3
ORDER BY account_count DESC;

-- 5. Admin RPC to fetch suspicious accounts (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_suspicious_accounts()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fp_dupes JSON;
  ip_clusters JSON;
BEGIN
  -- Fingerprint duplicates
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO fp_dupes
  FROM (
    SELECT device_fingerprint, account_count, emails, signup_dates, statuses
    FROM public.suspicious_accounts
    LIMIT 50
  ) t;

  -- IP clusters (3+ accounts)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO ip_clusters
  FROM (
    SELECT signup_ip, account_count, emails, signup_dates, statuses
    FROM public.ip_clusters
    LIMIT 50
  ) t;

  RETURN json_build_object(
    'fingerprint_dupes', fp_dupes,
    'ip_clusters', ip_clusters
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_suspicious_accounts() TO authenticated;

SELECT 'Migration complete: signup_ip column, suspicious_accounts view, ip_clusters view, admin RPC ready.' AS status;
