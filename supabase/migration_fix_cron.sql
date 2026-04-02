-- ============================================
-- FIX: Split scraper into 3 cron jobs (one per source)
-- Each job runs a single source to stay under 60s edge function timeout
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Remove old single cron job
SELECT cron.unschedule('daily-idea-scraper');

-- Step 2: Create 3 separate cron jobs — 5 minutes apart

-- Reddit scraper: 12:30 UTC (6:00 PM IST)
SELECT cron.schedule(
  'scrape-reddit',
  '30 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"source":"reddit"}'::jsonb
  ) AS request_id;
  $$
);

-- Hacker News scraper: 12:35 UTC
SELECT cron.schedule(
  'scrape-hackernews',
  '35 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"source":"hackernews"}'::jsonb
  ) AS request_id;
  $$
);

-- GitHub Trending scraper: 12:40 UTC
SELECT cron.schedule(
  'scrape-github',
  '40 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"source":"github"}'::jsonb
  ) AS request_id;
  $$
);

-- Verify all jobs
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
