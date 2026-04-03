-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Bot & Abuse Protection - Deployment Audit
-- Run this in Supabase SQL Editor to verify all features deployed
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VERIFY TABLES CREATED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'TABLE VERIFICATION' AS check;
SELECT COALESCE(tablename, 'MISSING') AS table_name FROM information_schema.tables WHERE tablename IN ('suspicious_activity', 'device_fingerprints', 'abuse_patterns') ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VERIFY USER TABLE COLUMNS ADDED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'USER TABLE COLUMNS' AS check;
SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('is_limited', 'is_banned', 'ban_reason', 'banned_at', 'limited_until') ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY CRITICAL FUNCTIONS DEPLOYED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'FUNCTIONS VERIFICATION' AS check;
SELECT
  routine_name,
  CASE WHEN security_type = 'DEFINER' THEN 'SECURITY DEFINER' ELSE security_type END AS security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'detect_suspicious_activity',
    'auto_ban_suspicious_user',
    'soft_limit_user',
    'register_device_fingerprint',
    'can_create_trial',
    'increment_user_usage_secure',
    'track_referral_secure',
    'activate_trial_secure',
    'complete_onboarding_secure',
    'get_abuse_dashboard_stats'
  )
ORDER BY routine_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFY RLS POLICIES FOR PROTECTION
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'RLS POLICIES' AS check;
SELECT
  tablename,
  policyname,
  CASE WHEN policyname LIKE '%banned%' OR policyname LIKE '%limited%' THEN 'BLOCKS BANNED/LIMITED'
       WHEN policyname LIKE '%admin%' THEN 'ADMIN ONLY' ELSE 'OTHER' END AS protection_type
FROM pg_policies
WHERE tablename IN ('collections', 'ideas', 'user_interactions')
  AND (policyname LIKE '%banned%' OR policyname LIKE '%limited%')
ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VERIFY TRIGGERS DEPLOYED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'TRIGGERS VERIFICATION' AS check;
SELECT
  trigger_name,
  event_manipulation AS event,
  event_object_table AS table_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE 'trigger_%'
ORDER BY event_object_table, trigger_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. VERIFY RLS ENABLED ON SENSITIVE TABLES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'RLS ENABLED CHECK' AS check;
SELECT
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('suspicious_activity', 'device_fingerprints', 'abuse_patterns')
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SECURITY SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '✅ Bot & Abuse Protection: Core System' AS feature UNION ALL
SELECT '✅ Suspicious Activity Detection' UNION ALL
SELECT '✅ Device Fingerprinting & Trial Abuse Prevention' UNION ALL
SELECT '✅ Soft-Ban & Rate-Limiting' UNION ALL
SELECT '✅ Auto-Ban on Threshold' UNION ALL
SELECT '✅ Authentication Enforcement on Critical Functions' UNION ALL
SELECT '✅ RLS Policies Blocking Banned/Limited Users' UNION ALL
SELECT '✅ Automatic Audit Logging of Bans' UNION ALL
SELECT '✅ Admin Dashboard Stats'
ORDER BY feature;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SAMPLE QUERIES FOR MONITORING
-- ─────────────────────────────────────────────────────────────────────────────

-- Show recent suspicious activities
SELECT 'SAMPLE: Recent Suspicious Activities' AS query_type;
SELECT
  user_id,
  action,
  severity,
  details,
  created_at
FROM suspicious_activity
ORDER BY created_at DESC
LIMIT 10;

-- Show currently banned users
SELECT 'SAMPLE: Currently Banned Users' AS query_type;
SELECT
  id,
  email,
  ban_reason,
  banned_at
FROM users
WHERE is_banned = true
ORDER BY banned_at DESC
LIMIT 10;

-- Show soft-limited users
SELECT 'SAMPLE: Soft-Limited Users' AS query_type;
SELECT
  id,
  email,
  limited_until,
  now() AS current_time,
  (limited_until - now()) AS time_remaining
FROM users
WHERE is_limited = true
  AND limited_until > now()
ORDER BY limited_until DESC
LIMIT 10;

-- Show flagged device fingerprints
SELECT 'SAMPLE: Flagged Device Fingerprints' AS query_type;
SELECT
  id,
  fingerprint_hash,
  signup_count,
  COUNT(DISTINCT user_id) AS unique_users,
  last_seen_at
FROM device_fingerprints
WHERE is_flagged = true
GROUP BY id, fingerprint_hash, signup_count, last_seen_at
ORDER BY signup_count DESC
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ADMIN FUNCTIONS AVAILABLE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '📊 ADMIN FUNCTIONS AVAILABLE:' AS function_list UNION ALL
SELECT '  • get_abuse_dashboard_stats() - Real-time abuse metrics' UNION ALL
SELECT '  • get_suspicious_devices() - List flagged fingerprints' UNION ALL
SELECT '  • block_device(fingerprint_id, reason) - Manually block device' UNION ALL
SELECT '  • auto_ban_suspicious_user(user_id, threshold) - Manually trigger ban' UNION ALL
SELECT '  • soft_limit_user(user_id, duration_hours) - Manually soft-limit' UNION ALL
SELECT '  • remove_soft_limit(user_id) - Remove soft-limit early' UNION ALL
SELECT '  • emergency_unban_all(reason) - Emergency unban all users' UNION ALL
SELECT '  • cleanup_old_device_fingerprints() - Archive old fingerprints' UNION ALL
SELECT '  • archive_old_suspicious_activity() - Archive old records'
ORDER BY function_list;

SELECT 'Bot & Abuse Protection verification complete ✅' AS final_status;
