-- Migration: Add problem_size column to ideas table
-- Categorizes ideas by build effort: small (weekend), medium (side project), large (serious build)

-- 1. Add the column
ALTER TABLE ideas
ADD COLUMN IF NOT EXISTS problem_size TEXT DEFAULT 'medium'
CHECK (problem_size IN ('small', 'medium', 'large'));

-- 2. Backfill from build_difficulty score
-- build_difficulty <= 3 → small (weekend project)
-- build_difficulty <= 6 → medium (side project)
-- build_difficulty > 6  → large (serious build)
UPDATE ideas
SET problem_size = CASE
  WHEN COALESCE(build_difficulty, 5) <= 3 THEN 'small'
  WHEN COALESCE(build_difficulty, 5) <= 6 THEN 'medium'
  ELSE 'large'
END
WHERE problem_size IS NULL OR problem_size = 'medium';

-- 3. Index for filtering
CREATE INDEX IF NOT EXISTS idx_ideas_problem_size ON ideas (problem_size);
