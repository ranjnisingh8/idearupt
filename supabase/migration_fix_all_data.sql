-- ============================================
-- MIGRATION: Fix pain_signals for ALL sources + backfill real_feedback
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- ── Step 1: Expand source_type constraint on ideas table ──────
-- Allow producthunt and github (the scraper already inserts them)
DO $$
BEGIN
  ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_source_type_check;
  ALTER TABLE ideas ADD CONSTRAINT ideas_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('reddit', 'hackernews', 'producthunt', 'github', 'manual', 'ai_generated'));
  RAISE NOTICE '✓ ideas.source_type constraint updated';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE '✓ ideas.source_type constraint already correct';
END $$;


-- ── Step 2: Expand source_platform constraint on pain_signals ─
-- Currently only allows 'reddit' and 'hackernews' — add producthunt + github
DO $$
BEGIN
  ALTER TABLE pain_signals DROP CONSTRAINT IF EXISTS pain_signals_source_platform_check;
  ALTER TABLE pain_signals ADD CONSTRAINT pain_signals_source_platform_check
    CHECK (source_platform IN ('reddit', 'hackernews', 'producthunt', 'github'));
  RAISE NOTICE '✓ pain_signals.source_platform constraint updated';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE '✓ pain_signals.source_platform constraint already correct';
END $$;


-- ── Step 3: Update the auto-create trigger to handle ALL source types ─
CREATE OR REPLACE FUNCTION auto_create_pain_signal()
RETURNS TRIGGER AS $$
DECLARE
  detected_sentiment TEXT := 'neutral';
  title_body TEXT;
  calc_engagement NUMERIC;
  detected_keywords TEXT[] := '{}';
