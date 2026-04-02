-- ═══════════════════════════════════════════════════
-- Reset usage tracking for today (run to test features)
-- Run this via Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- View current usage for all users today
SELECT ut.user_id, u.email, ut.feature, ut.count, ut.used_at
FROM usage_tracking ut
LEFT JOIN users u ON u.id = ut.user_id
WHERE ut.used_at = CURRENT_DATE
ORDER BY ut.used_at DESC;

-- Reset all usage for today (uncomment to run):
-- DELETE FROM usage_tracking WHERE used_at = CURRENT_DATE;

-- Or reset just blueprint and competitors for a specific user:
-- DELETE FROM usage_tracking
-- WHERE used_at = CURRENT_DATE
-- AND feature IN ('blueprint', 'competitors', 'validation');
