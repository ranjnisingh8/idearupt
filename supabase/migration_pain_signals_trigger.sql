-- ============================================
-- PAIN SIGNALS AUTO-POPULATION TRIGGER
-- Auto-creates a pain_signal when a scraped idea is inserted
-- Run this in Supabase SQL Editor after migration.sql
-- ============================================

-- Function: Auto-create pain_signal from scraped ideas
CREATE OR REPLACE FUNCTION auto_create_pain_signal()
RETURNS TRIGGER AS $$
DECLARE
  detected_sentiment TEXT := 'neutral';
  title_body TEXT;
  calc_engagement NUMERIC;
  detected_keywords TEXT[] := '{}';
BEGIN
  -- Only create pain signals for scraped ideas (not manually created)
  IF NEW.source_type IS NULL OR NEW.source_type NOT IN ('reddit', 'hackernews') THEN
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
  ELSIF title_body ~ '(would love|looking for|hoping|wish|if only|would pay for)' THEN
    detected_sentiment := 'hopeful';
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
  IF title_body ~ 'broken' THEN detected_keywords := array_append(detected_keywords, 'broken'); END IF;
  IF title_body ~ 'bloated' THEN detected_keywords := array_append(detected_keywords, 'bloated'); END IF;

  -- Calculate engagement score
  calc_engagement := COALESCE(NEW.upvotes, 0) + (COALESCE(NEW.comments_count, 0) * 2);

  -- Insert the pain signal
  INSERT INTO pain_signals (
    title,
    body,
    source_platform,
    source_url,
    subreddit,
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
    NEW.source_subreddit,
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

-- Drop old trigger if exists, create new one
DROP TRIGGER IF EXISTS ideas_auto_pain_signal ON ideas;
CREATE TRIGGER ideas_auto_pain_signal
  AFTER INSERT ON ideas
  FOR EACH ROW EXECUTE FUNCTION auto_create_pain_signal();

-- ============================================
-- BACKFILL: Create pain signals for existing scraped ideas
-- ============================================
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
  AND NOT EXISTS (
    SELECT 1 FROM pain_signals ps WHERE ps.linked_idea_id = i.id
  );

-- Verify
SELECT COUNT(*) as total_pain_signals FROM pain_signals;
