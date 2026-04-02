-- ============================================
-- FIX: Ensure source_type constraint allows all scraper sources
-- AND check last scraper run response
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Fix source_type constraint (may already be correct)
DO $$
BEGIN
  ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_source_type_check;
  ALTER TABLE ideas ADD CONSTRAINT ideas_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('reddit', 'hackernews', 'producthunt', 'github', 'manual', 'ai_generated'));
  RAISE NOTICE '✓ source_type constraint updated';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE '✓ source_type constraint already correct';
END $$;

-- Step 2: Check the HTTP response from the last manual scraper trigger
-- This shows us what the edge function actually returned
SELECT
  id,
  status_code,
  LEFT(content::text, 2000) as response_body,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 5;

-- Step 3: Check current constraint definition
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ideas'::regclass
AND contype = 'c';

-- Step 4: Count ideas by source_type to understand current state
SELECT
  COALESCE(source_type, 'NULL (no source)') as source_type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM ideas
GROUP BY source_type
ORDER BY count DESC;
