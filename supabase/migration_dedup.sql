-- ============================================
-- DEDUPLICATION: Add unique constraints to prevent duplicate ideas
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Remove any existing duplicates first (keep the one with highest overall_score)
DELETE FROM ideas a
USING ideas b
WHERE a.id < b.id
  AND LOWER(TRIM(LEFT(a.title, 150))) = LOWER(TRIM(LEFT(b.title, 150)));

-- 2. Create a unique index on normalized title (first 150 chars, lowercased, trimmed)
-- This prevents the same idea from being inserted twice across scraper runs
CREATE UNIQUE INDEX IF NOT EXISTS idx_ideas_unique_title
  ON ideas (LOWER(TRIM(LEFT(title, 150))));

-- 3. Also add unique constraint on source_url where it's not empty
-- This prevents the same Reddit/HN post from creating multiple ideas
CREATE UNIQUE INDEX IF NOT EXISTS idx_ideas_unique_source_url
  ON ideas (source_url)
  WHERE source_url IS NOT NULL AND source_url != '';

-- 4. Same for pain_signals — prevent duplicate signals
DELETE FROM pain_signals a
USING pain_signals b
WHERE a.id < b.id
  AND LOWER(TRIM(LEFT(a.title, 150))) = LOWER(TRIM(LEFT(b.title, 150)))
  AND a.source_platform = b.source_platform;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_signals_unique_title_platform
  ON pain_signals (LOWER(TRIM(LEFT(title, 150))), source_platform);

-- Verify
SELECT 'Ideas count:' as label, COUNT(*) as count FROM ideas
UNION ALL
SELECT 'Pain signals count:', COUNT(*) FROM pain_signals;