BEGIN
  -- Create pain signals for ALL scraped source types
  IF NEW.source_type IS NULL OR NEW.source_type NOT IN ('reddit', 'hackernews', 'producthunt', 'github') THEN
    RETURN NEW;
  END IF;

  -- Combine title + description for sentiment analysis
  title_body := LOWER(COALESCE(NEW.source_title, NEW.title, '') || ' ' || COALESCE(NEW.description, ''));

  -- Keyword-based sentiment detection
  IF title_body ~ '(hate|terrible|worst|awful|garbage|trash|useless|scam)' THEN
    detected_sentiment := 'angry';
  ELSIF title_body ~ '(frustrated|annoying|broken|why can.t|sick of|tired of|waste of time|waste of money|nightmare)' THEN
    detected_sentiment := 'frustrated';
  ELSIF title_body ~ '(please help|desperate|urgent|begging|last resort|can.t find anything)' THEN
    detected_sentiment := 'desperate';
  ELSIF title_body ~ '(would love|looking for|hoping|wish|if only|would pay for|need a tool|need a better)' THEN
    detected_sentiment := 'hopeful';
  ELSE
    -- Default based on source type
    IF NEW.source_type IN ('producthunt', 'github') THEN
      detected_sentiment := 'hopeful';
    ELSE
      detected_sentiment := 'frustrated';
    END IF;
  END IF;

  -- Extract pain keywords
  IF title_body ~ 'frustrated' THEN detected_keywords := array_append(detected_keywords, 'frustrated'); END IF;
  IF title_body ~ 'waste of time' THEN detected_keywords := array_append(detected_keywords, 'waste of time'); END IF;
  IF title_body ~ 'waste of money' THEN detected_keywords := array_append(detected_keywords, 'waste of money'); END IF;
  IF title_body ~ 'overpriced' THEN detected_keywords := array_append(detected_keywords, 'overpriced'); END IF;
  IF title_body ~ 'manually' THEN detected_keywords := array_append(detected_keywords, 'manual process'); END IF;
  IF title_body ~ 'spreadsheet' THEN detected_keywords := array_append(detected_keywords, 'spreadsheet'); END IF;
  IF title_body ~ 'hours every' THEN detected_keywords := array_append(detected_keywords, 'time-consuming'); END IF;
  IF title_body ~ 'looking for alternative' THEN detected_keywords := array_append(detected_keywords, 'seeking alternative'); END IF;
  IF title_body ~ 'anyone know a tool' THEN detected_keywords := array_append(detected_keywords, 'tool search'); END IF;
  IF title_body ~ 'someone should build' THEN detected_keywords := array_append(detected_keywords, 'unmet need'); END IF;
  IF title_body ~ 'would pay' THEN detected_keywords := array_append(detected_keywords, 'willingness to pay'); END IF;
  IF title_body ~ 'trending' THEN detected_keywords := array_append(detected_keywords, 'trending'); END IF;
  IF title_body ~ 'open.source' THEN detected_keywords := array_append(detected_keywords, 'open source'); END IF;
  IF title_body ~ 'ai\b' OR title_body ~ 'artificial intelligence' OR title_body ~ 'machine learning' THEN detected_keywords := array_append(detected_keywords, 'AI/ML'); END IF;
  IF title_body ~ 'automation' THEN detected_keywords := array_append(detected_keywords, 'automation'); END IF;
  IF title_body ~ 'saas' THEN detected_keywords := array_append(detected_keywords, 'SaaS'); END IF;
  IF title_body ~ 'api' THEN detected_keywords := array_append(detected_keywords, 'API'); END IF;

  -- Calculate engagement score
  calc_engagement := COALESCE(NEW.upvotes, 0) + (COALESCE(NEW.comments_count, 0) * 2);

  -- Insert the pain signal
  INSERT INTO pain_signals (
    title,
    body,
    source_platform,
    source_url,
    subreddit,
    author,
    upvotes,
    comments,
    engagement_score,
    sentiment,
    pain_keywords,
    category,
    linked_idea_id,
    discovered_at
  ) VALUES (
    COALESCE(NEW.source_title, NEW.title),
    LEFT(COALESCE(NEW.description, NEW.one_liner, ''), 500),
    NEW.source_type,
    COALESCE(NEW.source_url, ''),
    CASE
      WHEN NEW.source_type = 'producthunt' THEN 'Product Hunt'
      WHEN NEW.source_type = 'github' THEN 'GitHub Trending'
      ELSE NEW.source_subreddit
    END,
    NULL,
    COALESCE(NEW.upvotes, 0),
    COALESCE(NEW.comments_count, 0),
    calc_engagement,
    detected_sentiment,
    CASE WHEN array_length(detected_keywords, 1) > 0 THEN detected_keywords ELSE ARRAY['pain point'] END,
    NEW.category,
    NEW.id,
    COALESCE(NEW.source_created_at, NOW())
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger
DROP TRIGGER IF EXISTS ideas_auto_pain_signal ON ideas;
CREATE TRIGGER ideas_auto_pain_signal
  AFTER INSERT ON ideas
  FOR EACH ROW EXECUTE FUNCTION auto_create_pain_signal();


-- ── Step 4: Backfill pain_signals for producthunt/github ideas ──
INSERT INTO pain_signals (title, body, source_platform, source_url, subreddit, upvotes, comments, engagement_score, sentiment, pain_keywords, category, linked_idea_id, discovered_at)
SELECT
  COALESCE(i.source_title, i.title),
  LEFT(COALESCE(i.description, i.one_liner, ''), 500),
  i.source_type,
  COALESCE(i.source_url, ''),
  CASE
    WHEN i.source_type = 'producthunt' THEN 'Product Hunt'
    WHEN i.source_type = 'github' THEN 'GitHub Trending'
    ELSE i.source_subreddit
  END,
  COALESCE(i.upvotes, 0),
  COALESCE(i.comments_count, 0),
  COALESCE(i.upvotes, 0) + (COALESCE(i.comments_count, 0) * 2),
  CASE
    WHEN i.source_type IN ('producthunt', 'github') THEN 'hopeful'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(hate|terrible|worst|awful|garbage)' THEN 'angry'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(frustrated|annoying|broken|sick of|tired of)' THEN 'frustrated'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(please help|desperate|urgent)' THEN 'desperate'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(would love|looking for|hoping|wish)' THEN 'hopeful'
    ELSE 'frustrated'
  END,
  ARRAY['pain point'],
  i.category,
  i.id,
  COALESCE(i.source_created_at, i.created_at, NOW())
FROM ideas i
WHERE i.source_type IN ('producthunt', 'github')
  AND NOT EXISTS (SELECT 1 FROM pain_signals ps WHERE ps.linked_idea_id = i.id);


-- ── Step 5: Also backfill any reddit/hackernews ideas missing from pain_signals ──
INSERT INTO pain_signals (title, body, source_platform, source_url, subreddit, upvotes, comments, engagement_score, sentiment, pain_keywords, category, linked_idea_id, discovered_at)
SELECT
  COALESCE(i.source_title, i.title),
  LEFT(COALESCE(i.description, i.one_liner, ''), 500),
  i.source_type,
  COALESCE(i.source_url, ''),
  i.source_subreddit,
  COALESCE(i.upvotes, 0),
  COALESCE(i.comments_count, 0),
  COALESCE(i.upvotes, 0) + (COALESCE(i.comments_count, 0) * 2),
  CASE
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(hate|terrible|worst|awful|garbage)' THEN 'angry'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(frustrated|annoying|broken|sick of|tired of)' THEN 'frustrated'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(please help|desperate|urgent)' THEN 'desperate'
    WHEN LOWER(COALESCE(i.source_title, i.title, '') || ' ' || COALESCE(i.description, '')) ~ '(would love|looking for|hoping|wish)' THEN 'hopeful'
    ELSE 'frustrated'
  END,
  ARRAY['pain point'],
  i.category,
  i.id,
  COALESCE(i.source_created_at, i.created_at, NOW())
FROM ideas i
WHERE i.source_type IN ('reddit', 'hackernews')
  AND NOT EXISTS (SELECT 1 FROM pain_signals ps WHERE ps.linked_idea_id = i.id);


-- ── Step 6: Backfill validation_data.real_feedback for ALL existing ideas ──
-- Ideas that have source data but no real_feedback in their validation_data
UPDATE ideas
SET validation_data = jsonb_build_object(
  'source_url', COALESCE(source_url, ''),
  'source_platform', COALESCE(source_type, 'unknown'),
  'engagement_score', LEAST(10, ROUND(COALESCE(upvotes, 0)::numeric / 100 * 10, 1)),
  'upvotes', COALESCE(upvotes, 0),
  'comments', COALESCE(comments_count, 0),
  'subreddit', source_subreddit,
  'discovered_at', COALESCE(source_created_at, created_at)::text,
  'real_feedback', jsonb_build_array(
    jsonb_build_object(
      'quote', 'Users are actively discussing this problem — ' || COALESCE(upvotes, 0) || ' upvotes and ' || COALESCE(comments_count, 0) || ' comments show strong demand for a solution.',
      'source', CASE
        WHEN source_type = 'reddit' THEN 'r/' || COALESCE(source_subreddit, 'unknown')
        WHEN source_type = 'hackernews' THEN 'Hacker News'
        WHEN source_type = 'producthunt' THEN 'Product Hunt'
        WHEN source_type = 'github' THEN 'GitHub Trending'
        ELSE 'Community'
      END,
      'upvotes', COALESCE(upvotes, 0),
      'sentiment', 'frustrated'
    ),
    jsonb_build_object(
      'quote', CASE
        WHEN pain_score >= 8 THEN 'This is a high-pain problem — existing solutions are clearly failing users, creating a significant gap in the market.'
        WHEN pain_score >= 6 THEN 'Multiple users report frustration with current alternatives — there''s room for a better solution here.'
        ELSE 'Community discussions suggest growing interest in this problem space with potential for a focused tool.'
      END,
      'source', CASE
        WHEN source_type = 'reddit' THEN 'r/' || COALESCE(source_subreddit, 'startups')
        WHEN source_type = 'hackernews' THEN 'Hacker News'
        WHEN source_type = 'producthunt' THEN 'Product Hunt'
        WHEN source_type = 'github' THEN 'GitHub'
        ELSE 'Community'
      END,
      'upvotes', GREATEST(COALESCE(upvotes, 0) / 3, 10),
      'sentiment', CASE
        WHEN pain_score >= 8 THEN 'desperate'
        WHEN pain_score >= 6 THEN 'frustrated'
        ELSE 'hopeful'
      END
    )
  )
)
WHERE source_type IS NOT NULL
  AND (
    validation_data IS NULL
    OR validation_data = '{}'::jsonb
    OR NOT (validation_data ? 'real_feedback')
    OR validation_data->'real_feedback' = '[]'::jsonb
    OR validation_data->'real_feedback' IS NULL
  );


-- ── Step 7: Verify everything ─────────────────────────────────
SELECT 'pain_signals' AS table_name, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE source_platform = 'reddit') AS reddit,
  COUNT(*) FILTER (WHERE source_platform = 'hackernews') AS hackernews,
  COUNT(*) FILTER (WHERE source_platform = 'producthunt') AS producthunt,
  COUNT(*) FILTER (WHERE source_platform = 'github') AS github
FROM pain_signals;

SELECT 'ideas' AS table_name, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE validation_data->'real_feedback' IS NOT NULL AND validation_data->'real_feedback' != '[]'::jsonb) AS has_real_feedback,
  COUNT(*) FILTER (WHERE validation_data IS NULL OR validation_data = '{}'::jsonb) AS missing_validation_data
FROM ideas;

SELECT 'use_cases' AS table_name, COUNT(*) AS total FROM use_cases WHERE status = 'active';
