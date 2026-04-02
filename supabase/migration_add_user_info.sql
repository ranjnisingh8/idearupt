-- ═══════════════════════════════════════════════════
-- Add user_email and user_name to builder_dna
-- So the admin can identify users in the dashboard
-- Run this via Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Add columns to builder_dna
ALTER TABLE builder_dna ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE builder_dna ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Backfill existing rows from users table
UPDATE builder_dna bd
SET
  user_email = u.email,
  user_name = COALESCE(u.display_name, split_part(u.email, '@', 1))
FROM users u
WHERE bd.user_id = u.id
AND (bd.user_email IS NULL OR bd.user_name IS NULL);

-- Verify
SELECT bd.id, bd.user_id, bd.user_email, bd.user_name, bd.tech_level, bd.industries
FROM builder_dna bd
ORDER BY bd.created_at DESC
LIMIT 10;
