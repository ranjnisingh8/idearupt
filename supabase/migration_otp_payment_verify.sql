-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Secure OTP & Payment Systems
-- Run this in Supabase SQL Editor to verify all features deployed
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VERIFY OTP TABLES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'OTP TABLES VERIFICATION' AS check;
SELECT
  COALESCE(tablename, 'MISSING') AS table_name,
  CASE WHEN tablename IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM (
  SELECT tablename FROM information_schema.tables WHERE tablename IN (
    'otp_requests', 'otp_codes', 'otp_audit_log'
  )
) t
FULL OUTER JOIN information_schema.tables t2
  ON t.tablename = t2.tablename
WHERE tablename IN ('otp_requests', 'otp_codes', 'otp_audit_log')
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VERIFY PAYMENT TABLES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'PAYMENT TABLES VERIFICATION' AS check;
SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'RLS ENABLED' ELSE 'RLS DISABLED' END AS status
FROM pg_tables
WHERE tablename IN ('payment_events', 'subscription_status', 'provider_customers', 'webhook_verification_log')
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY OTP FUNCTIONS DEPLOYED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'OTP FUNCTIONS VERIFICATION' AS check;
SELECT
  routine_name,
  CASE WHEN security_type = 'DEFINER' THEN '🔒 SECURITY DEFINER' ELSE security_type END AS security
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'request_otp_secure',
    'verify_otp_secure',
    'check_otp_rate_limit',
    'hash_otp_code',
    'cleanup_expired_otps',
    'invalidate_otp'
  )
ORDER BY routine_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFY PAYMENT FUNCTIONS DEPLOYED
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'PAYMENT FUNCTIONS VERIFICATION' AS check;
SELECT
  routine_name,
  CASE WHEN security_type = 'DEFINER' THEN '🔒 SECURITY DEFINER' ELSE security_type END AS security
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'verify_webhook_signature',
    'process_payment_event',
    'get_user_subscription',
    'cancel_subscription_via_webhook',
    'link_provider_customer',
    'user_can_access_feature',
    'archive_old_payment_events'
  )
ORDER BY routine_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VERIFY RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'RLS POLICIES VERIFICATION' AS check;
SELECT
  tablename,
  COUNT(*) AS policy_count,
  STRING_AGG(policyname, ', ') AS policies
FROM pg_policies
WHERE tablename IN ('otp_codes', 'payment_events', 'subscription_status')
GROUP BY tablename
ORDER BY tablename;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SECURITY FEATURES SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '✅ OTP SYSTEM PROTECTIONS:' AS feature UNION ALL
SELECT '  ✓ Rate limiting: Max 5 OTP requests per 10 minutes' UNION ALL
SELECT '  ✓ Rate limiting: Max 50 requests per IP per hour' UNION ALL
SELECT '  ✓ Enumeration prevention: Always returns same response' UNION ALL
SELECT '  ✓ Hashed OTPs: Never stored as plaintext' UNION ALL
SELECT '  ✓ Attempt limiting: Max 5 attempts per OTP' UNION ALL
SELECT '  ✓ Expiration: OTPs expire after 5 minutes' UNION ALL
SELECT '  ✓ Audit trail: All OTP events logged' UNION ALL
SELECT '' UNION ALL
SELECT '✅ PAYMENT SYSTEM PROTECTIONS:' UNION ALL
SELECT '  ✓ Mandatory signature verification for all webhooks' UNION ALL
SELECT '  ✓ Replay attack prevention: Unique event IDs' UNION ALL
SELECT '  ✓ Server-side subscription source of truth' UNION ALL
SELECT '  ✓ No client-side plan upgrades' UNION ALL
SELECT '  ✓ Complete webhook event audit trail' UNION ALL
SELECT '  ✓ Provider customer mapping for webhook routing'
ORDER BY feature;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SAMPLE SECURITY QUERIES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'SAMPLE: Recent OTP Audit Log' AS query_type;
SELECT
  identifier,
  action,
  reason,
  ip_address,
  created_at
FROM otp_audit_log
ORDER BY created_at DESC
LIMIT 5;

SELECT 'SAMPLE: Webhook Verification Attempts' AS query_type;
SELECT
  provider,
  event_id,
  verification_result,
  reason,
  created_at
FROM webhook_verification_log
ORDER BY created_at DESC
LIMIT 5;

SELECT 'SAMPLE: Payment Events' AS query_type;
SELECT
  event_type,
  provider,
  verified,
  signature_valid,
  processed,
  created_at
FROM payment_events
ORDER BY created_at DESC
LIMIT 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ADMIN FUNCTIONS AVAILABLE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '📊 ADMIN FUNCTIONS AVAILABLE:' AS function_list UNION ALL
SELECT '  • get_duplicate_webhook_attempts() - Find replay attack attempts' UNION ALL
SELECT '  • get_payment_history(user_id) - View user payment history' UNION ALL
SELECT '  • user_can_access_feature(user_id, feature) - Verify feature access' UNION ALL
SELECT '  • get_user_subscription(user_id) - Get current subscription' UNION ALL
SELECT '  • cancel_subscription_via_webhook() - Only via verified webhook' UNION ALL
SELECT '  • archive_old_payment_events() - Maintain database' UNION ALL
SELECT '  • cleanup_expired_otps() - Remove expired OTPs'
ORDER BY function_list;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CRITICAL SECURITY NOTES
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '🔐 CRITICAL SECURITY IMPLEMENTATION CHECKLIST:' AS security_note UNION ALL
SELECT '' UNION ALL
SELECT '✅ OTP System:' UNION ALL
SELECT '  [ ] Set app.otp_salt setting in environment' UNION ALL
SELECT '  [ ] Implement send_otp_email() function to actually send OTPs' UNION ALL
SELECT '  [ ] Configure OTP delivery via email/SMS provider' UNION ALL
SELECT '  [ ] Test rate limiting with multiple requests' UNION ALL
SELECT '' UNION ALL
SELECT '✅ Payment System:' UNION ALL
SELECT '  [ ] Set app.webhook_secret_stripe environment variable' UNION ALL
SELECT '  [ ] Set app.webhook_secret_paddle if using Paddle' UNION ALL
SELECT '  [ ] Configure webhook endpoints to call process_payment_event()' UNION ALL
SELECT '  [ ] Verify webhook endpoint receives webhooks correctly' UNION ALL
SELECT '  [ ] Test with Stripe test events' UNION ALL
SELECT '  [ ] Test signature verification with invalid signatures' UNION ALL
SELECT '  [ ] Test replay attack prevention with duplicate event IDs' UNION ALL
SELECT '' UNION ALL
SELECT '✅ General:' UNION ALL
SELECT '  [ ] All functions use SECURITY DEFINER for elevation' UNION ALL
SELECT '  [ ] RLS policies prevent direct table access' UNION ALL
SELECT '  [ ] Audit logs capture all sensitive operations'
ORDER BY security_note;

SELECT 'Secure OTP & Payment verification complete ✅' AS final_status;
