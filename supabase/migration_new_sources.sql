-- ============================================
-- MIGRATION: Add Product Hunt + GitHub Trending support
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- ── Step 1: Update source_type constraint (if it exists) ────────
-- Allow 'producthunt' and 'github' as new source_type values
-- First, drop the old constraint (if any), then recreate with new values
DO $$
BEGIN
  -- Try to drop existing constraint (different possible names)
  BEGIN
    ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_source_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE ideas DROP CONSTRAINT IF EXISTS source_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  -- Add updated constraint with all 6 allowed source types
  ALTER TABLE ideas ADD CONSTRAINT ideas_source_type_check
    CHECK (source_type IN ('reddit', 'hackernews', 'producthunt', 'github', 'manual', 'ai_generated'));

  RAISE NOTICE 'source_type constraint updated ✓';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'source_type constraint already exists with correct values ✓';
END $$;


-- ── Step 2: Update pain signals trigger to include new sources ──
-- Replace the trigger function so it also fires for 'producthunt' and 'github'
CREATE OR REPLACE FUNCTION auto_create_pain_signal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create pain signals for scraped ideas (not manual/AI)
  IF NEW.source_type IN ('reddit', 'hackernews', 'producthunt', 'github') THEN
    INSERT INTO pain_signals (
      title,
      description,
      source,
      source_url,
      signal_type,
      intensity,
      discovered_at
    ) VALUES (
      LEFT(NEW.title, 200),
      LEFT(COALESCE(NEW.one_liner, NEW.description, 'Pain signal from ' || NEW.source_type), 500),
      COALESCE(NEW.source, NEW.source_type),
      NEW.source_url,
      'complaint',
      LEAST(GREATEST(COALESCE(NEW.pain_score, 5)::int, 1), 10),
      COALESCE(NEW.source_created_at, NOW())
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── Step 3: Verify everything ───────────────────────────────────
-- Check constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ideas'::regclass AND conname LIKE '%source_type%';

-- Check trigger function
SELECT prosrc
FROM pg_proc
WHERE proname = 'auto_create_pain_signal';

-- Check recent GitHub ideas (should show data from test runs)
SELECT id, title, source_type, source, overall_score, created_at
FROM ideas
WHERE source_type IN ('github', 'producthunt')
ORDER BY created_at DESC
LIMIT 10;

-- Count ideas by source type
SELECT source_type, COUNT(*) as count
FROM ideas
GROUP BY source_type
ORDER BY count DESC;
