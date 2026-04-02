-- ============================================
-- CRON: Daily Idea Scraper at 12:30 UTC (6:00 PM IST)
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Enable extensions (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: Call the scrape-ideas edge function daily at 12:30 UTC
SELECT cron.schedule(
  'daily-idea-scraper',           -- job name
  '30 12 * * *',                   -- cron: 12:30 UTC = 6:00 PM IST
  $$
  SELECT net.http_post(
    url := 'https://hseuprmcguiqgrdcqexi.supabase.co/functions/v1/scrape-ideas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'daily-idea-scraper';
