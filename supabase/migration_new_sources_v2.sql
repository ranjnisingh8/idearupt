-- ============================================================
-- MIGRATION: Add Indie Hackers + Stack Overflow scraping support
-- Run each block separately in Supabase SQL Editor
-- ============================================================

-- ─── BLOCK 1: Update source_type constraint ────────────────
-- Add 'indiehackers' and 'stackoverflow' as allowed source types
DO $$
BEGIN
  BEGIN
    ALTER TABLE ideas DROP CONSTRAINT IF EXISTS ideas_source_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  ALTER TABLE ideas ADD CONSTRAINT ideas_source_type_check
    CHECK (source_type IS NULL OR source_type IN (
      'reddit', 'hackernews', 'producthunt', 'github',
      'indiehackers', 'stackoverflow',
      'manual', 'ai_generated'
    ));

  RAISE NOTICE 'source_type constraint updated with indiehackers + stackoverflow ✓';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'constraint already exists ✓';
END $$;


-- ─── BLOCK 2: Update pain signals trigger ──────────────────
-- Include new sources in auto pain signal generation
CREATE OR REPLACE FUNCTION auto_create_pain_signal()
RETURNS TRIGGER AS $$
DECLARE
  detected_sentiment TEXT := 'neutral';
  title_body TEXT;
  calc_engagement NUMERIC;
  detected_keywords TEXT[] := '{}';
BEGIN
  -- Only create pain signals for scraped ideas (not manually created)
  IF NEW.source_type IS NULL OR NEW.source_type NOT IN (
    'reddit', 'hackernews', 'producthunt', 'github', 'indiehackers', 'stackoverflow'
  ) THEN
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
    title, body, source_platform, source_url, subreddit,
    upvotes, comments, engagement_score, sentiment,
    pain_keywords, category, linked_idea_id, discovered_at
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

-- Recreate trigger
DROP TRIGGER IF EXISTS ideas_auto_pain_signal ON ideas;
CREATE TRIGGER ideas_auto_pain_signal
  AFTER INSERT ON ideas
  FOR EACH ROW EXECUTE FUNCTION auto_create_pain_signal();


-- ─── BLOCK 3: Cron jobs for new sources ────────────────────

-- Product Hunt scrape at 12:45 UTC daily
SELECT cron.schedule(
  'scrape-producthunt',
  '45 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"source":"producthunt"}'::jsonb
  );
  $$
);

-- Indie Hackers scrape at 12:50 UTC daily
SELECT cron.schedule(
  'scrape-indiehackers',
  '50 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"source":"indiehackers"}'::jsonb
  );
  $$
);

-- Stack Overflow scrape at 12:55 UTC daily
SELECT cron.schedule(
  'scrape-stackoverflow',
  '55 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"source":"stackoverflow"}'::jsonb
  );
  $$
);

-- Verify all cron jobs
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;


-- ─── BLOCK 4: Update pain_signals source_platform constraint ──
-- The pain_signals table has its own check constraint that was missing indiehackers + stackoverflow
-- Without this, the auto_create_pain_signal trigger fails and rolls back idea inserts
DO $$
BEGIN
  ALTER TABLE pain_signals DROP CONSTRAINT IF EXISTS pain_signals_source_platform_check;
  ALTER TABLE pain_signals ADD CONSTRAINT pain_signals_source_platform_check
    CHECK (source_platform IN (
      'reddit', 'hackernews', 'producthunt', 'github',
      'indiehackers', 'stackoverflow'
    ));
  RAISE NOTICE 'pain_signals.source_platform constraint updated with indiehackers + stackoverflow ✓';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'constraint already exists ✓';
END $$;
